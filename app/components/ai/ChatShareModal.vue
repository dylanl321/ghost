<template>
  <UModal v-model="isOpen" :ui="{ width: 'max-w-lg' }">
    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-share" class="w-5 h-5 text-blue-500" />
          <h3 class="text-lg font-semibold">Share Conversation</h3>
        </div>
      </template>

      <!-- Loading State -->
      <div v-if="loading" class="flex items-center justify-center py-8">
        <div class="flex flex-col items-center gap-3">
          <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 text-purple-500 animate-spin" />
          <p class="text-sm text-gray-500 dark:text-gray-400">Generating share link...</p>
        </div>
      </div>

      <!-- Share Options -->
      <div v-else-if="!shareData && !error" class="space-y-5">
        <div>
          <p class="text-sm font-medium text-gray-900 dark:text-white mb-2">Conversation preview</p>
          <div class="max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-200 dark:divide-gray-700">
            <div v-for="message in previewMessages" :key="message.messageId" class="p-3">
              <p class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                {{ message.role === 'user' ? 'You' : 'GHOST' }}
              </p>
              <p class="text-sm text-gray-700 dark:text-gray-300 line-clamp-3 whitespace-pre-wrap">{{ message.content }}</p>
            </div>
          </div>
          <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Public links include message text only. Reasoning, tool details, model data, tokens, and job IDs are excluded.
          </p>
        </div>

        <fieldset>
          <legend class="text-sm font-medium text-gray-900 dark:text-white mb-2">Link expires after</legend>
          <div class="grid grid-cols-4 gap-2">
            <UButton
              v-for="days in expirationOptions"
              :key="days"
              :variant="selectedExpiresInDays === days ? 'solid' : 'outline'"
              :color="selectedExpiresInDays === days ? 'purple' : 'gray'"
              @click="selectedExpiresInDays = days"
            >
              {{ days }} day{{ days === 1 ? '' : 's' }}
            </UButton>
          </div>
        </fieldset>

        <UButton block color="purple" icon="i-heroicons-link" @click="generateShareLink">
          Create Public Link
        </UButton>
      </div>

      <!-- Share Link Ready -->
      <div v-else-if="shareData" class="space-y-4">
        <p class="text-sm text-gray-600 dark:text-gray-400">
          Anyone with this link can view this conversation. The link will expire in {{ selectedExpiresInDays }} days.
        </p>

        <!-- Share URL -->
        <div class="space-y-2">
          <label class="text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
            Share Link
          </label>
          <div class="flex gap-2">
            <UInput
              :model-value="shareUrl"
              readonly
              size="lg"
              class="flex-1"
            />
            <UButton
              icon="i-heroicons-clipboard-document"
              color="purple"
              size="lg"
              @click="copyToClipboard"
            />
          </div>
        </div>

        <!-- Short URL (if available) -->
        <div v-if="shareData.shortUrl" class="space-y-2">
          <label class="text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
            Short Link
          </label>
          <div class="flex gap-2">
            <UInput
              :model-value="shareData.shortUrl"
              readonly
              size="lg"
              class="flex-1"
            />
            <UButton
              icon="i-heroicons-clipboard-document"
              color="purple"
              size="lg"
              @click="copyShortUrl"
            />
          </div>
        </div>

        <!-- Expiration Info -->
        <div class="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <UIcon name="i-heroicons-clock" class="w-5 h-5 text-blue-600 dark:text-blue-400" />
          <div class="flex-1">
            <p class="text-sm font-medium text-blue-900 dark:text-blue-100">
              Link Expiration
            </p>
            <p class="text-xs text-blue-700 dark:text-blue-300">
              Expires on {{ formatExpirationDate(shareData.expiresAt) }}
            </p>
          </div>
        </div>

        <!-- Share Actions -->
        <div class="flex gap-2">
          <UButton
            v-if="shareData.shortUrl"
            icon="i-heroicons-arrow-top-right-on-square"
            variant="outline"
            color="gray"
            class="flex-1"
            :to="shareData.shortUrl"
            target="_blank"
          >
            Open Link
          </UButton>
          <UButton
            icon="i-heroicons-no-symbol"
            variant="outline"
            color="red"
            class="flex-1"
            @click="handleUnshare"
          >
            Remove Sharing
          </UButton>
        </div>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="py-8">
        <div class="flex flex-col items-center gap-3 text-center">
          <UIcon name="i-heroicons-exclamation-circle" class="w-12 h-12 text-red-500" />
          <div>
            <h4 class="font-medium text-gray-900 dark:text-white mb-1">Failed to generate share link</h4>
            <p class="text-sm text-gray-600 dark:text-gray-400">{{ error }}</p>
          </div>
          <UButton color="purple" @click="generateShareLink">
            Try Again
          </UButton>
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end">
          <UButton variant="ghost" color="gray" @click="close">
            Close
          </UButton>
        </div>
      </template>
    </UCard>
  </UModal>
</template>

<script setup lang="ts">
import type { ShareThreadResponse } from '#shared/types/chat-threads'
import { useChatThreadsStore } from '~/stores/useChatThreadsStore'

const logger = createLogger('ChatShareModal')

interface Props {
  threadId: string | null
  expiresInDays?: number
}

const props = withDefaults(defineProps<Props>(), {
  expiresInDays: 30
})

const emit = defineEmits<{
  close: []
  unshared: []
}>()

const isOpen = defineModel<boolean>({ required: true })
const toast = useToast()
const threadsStore = useChatThreadsStore() as unknown as { currentThread: import('#shared/types/chat-threads').ChatThread | null }

// State
const loading = ref(false)
const error = ref<string | null>(null)
const shareData = ref<ShareThreadResponse | null>(null)
const expirationOptions = [1, 7, 30, 90] as const
const selectedExpiresInDays = ref<1 | 7 | 30 | 90>(
  expirationOptions.includes(props.expiresInDays as 1 | 7 | 30 | 90)
    ? props.expiresInDays as 1 | 7 | 30 | 90
    : 30
)
const previewMessages = computed(() => {
  if (threadsStore.currentThread?.threadId !== props.threadId) return []
  return (threadsStore.currentThread.messages || []).slice(-4)
})

// Computed share URL - points to the human-readable page, not the API endpoint
const shareUrl = computed(() => {
  if (!shareData.value) return ''
  const origin = window.location.origin
  return `${origin}/chat/shared/${shareData.value.shareId}`
})

// Track the threadId that shareData belongs to, to clear stale data when thread changes
const currentShareThreadId = ref<string | null>(null)

// Watch for thread ID changes - clear stale share data and fetch if modal is open
watch(() => props.threadId, (newThreadId, oldThreadId) => {
  // Clear share data if thread changed
  if (newThreadId !== oldThreadId) {
    shareData.value = null
    currentShareThreadId.value = null
    error.value = null
  }

}, { immediate: true })

// Generate share link (or fetch existing)
async function generateShareLink() {
  if (!props.threadId) return

  // Skip if we already have share data for this thread
  if (currentShareThreadId.value === props.threadId && shareData.value) {
    return
  }

  loading.value = true
  error.value = null

  try {
    // The API returns existing share data if thread is already shared
    const response = await $fetch(`/api/chat/threads/${props.threadId}/share`, {
      method: 'POST',
      body: {
        expiresInDays: selectedExpiresInDays.value
      }
    })

    shareData.value = response.data
    currentShareThreadId.value = props.threadId
  } catch (err: any) {
    logger.error('Error generating share link:', err)
    error.value = err.data?.error?.message || 'Failed to generate share link'
  } finally {
    loading.value = false
  }
}

// Copy to clipboard
async function copyToClipboard() {
  if (!shareUrl.value) return

  try {
    await navigator.clipboard.writeText(shareUrl.value)
    toast.add({
      title: 'Link copied!',
      description: 'Share link copied to clipboard',
      color: 'green'
    })
  } catch (err) {
    logger.error('Failed to copy:', err)
    toast.add({
      title: 'Failed to copy',
      description: 'Please copy the link manually',
      color: 'red'
    })
  }
}

// Copy short URL
async function copyShortUrl() {
  if (!shareData.value?.shortUrl) return

  try {
    await navigator.clipboard.writeText(shareData.value.shortUrl)
    toast.add({
      title: 'Short link copied!',
      description: 'Short link copied to clipboard',
      color: 'green'
    })
  } catch (err) {
    logger.error('Failed to copy:', err)
    toast.add({
      title: 'Failed to copy',
      description: 'Please copy the link manually',
      color: 'red'
    })
  }
}

// Handle unshare
async function handleUnshare() {
  if (!props.threadId) return

  try {
    await $fetch(`/api/chat/threads/${props.threadId}/unshare`, {
      method: 'DELETE'
    })

    toast.add({
      title: 'Sharing removed',
      description: 'The share link has been disabled',
      color: 'green'
    })

    emit('unshared')
    close()
  } catch (err: any) {
    logger.error('Error removing share:', err)
    toast.add({
      title: 'Failed to remove sharing',
      description: err.data?.error?.message || 'Please try again',
      color: 'red'
    })
  }
}

// Format expiration date
function formatExpirationDate(dateString: string) {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// Close modal
function close() {
  isOpen.value = false
  shareData.value = null
  currentShareThreadId.value = null
  error.value = null
  emit('close')
}
</script>
