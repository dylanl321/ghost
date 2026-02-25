<template>
  <div class="flex items-center justify-center min-h-screen bg-gray-950">
    <div class="text-center">
      <div v-if="isLoading" class="space-y-4">
        <Icon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-blue-500 mx-auto" />
        <p class="text-gray-400">Resolving account...</p>
      </div>

      <div v-else-if="error" class="space-y-4">
        <Icon name="i-heroicons-exclamation-triangle" class="w-8 h-8 text-red-500 mx-auto" />
        <div>
          <h2 class="text-xl font-semibold text-white mb-2">{{ errorTitle }}</h2>
          <p class="text-gray-400 mb-4">{{ error }}</p>
          <UButton
            color="blue"
            variant="solid"
            @click="$router.push('/account')"
          >
            Go to Account Explorer
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const target = route.params.target as string
const id = route.params.id as string
const type = route.query.type as string | undefined

const isLoading = ref(true)
const error = ref<string | null>(null)
const errorTitle = ref('Account Not Found')

const VALID_TARGETS = ['account', 'costs']

onMounted(async () => {
  if (!VALID_TARGETS.includes(target)) {
    errorTitle.value = 'Invalid Link'
    error.value = `"${target}" is not a valid redirect target. Use "account" or "costs".`
    isLoading.value = false
    return
  }

  if (!id) {
    errorTitle.value = 'Invalid Link'
    error.value = 'No identifier provided.'
    isLoading.value = false
    return
  }

  // If the identifier is already a 12-digit account ID with no explicit type override,
  // redirect immediately without an API call
  if (/^\d{12}$/.test(id) && !type) {
    redirectToTarget(id)
    return
  }

  try {
    const queryParams = new URLSearchParams({ includeDecommissioned: 'true' })
    if (type) queryParams.set('type', type)

    const response = await $fetch<{
      success: boolean
      data: {
        account: Record<string, any>
      }
    }>(`/api/accounts/${encodeURIComponent(id)}?${queryParams.toString()}`)

    if (!response.success || !response.data?.account) {
      throw new Error('Account not found')
    }

    const account = response.data.account
    const commercialId = account.accountId || account.awsStandardAccountID

    if (!commercialId) {
      error.value = 'This account does not have a commercial AWS account ID.'
      isLoading.value = false
      return
    }

    redirectToTarget(commercialId)
  } catch (err: any) {
    const message = err?.data?.message || err?.message || 'Failed to resolve account'
    error.value = message
    isLoading.value = false
  }
})

function redirectToTarget(commercialId: string) {
  if (target === 'costs') {
    navigateTo(`/account/costs?account=${commercialId}`, { replace: true })
  } else {
    navigateTo(`/account/${commercialId}`, { replace: true })
  }
}

definePageMeta({
  keepalive: false,
  layout: 'default'
})

useHead({
  title: 'Redirecting - Ghost Dashboard'
})
</script>
