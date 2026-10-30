import { getShortLink, SHORT_CODE_PATTERN } from '../../lib/shortlinks'
import { logger } from '../../utils/logger'

// Public: the /s/:code page resolves a code before the visitor signs in, so
// only what that page needs is returned (not the creator or original URL).
export default defineEventHandler(async (event) => {
  try {
    const code = getRouterParam(event, 'code')

    if (!code || !SHORT_CODE_PATTERN.test(code)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'A valid short code is required'
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
      data: {
        shortCode: shortLink.shortCode,
        pagePath: shortLink.pagePath,
        configData: shortLink.configData,
        expiresAt: shortLink.expiresAt
      }
    }
  } catch (error: any) {
    if (!error.statusCode) logger.error('Error retrieving short link:', error)
    throw createError({
      statusCode: error.statusCode || 500,
      statusMessage: error.statusMessage || 'Failed to retrieve short link'
    })
  }
})
