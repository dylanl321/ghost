import { randomBytes } from 'crypto'
import { getItem, putItem, updateItem, scanItems } from '../utils/dynamodb'
import { getTableConfig } from './dynamodb-config'
import { logger } from '../utils/logger'

// Table configuration now loaded dynamically from Secrets Manager or environment variables

export interface ShortLink {
  shortCode: string
  originalUrl: string
  pagePath: string
  configData: any
  createdAt: string
  expiresAt?: string
  visitCount: number
  lastVisited?: string
  createdBy?: string
  description?: string
  ttl?: number
}

/**
 * Generate a unique short code
 */
function generateShortCode(length: number = 8): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = randomBytes(length)
  let result = ''
  
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length]
  }
  
  return result
}

export const SHORT_CODE_PATTERN = /^[A-Za-z0-9]{4,32}$/
const MAX_CONFIG_BYTES = 8 * 1024

/**
 * Validate a short link sent by the browser. pagePath must be a path inside
 * this app (the /s/:code page navigates to it), configData a small object.
 * Returns an error message, or null when the input is valid.
 */
export function validateShortLinkInput(body: any): string | null {
  if (!body || typeof body !== 'object') return 'Request body is required'
  if (typeof body.pagePath !== 'string' || !/^\/(?![/\\])[^\s]*$/.test(body.pagePath) || body.pagePath.length > 512) {
    return 'pagePath must be a path in this app, such as /account/costs'
  }
  if (typeof body.originalUrl !== 'string' || !body.originalUrl || body.originalUrl.length > 2048) {
    return 'originalUrl is required (up to 2048 characters)'
  }
  if (!body.configData || typeof body.configData !== 'object' || Array.isArray(body.configData)) {
    return 'configData must be an object'
  }
  if (Buffer.byteLength(JSON.stringify(body.configData)) > MAX_CONFIG_BYTES) {
    return `configData must be under ${MAX_CONFIG_BYTES} bytes`
  }
  if (body.expiresInDays !== undefined && (!Number.isInteger(body.expiresInDays) || body.expiresInDays < 1 || body.expiresInDays > 365)) {
    return 'expiresInDays must be a whole number from 1 to 365'
  }
  if (body.description !== undefined && (typeof body.description !== 'string' || body.description.length > 500)) {
    return 'description must be text up to 500 characters'
  }
  return null
}

/**
 * Create a new short link
 */
export async function createShortLink(data: {
  originalUrl: string
  pagePath: string
  configData: any
  expiresInDays?: number
  createdBy?: string
  description?: string
}): Promise<ShortLink> {
  const shortCode = generateShortCode()
  const createdAt = new Date().toISOString()
  
  let ttl: number | undefined
  let expiresAt: string | undefined
  
  if (data.expiresInDays) {
    const expiryDate = new Date(Date.now() + data.expiresInDays * 24 * 60 * 60 * 1000)
    expiresAt = expiryDate.toISOString()
    ttl = Math.floor(expiryDate.getTime() / 1000)
  }
  
  const item: ShortLink = {
    shortCode,
    originalUrl: data.originalUrl,
    pagePath: data.pagePath,
    configData: data.configData,
    createdAt,
    expiresAt,
    visitCount: 0,
    createdBy: data.createdBy,
    description: data.description,
    ttl
  }

  const tableConfig = await getTableConfig('shortlinks')
  await putItem(tableConfig.tableName, item, tableConfig.environment, tableConfig.accountId)
  return item
}

/**
 * Get a short link by its code
 */
export async function getShortLink(shortCode: string): Promise<ShortLink | null> {
  try {
    const tableConfig = await getTableConfig('shortlinks')
    const item = await getItem(tableConfig.tableName, { shortCode }, tableConfig.environment, tableConfig.accountId) as ShortLink

    if (!item) return null

    // Check if expired
    if (item.expiresAt && new Date(item.expiresAt) < new Date()) {
      return null
    }

    // Update visit count and last visited
    const now = new Date().toISOString()
    const updatedItem = await updateItem(tableConfig.tableName, { shortCode }, {
      visitCount: (item.visitCount || 0) + 1,
      lastVisited: now
    }, tableConfig.environment, tableConfig.accountId)

    return updatedItem as ShortLink
  } catch (error) {
    logger.error('Error getting short link:', error)
    return null
  }
}

/**
 * List short links, newest first. Expired links are left out; the table is
 * scanned in full because filters and sorting apply after DynamoDB pages.
 */
export async function listShortLinks(options: {
  limit?: number
  offset?: number
  createdBy?: string
}): Promise<{ links: ShortLink[], total: number }> {
  const limit = Math.min(Math.max(options.limit || 50, 1), 500)
  const offset = Math.max(options.offset || 0, 0)

  const tableConfig = await getTableConfig('shortlinks')
  const items: ShortLink[] = []
  let nextToken: string | undefined
  do {
    const result = await scanItems(
      tableConfig.tableName,
      options.createdBy ? 'createdBy = :createdBy' : undefined,
      undefined,
      nextToken,
      tableConfig.environment,
      undefined,
      options.createdBy ? { ':createdBy': options.createdBy } : undefined,
      tableConfig.accountId
    )
    items.push(...(result.items as ShortLink[]))
    nextToken = result.nextToken
  } while (nextToken)

  const now = new Date()
  const validLinks = items
    .filter(link => !link.expiresAt || new Date(link.expiresAt) > now)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  return {
    links: validLinks.slice(offset, offset + limit),
    total: validLinks.length
  }
}
