const logger = createLogger('InitCheck')

// This plugin is used to navigate the user to the loading page if one or more of their Pinia Stores has expired and needs to be refreshed
// This code will run when the user first loads the website (including hard refresh or opening in new tab)

// TEMPORARILY DISABLED: This plugin is causing infinite reload loops due to SSR/hydration mismatches
// The stores appear "stale" on every page load because the server doesn't have access to localStorage
// and renders with empty state, while the client hydrates with persisted state.
// This causes needsRefresh to always be true on initial load.

export default defineNuxtPlugin((nuxtApp) => {
  // Plugin disabled to prevent infinite reload loop
  // TODO: Implement proper SSR-compatible store initialization
  
  logger.info('Store refresh check disabled to prevent reload loop')
  
  // Original logic commented out:
  /*
  const router = useRouter()
  const route = useRoute()

  nuxtApp.hook('app:mounted', () => {
    const userGroupStore = useUserGroupStore()
    const enclaveStore = useEnclaveStore()

    const needsRefresh = userGroupStore.groupsNeedRefresh || userGroupStore.awsRolesNeedRefresh || enclaveStore.needsRefresh

    if (needsRefresh) {
      logger.info('One or more pinia stores is stale. Refreshing...')
      router.replace('/auth/loading')
    } else {
      logger.info('Pinia stores are all up to date')
    }
  })
  */
})
