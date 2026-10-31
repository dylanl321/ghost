import { createShortLink, validateShortLinkInput } from '../../lib/shortlinks'
import { logger } from '../../utils/logger'
import { getUserEmail } from '../../utils/user-roles'
import { shortLinkUrl } from '../../utils/short-link-url'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)

    const invalid = validateShortLinkInput(body)
    if (invalid) {
      throw createError({ statusCode: 400, statusMessage: invalid })
    }

    const shortLink = await createShortLink({
      originalUrl: body.originalUrl,
      pagePath: body.pagePath,
      configData: body.configData,
      expiresInDays: body.expiresInDays || 365, // Default to 1 year expiry
      // The creator comes from the session, never the request body
      createdBy: getUserEmail(event) || undefined,
      description: body.description
    })

    return {
      success: true,
      data: {
        ...shortLink,
        shortUrl: shortLinkUrl(event, shortLink.shortCode)
      }
    }
  } catch (error: any) {
    if (!error.statusCode) logger.error('Error creating short link:', error)
    throw createError({
      statusCode: error.statusCode || 500,
      statusMessage: error.statusMessage || 'Failed to create short link'
    })
  }
})
