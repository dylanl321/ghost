<template>
  <div class="flex items-center justify-center min-h-screen bg-gray-950">
    <div class="text-center">
      <div v-if="isLoading" class="space-y-4">
        <Icon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-blue-500 mx-auto" />
        <p class="text-gray-400">Loading shared view...</p>
      </div>
      
      <div v-else-if="error" class="space-y-4">
        <Icon name="i-heroicons-exclamation-triangle" class="w-8 h-8 text-red-500 mx-auto" />
        <div>
          <h2 class="text-xl font-semibold text-white mb-2">Link Not Found</h2>
          <p class="text-gray-400 mb-4">{{ error }}</p>
          <UButton 
            color="blue" 
            variant="solid" 
            @click="$router.push('/account/costs')"
          >
            Go to Cost Analytics
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface ShareLinkState {
  selectedAccounts: string[]
  timeframe: string
  view: string
  tab: string
  dataMode: 'billable' | 'proforma'
}

// Get the shortlink code from the route
const route = useRoute()
const router = useRouter()
const code = route.params.code as string

const isLoading = ref(true)
const error = ref<string | null>(null)

// Check authentication - redirect to login if needed
const { loggedIn } = useOidcAuth()

// If not authenticated, save the current URL and redirect to auth
if (!loggedIn.value) {
  // Store the intended destination
  const intendedUrl = route.fullPath
  await navigateTo(`/auth/loading?redirect=${encodeURIComponent(intendedUrl)}`)
}

onMounted(async () => {
  if (!code) {
    error.value = 'No share code provided'
    isLoading.value = false
    return
  }

  try {
    // Fetch the shortlink data
    const response = await $fetch<{
      success: boolean
      data: {
        pagePath: string
        configData: ShareLinkState
      }
    }>(`/api/shortlinks/${code}`)

    if (!response.success || !response.data) {
      throw new Error('Share link not found or has expired')
    }

    const { pagePath, configData } = response.data

    // Build query parameters from the shared state
    const queryParams = new URLSearchParams()
    
    if (configData.selectedAccounts?.length > 0) {
      queryParams.set('accounts', JSON.stringify(configData.selectedAccounts))
    }
    if (configData.timeframe) {
      queryParams.set('timeframe', configData.timeframe)
    }
    if (configData.view) {
      queryParams.set('view', configData.view)
    }
    if (configData.tab) {
      queryParams.set('tab', configData.tab)
    }
    if (configData.dataMode) {
      queryParams.set('mode', configData.dataMode)
    }

    // Redirect to the original page with state parameters
    const targetUrl = queryParams.toString() 
      ? `${pagePath}?${queryParams.toString()}`
      : pagePath

    await navigateTo(targetUrl)

  } catch (err: any) {
    console.error('Error loading shared link:', err)
    error.value = err?.message || 'Failed to load shared link'
  } finally {
    isLoading.value = false
  }
})

// Set page metadata
definePageMeta({
  layout: 'default'
})

useHead({
  title: 'Loading Shared View - Ghost Dashboard'
})
</script>