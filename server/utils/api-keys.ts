/**
 * API Key Management System
 * Handles creation, validation, and management of API keys for non-interactive access
 * Uses DynamoDB for persistent storage across ECS deployments
 */

import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { putItem, getItem, scanItems, updateItem, deleteItem } from './dynamodb'
import { accountCache } from './cache-manager'

export interface ApiKey {
  id: string
  name: string
  keyHash: string
  salt: string
  scopes: string[]
  createdAt: Date
  expiresAt?: Date
  lastUsedAt?: Date
  isActive: boolean
  createdBy: string
  metadata?: Record<string, any>
}

export interface ApiKeyValidation {
  valid: boolean
  id?: string
  scopes?: string[]
  error?: string
}

export interface CreateApiKeyRequest {
  name: string
  scopes: string[]
  expiresInDays?: number
  metadata?: Record<string, any>
}

export interface CreateApiKeyResponse {
  id: string
  name: string
  key: string  // Plain text key - only returned on creation
  scopes: string[]
  expiresAt?: Date
}

/**
 * Available scopes for API keys
 */
export const API_KEY_SCOPES = {
  'entra:read': 'Read access to Entra ID data',
  'entra:write': 'Write access to Entra ID data',
  'entra:admin': 'Administrative access to Entra ID APIs',
  'accounts:read': 'Read access to AWS account data',
  'groups:read': 'Read access to group data',
  'users:read': 'Read access to user data',
  'cache:manage': 'Manage cache operations'
} as const

/**
 * Generate a secure API key
 */
function generateApiKey(): string {
  // Format: gdms_[environment]_[32-char-hex]
  const environment = process.env.NODE_ENV || 'dev'
  const keyPart = randomBytes(16).toString('hex')
  return `gdms_${environment}_${keyPart}`
}

/**
 * Hash an API key for storage
 */
function hashApiKey(key: string, salt: string): string {
  return scryptSync(key, salt, 64).toString('hex')
}

/**
 * Generate salt for API key hashing
 */
function generateSalt(): string {
  return randomBytes(16).toString('hex')
}

/**
 * DynamoDB table name for API keys
 */
const API_KEYS_TABLE = process.env.DYNAMODB_API_KEYS_TABLE || 'ghost-api-keys'

/**
 * DynamoDB environment for API keys storage
 */
const API_KEYS_ENVIRONMENT: 'commercial' | 'govcloud' = 
  (process.env.API_KEYS_STORAGE_ENV as 'commercial' | 'govcloud') || 'commercial'

/**
 * Load all API keys from DynamoDB
 */
async function loadApiKeys(): Promise<ApiKey[]> {
  try {
    // Check cache first for performance
    const cacheKey = 'api_keys:all'
    const cached = await accountCache.get(cacheKey)
    if (cached) {
      return cached
    }
    
    // Scan DynamoDB table
    const result = await scanItems(API_KEYS_TABLE, undefined, undefined, undefined, API_KEYS_ENVIRONMENT)
    const items = result.items
    const apiKeys: ApiKey[] = items.map(item => ({
      id: item.id,
      name: item.name,
      keyHash: item.keyHash,
      salt: item.salt,
      scopes: item.scopes,
      isActive: item.isActive,
      createdBy: item.createdBy,
      metadata: item.metadata,
      createdAt: new Date(item.createdAt),
      expiresAt: item.expiresAt ? new Date(item.expiresAt) : undefined,
      lastUsedAt: item.lastUsedAt ? new Date(item.lastUsedAt) : undefined
    }))
    
    // Cache for 5 minutes to reduce DynamoDB calls
    await accountCache.set(cacheKey, apiKeys, { ttl: 300 })
    
    return apiKeys
  } catch (error: any) {
    // Handle table not existing gracefully
    if (error.name === 'ResourceNotFoundException' || error.message?.includes('Requested resource not found')) {
      console.log(`API keys table ${API_KEYS_TABLE} does not exist yet in ${API_KEYS_ENVIRONMENT} environment`)
      return []
    }
    console.error('Failed to load API keys from DynamoDB:', error)
    return []
  }
}

/**
 * Save a single API key to DynamoDB
 */
async function saveApiKey(apiKey: ApiKey): Promise<void> {
  try {
    // Convert dates to ISO strings for DynamoDB
    const dbItem = {
      ...apiKey,
      createdAt: apiKey.createdAt.toISOString(),
      expiresAt: apiKey.expiresAt?.toISOString(),
      lastUsedAt: apiKey.lastUsedAt?.toISOString()
    }
    
    await putItem(API_KEYS_TABLE, dbItem, API_KEYS_ENVIRONMENT)
    
    // Invalidate cache
    await accountCache.delete('api_keys:all')
  } catch (error) {
    console.error('Failed to save API key to DynamoDB:', error)
    throw error
  }
}

/**
 * Update API key in DynamoDB
 */
async function updateApiKey(id: string, updates: Partial<ApiKey>): Promise<void> {
  try {
    // Convert dates to ISO strings
    const dbUpdates: any = { ...updates }
    if (dbUpdates.lastUsedAt) {
      dbUpdates.lastUsedAt = dbUpdates.lastUsedAt.toISOString()
    }
    if (dbUpdates.expiresAt) {
      dbUpdates.expiresAt = dbUpdates.expiresAt.toISOString()
    }
    
    await updateItem(
      API_KEYS_TABLE,
      { id },
      dbUpdates,
      API_KEYS_ENVIRONMENT
    )
    
    // Invalidate cache
    await accountCache.delete('api_keys:all')
  } catch (error) {
    console.error('Failed to update API key in DynamoDB:', error)
    throw error
  }
}

/**
 * Create a new API key
 */
export async function createApiKey(
  request: CreateApiKeyRequest,
  createdBy: string
): Promise<CreateApiKeyResponse> {
  try {
    // Validate scopes
    const invalidScopes = request.scopes.filter(scope => 
      !Object.keys(API_KEY_SCOPES).includes(scope)
    )
    
    if (invalidScopes.length > 0) {
      throw new Error(`Invalid scopes: ${invalidScopes.join(', ')}`)
    }
    
    // Generate key and hash
    const plainKey = generateApiKey()
    const salt = generateSalt()
    const keyHash = hashApiKey(plainKey, salt)
    const id = randomBytes(8).toString('hex')
    
    // Calculate expiration
    let expiresAt: Date | undefined
    if (request.expiresInDays) {
      expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + request.expiresInDays)
    }
    
    // Create API key record
    const apiKey: ApiKey = {
      id,
      name: request.name,
      keyHash,
      salt,
      scopes: request.scopes,
      createdAt: new Date(),
      expiresAt,
      isActive: true,
      createdBy,
      metadata: request.metadata
    }
    
    // Save to DynamoDB
    await saveApiKey(apiKey)
    
    console.log(`Created API key ${id} for ${createdBy} with scopes: ${request.scopes.join(', ')}`)
    
    return {
      id,
      name: request.name,
      key: plainKey,
      scopes: request.scopes,
      expiresAt
    }
  } catch (error) {
    console.error('Failed to create API key:', error)
    throw error
  }
}

/**
 * Validate an API key
 */
export async function validateApiKey(key: string): Promise<ApiKeyValidation> {
  try {
    const apiKeys = await loadApiKeys()
    
    for (const apiKey of apiKeys) {
      // Skip inactive keys
      if (!apiKey.isActive) {
        continue
      }
      
      // Skip expired keys
      if (apiKey.expiresAt && new Date() > apiKey.expiresAt) {
        continue
      }
      
      // Check if key matches
      const keyHash = hashApiKey(key, apiKey.salt)
      const storedHash = Buffer.from(apiKey.keyHash, 'hex')
      const providedHash = Buffer.from(keyHash, 'hex')
      
      if (storedHash.length === providedHash.length && 
          timingSafeEqual(storedHash, providedHash)) {
        
        // Update last used timestamp
        await updateApiKey(apiKey.id, { lastUsedAt: new Date() })
        
        return {
          valid: true,
          id: apiKey.id,
          scopes: apiKey.scopes
        }
      }
    }
    
    return {
      valid: false,
      error: 'Invalid API key'
    }
  } catch (error) {
    console.error('API key validation error:', error)
    return {
      valid: false,
      error: 'API key validation failed'
    }
  }
}

/**
 * List API keys (without revealing the actual keys)
 */
export async function listApiKeys(createdBy?: string): Promise<Omit<ApiKey, 'keyHash' | 'salt'>[]> {
  try {
    const apiKeys = await loadApiKeys()
    
    return apiKeys
      .filter(key => !createdBy || key.createdBy === createdBy)
      .map(({ keyHash, salt, ...key }) => key)
  } catch (error) {
    console.error('Failed to list API keys:', error)
    return []
  }
}

/**
 * Deactivate an API key
 */
export async function deactivateApiKey(keyId: string, userId: string): Promise<boolean> {
  try {
    // Get the specific API key
    const apiKey = await getItem(API_KEYS_TABLE, { id: keyId }, API_KEYS_ENVIRONMENT)
    
    if (!apiKey) {
      return false
    }
    
    // Check if user has permission to deactivate this key
    if (apiKey.createdBy !== userId) {
      throw new Error('Insufficient permissions to deactivate this API key')
    }
    
    // Update to inactive
    await updateApiKey(keyId, { isActive: false })
    
    console.log(`Deactivated API key ${keyId} by ${userId}`)
    return true
  } catch (error) {
    console.error('Failed to deactivate API key:', error)
    throw error
  }
}

/**
 * Clean up expired API keys
 */
export async function cleanupExpiredKeys(): Promise<number> {
  try {
    const apiKeys = await loadApiKeys()
    const now = new Date()
    let removedCount = 0
    
    for (const key of apiKeys) {
      // Mark expired keys as inactive
      if (key.isActive && key.expiresAt && key.expiresAt <= now) {
        await updateApiKey(key.id, { isActive: false })
        removedCount++
      }
    }
    
    if (removedCount > 0) {
      console.log(`Cleaned up ${removedCount} expired API keys`)
      // Invalidate cache
      await accountCache.delete('api_keys:all')
    }
    
    return removedCount
  } catch (error) {
    console.error('Failed to cleanup expired keys:', error)
    return 0
  }
}

/**
 * Get API key usage statistics
 */
export async function getApiKeyStats(): Promise<{
  total: number
  active: number
  expired: number
  byScope: Record<string, number>
}> {
  try {
    const apiKeys = await loadApiKeys()
    const now = new Date()
    
    const stats = {
      total: apiKeys.length,
      active: 0,
      expired: 0,
      byScope: {} as Record<string, number>
    }
    
    for (const key of apiKeys) {
      if (key.isActive && (!key.expiresAt || key.expiresAt > now)) {
        stats.active++
      } else {
        stats.expired++
      }
      
      // Count scopes
      for (const scope of key.scopes) {
        stats.byScope[scope] = (stats.byScope[scope] || 0) + 1
      }
    }
    
    return stats
  } catch (error) {
    console.error('Failed to get API key stats:', error)
    return { total: 0, active: 0, expired: 0, byScope: {} }
  }
}