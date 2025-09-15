/**
 * GET /api/test-auth
 * Test endpoint to verify authentication bypass is working
 */

import { defineEventHandler } from 'h3'
import { getAuthContext } from '../middleware/entra-auth'
import { sendSuccess } from '../utils/api-response'

export default defineEventHandler(async (event) => {
  const authContext = getAuthContext(event)
  
  return sendSuccess(event, {
    message: 'Auth test endpoint',
    authContext,
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      AUTH_BYPASS: process.env.AUTH_BYPASS,
      isDevMode: process.env.NODE_ENV === 'development' && process.env.AUTH_BYPASS === 'true'
    }
  })
})
