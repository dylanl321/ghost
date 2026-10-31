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
  BatchWriteItemCommand
} from '@aws-sdk/client-dynamodb';
import type { BatchWriteItemCommandOutput, ScanCommandInput } from '@aws-sdk/client-dynamodb';
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import type { SiteConfigItem, SiteConfigHistoryEntry } from '../../shared/types/site-config';
import { DEFAULT_SITE_CONFIG, isRetiredSiteConfigKey } from '../../shared/types/site-config';

const TABLE_NAME = process.env.SITE_CONFIG_TABLE || 'ghost-site-config';
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// In-memory cache for config values
const configCache = new Map<string, { value: SiteConfigItem; expiresAt: number }>();

/**
 * The site-config table's only key is `key`, so change history is stored as
 * separate rows whose key starts with this prefix: history#<configKey>#<changedAt>.
 */
export const HISTORY_KEY_PREFIX = 'history#';

export function historyRowKey(configKey: string, changedAt: string): string {
  return `${HISTORY_KEY_PREFIX}${configKey}#${changedAt}`;
}

/** Error with an HTTP status, so routes can pass it straight to createError. */
export class SiteConfigError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = 'SiteConfigError';
  }
}

/**
 * Earlier versions wrote history rows with the config key itself as the table
 * key, which overwrote the setting with { key, PK, SK, oldValue, newValue, ... }.
 * Such a row still holds the value the admin saved in newValue, so read it as
 * that setting instead of silently falling back to the default.
 */
export function normalizeStoredItem(item: Record<string, any>): Record<string, any> {
  if (typeof item.SK === 'string' && item.SK.startsWith('HISTORY#') && !('value' in item) && 'newValue' in item) {
    const defaultItem = DEFAULT_SITE_CONFIG.find(c => c.key === item.key);
    return {
      ...(defaultItem ?? {}),
      key: item.key,
      value: item.newValue,
      updatedAt: item.changedAt,
      updatedBy: item.changedBy,
    };
  }
  return item;
}

/** Scan every page of the table (a single Scan stops at 1 MB). */
async function scanAll(
  client: DynamoDBClient,
  input: Omit<ScanCommandInput, 'TableName' | 'ExclusiveStartKey'> = {}
): Promise<Record<string, any>[]> {
  const items: Record<string, any>[] = [];
  let startKey: Record<string, any> | undefined;
  do {
    const response = await client.send(new ScanCommand({ ...input, TableName: TABLE_NAME, ExclusiveStartKey: startKey }));
    for (const item of response.Items ?? []) items.push(unmarshall(item));
    startKey = response.LastEvaluatedKey;
  } while (startKey);
  return items;
}

/** BatchWriteItem in chunks of 25, retrying anything DynamoDB returns as unprocessed. */
async function batchPutAll(client: DynamoDBClient, items: Record<string, any>[]): Promise<void> {
  for (let i = 0; i < items.length; i += 25) {
    let requests: any[] | undefined = items.slice(i, i + 25).map(item => ({
      PutRequest: { Item: marshall(item, { removeUndefinedValues: true }) }
    }));
    for (let attempt = 0; requests && requests.length > 0; attempt++) {
      if (attempt >= 5) {
        throw new Error(`Site config batch write left ${requests.length} item(s) unprocessed`);
      }
      if (attempt > 0) await new Promise(resolve => setTimeout(resolve, 100 * 2 ** attempt));
      const response: BatchWriteItemCommandOutput = await client.send(new BatchWriteItemCommand({ RequestItems: { [TABLE_NAME]: requests } }));
      requests = response.UnprocessedItems?.[TABLE_NAME];
    }
  }
}

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
    logger.info('[Site Config] DynamoDB client credentials expired, refreshing...');
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
      logger.error('Failed to assume role for site-config access');
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

    logger.info(`[Site Config] Created DynamoDB client for deployment account ${deploymentAccountId}, expires at ${assumeRoleResponse.Credentials.Expiration.toISOString()}`);

    return client;
  } catch (error) {
    logger.error('Error assuming role for site-config:', error);
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
  if (isRetiredSiteConfigKey(key)) return null;
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
    const item = response.Item ? normalizeStoredItem(unmarshall(response.Item)) as SiteConfigItem : null;

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
    logger.error(`Error fetching site config for key ${key}:`, error);
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
      logger.warn('AWS credentials not available, using default site config');
      return DEFAULT_SITE_CONFIG;
    }

    const items = (await scanAll(client))
      .map(item => normalizeStoredItem(item) as SiteConfigItem)
      .filter(item => !isRetiredSiteConfigKey(item.key) && isSiteConfigItem(item));

    // If DB is empty or has fewer items than defaults, merge with defaults
    if (items.length === 0) {
      logger.warn('Site config table is empty, using defaults');
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
    if ((error instanceof Error ? error.name : "Error") === 'ResourceNotFoundException' || (error instanceof Error ? error.message : String(error))?.includes('not found')) {
      logger.warn(`Site config table '${TABLE_NAME}' not found, using defaults. Run 'npx tsx scripts/init-site-config.ts' to initialize.`);
      return DEFAULT_SITE_CONFIG;
    }

    logger.error('Error fetching all site config:', error);
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
      throw new SiteConfigError(`Configuration key not found: ${key}`, 404);
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
    if (error instanceof SiteConfigError) throw error;
    // If table doesn't exist, provide helpful error message
    if ((error instanceof Error ? error.name : "Error") === 'ResourceNotFoundException') {
      throw new Error(`Site config table '${TABLE_NAME}' not found. Please run 'npx tsx scripts/init-site-config.ts' to initialize the table.`);
    }

    logger.error(`Error updating site config for key ${key}:`, error);
    throw error;
  }
}

/**
 * Update a configuration item and record the change in its history.
 */
export async function updateSiteConfigWithHistory(
  key: string,
  value: any,
  updatedBy: string,
  reason?: string
): Promise<SiteConfigItem> {
  const previous = await getSiteConfig(key, false);
  const updated = await updateSiteConfig(key, value, updatedBy);
  await saveConfigHistory(key, previous?.value ?? null, value, updatedBy, reason);
  return updated;
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
 * Reset all configuration items to defaults.
 *
 * `excludeKeys` optionally preserves specific keys (they are neither reset nor
 * rewritten). This is used to keep capability-gated keys (e.g. `oauth.alerts.*`)
 * out of a generic "reset all" performed by a caller who does not hold the
 * required capability, so the generic reset route cannot become a bypass.
 */
export async function resetAllSiteConfig(updatedBy?: string, excludeKeys: readonly string[] = []): Promise<void> {
  const timestamp = new Date().toISOString();
  const excluded = new Set(excludeKeys);
  const resetConfigs = DEFAULT_SITE_CONFIG
    .filter((config) => !excluded.has(config.key))
    .map((config) => ({
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

  await batchPutAll(client, resetConfigs);

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

    await batchPutAll(client, initialConfigs);

    logger.info('Site config initialized successfully');
  } catch (error) {
    logger.error('Error initializing site config:', error);
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
 * Converts 'features.reportScheduler.enabled' to { features: { reportScheduler: { enabled: true } } }
 */
export function buildNestedConfig(items: SiteConfigItem[]): Record<string, any> {
  const result: Record<string, any> = {};

  items.filter(item => !isRetiredSiteConfigKey(item.key)).forEach((item) => {
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

const NON_CONFIG_KEY_PREFIXES = ['security:', HISTORY_KEY_PREFIX]

// Track which orphan keys we've already warned about to avoid log spam
const warnedOrphanKeys = new Set<string>()

function isSiteConfigItem(item: Record<string, any>): boolean {
  if (NON_CONFIG_KEY_PREFIXES.some(prefix => item.key?.startsWith(prefix))) {
    return false
  }
  return Boolean(item.type && item.category)
}

/**
 * Helper: Merge a single DB item with its default metadata
 */
function mergeSingleItemWithDefault(dbItem: SiteConfigItem): SiteConfigItem {
  const defaultItem = DEFAULT_SITE_CONFIG.find((c) => c.key === dbItem.key);

  if (!defaultItem) {
    // DB item not in defaults - validate it has required fields
    if (!dbItem.type) {
      if (!warnedOrphanKeys.has(dbItem.key)) {
        warnedOrphanKeys.add(dbItem.key);
        logger.warn(`[Site Config] Orphaned config item "${dbItem.key}" has no type field. Defaulting to type 'string'.`);
      }
      return {
        ...dbItem,
        type: 'string',
        category: dbItem.category || 'system',
        label: dbItem.label || dbItem.key,
        description: dbItem.description || '',
        defaultValue: dbItem.value,
        isPublic: dbItem.isPublic ?? false,
        isEditable: dbItem.isEditable ?? false,
      };
    }
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

  const configItems = dbItems.filter((item) => {
    if (!isSiteConfigItem(item)) {
      logger.debug(`[Site Config] Skipping non-config item "${item.key}" in site-config table`)
      return false
    }
    return true
  })

  configItems.forEach((dbItem) => {
    const mergedItem = mergeSingleItemWithDefault(dbItem);
    merged.push(mergedItem);

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
    throw new SiteConfigError(
      `Invalid type for ${config.key}: expected ${config.type}, got ${valueType}`,
      400
    );
  }

  // Validation rules
  if (config.validation) {
    const { min, max, pattern, allowedValues } = config.validation;

    // Numeric min/max
    if (typeof value === 'number') {
      if (min !== undefined && value < min) {
        throw new SiteConfigError(`Value for ${config.key} must be at least ${min}`, 400);
      }
      if (max !== undefined && value > max) {
        throw new SiteConfigError(`Value for ${config.key} must be at most ${max}`, 400);
      }
    }

    // String pattern
    if (typeof value === 'string' && pattern) {
      const regex = new RegExp(pattern);
      if (!regex.test(value)) {
        throw new SiteConfigError(`Value for ${config.key} does not match required pattern`, 400);
      }
    }

    // Allowed values
    if (allowedValues && !allowedValues.includes(value)) {
      throw new SiteConfigError(
        `Value for ${config.key} must be one of: ${allowedValues.join(', ')}`,
        400
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
 * Write a raw key-value to the site-config table without requiring
 * the key to exist in DEFAULT_SITE_CONFIG. Used for dynamic runtime data
 * like source heartbeats that don't belong in the static defaults.
 */
export async function putSiteConfigRaw(key: string, value: any): Promise<void> {
  const client = await getDynamoDBClientDirect();
  if (!client) return;

  const item: Record<string, any> = {
    key,
    value,
    type: 'object',
    category: 'system',
    label: key,
    description: `Auto-generated runtime value for ${key}`,
    isPublic: false,
    isEditable: false,
    updatedAt: new Date().toISOString()
  };

  await client.send(new PutItemCommand({
    TableName: TABLE_NAME,
    Item: marshall(item, { removeUndefinedValues: true })
  }));

  // Update in-memory cache
  configCache.set(key, {
    value: item as SiteConfigItem,
    expiresAt: Date.now() + CACHE_TTL
  });
}

/**
 * Save a change history entry to DynamoDB, as its own row keyed
 * history#<configKey>#<changedAt> (see HISTORY_KEY_PREFIX).
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
      logger.warn('Cannot save config history: AWS credentials not available');
      return;
    }

    const changedAt = new Date().toISOString();
    const historyItem = {
      key: historyRowKey(key, changedAt),
      configKey: key,
      oldValue,
      newValue,
      changedBy,
      changedAt,
      reason,
    };

    await client.send(new PutItemCommand({
      TableName: TABLE_NAME,
      Item: marshall(historyItem, { removeUndefinedValues: true }),
    }));
  } catch (error) {
    logger.error('Error saving config history:', error);
    // Don't throw - history is nice-to-have, not critical
  }
}

export function toHistoryEntry(row: Record<string, any>): SiteConfigHistoryEntry {
  return {
    key: row.configKey,
    oldValue: row.oldValue,
    newValue: row.newValue,
    changedBy: row.changedBy,
    changedAt: row.changedAt,
    reason: row.reason,
  };
}

async function scanHistory(prefix: string, limit: number): Promise<SiteConfigHistoryEntry[]> {
  const client = await getDynamoDBClientDirect();

  if (!client) {
    logger.warn('Cannot retrieve config history: AWS credentials not available');
    return [];
  }

  // Filters apply after a Scan reads each page, so every page is read and the
  // newest entries are kept.
  const rows = await scanAll(client, {
    FilterExpression: 'begins_with(#k, :prefix)',
    ExpressionAttributeNames: { '#k': 'key' },
    ExpressionAttributeValues: marshall({ ':prefix': prefix }),
  });

  return rows
    .map(toHistoryEntry)
    .sort((a, b) => b.changedAt.localeCompare(a.changedAt))
    .slice(0, limit);
}

/**
 * Get change history for a specific configuration key, most recent first
 */
export async function getConfigHistory(key: string, limit = 50): Promise<SiteConfigHistoryEntry[]> {
  return scanHistory(`${HISTORY_KEY_PREFIX}${key}#`, limit);
}

/**
 * Get change history for all configuration changes, most recent first
 */
export async function getAllConfigHistory(limit = 100): Promise<SiteConfigHistoryEntry[]> {
  return scanHistory(HISTORY_KEY_PREFIX, limit);
}
