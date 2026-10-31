import { listShortLinks } from '../../lib/shortlinks'
import { logger } from '../../utils/logger'
import { requireAdmin } from '../../utils/user-roles'
import { shortLinkUrl } from '../../utils/short-link-url'

// Lists every user's share links with their saved page state: admin only
// (used by the admin Share Links panel).
export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  try {
    const query = getQuery(event)
    const limit = Math.min(Math.max(parseInt(query.limit as string) || 50, 1), 500)
    const offset = Math.max(parseInt(query.offset as string) || 0, 0)

    const { links, total } = await listShortLinks({
      limit,
      offset,
      createdBy: typeof query.createdBy === 'string' && query.createdBy ? query.createdBy : undefined
    })

    return {
      success: true,
      data: {
        links: links.map(link => ({ ...link, shortUrl: shortLinkUrl(event, link.shortCode) })),
        total,
        limit,
        offset
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
