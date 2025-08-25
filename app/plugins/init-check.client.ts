// This plugin is used to navigate the user to the loading page if 
// 1) they are first navigating to the page (or doing a hard refresh)
// and 2) one or more of their Pinia Stores has expired and needs to be refreshed
export default defineNuxtPlugin((nuxtApp) => {
  const router = useRouter()

  nuxtApp.hook('app:mounted', () => {
    const userGroupStore = useUserGroupStore()
    const enclaveStore = useEnclaveStore()

    const expired =
      !userGroupStore.groupsLastFetch ||
      !userGroupStore.awsRolesLastFetch ||
      !enclaveStore.lastFetch

    if (expired) {
      console.log('expired is true')
      router.replace('/auth/loading')
    }
  })
})
