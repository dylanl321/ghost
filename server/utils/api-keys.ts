/**
 * API Key Management System
 * Handles creation, validation, and management of API keys for non-interactive access
 * Uses DynamoDB for persistent storage across ECS deployments
 */

import { createHash, randomBytes, scrypt, timingSafeEqual } from 'crypto'
import { promisify } from 'util'
import { createError } from 'h3'
import { putItem, getItem, scanItems, updateItem } from './dynamodb'
import { accountCache } from './cache-manager'
import { getTableName, getTableEnvironment, getTableAccountId } from '../lib/dynamodb-config'
import { logger } from './logger'

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
  /** 'v2' keys embed their id; absent on keys issued before that format. */
  keyFormat?: 'v2'
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
  neverExpires?: boolean
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
  'accounts:read': 'Read access to AWS account data',
  'costs:read': 'View AWS cost data and reports',
  'forecast:read': 'View cost forecast data',
  'security:read': 'View Security Hub summaries and findings',
  // Existing dedicated VMaaS keys retain this scope and their separate allowlist.
  'vmaas:costs:read': 'Read fixed-account VMaaS cost projections'
} as const

export const INTEGRATION_API_KEY_SCOPES = [
  'accounts:read',
  'costs:read',
  'forecast:read',
  'security:read'
] as const

const MAX_METADATA_BYTES = 4096

export function validateIntegrationApiKeyRequest(request: CreateApiKeyRequest): string | null {
  if (!request || typeof request !== 'object') return 'Request body must be a JSON object'
  if (typeof request.name !== 'string' || request.name.trim().length === 0) return 'API key name is required'
  if (request.name.trim().length > 100) return 'API key name must be 100 characters or fewer'
  if (!Array.isArray(request.scopes) || request.scopes.length === 0) return 'At least one scope is required'

  const invalidScopes = request.scopes.filter(scope =>
    !(INTEGRATION_API_KEY_SCOPES as readonly string[]).includes(scope)
  )
  if (invalidScopes.length > 0) {
    return `Invalid scopes: ${invalidScopes.join(', ')}. Valid scopes: ${INTEGRATION_API_KEY_SCOPES.join(', ')}`
  }
  if (request.neverExpires && request.expiresInDays !== undefined) {
    return 'Choose either an expiration or Never expires'
  }
  if (request.expiresInDays !== undefined &&
    (!Number.isInteger(request.expiresInDays) || request.expiresInDays < 1 || request.expiresInDays > 365)) {
    return 'Expiration must be a whole number between 1 and 365 days'
  }
  if (request.neverExpires !== undefined && typeof request.neverExpires !== 'boolean') {
    return 'neverExpires must be a boolean'
  }
  return validateApiKeyMetadata(request.metadata)
}

/**
 * Metadata is caller-owned free-form data, but it is stored on the key record
 * and returned on every list call, so it must stay a small plain object.
 */
export function validateApiKeyMetadata(metadata: unknown): string | null {
  if (metadata === undefined) return null
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return 'metadata must be a JSON object'
  }
  if (Buffer.byteLength(JSON.stringify(metadata)) > MAX_METADATA_BYTES) {
    return `metadata must be ${MAX_METADATA_BYTES} bytes or fewer`
  }
  return null
}

/** Metadata keys GHOST sets itself; callers cannot overwrite them. */
export const RESERVED_API_KEY_METADATA = ['integrationContract'] as const

export function stripReservedApiKeyMetadata(metadata: Record<string, any> = {}): Record<string, any> {
  return Object.fromEntries(Object.entries(metadata).filter(([key]) =>
    !(RESERVED_API_KEY_METADATA as readonly string[]).includes(key)))
}

export function isApiKeyOwner(apiKey: Pick<ApiKey, 'createdBy'> | null | undefined, userId: string): boolean {
  return Boolean(apiKey && userId && apiKey.createdBy.toLowerCase() === userId.toLowerCase())
}

// Current keys embed their record id so validation is one lookup and one hash:
//   gdms_<environment>_<16-hex id>_<32-hex secret>
// Keys issued before the id was embedded keep working: gdms_<environment>_<32-hex secret>
const API_KEY_PATTERN = /^gdms_([a-z0-9-]{1,32})_([0-9a-f]{16})_([0-9a-f]{32})$/
const LEGACY_API_KEY_PATTERN = /^gdms_([a-z0-9-]{1,32})_([0-9a-f]{32})$/

export type ParsedApiKey =
  | { format: 'v2', id: string }
  | { format: 'legacy' }

/**
 * Classify a presented key without touching storage, so malformed headers are
 * rejected before any scrypt work or DynamoDB read.
 */
export function parseApiKey(key: unknown): ParsedApiKey | null {
  if (typeof key !== 'string' || key.length > 128) return null
  const match = API_KEY_PATTERN.exec(key)
  if (match) return { format: 'v2', id: match[2]! }
  return LEGACY_API_KEY_PATTERN.test(key) ? { format: 'legacy' } : null
}

/**
 * Generate a secure API key
 */
function generateApiKey(id: string): string {
  const environment = (process.env.NODE_ENV || 'dev').toLowerCase().replace(/[^a-z0-9-]/g, '') || 'dev'
  const keyPart = randomBytes(16).toString('hex')
  return `gdms_${environment}_${id}_${keyPart}`
}

const scryptAsync = promisify(scrypt) as (password: string, salt: string, keylen: number) => Promise<Buffer>

/**
 * Hash an API key for storage. Runs on the libuv pool so a burst of API
 * requests does not block the event loop.
 */
async function hashApiKey(key: string, salt: string): Promise<string> {
  return (await scryptAsync(key, salt, 64)).toString('hex')
}

async function apiKeyMatches(key: string, apiKey: Pick<ApiKey, 'keyHash' | 'salt'>): Promise<boolean> {
  if (!apiKey.keyHash || !apiKey.salt) return false
  const storedHash = Buffer.from(apiKey.keyHash, 'hex')
  const providedHash = Buffer.from(await hashApiKey(key, apiKey.salt), 'hex')
  return storedHash.length === providedHash.length && timingSafeEqual(storedHash, providedHash)
}

/**
 * Generate salt for API key hashing
 */
function generateSalt(): string {
  return randomBytes(16).toString('hex')
}

/**
 * DynamoDB table configuration
 * Table names and environment are now loaded dynamically from config (Secrets Manager or env vars)
 * This allows centralized configuration management
 */

/**
 * Retention period for usage history in days
 */
const USAGE_RETENTION_DAYS = parseInt(process.env.API_KEY_USAGE_RETENTION_DAYS || '90')

function toApiKey(item: Record<string, any>): ApiKey {
  return {
    id: item.id,
    name: item.name,
    keyHash: item.keyHash,
    salt: item.salt,
    scopes: Array.isArray(item.scopes) ? item.scopes : [],
    isActive: item.isActive === 'true' || item.isActive === true, // Convert string to boolean
    createdBy: item.createdBy,
    metadata: item.metadata,
    keyFormat: item.keyFormat === 'v2' ? 'v2' : undefined,
    createdAt: new Date(item.createdAt),
    expiresAt: item.expiresAt ? new Date(item.expiresAt) : undefined,
    lastUsedAt: item.lastUsedAt ? new Date(item.lastUsedAt) : undefined
  }
}

/**
 * How long a single key record is trusted before it is re-read. This bounds how
 * long a revoked or expired key keeps working on a task that did not process
 * the revocation itself.
 */
const KEY_RECORD_TTL_MS = Number(process.env.API_KEY_RECORD_CACHE_SECONDS || 30) * 1000
const MAX_CACHED_RECORDS = 1000
const keyRecordCache = new Map<string, { record: ApiKey | null, expiresAt: number }>()

// Legacy keys carry no id, so a match is remembered by a digest of the key to
// avoid repeating the scan of every stored hash on each request.
const LEGACY_MATCH_TTL_MS = 5 * 60 * 1000
const LEGACY_MISS_TTL_MS = 60 * 1000
const legacyMatchCache = new Map<string, { id: string | null, expiresAt: number }>()

function rememberBounded<V>(cache: Map<string, V>, key: string, value: V): void {
  if (cache.size >= MAX_CACHED_RECORDS && !cache.has(key)) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(key, value)
}

function invalidateApiKeyCaches(id?: string): void {
  if (id) keyRecordCache.delete(id)
  else keyRecordCache.clear()
  // A revoked legacy key must not stay matched from the digest cache.
  legacyMatchCache.clear()
}

/** Test hook: drop every in-process API key cache. */
export async function resetApiKeyCachesForTests(): Promise<void> {
  invalidateApiKeyCaches()
  await accountCache.delete('api_keys:all')
}

/**
 * Load one API key record by id, with a short per-task cache.
 */
async function loadApiKeyRecord(id: string): Promise<ApiKey | null> {
  const now = Date.now()
  const cached = keyRecordCache.get(id)
  if (cached && cached.expiresAt > now) return cached.record

  const tableName = await getTableName('apiKeys')
  const environment = await getTableEnvironment('apiKeys')
  const accountId = await getTableAccountId('apiKeys')
  const item = await getItem(tableName, { id }, environment, accountId)
  const record = item ? toApiKey(item) : null
  rememberBounded(keyRecordCache, id, { record, expiresAt: now + KEY_RECORD_TTL_MS })
  return record
}

function isUsable(apiKey: ApiKey, now = new Date()): boolean {
  return apiKey.isActive && !(apiKey.expiresAt && now > apiKey.expiresAt)
}

function describeUnusable(apiKey: ApiKey): string {
  if (!apiKey.isActive) return 'API key has been revoked'
  return 'API key has expired'
}

/**
 * Load all API keys from DynamoDB. Every page is read so no key goes missing
 * once the table grows past one scan page. A missing table means no keys yet;
 * any other failure is thrown so callers never mistake an outage for "no keys".
 */
async function loadApiKeys(): Promise<ApiKey[]> {
  const cacheKey = 'api_keys:all'
  const cached = await accountCache.get(cacheKey)
  if (cached) return cached

  const tableName = await getTableName('apiKeys')
  const environment = await getTableEnvironment('apiKeys')
  const accountId = await getTableAccountId('apiKeys')
  const apiKeys: ApiKey[] = []
  try {
    let nextToken: string | undefined
    do {
      const page = await scanItems(tableName, undefined, undefined, nextToken, environment, undefined, undefined, accountId)
      apiKeys.push(...page.items.map(toApiKey))
      nextToken = page.nextToken
    } while (nextToken)
  } catch (error) {
    const name = error instanceof Error ? error.name : ''
    const message = error instanceof Error ? error.message : String(error)
    if (name === 'ResourceNotFoundException' || message.includes('Requested resource not found')) {
      logger.info(`API keys table ${tableName} does not exist yet in ${environment} environment`)
      return []
    }
    throw error
  }

  // Cache for 5 minutes to reduce DynamoDB calls
  await accountCache.set(cacheKey, apiKeys, { ttl: 300 })
  return apiKeys
}

/**
 * Save a single API key to DynamoDB
 */
async function saveApiKey(apiKey: ApiKey): Promise<void> {
  try {
    // Convert dates to ISO strings and boolean to string for DynamoDB
    const dbItem = {
      ...apiKey,
      createdAt: apiKey.createdAt.toISOString(),
      expiresAt: apiKey.expiresAt?.toISOString(),
      lastUsedAt: apiKey.lastUsedAt?.toISOString(),
      isActive: apiKey.isActive.toString() // Convert boolean to string for GSI
    }

    const tableName = await getTableName('apiKeys')
    const environment = await getTableEnvironment('apiKeys')
    // The base credentials belong to the organizations account, not the table account.
    const accountId = await getTableAccountId('apiKeys')
    await putItem(tableName, dbItem, environment, accountId)

    // Invalidate cache
    invalidateApiKeyCaches(apiKey.id)
    await accountCache.delete('api_keys:all')
  } catch (error) {
    logger.error('Failed to save API key to DynamoDB:', error)
    throw error
  }
}

/**
 * Update API key in DynamoDB
 */
async function updateApiKey(id: string, updates: Partial<ApiKey>): Promise<void> {
  try {
    // Convert dates to ISO strings and boolean to string
    const dbUpdates: any = { ...updates }
    if (dbUpdates.lastUsedAt) {
      dbUpdates.lastUsedAt = dbUpdates.lastUsedAt.toISOString()
    }
    if (dbUpdates.expiresAt) {
      dbUpdates.expiresAt = dbUpdates.expiresAt.toISOString()
    }
    if (typeof dbUpdates.isActive === 'boolean') {
      dbUpdates.isActive = dbUpdates.isActive.toString() // Convert boolean to string for GSI
    }

    const tableName = await getTableName('apiKeys')
    const environment = await getTableEnvironment('apiKeys')
    const accountId = await getTableAccountId('apiKeys')
    await updateItem(
      tableName,
      { id },
      dbUpdates,
      environment,
      accountId
    )

    // Invalidate cache. A lastUsedAt touch does not change validity, so it
    // keeps the per-key caches warm.
    const changesValidity = Object.keys(updates).some(key => key !== 'lastUsedAt')
    if (changesValidity) invalidateApiKeyCaches(id)
    await accountCache.delete('api_keys:all')
  } catch (error) {
    logger.error('Failed to update API key in DynamoDB:', error)
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
    const id = randomBytes(8).toString('hex')
    const plainKey = generateApiKey(id)
    const salt = generateSalt()
    const keyHash = await hashApiKey(plainKey, salt)
    
    // Calculate expiration
    let expiresAt: Date | undefined
    const expiresInDays = request.neverExpires ? 0 : (request.expiresInDays ?? 90)
    if (expiresInDays > 0) {
      expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + expiresInDays)
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
      metadata: request.metadata,
      keyFormat: 'v2'
    }
    
    // Save to DynamoDB
    await saveApiKey(apiKey)
    
    logger.info(`Created API key ${id} for ${createdBy} with scopes: ${request.scopes.join(', ')}`)
    
    return {
      id,
      name: request.name,
      key: plainKey,
      scopes: request.scopes,
      expiresAt
    }
  } catch (error) {
    logger.error('Failed to create API key:', error)
    throw error
  }
}

function touchLastUsed(apiKey: ApiKey): void {
  // Avoid invalidating the validation cache and writing DynamoDB on every call.
  const lastUsedAge = apiKey.lastUsedAt ? Date.now() - apiKey.lastUsedAt.getTime() : Infinity
  if (lastUsedAge >= 5 * 60 * 1000) {
    apiKey.lastUsedAt = new Date()
    void updateApiKey(apiKey.id, { lastUsedAt: apiKey.lastUsedAt }).catch(error => {
      logger.warn(`Failed to update lastUsedAt for API key ${apiKey.id}:`, error)
    })
  }
}

function accept(apiKey: ApiKey): ApiKeyValidation {
  touchLastUsed(apiKey)
  return { valid: true, id: apiKey.id, scopes: apiKey.scopes }
}

const INVALID_KEY = 'Invalid API key'

async function validateLegacyApiKey(key: string): Promise<ApiKeyValidation> {
  const digest = createHash('sha256').update(key).digest('hex')
  const now = Date.now()
  const remembered = legacyMatchCache.get(digest)
  if (remembered && remembered.expiresAt > now) {
    if (!remembered.id) return { valid: false, error: INVALID_KEY }
    // Re-read the record so a revocation on another task is honored.
    const record = await loadApiKeyRecord(remembered.id)
    if (record && isUsable(record)) return accept(record)
    legacyMatchCache.delete(digest)
    return { valid: false, error: record ? describeUnusable(record) : INVALID_KEY }
  }

  // Only keys issued before ids were embedded can match a legacy-format key.
  const candidates = (await loadApiKeys()).filter(apiKey => apiKey.keyFormat !== 'v2' && isUsable(apiKey))
  for (const apiKey of candidates) {
    if (await apiKeyMatches(key, apiKey)) {
      rememberBounded(legacyMatchCache, digest, { id: apiKey.id, expiresAt: now + LEGACY_MATCH_TTL_MS })
      const record = await loadApiKeyRecord(apiKey.id)
      if (record && isUsable(record)) return accept(record)
      return { valid: false, error: record ? describeUnusable(record) : INVALID_KEY }
    }
  }
  rememberBounded(legacyMatchCache, digest, { id: null, expiresAt: now + LEGACY_MISS_TTL_MS })
  return { valid: false, error: INVALID_KEY }
}

/**
 * Validate an API key
 */
export async function validateApiKey(key: string): Promise<ApiKeyValidation> {
  try {
    const parsed = parseApiKey(key)
    if (!parsed) return { valid: false, error: INVALID_KEY }
    if (parsed.format === 'legacy') return await validateLegacyApiKey(key)

    const apiKey = await loadApiKeyRecord(parsed.id)
    if (!apiKey || !(await apiKeyMatches(key, apiKey))) {
      return { valid: false, error: INVALID_KEY }
    }
    // Only reveal revoked/expired once the caller has proven they hold the key.
    if (!isUsable(apiKey)) return { valid: false, error: describeUnusable(apiKey) }
    return accept(apiKey)
  } catch (error) {
    logger.error('API key validation error:', error)
    return {
      valid: false,
      error: 'API key validation failed'
    }
  }
}

/**
 * List API keys (without revealing the actual keys)
 */
export async function listApiKeys(createdBy?: string): Promise<Omit<ApiKey, 'keyHash' | 'salt' | 'keyFormat'>[]> {
  const apiKeys = await loadApiKeys()
  return apiKeys
    .filter(key => !createdBy || isApiKeyOwner(key, createdBy))
    .map(({ keyHash, salt, keyFormat, ...key }) => key)
}

/**
 * Deactivate an API key
 */
export async function deactivateApiKey(keyId: string, userId: string): Promise<boolean> {
  try {
    // Get the specific API key
    const tableName = await getTableName('apiKeys')
    const environment = await getTableEnvironment('apiKeys')
    const accountId = await getTableAccountId('apiKeys')
    const apiKey = await getItem(tableName, { id: keyId }, environment, accountId)
    
    if (!apiKey) {
      return false
    }
    
    // Check if user has permission to deactivate this key
    if (!isApiKeyOwner(apiKey as ApiKey, userId)) {
      return false
    }
    
    // Update to inactive
    await updateApiKey(keyId, { isActive: false })
    
    logger.info(`Deactivated API key ${keyId} by ${userId}`)
    return true
  } catch (error) {
    logger.error('Failed to deactivate API key:', error)
    throw error
  }
}

/**
 * Merge caller metadata into a key the caller owns. Returns false when the key
 * does not exist or belongs to someone else, so callers can answer 404 either way.
 */
export async function updateApiKeyMetadata(
  keyId: string,
  userId: string,
  metadata: Record<string, any>
): Promise<boolean> {
  const tableName = await getTableName('apiKeys')
  const environment = await getTableEnvironment('apiKeys')
  const accountId = await getTableAccountId('apiKeys')
  const existing = await getItem(tableName, { id: keyId }, environment, accountId)
  if (!existing || !isApiKeyOwner(existing as ApiKey, userId)) return false

  const merged = { ...existing.metadata, ...stripReservedApiKeyMetadata(metadata) }
  for (const key of RESERVED_API_KEY_METADATA) {
    if (existing.metadata?.[key] !== undefined) merged[key] = existing.metadata[key]
  }
  const sizeError = validateApiKeyMetadata(merged)
  if (sizeError) throw createError({ statusCode: 400, statusMessage: sizeError })

  await updateApiKey(keyId, { metadata: merged })
  return true
}

export async function isApiKeyOwnedBy(keyId: string, userId: string): Promise<boolean> {
  const tableName = await getTableName('apiKeys')
  const environment = await getTableEnvironment('apiKeys')
  const accountId = await getTableAccountId('apiKeys')
  const apiKey = await getItem(tableName, { id: keyId }, environment, accountId)
  return isApiKeyOwner(apiKey as ApiKey | undefined, userId)
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
      logger.info(`Cleaned up ${removedCount} expired API keys`)
      // Invalidate cache
      await accountCache.delete('api_keys:all')
    }
    
    return removedCount
  } catch (error) {
    logger.error('Failed to cleanup expired keys:', error)
    return 0
  }
}

export async function revokeLegacyIntegrationKeys(dryRun = true): Promise<string[]> {
  const keys = await loadApiKeys()
  const legacyKeyIds = keys
    .filter(key =>
      key.isActive &&
      !key.scopes.includes('vmaas:costs:read') &&
      key.metadata?.integrationContract !== 'v1'
    )
    .map(key => key.id)

  if (!dryRun) {
    for (const keyId of legacyKeyIds) {
      await updateApiKey(keyId, { isActive: false })
    }
  }
  return legacyKeyIds
}

export interface ApiKeyStats {
  total: number
  active: number
  /** Revoked or past expiry. */
  expired: number
  byScope: Record<string, number>
}

export function summarizeApiKeys(apiKeys: Array<Pick<ApiKey, 'isActive' | 'expiresAt' | 'scopes'>>, now = new Date()): ApiKeyStats {
  const stats: ApiKeyStats = { total: apiKeys.length, active: 0, expired: 0, byScope: {} }
  for (const key of apiKeys) {
    if (key.isActive && (!key.expiresAt || key.expiresAt > now)) stats.active++
    else stats.expired++
    for (const scope of key.scopes) stats.byScope[scope] = (stats.byScope[scope] || 0) + 1
  }
  return stats
}

/**
 * Get API key usage statistics
 */
export async function getApiKeyStats(): Promise<ApiKeyStats> {
  try {
    return summarizeApiKeys(await loadApiKeys())
  } catch (error) {
    logger.error('Failed to get API key stats:', error)
    return { total: 0, active: 0, expired: 0, byScope: {} }
  }
}

/**
 * Record API key usage
 */
export async function recordApiKeyUsage(
  keyId: string,
  endpoint: string,
  method: string,
  statusCode: number,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  try {
    const now = new Date()
    const ttl = Math.floor(now.getTime() / 1000) + (USAGE_RETENTION_DAYS * 24 * 60 * 60)

    const usageRecord = {
      keyId,
      // The sort key gets a random suffix: two calls in the same millisecond
      // used to overwrite each other and undercount busy integrations.
      timestamp: `${now.toISOString()}#${randomBytes(4).toString('hex')}`,
      calledAt: now.toISOString(),
      endpoint,
      method,
      statusCode,
      ipAddress: ipAddress || 'unknown',
      userAgent: userAgent || 'unknown',
      ttl // Auto-delete after retention period
    }

    const usageTableName = await getTableName('apiKeysUsage')
    const environment = await getTableEnvironment('apiKeysUsage')
    const accountId = await getTableAccountId('apiKeysUsage')
    await putItem(usageTableName, usageRecord, environment, accountId)
  } catch (error) {
    // Don't throw error - usage recording should not block API calls
    logger.error('Failed to record API key usage:', error)
  }
}

export interface ApiKeyUsageRecord {
  timestamp: Date
  endpoint: string
  method: string
  statusCode: number
  ipAddress: string
  userAgent: string
}

export interface ApiKeyUsageStats {
  /** Calls in the stats window (last30Days); kept for older clients. */
  totalCalls: number
  lastUsed: Date | null
  callsByEndpoint: Record<string, number>
  callsByStatus: Record<number, number>
  last24Hours: number
  last7Days: number
  last30Days: number
  windowDays: number
  /** True when the window held more calls than were counted. */
  truncated: boolean
}

const USAGE_STATS_WINDOW_DAYS = 30
const MAX_USAGE_RECORDS_SCANNED = 50_000

/**
 * Read a key's usage newest first, following DynamoDB pages. A single Query
 * returns at most 1 MB, so the old one-page read undercounted busy keys.
 */
async function queryApiKeyUsage(keyId: string, since: Date, maxRecords: number): Promise<{ records: ApiKeyUsageRecord[], truncated: boolean }> {
  const { getDynamoDBClient } = await import('../lib/aws-client-factory')
  const { QueryCommand } = await import('@aws-sdk/client-dynamodb')
  const { unmarshall } = await import('@aws-sdk/util-dynamodb')

  const usageTableName = await getTableName('apiKeysUsage')
  const environment = await getTableEnvironment('apiKeysUsage')
  const accountId = await getTableAccountId('apiKeysUsage')
  const client = await getDynamoDBClient(environment, undefined, accountId)

  const records: ApiKeyUsageRecord[] = []
  let exclusiveStartKey: Record<string, any> | undefined
  do {
    const result = await client.send(new QueryCommand({
      TableName: usageTableName,
      KeyConditionExpression: 'keyId = :keyId AND #ts >= :since',
      ExpressionAttributeNames: { '#ts': 'timestamp' },
      ExpressionAttributeValues: {
        ':keyId': { S: keyId },
        ':since': { S: since.toISOString() }
      },
      ScanIndexForward: false,
      Limit: Math.min(1000, maxRecords - records.length),
      ExclusiveStartKey: exclusiveStartKey
    }))
    for (const raw of result.Items || []) {
      const item = unmarshall(raw)
      records.push({
        timestamp: new Date(item.calledAt || String(item.timestamp).split('#')[0]),
        endpoint: item.endpoint,
        method: item.method,
        statusCode: Number(item.statusCode),
        ipAddress: item.ipAddress,
        userAgent: item.userAgent
      })
    }
    exclusiveStartKey = result.LastEvaluatedKey
  } while (exclusiveStartKey && records.length < maxRecords)

  return { records, truncated: Boolean(exclusiveStartKey) }
}

export function summarizeApiKeyUsage(records: ApiKeyUsageRecord[], truncated: boolean, now = new Date()): ApiKeyUsageStats {
  const oneDayAgo = now.getTime() - 24 * 60 * 60 * 1000
  const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000
  const stats: ApiKeyUsageStats = {
    totalCalls: records.length,
    lastUsed: records[0]?.timestamp || null,
    callsByEndpoint: {},
    callsByStatus: {},
    last24Hours: 0,
    last7Days: 0,
    last30Days: records.length,
    windowDays: USAGE_STATS_WINDOW_DAYS,
    truncated
  }
  for (const record of records) {
    stats.callsByEndpoint[record.endpoint] = (stats.callsByEndpoint[record.endpoint] || 0) + 1
    stats.callsByStatus[record.statusCode] = (stats.callsByStatus[record.statusCode] || 0) + 1
    const time = record.timestamp.getTime()
    if (time >= oneDayAgo) stats.last24Hours++
    if (time >= sevenDaysAgo) stats.last7Days++
  }
  return stats
}

/**
 * Usage stats for the last 30 days plus the most recent calls, from one read.
 */
export async function getApiKeyUsage(keyId: string, historyLimit = 100): Promise<{ stats: ApiKeyUsageStats, history: ApiKeyUsageRecord[] }> {
  const since = new Date(Date.now() - USAGE_STATS_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const { records, truncated } = await queryApiKeyUsage(keyId, since, MAX_USAGE_RECORDS_SCANNED)
  return {
    stats: summarizeApiKeyUsage(records, truncated),
    history: records.slice(0, historyLimit)
  }
}
