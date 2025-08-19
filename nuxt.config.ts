// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: true },

  modules: ['@nuxt/ui', '@nuxt/eslint', 'nuxt-oidc-auth'],

  css: ['~/assets/css/main.css'],

  compatibilityDate: '2025-07-16',


  oidc: {
    defaultProvider: 'entra',
    providers: {
      entra: {
        redirectUri: '', // Fields with empty strings as the values are automatically overridden by the environment variables passed in. See the .env file for more details.
        clientId: '',
        clientSecret: '',
        authorizationUrl: 'https://login.microsoftonline.us/7c5a26cf-ddf0-400c-9703-4070b4e3a54d/oauth2/v2.0/authorize', // For Entra External ID, use https://TENANT_NAME.ciamlogin.com/TENANT_ID/oauth2/authorize
        tokenUrl: 'https://login.microsoftonline.us/7c5a26cf-ddf0-400c-9703-4070b4e3a54d/oauth2/v2.0/token', // For Entra External ID, use https://TENANT_NAME.ciamlogin.com/TENANT_ID/oauth2/token
        userNameClaim: 'email',
        nonce: true,
        responseType: 'code id_token',
        scope: [
          'profile',
          'openid',
          'offline_access',
          'email',
          'Group.Read.All',
          'Directory.Read.All'
        ],        
        logoutUrl: 'https://login.microsoftonline.us/7c5a26cf-ddf0-400c-9703-4070b4e3a54d/oauth2/v2.0/logout', // For Entra External ID, use https://TENANT_NAME.ciamlogin.com/TENANT_ID/oauth2/logout
        optionalClaims: ['email', 'family_name', 'given_name', 'groups', 'roles', 'in_corp', "onprem_sid", "sid", "preferred_username", "upn"],
        userInfoUrl: 'https://graph.microsoft.us/oidc/userinfo', // Set only if you are sure, you are requesting a Graph API token. This endpoint will not work for custom APIs/App registrations.
        exposeAccessToken: true,
        callbackRedirectUrl: '',
        // Enhanced token handling for better Entra alignment
        tokenType: 'Bearer',
        pkce: true, // Enable PKCE for better security
        state: true, // Enable state parameter for CSRF protection
        // Configure token refresh behavior
        refreshTokenRotation: true,
        revokeRefreshTokenOnLogout: false // Don't revoke Entra refresh token on local logout
      },
    },
    middleware: {
      globalMiddlewareEnabled: true, // Adds a global middleware to Nuxt server which automatically redirects all requests to /auth/login if the user is not logged in
      customLoginPage: false
    },
    session: {
      expirationCheck: true,
      automaticRefresh: true,
      expirationThreshold: 3600
    }
  }
})