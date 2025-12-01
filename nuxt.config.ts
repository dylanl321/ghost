/* Important Notes

The '@nuxt/eslint' module is a linter that does static code analysis to detect issue with the code. Install the VSCode ESLint extension to lint your code in real time.
  Documentation: https://eslint.nuxt.com/packages/module

*/

import { fileURLToPath } from 'node:url'

const entra_tenant_id = "7c5a26cf-ddf0-400c-9703-4070b4e3a54d";

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: false },

  alias: {
    '#shared': fileURLToPath(new URL('./shared', import.meta.url))
  },

  app: {
    head: {
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' }
      ],
      title: 'GHOST - AWS Dashboard',
      meta: [
        { name: 'description', content: 'General Data Hosting and Orchestration System Technology - AWS Dashboard' }
      ]
    }
  },

  modules: [
    "@nuxt/ui",
    "@nuxt/eslint",
    "nuxt-oidc-auth",
    "@pinia/nuxt",
    "pinia-plugin-persistedstate/nuxt",
    "nuxt-echarts",
  ], // Modules are used to extend the functionality of Nuxt (https://nuxt.com/docs/4.x/guide/concepts/modules)

  echarts: {
    charts: ["BarChart", "LineChart", "PieChart", "GaugeChart"],
    components: [
      "TitleComponent",
      "TooltipComponent",
      "LegendComponent",
      "GridComponent",
    ],
  },
  css: ["~/assets/css/main.css"],
  components: [
    {
      path: "~/components",
      pathPrefix: false, // Auto important components based only on name, ignoring path prefix
    },
  ],
  // ui: {
  //   fonts: false // Prevent NuxtUI from fetching fonts, which causes a certificate error
  // },

  nitro: {
    noExternal: ['gray-matter']
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

  runtimeConfig: {
    // Server-side only (not exposed to client)
    strandsServerUrl: process.env.STRANDS_SERVER_URL || '',
    strandsTimeout: parseInt(process.env.STRANDS_TIMEOUT || '30000', 10),

    // Admin Notifications
    adminNotificationEmails: process.env.ADMIN_NOTIFICATION_EMAILS || 'dylan.lewis@gd-ms.com',
    adminNotificationsEnabled: process.env.ADMIN_NOTIFICATIONS_ENABLED !== 'false',
    notificationsTableName: process.env.NOTIFICATIONS_TABLE_NAME || 'ghost_admin_notifications',

    // Site Configuration
    siteConfigTableName: process.env.SITE_CONFIG_TABLE_NAME || 'ghost-site-config',

    public: {
      environment: process.env.NODE_ENV || "local",
      authBypass: process.env.AUTH_BYPASS === "true",
    },
  },

  // See the Nuxt OIDC configuration docs for other properties and default values that are not shown here:
  // https://nuxtoidc.cloud/configuration#provider-configuration-provider
  // NOTE: The 'globalMiddlewareEnabled' is set to 'true' by default, meaning Nuxt automatically redirects all requests to /auth/login if the user is not logged in
  oidc: {
    defaultProvider: "entra",
    providers: {
      entra: {
        redirectUri: "", // Fields with empty strings as the values are automatically overridden by the environment variables passed in. See the .env file for more details.
        clientId: "",
        clientSecret: "",
        authorizationUrl: `https://login.microsoftonline.us/${entra_tenant_id}/oauth2/v2.0/authorize`,
        tokenUrl: `https://login.microsoftonline.us/${entra_tenant_id}/oauth2/v2.0/token`,
        logoutUrl: `https://login.microsoftonline.us/${entra_tenant_id}/oauth2/v2.0/logout`,
        callbackRedirectUrl: "/auth/loading", // URL to redirect to after Entra authentication is complete
        scope: [
          // 'scopes' just means items you are requesting permission to access from Entra (https://learn.microsoft.com/en-us/graph/permissions-reference#delegated-permissions-26)
          "openid",
          "profile",
          "email",
          "offline_access", // This will give our application a refresh token for easier refreshing of credentials
          "Directory.Read.All",
          "Group.Read.All",
        ],
        optionalClaims: ["email", "given_name", "family_name"], // https://learn.microsoft.com/en-us/entra/identity-platform/optional-claims-reference
        exposeAccessToken: true,
        // userInfoUrl: 'https://graph.microsoft.us/oidc/userinfo',
      },
    },
    middleware: {
      // customLoginPage: false,
    },
    session: {
      expirationThreshold: 300, // Allow the token to be refreshed early (within 5 minutes of expiration)
      maxAge: 60 * 60 * 24 * 1, // 1 day
    },
  },
});
