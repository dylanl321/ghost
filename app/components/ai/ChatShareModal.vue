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

      <!-- Share Link Ready -->
      <div v-else-if="shareData" class="space-y-4">
        <p class="text-sm text-gray-600 dark:text-gray-400">
          Anyone with this link can view this conversation. The link will expire in {{ expiresInDays }} days.
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
import type { ShareThreadResponse } from '~/shared/types/chat-threads'

interface Props {
  threadId: string | null
  expiresInDays?: number
}

const props = withDefaults(defineProps<Props>(), {
  expiresInDays: 90
})

const emit = defineEmits<{
  close: []
  unshared: []
}>()

const isOpen = defineModel<boolean>({ required: true })
const toast = useToast()

// State
const loading = ref(false)
const error = ref<string | null>(null)
const shareData = ref<ShareThreadResponse | null>(null)

// Computed share URL
const shareUrl = computed(() => {
  if (!shareData.value) return ''
  const origin = window.location.origin
  return `${origin}/api/chat/threads/shared/${shareData.value.shareId}`
})

// Watch for thread ID changes and generate share link
watch(() => props.threadId, async (newThreadId) => {
  if (newThreadId && isOpen.value) {
    await generateShareLink()
  }
}, { immediate: true })

// Watch for modal open and generate link if needed
watch(isOpen, async (open) => {
  if (open && props.threadId && !shareData.value) {
    await generateShareLink()
  }
})

// Generate share link
async function generateShareLink() {
  if (!props.threadId) return

  loading.value = true
  error.value = null

  try {
    const response = await $fetch(`/api/chat/threads/${props.threadId}/share`, {
      method: 'POST',
      body: {
        expiresInDays: props.expiresInDays
      }
    })

    shareData.value = response.data
  } catch (err: any) {
    console.error('Error generating share link:', err)
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
    console.error('Failed to copy:', err)
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
    console.error('Failed to copy:', err)
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
    console.error('Error removing share:', err)
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
  error.value = null
  emit('close')
}
</script>
