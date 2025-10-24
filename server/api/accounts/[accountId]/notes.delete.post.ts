/**
 * POST /api/accounts/:accountId/notes.delete
 * Delete a note (admin only, must be creator)
 */

import { sendSuccess, errors } from '../../../utils/api-response'
import { isUserAdmin } from '../../../utils/user-roles'
import { getUserSession } from '../../../utils/entra/session'
import { deleteAccountNote } from '../../../lib/account-notes'
import { logger } from '../../../utils/logger'

export default defineEventHandler(async (event) => {
  try {
    // Check if user is admin
    const isAdmin = await isUserAdmin(event)
    if (!isAdmin) {
      return errors.forbidden(event, 'Admin access required')
    }

    // Get user session
    const session = await getUserSession(event)
    if (!session?.user) {
      return errors.unauthorized(event, 'User session required')
    }

    const userEmail = session.user.email || session.user.id || 'unknown'

    const accountId = getRouterParam(event, 'accountId')
    const body = await readBody(event)
    const noteId = body.noteId

    if (!accountId || !noteId) {
      return errors.badRequest(event, 'Account ID and Note ID are required')
    }

    // Delete the note (checks ownership internally)
    await deleteAccountNote(noteId, userEmail)

    return sendSuccess(event, { deleted: true }, {
      message: 'Note deleted successfully'
    })
  } catch (error: any) {
    logger.error('Error deleting account note:', error)

    if (error.message === 'Note not found') {
      return errors.notFound(event, 'Note not found')
    }

    if (error.message === 'Not authorized to delete this note') {
      return errors.forbidden(event, 'You can only delete your own notes')
    }

    return errors.serverError(event, error.message || 'Failed to delete note')
  }
})
