<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const { user, loggedIn } = useOidcAuth()
const userGroupStore = useUserGroupStore()
const enclaveStore = useEnclaveStore()

const step = ref('Validating login state...')
const error = ref<string | null>(null)
const progress = ref(0)

const validateLoginState = (accessToken: string) => {
  const currentUser = user.value

  if (!loggedIn.value || !currentUser || !accessToken) {
    error.value = 'Error: Authentication failed'
    return false
  }

  if (currentUser.claims?.given_name || currentUser.claims?.family_name) {
    error.value = 'Error: Incomplete profile'
    return false
  }

  return true
}

onMounted(async () => {
  try {
    step.value = 'Validating login state...'
    const accessToken: string = user.value?.accessToken || ''
    if (!validateLoginState(accessToken)) {
      return
    }

    step.value = 'Fetching user groups...'
    progress.value = 30

    // Store user groups
    await userGroupStore.initializeGroups(accessToken)

    step.value = 'Fetching AWS enclave information...'
    progress.value = 60

    // Store account/enclave information for all AWS accounts
    await enclaveStore.initialize()

    // Store merged AWS role / enclave data in the user group store
    await userGroupStore.initializeAWSRoles(enclaveStore.enclaves)

    console.log('role groups', userGroupStore.roleGroups)
    console.log('dist groups', userGroupStore.distributionGroups)
    console.log('enclaves', enclaveStore.enclaves)
    console.log('aws roles', userGroupStore.awsRoles)

    step.value = 'All set! Taking you to your dashboard...'
    progress.value = 100
    await new Promise((resolve) => setTimeout(resolve, 800))

    router.push('/')
  } catch {
    error.value = 'Something went wrong'
  }
})
</script>

<template>
  <div class="flex items-center justify-center h-screen bg-gradient-to-br from-secondary/50 to-primary-50/30 dark:from-slate-900/50 dark:to-primary-950/50 backdrop-blur-lg">
    <div class="text-center p-12 rounded-xl shadow-xl bg-emerald-800/20 w-1/4">
      <p class="text-2xl font-bold mb-8" :class="error ? 'text-red-500' : 'text-black dark:text-white'">{{ error || step }}</p>
      <div v-if="!error" class="mt-4 bg-gray-200 dark:bg-emerald-900 rounded-full h-2.5 mb-4 overflow-hidden">
        <div
          class="bg-gradient-to-r from-primary-600 via-primary-500 to-primary-600 h-2.5 rounded-full transition-all duration-700 ease-in-out"
          :style="{
            width: `${progress}%`,
            backgroundSize: '200% 100%',
            animation: 'shimmer 2s infinite linear',
          }"
        />
      </div>
    </div>
  </div>
</template>
