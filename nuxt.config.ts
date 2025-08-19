/* Important Notes

The '@nuxt/eslint' module is a linter that does static code analysis to detect issue with the code. Install the VSCode ESLint extension to lint your code in real time.
  Documentation: https://eslint.nuxt.com/packages/module

*/

const entra_tenant_id = '7c5a26cf-ddf0-400c-9703-4070b4e3a54d';

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  modules: ['@nuxt/ui', '@nuxt/eslint', 'nuxt-oidc-auth', '@pinia/nuxt'], // Modules are used to extend the functionality of Nuxt (https://nuxt.com/docs/4.x/guide/concepts/modules)
  css: ['~/assets/css/main.css'],
  ui: {
    fonts: false // Prevent NuxtUI from fetching fonts, which causes a certificate error
  },

  // nitro: {
  //   compatibilityDate: '2024-12-27',
  //   routeRules: {
  //     '/api/**': {
  //       cors: true,
  //       headers: {
  //         'Access-Control-Allow-Credentials': 'true',
  //         'Access-Control-Allow-Origin': 'http://localhost:3000'
  //       }
  //     }
  //   }
  // },

  // runtimeConfig: {
  //   public: {
  //     environment: process.env.NODE_ENV || 'local'
  //   }
  // },

  // See the Nuxt OIDC configuration docs for other properties and default values that are not shown here: 
  // https://nuxtoidc.cloud/configuration#provider-configuration-provider
  // NOTE: The 'globalMiddlewareEnabled' is set to 'true' by default, meaning Nuxt automatically redirects all requests to /auth/login if the user is not logged in
  oidc: {
    defaultProvider: 'entra',
    providers: {
      entra: {
        redirectUri: '', // Fields with empty strings as the values are automatically overridden by the environment variables passed in. See the .env file for more details.
        clientId: '',
        clientSecret: '',
        authorizationUrl: `https://login.microsoftonline.us/${entra_tenant_id}/oauth2/v2.0/authorize`,
        tokenUrl: `https://login.microsoftonline.us/${entra_tenant_id}/oauth2/v2.0/token`,
        logoutUrl: `https://login.microsoftonline.us/${entra_tenant_id}/oauth2/v2.0/logout`,
        callbackRedirectUrl: '/auth/loading', // URL to redirect to after Entra authentication is complete
        scope: [ // 'scope' just means items you are requesting permission to access from Entra
          'openid', 
          'profile', // TODO: remove this and compare currentUser output
          'email',
          // 'Group.Read.All' // Allow user to read group membership?
        ],
        exposeAccessToken: true,
        // responseMode: 'query',
        // scope: ['openid'], // scope: ['openid', 'profile', 'email'],
        // userInfoUrl: 'https://graph.microsoft.us/oidc/userinfo',
      }
    },
    middleware: {
      // customLoginPage: false,
    },
    session: {
      expirationThreshold: 300, // Allow the token to be refreshed early (within 5 minutes of expiration)
      maxAge: 60 * 60 * 24 * 5 // 5 days
    },
  },

});
