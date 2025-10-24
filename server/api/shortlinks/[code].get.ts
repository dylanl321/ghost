import { getShortLink } from '../../lib/shortlinks'
import { logger } from '../../utils/logger'

export default defineEventHandler(async (event) => {
  try {
    const code = getRouterParam(event, 'code')
    
    if (!code) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Short code is required'
      })
    }
    
    const shortLink = await getShortLink(code)
    
    if (!shortLink) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Short link not found or expired'
      })
    }
    
    return {
      success: true,
      data: shortLink
    }
  } catch (error: any) {
    logger.error('Error retrieving short link:', error)
    throw createError({
      statusCode: error.statusCode || 500,
      statusMessage: error.statusMessage || 'Failed to retrieve short link'
    })
  }
})