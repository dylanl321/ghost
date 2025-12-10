/**
 * OIDC Configuration for Entra ID
 * Nuxt OIDC module configuration and setup
 */

/**
 * Get OIDC provider configuration for Entra ID
 * Note: This is only needed if setting up app-only authentication.
 * For delegated auth using user's access token, only tenant ID is required.
 */
import { logger } from './logger'

export function getEntraOIDCConfig() {
  const tenantId = process.env.ENTRA_TENANT_ID
  const clientId = process.env.ENTRA_CLIENT_ID
  const clientSecret = process.env.ENTRA_CLIENT_SECRET
  const loginBaseUrl = process.env.ENTRA_LOGIN_BASE_URL || 'https://login.microsoftonline.us'
  const graphBaseUrl = process.env.ENTRA_GRAPH_BASE_URL || 'https://graph.microsoft.us'
  const graphVersion = process.env.ENTRA_GRAPH_VERSION || 'v1.0'
  
  // Only require tenant ID for basic configuration
  if (!tenantId) {
    throw new Error('Missing ENTRA_TENANT_ID. This is required for Entra ID configuration.')
  }
  
  // Return null if app-only auth is not configured
  if (!clientId || !clientSecret) {
    logger.debug('App-only authentication not configured. Using delegated authentication with user tokens.')
    return null
  }
  
  return {
    // Provider configuration for nuxt-oidc
    entra: {
      clientId,
      clientSecret,
      responseType: 'code',
      
      // Microsoft Graph API scopes for Entra ID
      scope: [
        'openid',
        'profile', 
        'email',
        'offline_access',
        'User.Read',
        'Group.Read.All',
        'GroupMember.Read.All',
        'Directory.Read.All'
      ],
      
      // Configurable endpoints (defaults to Azure Government)
      authorizationUrl: `${loginBaseUrl}/${tenantId}/oauth2/v2.0/authorize`,
      tokenUrl: `${loginBaseUrl}/${tenantId}/oauth2/v2.0/token`,
      userInfoUrl: `${graphBaseUrl}/${graphVersion}/me`,
      
      // Token configuration
      pkce: true,
      state: true,
      
      // Additional claims for Graph API access
      additionalParameters: {
        resource: graphBaseUrl
      }
    }
  }
}

/**
 * Nuxt config for OIDC integration
 * Add this to your nuxt.config.ts
 */
export function getNuxtOIDCConfig() {
  return {
    modules: ['nuxt-oidc'],
    oidc: {
      providers: getEntraOIDCConfig(),
      
      // Session configuration
      session: {
        expirationCheck: true,
        automaticRefresh: true,
        maxAge: 60 * 60 * 24 * 7, // 7 days
      },
      
      // Middleware configuration
      middleware: {
        global: false, // We'll handle this manually for Entra routes
        guestRedirectTo: '/login'
      },
      
      // Development settings
      devtools: ['development', 'dev'].includes(process.env.NODE_ENV?.toLowerCase() || '')
    }
  }
}

/**
 * Environment variables needed for OIDC
 * Note: When using delegated authentication with user's access token,
 * only the tenant ID is truly required for Graph API calls
 */
export const REQUIRED_OIDC_ENV_VARS = [
  'ENTRA_TENANT_ID'
] as const

/**
 * Optional OIDC environment variables for app-only auth
 */
export const OPTIONAL_OIDC_ENV_VARS = [
  'ENTRA_CLIENT_ID',     // Only needed for app-only authentication
  'ENTRA_CLIENT_SECRET'  // Only needed for app-only authentication
] as const

/**
 * Development environment variables
 */
export const DEV_ENV_VARS = [
  'ENTRA_TEST_ACCESS_TOKEN',
  'ENTRA_TEST_USER_EMAIL',
  'ENTRA_DEV_BYPASS'
] as const

/**
 * Validate OIDC configuration
 */
export function validateOIDCConfig(): { 
  valid: boolean; 
  configured: boolean;
  errors: string[] 
} {
  const errors: string[] = []
  
  // Check required environment variables (only tenant ID for delegated auth)
  for (const envVar of REQUIRED_OIDC_ENV_VARS) {
    if (!process.env[envVar]) {
      errors.push(`Missing required environment variable: ${envVar}`)
    }
  }
  
  // Check tenant ID format
  const tenantId = process.env.ENTRA_TENANT_ID
  if (tenantId && !tenantId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
    errors.push('ENTRA_TENANT_ID must be a valid GUID format')
  }
  
  // Check client ID format if provided (optional)
  const clientId = process.env.ENTRA_CLIENT_ID
  if (clientId && !clientId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
    errors.push('ENTRA_CLIENT_ID must be a valid GUID format')
  }
  
  // Check if app-only auth is configured (both client ID and secret present)
  const configured = !!(process.env.ENTRA_CLIENT_ID && process.env.ENTRA_CLIENT_SECRET)
  
  return {
    valid: errors.length === 0,
    configured,
    errors
  }
}