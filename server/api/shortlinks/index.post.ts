import { createShortLink } from '../../lib/shortlinks'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    
    // Validate required fields
    if (!body.originalUrl || !body.pagePath || !body.configData) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Missing required fields: originalUrl, pagePath, or configData'
      })
    }
    
    // Create the short link
    const shortLink = await createShortLink({
      originalUrl: body.originalUrl,
      pagePath: body.pagePath,
      configData: body.configData,
      expiresInDays: body.expiresInDays || 365, // Default to 1 year expiry
      createdBy: body.createdBy,
      description: body.description
    })
    
    // Build the full short URL
    const host = getHeader(event, 'host') || 'localhost:3000'
    const protocol = getHeader(event, 'x-forwarded-proto') || 'http'
    const shortUrl = `${protocol}://${host}/s/${shortLink.shortCode}`
    
    return {
      success: true,
      data: {
        ...shortLink,
        shortUrl
      }
    }
  } catch (error: any) {
    console.error('Error creating short link:', error)
    throw createError({
      statusCode: error.statusCode || 500,
      statusMessage: error.statusMessage || 'Failed to create short link'
    })
  }
})