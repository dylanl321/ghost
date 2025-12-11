/**
 * Site Configuration Management
 *
 * Server-side utilities for managing site configuration in DynamoDB.
 * Provides CRUD operations with caching for performance.
 */

import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  ScanCommand,
  BatchWriteItemCommand,
  QueryCommand
} from '@aws-sdk/client-dynamodb';
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import type { SiteConfigItem, SiteConfigHistoryEntry } from '../../shared/types/site-config';
import { DEFAULT_SITE_CONFIG } from '../../shared/types/site-config';

const TABLE_NAME = process.env.SITE_CONFIG_TABLE || 'ghost-site-config';
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// In-memory cache for config values
const configCache = new Map<string, { value: SiteConfigItem; expiresAt: number }>();

// Cached DynamoDB client with expiration tracking to avoid circular dependencies with aws-client-factory
interface CachedDynamoDBClient {
  client: DynamoDBClient;
  expiration: Date;
}
let cachedDynamoDBClient: CachedDynamoDBClient | null = null;

/**
 * Get DynamoDB client directly without aws-client-factory to avoid circular deps
 * CRITICAL: Do not use aws-client-factory here as it would create infinite loop:
 * site-config -> dynamodb -> aws-client-factory -> site-config
 *
 * Site config is stored in GovCloud deployment account (Account B - where ECS runs)
 * Uses role assumption from org account (Account A) to deployment account (Account B)
 * Returns null if credentials are not available
 */
async function getDynamoDBClientDirect(): Promise<DynamoDBClient | null> {
  // Check if base credentials are available
  const hasCredentials = process.env.AWS_GOVCLOUD_ACCESS_KEY_ID &&
                         process.env.AWS_GOVCLOUD_SECRET_ACCESS_KEY;

  if (!hasCredentials) {
    return null; // No credentials, will fall back to defaults
  }

  // Check if we have a cached client and if credentials are still valid (with 5 minute buffer)
  if (cachedDynamoDBClient) {
    const now = new Date();
    const expiresWithBuffer = new Date(cachedDynamoDBClient.expiration.getTime() - 5 * 60 * 1000);

    if (now < expiresWithBuffer) {
      return cachedDynamoDBClient.client;
    }

    // Credentials expired or about to expire, clear cache
    console.log('[Site Config] DynamoDB client credentials expired, refreshing...');
    cachedDynamoDBClient = null;
  }

  // Create new client with fresh credentials
  const region = process.env.AWS_GOVCLOUD_REGION || 'us-gov-west-1';
  const deploymentAccountId = process.env.AWS_DEPLOYMENT_ACCOUNT_ID || '461760157232';
  const roleName = process.env.AWS_ASSUME_ROLE_NAME || 'GDMSOrganizationsRole';

  try {
    // Create STS client with base credentials (org account)
    const stsClient = new STSClient({
      region,
      credentials: {
        accessKeyId: process.env.AWS_GOVCLOUD_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_GOVCLOUD_SECRET_ACCESS_KEY!,
      },
    });

    // Assume role in deployment account
    // Use 1 hour duration (safe default that works with most role configurations)
    // The client will auto-refresh before expiration
    const assumeRoleCommand = new AssumeRoleCommand({
      RoleArn: `arn:aws-us-gov:iam::${deploymentAccountId}:role/${roleName}`,
      RoleSessionName: `site-config-${Date.now()}`,
      DurationSeconds: 3600, // 1 hour (auto-refreshes before expiration)
    });

    const assumeRoleResponse = await stsClient.send(assumeRoleCommand);

    if (!assumeRoleResponse.Credentials || !assumeRoleResponse.Credentials.Expiration) {
      console.error('Failed to assume role for site-config access');
      return null;
    }

    // Create DynamoDB client with assumed role credentials
    const client = new DynamoDBClient({
      region,
      credentials: {
        accessKeyId: assumeRoleResponse.Credentials.AccessKeyId!,
        secretAccessKey: assumeRoleResponse.Credentials.SecretAccessKey!,
        sessionToken: assumeRoleResponse.Credentials.SessionToken!,
      },
    });

    // Cache the client with expiration tracking
    cachedDynamoDBClient = {
      client,
      expiration: assumeRoleResponse.Credentials.Expiration,
    };

    console.log(`[Site Config] Created DynamoDB client for deployment account ${deploymentAccountId}, expires at ${assumeRoleResponse.Credentials.Expiration.toISOString()}`);

    return client;
  } catch (error) {
    console.error('Error assuming role for site-config:', error);
    return null;
  }
}

/**
 * Get the appropriate AWS environment and account ID for site config
 * Site config is stored in GovCloud deployment account (Account B - where ECS runs)
 * Uses role assumption from org account (Account A) to deployment account (Account B)
 */
function getSiteConfigContext() {
  return {
    environment: 'govcloud' as const,
    accountId: process.env.AWS_DEPLOYMENT_ACCOUNT_ID || '461760157232',
  };
}

/**
 * Get a single configuration item by key
 */
export async function getSiteConfig(key: string, useCache = true): Promise<SiteConfigItem | null> {
  // Check cache first
  if (useCache) {
    const cached = configCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }
  }

  try {
    const client = await getDynamoDBClientDirect();

    // If no client (no credentials), return default
    if (!client) {
      return getDefaultConfig(key);
    }

    const command = new GetItemCommand({
      TableName: TABLE_NAME,
      Key: marshall({ key }, { removeUndefinedValues: true })
    });

    const response = await client.send(command);
    const item = response.Item ? unmarshall(response.Item) as SiteConfigItem : null;

    if (item) {
      // Merge with default metadata
      const merged = mergeSingleItemWithDefault(item);

      // Cache the merged result
      configCache.set(key, {
        value: merged,
        expiresAt: Date.now() + CACHE_TTL,
      });
      return merged;
    }

    // If not found in DB, return default value
    return getDefaultConfig(key);
  } catch (error) {
    console.error(`Error fetching site config for key ${key}:`, error);
    // Return default on error
    return getDefaultConfig(key);
  }
}

/**
 * Get all configuration items
 */
export async function getAllSiteConfig(useCache = true): Promise<SiteConfigItem[]> {
  try {
    const client = await getDynamoDBClientDirect();

    // If no client (no credentials), return defaults
    if (!client) {
      console.warn('AWS credentials not available, using default site config');
      return DEFAULT_SITE_CONFIG;
    }

    const command = new ScanCommand({
      TableName: TABLE_NAME
    });

    const response = await client.send(command);
    const items = response.Items ? response.Items.map(item => unmarshall(item) as SiteConfigItem) : [];

    // If DB is empty or has fewer items than defaults, merge with defaults
    if (items.length === 0) {
      console.warn('Site config table is empty, using defaults');
      return DEFAULT_SITE_CONFIG;
    }

    // Cache all items
    if (useCache) {
      const expiresAt = Date.now() + CACHE_TTL;
      items.forEach((item) => {
        configCache.set(item.key, { value: item, expiresAt });
      });
    }

    // Merge with defaults to ensure all keys exist
    return mergeWithDefaults(items);
  } catch (error: any) {
    // If table doesn't exist yet, return defaults
    if (error.name === 'ResourceNotFoundException' || error.message?.includes('not found')) {
      console.warn(`Site config table '${TABLE_NAME}' not found, using defaults. Run 'npx tsx scripts/init-site-config.ts' to initialize.`);
      return DEFAULT_SITE_CONFIG;
    }

    console.error('Error fetching all site config:', error);
    // Return defaults on any error
    return DEFAULT_SITE_CONFIG;
  }
}

/**
 * Get only public configuration items (safe to send to client)
 */
export async function getPublicSiteConfig(useCache = true): Promise<SiteConfigItem[]> {
  const allConfig = await getAllSiteConfig(useCache);
  return allConfig.filter((item) => item.isPublic);
}

/**
 * Update a configuration item
 */
export async function updateSiteConfig(
  key: string,
  value: any,
  updatedBy?: string
): Promise<SiteConfigItem> {
  try {
    // Get existing config or default
    const existing = await getSiteConfig(key, false);
    if (!existing) {
      throw new Error(`Configuration key not found: ${key}`);
    }

    // Validate the new value
    validateConfigValue(existing, value);

    // Update the item
    const updated: SiteConfigItem = {
      ...existing,
      value,
      updatedAt: new Date().toISOString(),
      updatedBy,
    };

    const client = await getDynamoDBClientDirect();

    // If no client (no credentials), throw error
    if (!client) {
      throw new Error('AWS credentials not configured. Cannot update site config in DynamoDB.');
    }

    const command = new PutItemCommand({
      TableName: TABLE_NAME,
      Item: marshall(updated, { removeUndefinedValues: true })
    });
    await client.send(command);

    // Clear cache for this key and update with merged version
    configCache.delete(key);

    // Ensure the updated item has all metadata from defaults
    const mergedUpdated = mergeSingleItemWithDefault(updated);

    // Cache the merged result
    configCache.set(key, {
      value: mergedUpdated,
      expiresAt: Date.now() + CACHE_TTL,
    });

    return mergedUpdated;
  } catch (error: any) {
    // If table doesn't exist, provide helpful error message
    if (error.name === 'ResourceNotFoundException' || error.message?.includes('not found')) {
      throw new Error(`Site config table '${TABLE_NAME}' not found. Please run 'npx tsx scripts/init-site-config.ts' to initialize the table.`);
    }

    console.error(`Error updating site config for key ${key}:`, error);
    throw error;
  }
}

/**
 * Reset a configuration item to its default value
 */
export async function resetSiteConfig(key: string, updatedBy?: string): Promise<SiteConfigItem> {
  const defaultConfig = getDefaultConfig(key);
  if (!defaultConfig) {
    throw new Error(`No default configuration found for key: ${key}`);
  }

  return updateSiteConfig(key, defaultConfig.defaultValue, updatedBy);
}

/**
 * Reset all configuration items to defaults
 */
export async function resetAllSiteConfig(updatedBy?: string): Promise<void> {
  const timestamp = new Date().toISOString();
  const resetConfigs = DEFAULT_SITE_CONFIG.map((config) => ({
    ...config,
    value: config.defaultValue,
    updatedAt: timestamp,
    updatedBy,
  }));

  // Batch write in chunks of 25 (DynamoDB limit)
  const client = await getDynamoDBClientDirect();

  // If no client (no credentials), throw error
  if (!client) {
    throw new Error('AWS credentials not configured. Cannot reset site config in DynamoDB.');
  }

  for (let i = 0; i < resetConfigs.length; i += 25) {
    const chunk = resetConfigs.slice(i, i + 25);
    const command = new BatchWriteItemCommand({
      RequestItems: {
        [TABLE_NAME]: chunk.map(item => ({
          PutRequest: {
            Item: marshall(item, { removeUndefinedValues: true })
          }
        }))
      }
    });
    await client.send(command);
  }

  // Clear entire cache
  configCache.clear();
}

/**
 * Initialize the site config table with default values
 * Should be run once during setup
 */
export async function initializeSiteConfig(): Promise<void> {
  try {
    const timestamp = new Date().toISOString();
    const initialConfigs = DEFAULT_SITE_CONFIG.map((config) => ({
      ...config,
      createdAt: timestamp,
      updatedAt: timestamp,
    }));

    // Batch write in chunks of 25 (DynamoDB limit)
    const client = await getDynamoDBClientDirect();

    // If no client (no credentials), throw error
    if (!client) {
      throw new Error('AWS credentials not configured. Cannot initialize site config in DynamoDB.');
    }

    for (let i = 0; i < initialConfigs.length; i += 25) {
      const chunk = initialConfigs.slice(i, i + 25);
      const command = new BatchWriteItemCommand({
        RequestItems: {
          [TABLE_NAME]: chunk.map(item => ({
            PutRequest: {
              Item: marshall(item, { removeUndefinedValues: true })
            }
          }))
        }
      });
      await client.send(command);
    }

    console.log('Site config initialized successfully');
  } catch (error) {
    console.error('Error initializing site config:', error);
    throw error;
  }
}

/**
 * Get a configuration value by key with type-safe return
 */
export async function getConfigValue<T = any>(key: string, useCache = true): Promise<T | null> {
  const config = await getSiteConfig(key, useCache);
  return config ? (config.value as T) : null;
}

/**
 * Build a nested configuration object from flat config items
 * Converts 'features.strandsChat.enabled' to { features: { strandsChat: { enabled: true } } }
 */
export function buildNestedConfig(items: SiteConfigItem[]): Record<string, any> {
  const result: Record<string, any> = {};

  items.forEach((item) => {
    const keys = item.key.split('.');
    let current = result;

    keys.forEach((key, index) => {
      if (index === keys.length - 1) {
        current[key] = item.value;
      } else {
        current[key] = current[key] || {};
        current = current[key];
      }
    });
  });

  return result;
}

/**
 * Helper: Get default config by key
 */
function getDefaultConfig(key: string): SiteConfigItem | null {
  return DEFAULT_SITE_CONFIG.find((c) => c.key === key) || null;
}

/**
 * Helper: Merge a single DB item with its default metadata
 */
function mergeSingleItemWithDefault(dbItem: SiteConfigItem): SiteConfigItem {
  const defaultItem = DEFAULT_SITE_CONFIG.find((c) => c.key === dbItem.key);

  if (!defaultItem) {
    // DB item not in defaults - validate it has required fields
    if (!dbItem.type) {
      console.warn(`[Site Config] Orphaned config item "${dbItem.key}" is missing required type field. Skipping...`);
      // Return a minimal valid item to prevent crashes
      return {
        ...dbItem,
        type: 'string', // Default to string if type is missing
        category: dbItem.category || 'system',
        label: dbItem.label || dbItem.key,
        description: dbItem.description || 'Legacy configuration item (no longer in use)',
        defaultValue: dbItem.value,
        isPublic: dbItem.isPublic ?? false,
        isEditable: dbItem.isEditable ?? false,
      };
    }
    // Has type, return as-is
    return dbItem;
  }

  // Merge: keep DB value but use default metadata if missing
  return {
    ...defaultItem, // Start with all default fields
    ...dbItem,      // Override with DB values
    // Ensure critical metadata comes from defaults if missing in DB
    type: dbItem.type || defaultItem.type,
    category: dbItem.category || defaultItem.category,
    label: dbItem.label || defaultItem.label,
    description: dbItem.description || defaultItem.description,
    defaultValue: defaultItem.defaultValue,
    isPublic: dbItem.isPublic !== undefined ? dbItem.isPublic : defaultItem.isPublic,
    isEditable: dbItem.isEditable !== undefined ? dbItem.isEditable : defaultItem.isEditable,
    validation: dbItem.validation || defaultItem.validation,
  };
}

/**
 * Helper: Merge DB items with defaults
 */
function mergeWithDefaults(dbItems: SiteConfigItem[]): SiteConfigItem[] {
  const defaultsMap = new Map(DEFAULT_SITE_CONFIG.map((item) => [item.key, item]));
  const merged: SiteConfigItem[] = [];

  // Merge DB items with default metadata
  dbItems.forEach((dbItem) => {
    // Use the single-item merge helper for consistency
    const mergedItem = mergeSingleItemWithDefault(dbItem);
    merged.push(mergedItem);

    // Mark default as processed if it exists
    defaultsMap.delete(dbItem.key);
  });

  // Add missing defaults that weren't in DB
  defaultsMap.forEach((defaultItem) => {
    merged.push(defaultItem);
  });

  return merged;
}

/**
 * Helper: Validate config value against validation rules
 */
function validateConfigValue(config: SiteConfigItem, value: any): void {
  // Ensure config has type defined
  if (!config.type) {
    throw new Error(
      `Configuration item ${config.key} is missing type metadata. This should not happen - check database and defaults.`
    );
  }

  // Type check
  const valueType = Array.isArray(value) ? 'array' : typeof value;
  if (valueType !== config.type && config.type !== 'object') {
    throw new Error(
      `Invalid type for ${config.key}: expected ${config.type}, got ${valueType}`
    );
  }

  // Validation rules
  if (config.validation) {
    const { min, max, pattern, allowedValues } = config.validation;

    // Numeric min/max
    if (typeof value === 'number') {
      if (min !== undefined && value < min) {
        throw new Error(`Value for ${config.key} must be at least ${min}`);
      }
      if (max !== undefined && value > max) {
        throw new Error(`Value for ${config.key} must be at most ${max}`);
      }
    }

    // String pattern
    if (typeof value === 'string' && pattern) {
      const regex = new RegExp(pattern);
      if (!regex.test(value)) {
        throw new Error(`Value for ${config.key} does not match required pattern`);
      }
    }

    // Allowed values
    if (allowedValues && !allowedValues.includes(value)) {
      throw new Error(
        `Value for ${config.key} must be one of: ${allowedValues.join(', ')}`
      );
    }
  }
}

/**
 * Clear the cache (useful for testing or forced refresh)
 */
export function clearSiteConfigCache(): void {
  configCache.clear();
}

/**
 * Save a change history entry to DynamoDB
 * History entries use a composite key: PK=CONFIG#key, SK=HISTORY#timestamp
 */
export async function saveConfigHistory(
  key: string,
  oldValue: any,
  newValue: any,
  changedBy: string,
  reason?: string
): Promise<void> {
  try {
    const client = await getDynamoDBClientDirect();

    if (!client) {
      console.warn('Cannot save config history: AWS credentials not available');
      return;
    }

    const timestamp = new Date().toISOString();
    const historyEntry: SiteConfigHistoryEntry = {
      key,
      oldValue,
      newValue,
      changedBy,
      changedAt: timestamp,
      reason,
    };

    // Store history with composite key for efficient querying
    const historyItem = {
      PK: `CONFIG#${key}`,
      SK: `HISTORY#${timestamp}`,
      ...historyEntry,
    };

    const command = new PutItemCommand({
      TableName: TABLE_NAME,
      Item: marshall(historyItem, { removeUndefinedValues: true }),
    });

    await client.send(command);
  } catch (error) {
    console.error('Error saving config history:', error);
    // Don't throw - history is nice-to-have, not critical
  }
}

/**
 * Get change history for a specific configuration key
 */
export async function getConfigHistory(key: string, limit = 50): Promise<SiteConfigHistoryEntry[]> {
  try {
    const client = await getDynamoDBClientDirect();

    if (!client) {
      console.warn('Cannot retrieve config history: AWS credentials not available');
      return [];
    }

    const command = new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: marshall({
        ':pk': `CONFIG#${key}`,
        ':sk': 'HISTORY#',
      }),
      ScanIndexFilter: undefined,
      Limit: limit,
      ScanIndexForward: false, // Most recent first
    });

    const response = await client.send(command);
    const items = response.Items ? response.Items.map(item => {
      const unmarshalled = unmarshall(item);
      // Remove DynamoDB keys from result
      const { PK, SK, ...historyEntry } = unmarshalled;
      return historyEntry as SiteConfigHistoryEntry;
    }) : [];

    return items;
  } catch (error) {
    console.error(`Error fetching config history for key ${key}:`, error);
    return [];
  }
}

/**
 * Get change history for all configuration changes
 */
export async function getAllConfigHistory(limit = 100): Promise<SiteConfigHistoryEntry[]> {
  try {
    const client = await getDynamoDBClientDirect();

    if (!client) {
      console.warn('Cannot retrieve config history: AWS credentials not available');
      return [];
    }

    const command = new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'begins_with(SK, :sk)',
      ExpressionAttributeValues: marshall({
        ':sk': 'HISTORY#',
      }),
      Limit: limit,
    });

    const response = await client.send(command);
    const items = response.Items ? response.Items.map(item => {
      const unmarshalled = unmarshall(item);
      // Remove DynamoDB keys from result
      const { PK, SK, ...historyEntry } = unmarshalled;
      return historyEntry as SiteConfigHistoryEntry;
    }) : [];

    // Sort by timestamp descending (most recent first)
    items.sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime());

    return items;
  } catch (error) {
    console.error('Error fetching all config history:', error);
    return [];
  }
}
