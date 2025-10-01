<template>
  <div>
    <!-- Share Button -->
    <UButton
      color="gray"
      variant="ghost"
      icon="i-heroicons-share"
      size="sm"
      :loading="isLoading"
      @click="handleShare"
    >
      Share
    </UButton>

    <!-- Share Modal -->
    <UModal v-model="isModalOpen" :ui="{ width: 'sm:max-w-md' }">
      <UCard
        :ui="{
          ring: '',
          divide: 'divide-y divide-gray-700',
          body: { base: 'p-0', padding: '' },
          header: { base: 'py-4 px-6', background: 'bg-gray-900' },
          footer: { base: 'py-4 px-6', background: 'bg-gray-900' }
        }"
      >
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold text-white">Share Cost View</h3>
            <UButton
              color="gray"
              variant="ghost"
              icon="i-heroicons-x-mark-20-solid"
              size="sm"
              @click="isModalOpen = false"
            />
          </div>
        </template>

        <div class="p-6 space-y-4">
          <!-- Debug Info -->
          <div class="text-xs text-gray-500 font-mono">
            Debug: isLoading={{ isLoading }}, shareUrl={{ shareUrl }}, error={{ error }}
          </div>

          <!-- Loading State -->
          <div v-if="isLoading" class="flex items-center justify-center py-8">
            <div class="text-center">
              <Icon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-blue-500 mx-auto mb-2" />
              <p class="text-sm text-gray-400">Creating share link...</p>
            </div>
          </div>

          <!-- Success State -->
          <div v-else-if="shareUrl && !error" class="space-y-4">
            <div class="flex items-center gap-2 text-green-400">
              <Icon name="i-heroicons-check-circle" class="w-5 h-5" />
              <span class="text-sm font-medium">Share link created successfully!</span>
            </div>
            
            <div class="space-y-2">
              <label class="text-sm font-medium text-gray-300">Share URL</label>
              <div class="flex gap-2">
                <UInput
                  :model-value="shareUrl || ''"
                  readonly
                  class="flex-1"
                  :ui="{ base: 'text-xs' }"
                />
                <UButton
                  color="blue"
                  variant="solid"
                  icon="i-heroicons-clipboard-document"
                  size="sm"
                  :loading="isCopying"
                  @click="copyToClipboard"
                >
                  {{ copySuccess ? 'Copied!' : 'Copy' }}
                </UButton>
              </div>
            </div>

            <div class="bg-blue-900/20 border border-blue-700 rounded-lg p-3">
              <div class="flex items-start gap-2">
                <Icon name="i-heroicons-information-circle" class="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                <div class="text-xs text-blue-200">
                  <div class="font-medium mb-1">What's included in this share:</div>
                  <ul class="space-y-1 text-blue-300">
                    <li v-if="stateInfo.accounts">• {{ stateInfo.accounts }} selected accounts</li>
                    <li v-if="stateInfo.timeframe">• Time period: {{ stateInfo.timeframe }}</li>
                    <li v-if="stateInfo.view">• View: {{ stateInfo.view }}</li>
                    <li v-if="stateInfo.tab">• Tab: {{ stateInfo.tab }}</li>
                    <li v-if="stateInfo.mode">• Data mode: {{ stateInfo.mode }}</li>
                  </ul>
                  <div class="mt-2 text-blue-400">
                    Link expires in 30 days.
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Error State -->
          <div v-else-if="error" class="space-y-4">
            <div class="flex items-center gap-2 text-red-400">
              <Icon name="i-heroicons-exclamation-triangle" class="w-5 h-5" />
              <span class="text-sm font-medium">Failed to create share link</span>
            </div>
            
            <div class="bg-red-900/20 border border-red-700 rounded-lg p-3">
              <p class="text-xs text-red-200">{{ error }}</p>
            </div>

            <UButton
              color="blue"
              variant="solid"
              @click="handleShare"
              class="w-full"
            >
              Try Again
            </UButton>
          </div>

          <!-- Initial State -->
          <div v-else class="space-y-4">
            <p class="text-sm text-gray-300">
              Create a shareable link that includes your current view settings, selected accounts, and filters.
            </p>
            
            <div class="bg-gray-800 rounded-lg p-3">
              <div class="text-xs text-gray-400 space-y-1">
                <div class="font-medium text-gray-300 mb-2">Current settings to share:</div>
                <div v-if="stateInfo.accounts">Selected accounts: {{ stateInfo.accounts }}</div>
                <div v-if="stateInfo.timeframe">Time period: {{ stateInfo.timeframe }}</div>
                <div v-if="stateInfo.view">View: {{ stateInfo.view }}</div>
                <div v-if="stateInfo.tab">Active tab: {{ stateInfo.tab }}</div>
                <div v-if="stateInfo.mode">Data mode: {{ stateInfo.mode }}</div>
              </div>
            </div>
          </div>
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton
              color="gray"
              variant="ghost"
              @click="isModalOpen = false"
            >
              Close
            </UButton>
            <UButton
              v-if="!shareUrl && !isLoading"
              color="blue"
              variant="solid"
              @click="handleShare"
            >
              Create Share Link
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import type { DataMode } from '~/types/costs'

interface Props {
  selectedAccounts: string[]
  selectedTimeframe: string
  selectedView: string
  activeTab: string
  dataMode: DataMode
}

const props = defineProps<Props>()

// Modal state
const isModalOpen = ref(false)
const isCopying = ref(false)
const copySuccess = ref(false)

// Create reactive refs for the share composable
const selectedAccounts = toRef(props, 'selectedAccounts')
const selectedTimeframe = toRef(props, 'selectedTimeframe')
const selectedView = toRef(props, 'selectedView')
const activeTab = toRef(props, 'activeTab')
const dataMode = toRef(props, 'dataMode')

// Initialize the share composable
const { isLoading, error, shortUrl, generateShareLink } = useShareLink({
  selectedAccounts,
  selectedTimeframe,
  selectedView,
  activeTab,
  dataMode
})

// Computed property for share URL
const shareUrl = computed(() => shortUrl.value)

// Computed property for readable state information
const stateInfo = computed(() => {
  const accountsText = props.selectedAccounts.length === 0 
    ? 'All accounts' 
    : `${props.selectedAccounts.length} account${props.selectedAccounts.length === 1 ? '' : 's'}`
  
  return {
    accounts: accountsText,
    timeframe: props.selectedTimeframe,
    view: props.selectedView,
    tab: getTabLabel(props.activeTab),
    mode: props.dataMode === 'billable' ? 'Billable' : 'Proforma'
  }
})

// Handle share button click
const handleShare = async () => {
  isModalOpen.value = true
  // Always generate a fresh link when opening the share modal
  const url = await generateShareLink()
  console.log('ShareButton - Generated URL:', url)
  console.log('ShareButton - shortUrl ref value:', shortUrl.value)
  console.log('ShareButton - shareUrl computed value:', shareUrl.value)
}

// Copy to clipboard functionality
const copyToClipboard = async () => {
  if (!shareUrl.value) return
  
  isCopying.value = true
  
  try {
    await navigator.clipboard.writeText(shareUrl.value)
    copySuccess.value = true
    
    // Reset copy success state after 2 seconds
    setTimeout(() => {
      copySuccess.value = false
    }, 2000)
  } catch (err) {
    console.error('Failed to copy to clipboard:', err)
  } finally {
    isCopying.value = false
  }
}

// Helper function for tab labels
const getTabLabel = (tabId: string): string => {
  const tabLabels: Record<string, string> = {
    'all': 'All Accounts',
    'lob': 'Lines of Business',
    'dept': 'Departments',
    'smart': 'Smart Groupings'
  }
  return tabLabels[tabId] || tabId
}

// Reset modal state when closed
watch(isModalOpen, (isOpen) => {
  if (!isOpen) {
    // Don't reset the share URL so it can be reused
    copySuccess.value = false
  }
})
</script>