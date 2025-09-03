// This plugin is used to navigate the user to the loading page if one or more of their Pinia Stores has expired and needs to be refreshed
// This code will run when the user first loads the website (including hard refresh or opening in new tab)
export default defineNuxtPlugin((nuxtApp) => {
  const router = useRouter()

  nuxtApp.hook('app:mounted', () => {
    const userGroupStore = useUserGroupStore()
    const enclaveStore = useEnclaveStore()

    const needsRefresh = userGroupStore.groupsNeedRefresh || userGroupStore.awsRolesNeedRefresh || enclaveStore.needsRefresh

    if (needsRefresh) {
      console.log('One or more pinia stores is stale. Refreshing...')
      router.replace('/auth/loading')
    }
  })
})
