/**
 * POST /api/accounts/:accountId/account-note-create
 * Create a new note for an account (admin only)
 */

import { sendSuccess, errors } from '../../../utils/api-response'
import { isUserAdmin } from '../../../utils/user-roles'
import { getUserSession } from '../../../utils/entra/session'
import { createAccountNote } from '../../../lib/account-notes'
import { sendEmail } from '../../../utils/email-service'
import type { CreateNoteRequest } from '../../../shared/types/account-notes'
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
    if (!accountId) {
      return errors.badRequest(event, 'Account ID is required')
    }

    // Parse request body
    const body = await readBody<CreateNoteRequest>(event)

    if (typeof body?.content !== 'string' || !body.content.trim()) {
      return errors.badRequest(event, 'Note content is required')
    }

    // Mentions trigger an email to each address, so only accept a short list
    // of real addresses.
    const mentionedUsers = body.mentionedUsers ?? []
    if (!Array.isArray(mentionedUsers) || mentionedUsers.length > 20 ||
        !mentionedUsers.every(email => typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      return errors.badRequest(event, 'mentionedUsers must be a list of up to 20 email addresses')
    }

    // Create the note
    const note = await createAccountNote(
      {
        accountId,
        content: body.content.trim(),
        tags: Array.isArray(body.tags) ? body.tags.filter((tag: unknown) => typeof tag === 'string') : [],
        mentionedUsers
      },
      userEmail
    )

    // Send email notifications to mentioned users
    if (mentionedUsers.length > 0) {
      try {
        const notePreview = body.content.length > 200
          ? body.content.substring(0, 200) + '...'
          : body.content

        // Send to each mentioned user
        for (const mentionedEmail of mentionedUsers) {
          await sendEmail({
            to: mentionedEmail,
            subject: `You were mentioned in a note for AWS Account ${accountId}`,
            body: `
Hello,

You were mentioned in a note by ${userEmail} for AWS Account ${accountId}.

Note:
${notePreview}

View the full note in GHOST dashboard.
            `.trim()
          })
        }
      } catch (emailError: any) {
        logger.error('Failed to send mention notifications:', emailError)
        // Don't fail the request if email fails
      }
    }

    return sendSuccess(event, note, {
      message: 'Note created successfully'
    })
  } catch (error: any) {
    logger.error('Error creating account note:', error)
    return errors.serverError(event, error.message || 'Failed to create note')
  }
})
