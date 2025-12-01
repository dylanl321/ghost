/**
 * Site Configuration Management
 *
 * Server-side utilities for managing site configuration in DynamoDB.
 * Provides CRUD operations with caching for performance.
 */

import { getItem, putItem, scanItems, batchPutItems } from './dynamodb';
import type { SiteConfigItem } from '../../shared/types/site-config';
import { DEFAULT_SITE_CONFIG } from '../../shared/types/site-config';

const TABLE_NAME = 'ghost-site-config';
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// In-memory cache for config values
const configCache = new Map<string, { value: SiteConfigItem; expiresAt: number }>();

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
    const { environment, accountId } = getSiteConfigContext();
    const item = await getItem<SiteConfigItem>(
      TABLE_NAME,
      { key },
      environment,
      accountId
    );

    if (item) {
      // Cache the result
      configCache.set(key, {
        value: item,
        expiresAt: Date.now() + CACHE_TTL,
      });
      return item;
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
    const { environment, accountId } = getSiteConfigContext();

    const { items } = await scanItems<SiteConfigItem>(
      TABLE_NAME,
      undefined, // no filter
      undefined, // no limit
      undefined, // no lastEvaluatedKey
      environment,
      undefined, // no expressionAttributeNames
      undefined, // no expressionAttributeValues
      accountId
    );

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

    const { environment, accountId } = getSiteConfigContext();
    await putItem(TABLE_NAME, updated, environment, accountId);

    // Clear cache for this key
    configCache.delete(key);

    return updated;
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

  const { environment, accountId } = getSiteConfigContext();
  await batchPutItems(TABLE_NAME, resetConfigs, environment, accountId);

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

    const { environment, accountId } = getSiteConfigContext();
    await batchPutItems(TABLE_NAME, initialConfigs, environment, accountId);

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
 * Helper: Merge DB items with defaults
 */
function mergeWithDefaults(dbItems: SiteConfigItem[]): SiteConfigItem[] {
  const dbKeys = new Set(dbItems.map((item) => item.key));
  const merged = [...dbItems];

  // Add missing defaults
  DEFAULT_SITE_CONFIG.forEach((defaultItem) => {
    if (!dbKeys.has(defaultItem.key)) {
      merged.push(defaultItem);
    }
  });

  return merged;
}

/**
 * Helper: Validate config value against validation rules
 */
function validateConfigValue(config: SiteConfigItem, value: any): void {
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
