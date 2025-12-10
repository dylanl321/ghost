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
            @click="$router.push('/')"
          >
            Go to Dashboard
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Support multiple page types
interface CostShareLinkState {
  selectedAccounts: string[]
  timeframe: string
  view: string
  tab: string
  dataMode: 'billable' | 'proforma'
}

interface AccountShareLinkState {
  accountId: string
  selectedTab: number
}

interface UserShareLinkState {
  username: string
}

interface ReportShareLinkState {
  shareId: string
  reportName: string
  format: string
}

interface ChatThreadShareLinkState {
  shareId: string
  threadId: string
  type: 'chat-thread'
}

type ShareLinkState = CostShareLinkState | AccountShareLinkState | UserShareLinkState | ReportShareLinkState | ChatThreadShareLinkState

// Get the shortlink code from the route
const route = useRoute()
const router = useRouter()
const code = route.params.code as string

const isLoading = ref(true)
const error = ref<string | null>(null)

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

    // Handle chat thread shares - redirect to dedicated view page
    if ('type' in configData && configData.type === 'chat-thread') {
      const chatData = configData as ChatThreadShareLinkState
      await navigateTo(`/chat/shared/${chatData.shareId}`, { replace: true })
      return
    }

    // Handle shared report downloads directly
    if ('shareId' in configData && !('type' in configData)) {
      const reportData = configData as ReportShareLinkState

      // Fetch the report and generate presigned URL, then redirect
      try {
        // Check if this is a dataset report or cost report
        const downloadEndpoint = 'reportType' in reportData && reportData.reportType === 'dataset'
          ? `/api/dataset-reports/download/${reportData.shareId}`
          : `/api/reports/download/${reportData.shareId}`

        const downloadResponse = await $fetch<{ presignedUrl: string }>(downloadEndpoint)

        // Redirect to S3 directly
        window.location.href = downloadResponse.presignedUrl
        return
      } catch (err: any) {
        error.value = err?.data?.message || 'Failed to download report'
        isLoading.value = false
        return
      }
    }

    // Build query parameters based on page type
    const queryParams = new URLSearchParams()

    // Handle cost analytics pages
    if ('selectedAccounts' in configData && 'timeframe' in configData) {
      const costData = configData as CostShareLinkState
      if (costData.selectedAccounts?.length > 0) {
        queryParams.set('accounts', JSON.stringify(costData.selectedAccounts))
      }
      if (costData.timeframe) {
        queryParams.set('timeframe', costData.timeframe)
      }
      if (costData.view) {
        queryParams.set('view', costData.view)
      }
      if (costData.tab) {
        queryParams.set('tab', costData.tab)
      }
      if (costData.dataMode) {
        queryParams.set('mode', costData.dataMode)
      }
    }
    // Handle account detail pages
    else if ('accountId' in configData && 'selectedTab' in configData) {
      const accountData = configData as AccountShareLinkState
      if (accountData.selectedTab !== undefined) {
        queryParams.set('tab', accountData.selectedTab.toString())
      }
    }
    // Handle user profile pages (no query params needed, username is in path)
    else if ('username' in configData) {
      // User pages don't need query params, username is in the path
    }

    // Redirect to the original page with state parameters
    const targetUrl = queryParams.toString()
      ? `${pagePath}?${queryParams.toString()}`
      : pagePath

    // Use replace: true so the /s/[code] page doesn't stay in browser history
    await navigateTo(targetUrl, { replace: true })

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