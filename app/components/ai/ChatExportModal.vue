<template>
  <UModal v-model="isOpen" :ui="{ width: 'max-w-lg' }">
    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-arrow-down-tray" class="w-5 h-5 text-green-500" />
          <h3 class="text-lg font-semibold">Export Conversation</h3>
        </div>
      </template>

      <div class="space-y-4">
        <p class="text-sm text-gray-600 dark:text-gray-400">
          Choose a format to download this conversation:
        </p>

        <!-- Format Selection -->
        <div class="space-y-3">
          <label class="text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
            Export Format
          </label>

          <!-- JSON Option -->
          <div
            :class="[
              'p-4 rounded-lg border-2 cursor-pointer transition-all',
              selectedFormat === 'json'
                ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                : 'border-gray-200 dark:border-slate-700 hover:border-purple-300 dark:hover:border-purple-700'
            ]"
            @click="selectedFormat = 'json'"
          >
            <div class="flex items-start gap-3">
              <UIcon
                :name="selectedFormat === 'json' ? 'i-heroicons-check-circle-solid' : 'i-heroicons-circle'"
                :class="[
                  'w-6 h-6 flex-shrink-0 mt-0.5',
                  selectedFormat === 'json' ? 'text-purple-600' : 'text-gray-400'
                ]"
              />
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-1">
                  <h4 class="font-semibold text-gray-900 dark:text-white">JSON Format</h4>
                  <UBadge color="blue" variant="subtle" size="xs">Technical</UBadge>
                </div>
                <p class="text-sm text-gray-600 dark:text-gray-400">
                  Complete structured data including all metadata, timestamps, and suggested links. Perfect for programmatic processing or data analysis.
                </p>
                <div class="mt-2 flex items-center gap-2 text-xs text-gray-500">
                  <UIcon name="i-heroicons-code-bracket" class="w-3 h-3" />
                  <span>Includes: messages, metadata, timestamps, links</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Markdown Option -->
          <div
            :class="[
              'p-4 rounded-lg border-2 cursor-pointer transition-all',
              selectedFormat === 'markdown'
                ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                : 'border-gray-200 dark:border-slate-700 hover:border-purple-300 dark:hover:border-purple-700'
            ]"
            @click="selectedFormat = 'markdown'"
          >
            <div class="flex items-start gap-3">
              <UIcon
                :name="selectedFormat === 'markdown' ? 'i-heroicons-check-circle-solid' : 'i-heroicons-circle'"
                :class="[
                  'w-6 h-6 flex-shrink-0 mt-0.5',
                  selectedFormat === 'markdown' ? 'text-purple-600' : 'text-gray-400'
                ]"
              />
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-1">
                  <h4 class="font-semibold text-gray-900 dark:text-white">Markdown Format</h4>
                  <UBadge color="green" variant="subtle" size="xs">Human-Readable</UBadge>
                </div>
                <p class="text-sm text-gray-600 dark:text-gray-400">
                  Beautifully formatted conversation that's easy to read and share. Great for documentation, reports, or archiving.
                </p>
                <div class="mt-2 flex items-center gap-2 text-xs text-gray-500">
                  <UIcon name="i-heroicons-document-text" class="w-3 h-3" />
                  <span>Includes: formatted messages, metadata badges, reference links</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- File Info -->
        <div v-if="threadData" class="p-3 bg-gray-50 dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-700">
          <div class="flex items-center justify-between text-sm">
            <div>
              <p class="font-medium text-gray-900 dark:text-white">{{ threadData.title }}</p>
              <p class="text-xs text-gray-500 dark:text-gray-400">
                {{ threadData.messageCount }} messages • Created {{ formatDate(threadData.createdAt) }}
              </p>
            </div>
            <div class="text-right">
              <p class="text-xs text-gray-500 dark:text-gray-400">File size</p>
              <p class="font-medium text-gray-900 dark:text-white">~{{ estimatedFileSize }} KB</p>
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" color="gray" @click="close">
            Cancel
          </UButton>
          <UButton
            color="purple"
            icon="i-heroicons-arrow-down-tray"
            :loading="downloading"
            @click="handleDownload"
          >
            Download {{ selectedFormat.toUpperCase() }}
          </UButton>
        </div>
      </template>
    </UCard>
  </UModal>
</template>

<script setup lang="ts">
import type { ChatThread } from '#shared/types/chat-threads'

interface Props {
  threadId: string | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  close: []
}>()

const isOpen = defineModel<boolean>({ required: true })
const toast = useToast()

// State
const selectedFormat = ref<'json' | 'markdown'>('markdown')
const downloading = ref(false)
const threadData = ref<ChatThread | null>(null)

// Estimated file size (rough calculation)
const estimatedFileSize = computed(() => {
  if (!threadData.value) return '0'
  const avgMessageSize = selectedFormat.value === 'json' ? 500 : 300
  const totalSize = threadData.value.messageCount * avgMessageSize
  return Math.ceil(totalSize / 1024).toString()
})

// Watch for thread ID changes and load thread data
watch(() => props.threadId, async (newThreadId) => {
  if (newThreadId && isOpen.value) {
    await loadThreadData()
  }
}, { immediate: true })

// Watch for modal open
watch(isOpen, async (open) => {
  if (open && props.threadId && !threadData.value) {
    await loadThreadData()
  }
})

// Load thread data
async function loadThreadData() {
  if (!props.threadId) return

  try {
    const response = await $fetch(`/api/chat/threads/${props.threadId}`)
    threadData.value = response.data
  } catch (err: any) {
    console.error('Error loading thread:', err)
    toast.add({
      title: 'Failed to load thread',
      description: err.data?.error?.message || 'Please try again',
      color: 'red'
    })
  }
}

// Format date
function formatDate(dateString: string) {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

// Handle download
async function handleDownload() {
  if (!props.threadId) return

  downloading.value = true

  try {
    const response = await fetch(`/api/chat/threads/${props.threadId}/export?format=${selectedFormat.value}`)

    if (!response.ok) {
      throw new Error('Export failed')
    }

    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url

    const filename = `ghost-chat-${threadData.value?.title.toLowerCase().replace(/\s+/g, '-') || props.threadId}-${Date.now()}.${selectedFormat.value === 'json' ? 'json' : 'md'}`
    a.download = filename

    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    toast.add({
      title: 'Export successful!',
      description: `Conversation downloaded as ${selectedFormat.value.toUpperCase()}`,
      color: 'green'
    })

    close()
  } catch (err: any) {
    console.error('Error exporting thread:', err)
    toast.add({
      title: 'Export failed',
      description: err.message || 'Failed to download conversation',
      color: 'red'
    })
  } finally {
    downloading.value = false
  }
}

// Close modal
function close() {
  isOpen.value = false
  threadData.value = null
  emit('close')
}
</script>
