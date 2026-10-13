/* Important Notes

The '@nuxt/eslint' module is a linter that does static code analysis to detect issue with the code. Install the VSCode ESLint extension to lint your code in real time.
  Documentation: https://eslint.nuxt.com/packages/module

*/

import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { version } from './package.json'

// Read changelog at build time so it's available in production
const changelogContent = readFileSync('./CHANGELOG.md', 'utf-8')

const entra_tenant_id = "7c5a26cf-ddf0-400c-9703-4070b4e3a54d";

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  routeRules: {
    '/chat/mcp': { redirect: { to: '/mcp-connections', statusCode: 301 } },
    '/chat/mcp/details': { redirect: { to: '/mcp-connections/details', statusCode: 301 } },
    '/support/mcp': { redirect: { to: '/mcp-connections', statusCode: 301 } },
  },
  compatibilityDate: "2025-07-15",
  devtools: { enabled: false },

  alias: {
    '#shared': fileURLToPath(new URL('./shared', import.meta.url))
  },

  app: {
    pageTransition: { name: 'page', mode: 'out-in' },
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

  // Default to dark, but allow light/system (user preference) via @nuxtjs/color-mode
  colorMode: {
    preference: 'dark',
    fallback: 'dark',
    classSuffix: '',
  },

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
  vite: {
    optimizeDeps: {
      include: [
        // Pre-bundle large AWS SDK packages to speed up dev server
        '@aws-sdk/client-dynamodb',
        '@aws-sdk/client-cost-explorer',
        '@aws-sdk/client-organizations',
        '@aws-sdk/client-s3',
        '@aws-sdk/client-sts',
        '@aws-sdk/client-ec2',
        '@aws-sdk/client-iam',
        '@aws-sdk/util-dynamodb',
        // Pre-bundle Vue ecosystem
        'vue',
        'pinia',
        '@vueuse/core',
        // Pre-bundle UI libraries
        'echarts',
        'd3'
      ]
    },
    build: {
      // Increase chunk size warning limit for large dependencies
      chunkSizeWarningLimit: 1000
    }
  },

  nitro: {
    externals: {
      inline: ['gray-matter', 'xlsx']
    }
  },

  runtimeConfig: {
    // Server-side only (not exposed to client)
    changelogContent,

    // Admin Notifications
    adminNotificationEmails: process.env.ADMIN_NOTIFICATION_EMAILS || 'dylan.lewis@gd-ms.com',
    adminNotificationsEnabled: process.env.ADMIN_NOTIFICATIONS_ENABLED !== 'false',
    notificationsTableName: process.env.NOTIFICATIONS_TABLE_NAME || 'ghost_admin_notifications',

    // Site Configuration
    siteConfigTableName: process.env.SITE_CONFIG_TABLE_NAME || 'ghost-site-config',

    public: {
      appVersion: version,
      buildDate: new Date().toISOString().split('T')[0],
      environment: process.env.NODE_ENV || "local",
      authBypass: process.env.AUTH_BYPASS === "true",
      // Dev mode groups for frontend use
      devUserGroups: process.env.DEV_USER_GROUPS || 'AWS-Product-Team',
      devAuthEnabled: process.env.DEV_AUTH_ENABLED === 'true',
    },
  },

  // See the Nuxt OIDC configuration docs for other properties and default values that are not shown here:
  // https://nuxtoidc.cloud/configuration#provider-configuration-provider
  // NOTE: The 'globalMiddlewareEnabled' is set to 'true' by default, meaning Nuxt automatically redirects all requests to /auth/login if the user is not logged in
  oidc: {
    defaultProvider: "entra",
    // Dev mode - creates mock session without Entra (only works in non-production)
    devMode: {
      enabled: process.env.DEV_AUTH_ENABLED === 'true',
      userName: process.env.DEV_USER_NAME || 'Dev User',
      // userInfo goes into user.value.userInfo
      userInfo: {
        email: process.env.DEV_USER_EMAIL || 'dev@localhost',
        name: process.env.DEV_USER_NAME || 'Dev User',
        given_name: 'Dev',
        family_name: 'User',
      },
      // claims goes into user.value.claims (REQUIRED for loading.vue validation)
      claims: {
        email: process.env.DEV_USER_EMAIL || 'dev@localhost',
        given_name: 'Dev',
        family_name: 'User',
        name: process.env.DEV_USER_NAME || 'Dev User',
        sub: 'dev-user-id',
      },
      generateAccessToken: true,
    },
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
        optionalClaims: ["email", "given_name", "family_name", "oid"], // https://learn.microsoft.com/en-us/entra/identity-platform/optional-claims-reference
        exposeAccessToken: true,
      },
    },
    middleware: {
      globalMiddlewareEnabled: false,
    },
    session: {
      // Disable expiration check when using devMode (dev tokens don't expire)
      expirationCheck: process.env.DEV_AUTH_ENABLED !== 'true',
      automaticRefresh: true, // Enable automatic token refresh
      expirationThreshold: 300, // Allow the token to be refreshed early (within 5 minutes of expiration)
      maxAge: 60 * 60 * 2, // 2 hours (aligned with typical token refresh patterns)
    },
  },
});
