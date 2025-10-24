import { listShortLinks } from '../../lib/shortlinks'
import { logger } from '../../utils/logger'

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    
    const { links, total } = await listShortLinks({
      limit: query.limit ? parseInt(query.limit as string) : 50,
      offset: query.offset ? parseInt(query.offset as string) : 0,
      createdBy: query.createdBy as string
    })
    
    // Build full URLs
    const host = getHeader(event, 'host') || 'localhost:3000'
    const protocol = getHeader(event, 'x-forwarded-proto') || 'http'
    
    const linksWithUrls = links.map(link => ({
      ...link,
      shortUrl: `${protocol}://${host}/s/${link.shortCode}`
    }))
    
    return {
      success: true,
      data: {
        links: linksWithUrls,
        total,
        limit: query.limit ? parseInt(query.limit as string) : 50,
        offset: query.offset ? parseInt(query.offset as string) : 0
      }
    }
  } catch (error: any) {
    logger.error('Error listing short links:', error)
    throw createError({
      statusCode: error.statusCode || 500,
      statusMessage: error.statusMessage || 'Failed to list short links'
    })
  }
})