/**
 * Non-admin limits for scheduled reports
 * The report form already showed these (10 reports, sent only to yourself);
 * the server now enforces them so the API cannot be used to bypass them.
 */

import type { H3Event } from 'h3'
import { getUserEmail, isUserAdmin } from './user-roles'
import { listUserReports } from './scheduled-reports'

export const NON_ADMIN_REPORT_LIMIT = 10

/** Reject a new report once a non-admin already owns the maximum */
export async function assertCanCreateReport(event: H3Event): Promise<void> {
  if (await isUserAdmin(event)) return
  const userEmail = getUserEmail(event)
  if (!userEmail) throw createError({ statusCode: 401, message: 'User authentication required' })

  const { total } = await listUserReports(userEmail, undefined, 1)
  if (total >= NON_ADMIN_REPORT_LIMIT) {
    throw createError({
      statusCode: 403,
      message: `You can have at most ${NON_ADMIN_REPORT_LIMIT} scheduled reports. Delete one to create another.`
    })
  }
}

/** Non-admins may only send reports to their own address */
export async function assertSelfOnlyRecipients(event: H3Event, recipients: unknown): Promise<void> {
  if (!Array.isArray(recipients)) return
  if (await isUserAdmin(event)) return
  const own = getUserEmail(event)?.toLowerCase()
  const others = recipients.filter(email => typeof email !== 'string' || email.trim().toLowerCase() !== own)
  if (!own || others.length > 0) {
    throw createError({
      statusCode: 403,
      message: 'Only administrators can send reports to other people'
    })
  }
}
