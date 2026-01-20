/**
 * Store Initialization Plugin
 * 
 * This plugin ensures stores are properly initialized on client-side
 * without causing infinite redirect loops.
 * 
 * It handles:
 * - Initial store loading when data is missing
 * - Graceful degradation when stores are empty
 * - Prevents SSR/hydration mismatches
 */

export default defineNuxtPlugin(async (nuxtApp) => {
  // Only run on client-side
  if (!import.meta.client) return

  nuxtApp.hook('app:mounted', async () => {
    const { user, loggedIn } = useOidcAuth()
    const userGroupStore = useUserGroupStore()
    const enclaveStore = useEnclaveStore()
    const siteConfigStore = useSiteConfigStore()
    const route = useRoute()
    const router = useRouter()
    
    // Skip initialization on auth pages
    const authPages = ['/auth/login', '/auth/loading', '/auth/logout', '/auth/callback']
    if (authPages.some(page => route.path.startsWith(page))) {
      console.log('On auth page, skipping store initialization')
      return
    }

    // Check if user is logged in
    if (!loggedIn.value || !user.value?.accessToken) {
      console.log('[GHOST-AUTH] Store init: User not logged in, skipping store initialization')
      // Let the auth-redirect middleware handle authentication
      // Don't save URL or redirect here - it conflicts with the middleware
      return
    }

    // Initialize stores if they're empty (not if they're "stale")
    // This prevents infinite loops while ensuring stores have data

    try {
      // Check if stores have any data at all
      const hasGroups = userGroupStore.roleGroups && Object.keys(userGroupStore.roleGroups).length > 0
      const hasEnclaves = enclaveStore.enclaves && Object.keys(enclaveStore.enclaves).length > 0
      const hasConfig = siteConfigStore.loaded

      // Only force initialization if stores are completely empty
      if (!hasGroups || !hasEnclaves || !hasConfig) {
        console.log('Stores are empty, initializing...')

        // Initialize in parallel for better performance
        const initPromises = []

        if (!hasGroups) {
          console.log('Initializing user groups...')
          initPromises.push(userGroupStore.initializeGroups(user.value.accessToken, true))
        }

        if (!hasEnclaves) {
          console.log('Initializing enclaves...')
          initPromises.push(enclaveStore.initialize(true))
        }

        if (!hasConfig) {
          console.log('Initializing site configuration...')
          initPromises.push(siteConfigStore.fetchConfig())
        }

        // Wait for initialization
        await Promise.all(initPromises)
        
        // Initialize AWS roles if needed
        if (!hasGroups && enclaveStore.enclaves) {
          console.log('Initializing AWS roles...')
          await userGroupStore.initializeAWSRoles(enclaveStore.enclaves, true)
        }
        
        console.log('Store initialization complete')
      } else {
        console.log('Stores have data, skipping initialization')
        
        // Optionally refresh if data is very old (but don't redirect)
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000)
        
        if (userGroupStore.groupsLastFetch && userGroupStore.groupsLastFetch < fiveMinutesAgo) {
          console.log('Groups data is stale, refreshing in background...')
          // Refresh in background without blocking
          userGroupStore.initializeGroups(user.value.accessToken, true).catch(err => 
            console.warn('Background refresh of groups failed:', err)
          )
        }
        
        if (enclaveStore.lastFetch && enclaveStore.lastFetch < fiveMinutesAgo) {
          console.log('Enclave data is stale, refreshing in background...')
          // Refresh in background without blocking
          enclaveStore.initialize(true).catch(err =>
            console.warn('Background refresh of enclaves failed:', err)
          )
        }

        if (siteConfigStore.isStale) {
          console.log('Site config is stale, refreshing in background...')
          // Refresh in background without blocking
          siteConfigStore.refresh().catch(err =>
            console.warn('Background refresh of site config failed:', err)
          )
        }
      }
    } catch (error) {
      console.error('Store initialization failed:', error)
      // Don't redirect on error - let the app work with cached data if available
    }
  })
})