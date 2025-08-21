<template>
  <div class="flex flex-col items-center justify-center h-screen">
    <p>Loading your groups...</p>
  </div>
</template>

<script setup lang="ts">
const { user } = useOidcAuth()
const userGroupStore = useUserGroupStore()
const enclaveStore = useEnclaveStore()
const router = useRouter()

onMounted(async () => {
  const accessToken: string = user.value?.accessToken || ''

  if (!accessToken) {
    throw new Error('Error fetching access token. Try logging in again.')
  }

  // Store user groups
  await userGroupStore.initialize(accessToken)

  // Store account/enclave information for all AWS accounts
  await enclaveStore.initialize()

  // const response = await fetch('/api/accounts/list')


  console.log('role groups', userGroupStore.roleGroups)
  console.log('dist groups', userGroupStore.distributionGroups)
  console.log('enclaves', enclaveStore.enclaves)
  // console.log('list accounts', response)

  router.push('/')
})

</script>