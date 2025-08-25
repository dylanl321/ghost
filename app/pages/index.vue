<template>
  <div class="m-8">
    <div class="border-2 p-4 mb-4 rounded-md">Hello!</div>
    <button
      class="bg-primary text-black px-4 py-2 rounded-lg"
      :onclick="() => {count += 1;}"
    >
      Click
    </button>
    <div>Count: {{ count }}</div>

    <UserEnclaves />

    <!-- <UButton class="mt-20" :onclick="handleLogout">Logout</UButton> -->
    <button class="mt-20 border-1 p-1 rounded-md hover:bg-emerald-600 hover:cursor-pointer" @click="handleLogout">Logout</button>
  </div>
</template>

<script setup lang="ts">
// import type { AWSEnclaveData } from '~~/shared/types/accounts'

const { user, logout } = useOidcAuth()
// const enclaveStore = useEnclaveStore()
const userGroupStore = useUserGroupStore()

const loginTime = ref('')

const handleLogout = () => {
  console.log('logging out')
  logout()
}

// const fetchAccountData = async () => {
//   const response = await fetch('/api/accounts/list')
//   const json = await response.json()

//   const accounts: AWSEnclaveData[] = json.data

//   const dict: Record<string, AWSEnclaveData> = {}
//   for (const acct of accounts) {
//     const id = acct.accountId || acct.awsStandardAccountID
//     if (!id) continue // skip if neither exists
//     dict[id] = acct
//   }

//   enclaveStore.enclaves = dict

//   console.log('enclave store', enclaveStore.enclaves)
// }

onMounted(async () => {
  const temp = new Date((user?.value?.loggedInAt || 0) * 1000)
  loginTime.value = temp.toLocaleString()

  // console.log('aws roles', userGroupStore.awsRoles)

  // await fetchAccountData()

  // use the enclaveStore's 'enclave' property to store the data
  // const accounts: any[] = json?.data || []
})

const count = ref(0)
</script>
