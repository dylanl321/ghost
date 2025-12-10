/**
 * GET /api/accounts/:accountId/account-notes-list
 * List notes for an account (admin only)
 */

import { sendSuccess, errors } from '../../../utils/api-response'
import { isUserAdmin } from '../../../utils/user-roles'
import { listAccountNotes } from '../../../lib/account-notes'
import { logger } from '../../../utils/logger'

export default defineEventHandler(async (event) => {
  try {
    // Check if user is admin
    const isAdmin = await isUserAdmin(event)
    if (!isAdmin) {
      return errors.forbidden(event, 'Admin access required')
    }

    const accountId = getRouterParam(event, 'accountId')
    if (!accountId) {
      return errors.badRequest(event, 'Account ID is required')
    }

    // Get query parameters
    const query = getQuery(event)
    const limit = query.limit ? parseInt(query.limit as string) : 50
    const sortOrder = (query.sortOrder as 'asc' | 'desc') || 'desc'

    // List notes for the account
    const notes = await listAccountNotes({
      accountId,
      limit,
      sortOrder
    })

    return sendSuccess(event, notes, {
      message: `Retrieved ${notes.length} note(s)`,
      count: notes.length
    })
  } catch (error: any) {
    logger.error('Error listing account notes:', error)
    return errors.serverError(event, error.message || 'Failed to list notes')
  }
})
