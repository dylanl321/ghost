/**
 * GET /api/debug/token
 * Debug endpoint to check user session and token
 */

import { defineEventHandler } from 'h3'
import { getUserSession } from '../../utils/entra/session'
import { logger } from '../../utils/logger'

// Decode JWT token to extract claims (without verification for debugging)
function decodeJWT(token: string) {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) {
      return null
    }
    
    // Decode the payload (second part)
    const payload = Buffer.from(parts[1], 'base64').toString('utf-8')
    return JSON.parse(payload)
  } catch (error) {
    logger.error('Failed to decode JWT:', error)
    return null
  }
}

export default defineEventHandler(async (event) => {
  try {
    logger.debug('Debug token endpoint called')
    
    const session = await getUserSession(event)
    
    logger.debug('Session debug info:', {
      hasSession: !!session,
      hasAccessToken: !!session?.accessToken,
      tokenLength: session?.accessToken?.length,
      hasUser: !!session?.user,
      userKeys: session?.user ? Object.keys(session.user) : []
    })
    
    // Decode token to get expiration info
    let tokenInfo = null
    if (session?.accessToken) {
      const decoded = decodeJWT(session.accessToken)
      if (decoded) {
        const now = Math.floor(Date.now() / 1000)
        const exp = decoded.exp || 0
        const iat = decoded.iat || 0
        
        tokenInfo = {
          issuer: decoded.iss,
          audience: decoded.aud,
          subject: decoded.sub,
          name: decoded.name,
          email: decoded.email || decoded.upn || decoded.preferred_username,
          issuedAt: iat ? new Date(iat * 1000).toISOString() : null,
          expiresAt: exp ? new Date(exp * 1000).toISOString() : null,
          expiresIn: exp ? Math.max(0, exp - now) : null,
          isExpired: exp ? now >= exp : false,
          remainingMinutes: exp ? Math.max(0, Math.floor((exp - now) / 60)) : null,
          scopes: decoded.scp || decoded.scope,
          appId: decoded.appid || decoded.azp,
          tenantId: decoded.tid
        }
      }
    }
    
    return {
      success: true,
      data: {
        authenticated: !!session,
        hasAccessToken: !!session?.accessToken,
        tokenLength: session?.accessToken?.length || 0,
        tokenInfo,
        user: session?.user ? {
          id: session.user.id,
          name: session.user.name || session.user.displayName,
          email: session.user.email,
          // Don't expose the full token, just first/last few chars for debugging
          tokenPreview: session.accessToken ? 
            `${session.accessToken.substring(0, 10)}...${session.accessToken.substring(session.accessToken.length - 10)}` : 
            null
        } : null
      }
    }
  } catch (error: any) {
    logger.error('Debug token error:', error)
    
    return {
      success: false,
      error: error.message,
      details: error.stack
    }
  }
})