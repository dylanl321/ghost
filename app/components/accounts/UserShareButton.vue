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
            <h3 class="text-lg font-semibold text-white">Share User Profile</h3>
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
                    <li>• User profile: {{ displayName || username }}</li>
                    <li>• AWS account access details</li>
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
              Create a shareable link to this user's profile and AWS access details.
            </p>

            <div class="bg-gray-800 rounded-lg p-3">
              <div class="text-xs text-gray-400 space-y-1">
                <div class="font-medium text-gray-300 mb-2">Current settings to share:</div>
                <div>User: {{ displayName || username }}</div>
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
const logger = createLogger('UserShareButton')

interface Props {
  username: string
  displayName?: string
}

const props = defineProps<Props>()

// Modal state
const isModalOpen = ref(false)
const isCopying = ref(false)
const copySuccess = ref(false)

// Create reactive ref for the share composable
const username = toRef(props, 'username')

// Initialize the share composable
const { isLoading, error, shortUrl, generateShareLink } = useUserShareLink({
  username
})

// Computed property for share URL
const shareUrl = computed(() => shortUrl.value)

// Handle share button click
const handleShare = async () => {
  isModalOpen.value = true
  // Always generate a fresh link when opening the share modal
  await generateShareLink()
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
    logger.error('Failed to copy to clipboard:', err)
  } finally {
    isCopying.value = false
  }
}

// Reset modal state when closed
watch(isModalOpen, (isOpen) => {
  if (!isOpen) {
    // Don't reset the share URL so it can be reused
    copySuccess.value = false
  }
})
</script>
