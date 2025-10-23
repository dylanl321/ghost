/**
 * POST /api/accounts/:accountId/notes
 * Create a new note for an account (admin only)
 */

import { sendSuccess, errors } from '../../../utils/api-response'
import { isUserAdmin } from '../../../utils/user-roles'
import { getUserSession } from '../../../utils/entra/session'
import { createAccountNote } from '../../../lib/account-notes'
import { sendEmail } from '../../../utils/email-service'
import type { CreateNoteRequest } from '#shared/types/account-notes'

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
    
    if (!body.content || body.content.trim().length === 0) {
      return errors.badRequest(event, 'Note content is required')
    }

    // Validate request
    const request: CreateNoteRequest = {
      accountId,
      content: body.content.trim(),
      mentionedUsers: body.mentionedUsers || [],
      tags: body.tags || []
    }

    // Create the note
    const note = await createAccountNote(request, userEmail)

    // Send email notifications to mentioned users (async, non-blocking)
    if (note.mentionedUsers.length > 0) {
      sendMentionNotifications(note, userEmail, accountId).catch(err => {
        console.error('Failed to send mention notifications:', err)
      })
    }

    return sendSuccess(event, note, {
      message: 'Note created successfully'
    })
  } catch (error: any) {
    console.error('Error creating account note:', error)
    return errors.serverError(event, error.message || 'Failed to create note')
  }
})

/**
 * Send email notifications to mentioned users
 */
async function sendMentionNotifications(
  note: any,
  mentionedBy: string,
  accountId: string
): Promise<void> {
  if (!note.mentionedUsers || note.mentionedUsers.length === 0) {
    return
  }

  // Get account name (you might want to fetch this from the store)
  const accountName = accountId // Simplified - could be enhanced

  const subject = `You were mentioned in a note on account ${accountName}`
  
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">You were mentioned in an account note</h2>
      <p><strong>${mentionedBy}</strong> mentioned you in a note on account <strong>${accountName}</strong>.</p>
      
      <div style="background-color: #f5f5f5; padding: 15px; border-left: 4px solid #4F46E5; margin: 20px 0;">
        ${note.content.replace(/\n/g, '<br>')}
      </div>
      
      <p style="margin-top: 20px;">
        <a href="${process.env.NUXT_PUBLIC_APP_URL || 'https://ghost.example.com'}/account/${accountId}" 
           style="background-color: #4F46E5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
          View Account
        </a>
      </p>
      
      <p style="color: #666; font-size: 12px; margin-top: 30px;">
        This is an automated notification from GHOST Dashboard.
      </p>
    </div>
  `

  // Send to each mentioned user
  for (const recipientEmail of note.mentionedUsers) {
    try {
      await sendEmail({
        to: [recipientEmail],
        subject,
        htmlBody,
        textBody: `${mentionedBy} mentioned you in a note on account ${accountName}.\n\n${note.content}\n\nView the account at: ${process.env.NUXT_PUBLIC_APP_URL || 'https://ghost.example.com'}/account/${accountId}`
      })
      
      console.log(`Sent mention notification to ${recipientEmail}`)
    } catch (error) {
      console.error(`Failed to send mention notification to ${recipientEmail}:`, error)
      // Continue with other recipients even if one fails
    }
  }
}

