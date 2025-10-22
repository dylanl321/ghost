import { randomBytes } from 'crypto'
import { getItem, putItem, updateItem, scanItems } from '../utils/dynamodb'
import { getTableConfig } from './dynamodb-config'

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
    console.error('Error getting short link:', error)
    return null
  }
}

/**
 * List all short links (with pagination)
 */
export async function listShortLinks(options: {
  limit?: number
  offset?: number
  createdBy?: string
}): Promise<{ links: ShortLink[], total: number }> {
  try {
    const limit = options.limit || 50

    // Build filter expression for non-expired items
    let filterExpression = undefined
    if (options.createdBy) {
      filterExpression = 'createdBy = :createdBy'
    }

    const tableConfig = await getTableConfig('shortlinks')
    const result = await scanItems(
      tableConfig.tableName,
      filterExpression,
      limit,
      undefined, // nextToken for pagination
      tableConfig.environment,
      undefined, // expressionAttributeNames
      undefined, // expressionAttributeValues
      tableConfig.accountId
    )
    
    // Filter out expired links
    const now = new Date()
    const validLinks = result.items.filter((link: ShortLink) => {
      if (!link.expiresAt) return true
      return new Date(link.expiresAt) > now
    })
    
    // Sort by creation date (newest first)
    validLinks.sort((a: ShortLink, b: ShortLink) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    
    return {
      links: validLinks as ShortLink[],
      total: validLinks.length
    }
  } catch (error) {
    console.error('Error listing short links:', error)
    return { links: [], total: 0 }
  }
}

/**
 * Get analytics for a short link
 */
export async function getShortLinkAnalytics(shortCode: string): Promise<{
  visitCount: number
  createdAt: string
  lastVisited?: string
} | null> {
  try {
    const tableConfig = await getTableConfig('shortlinks')
    const item = await getItem(tableConfig.tableName, { shortCode }, tableConfig.environment, tableConfig.accountId) as ShortLink

    if (!item) return null

    return {
      visitCount: item.visitCount || 0,
      createdAt: item.createdAt,
      lastVisited: item.lastVisited
    }
  } catch (error) {
    console.error('Error getting short link analytics:', error)
    return null
  }
}