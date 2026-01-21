/**
 * HEAD /api/user/session-check
 * Lightweight endpoint to validate server-side session existence
 *
 * Used by the client to detect when sessions are lost (e.g., after ECS restart)
 * without the overhead of a full API call.
 */

import { getUserSession } from '../../utils/entra/session'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)

  if (!session?.user && !session?.accessToken) {
    throw createError({
      statusCode: 401,
      message: 'Session invalid'
    })
  }

  // HEAD request - no body needed, just 200 status
  return null
})
