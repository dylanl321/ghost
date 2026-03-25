<template>
  <UModal v-model="isOpen" :ui="{ width: 'max-w-2xl' }">
    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-arrow-down-tray" class="w-5 h-5 text-green-500" />
          <h3 class="text-lg font-semibold">Export Conversation</h3>
        </div>
      </template>

      <div class="space-y-5">
        <!-- Content Selection -->
        <div class="space-y-3">
          <label class="text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
            Content to Export
          </label>

          <div class="grid grid-cols-2 gap-2">
            <!-- Full Conversation -->
            <div
              :class="[
                'p-3 rounded-lg border-2 cursor-pointer transition-all',
                contentMode === 'full'
                  ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                  : 'border-gray-200 dark:border-slate-700 hover:border-purple-300'
              ]"
              @click="contentMode = 'full'"
            >
              <div class="flex items-center gap-2">
                <UIcon
                  :name="contentMode === 'full' ? 'i-heroicons-check-circle-solid' : 'i-heroicons-circle'"
                  :class="['w-5 h-5', contentMode === 'full' ? 'text-purple-600' : 'text-gray-400']"
                />
                <div>
                  <p class="font-medium text-sm text-gray-900 dark:text-white">Full conversation</p>
                  <p class="text-xs text-gray-500">All messages</p>
                </div>
              </div>
            </div>

            <!-- Selected Messages -->
            <div
              :class="[
                'p-3 rounded-lg border-2 cursor-pointer transition-all',
                contentMode === 'selected'
                  ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                  : 'border-gray-200 dark:border-slate-700 hover:border-purple-300'
              ]"
              @click="contentMode = 'selected'"
            >
              <div class="flex items-center gap-2">
                <UIcon
                  :name="contentMode === 'selected' ? 'i-heroicons-check-circle-solid' : 'i-heroicons-circle'"
                  :class="['w-5 h-5', contentMode === 'selected' ? 'text-purple-600' : 'text-gray-400']"
                />
                <div>
                  <p class="font-medium text-sm text-gray-900 dark:text-white">Selected messages</p>
                  <p class="text-xs text-gray-500">Pick specific ones</p>
                </div>
              </div>
            </div>

            <!-- Last Response -->
            <div
              :class="[
                'p-3 rounded-lg border-2 cursor-pointer transition-all',
                contentMode === 'lastResponse'
                  ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                  : 'border-gray-200 dark:border-slate-700 hover:border-purple-300'
              ]"
              @click="contentMode = 'lastResponse'"
            >
              <div class="flex items-center gap-2">
                <UIcon
                  :name="contentMode === 'lastResponse' ? 'i-heroicons-check-circle-solid' : 'i-heroicons-circle'"
                  :class="['w-5 h-5', contentMode === 'lastResponse' ? 'text-purple-600' : 'text-gray-400']"
                />
                <div>
                  <p class="font-medium text-sm text-gray-900 dark:text-white">Last response only</p>
                  <p class="text-xs text-gray-500">Most recent answer</p>
                </div>
              </div>
            </div>

            <!-- AI Summary -->
            <div
              :class="[
                'p-3 rounded-lg border-2 cursor-pointer transition-all',
                contentMode === 'summary'
                  ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                  : 'border-gray-200 dark:border-slate-700 hover:border-purple-300'
              ]"
              @click="contentMode = 'summary'"
            >
              <div class="flex items-center gap-2">
                <UIcon
                  :name="contentMode === 'summary' ? 'i-heroicons-check-circle-solid' : 'i-heroicons-circle'"
                  :class="['w-5 h-5', contentMode === 'summary' ? 'text-purple-600' : 'text-gray-400']"
                />
                <div>
                  <p class="font-medium text-sm text-gray-900 dark:text-white">AI Summary</p>
                  <p class="text-xs text-gray-500">Condensed key points</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Message Selection (when "selected" mode is active) -->
        <div v-if="contentMode === 'selected' && threadData?.messages?.length" class="space-y-2">
          <div class="flex items-center justify-between">
            <label class="text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
              Select Messages
            </label>
            <div class="flex items-center gap-3">
              <span class="text-xs text-gray-500 dark:text-gray-400">
                {{ selectedMessageIds.size }} of {{ threadData.messages.length }} selected
              </span>
              <div class="flex gap-1">
                <UButton size="xs" variant="soft" color="gray" @click="selectAllMessages">All</UButton>
                <UButton size="xs" variant="soft" color="gray" @click="deselectAllMessages">None</UButton>
              </div>
            </div>
          </div>
          <div class="max-h-48 overflow-y-auto border border-gray-200 dark:border-slate-700 rounded-lg">
            <div
              v-for="(message, index) in threadData.messages"
              :key="message.messageId"
              :class="[
                'p-2.5 cursor-pointer transition-all flex items-start gap-3',
                selectedMessageIds.has(message.messageId)
                  ? 'bg-purple-100 dark:bg-purple-900/40 border-l-4 border-l-purple-500'
                  : 'bg-white dark:bg-slate-900 border-l-4 border-l-transparent hover:bg-gray-50 dark:hover:bg-slate-800',
                index > 0 ? 'border-t border-gray-100 dark:border-slate-800' : ''
              ]"
              @click="toggleMessageSelection(message.messageId)"
            >
              <!-- Checkbox -->
              <div
                :class="[
                  'w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors',
                  selectedMessageIds.has(message.messageId)
                    ? 'bg-purple-500 border-purple-500'
                    : 'bg-white dark:bg-slate-800 border-gray-300 dark:border-slate-600'
                ]"
              >
                <UIcon
                  v-if="selectedMessageIds.has(message.messageId)"
                  name="i-heroicons-check"
                  class="w-3.5 h-3.5 text-white"
                />
              </div>
              <!-- Message Content -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-0.5">
                  <span
                    :class="[
                      'text-xs font-semibold px-1.5 py-0.5 rounded',
                      message.role === 'user'
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                        : 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300'
                    ]"
                  >
                    {{ message.role === 'user' ? 'You' : 'GHOST' }}
                  </span>
                </div>
                <p
                  :class="[
                    'text-sm truncate',
                    selectedMessageIds.has(message.messageId)
                      ? 'text-gray-900 dark:text-white'
                      : 'text-gray-600 dark:text-gray-400'
                  ]"
                >
                  {{ message.content.substring(0, 100) }}{{ message.content.length > 100 ? '...' : '' }}
                </p>
              </div>
            </div>
          </div>
          <!-- Selection hint -->
          <p v-if="selectedMessageIds.size === 0" class="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
            <UIcon name="i-heroicons-exclamation-triangle" class="w-3.5 h-3.5" />
            Select at least one message to export
          </p>
        </div>

        <!-- Presentation Style (only for PDF) -->
        <div v-if="selectedFormat === 'pdf'" class="space-y-3">
          <label class="text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
            Presentation Style
          </label>

          <div class="grid grid-cols-2 gap-2">
            <!-- Conversation Style -->
            <div
              :class="[
                'p-3 rounded-lg border-2 cursor-pointer transition-all',
                presentationStyle === 'conversation'
                  ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                  : 'border-gray-200 dark:border-slate-700 hover:border-purple-300'
              ]"
              @click="presentationStyle = 'conversation'"
            >
              <div class="flex items-center gap-2">
                <UIcon
                  :name="presentationStyle === 'conversation' ? 'i-heroicons-check-circle-solid' : 'i-heroicons-circle'"
                  :class="['w-5 h-5', presentationStyle === 'conversation' ? 'text-purple-600' : 'text-gray-400']"
                />
                <div>
                  <p class="font-medium text-sm text-gray-900 dark:text-white">Conversation</p>
                  <p class="text-xs text-gray-500">Shows Q&A format with roles</p>
                </div>
              </div>
            </div>

            <!-- Deliverable Style -->
            <div
              :class="[
                'p-3 rounded-lg border-2 cursor-pointer transition-all',
                presentationStyle === 'deliverable'
                  ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                  : 'border-gray-200 dark:border-slate-700 hover:border-purple-300'
              ]"
              @click="presentationStyle = 'deliverable'"
            >
              <div class="flex items-center gap-2">
                <UIcon
                  :name="presentationStyle === 'deliverable' ? 'i-heroicons-check-circle-solid' : 'i-heroicons-circle'"
                  :class="['w-5 h-5', presentationStyle === 'deliverable' ? 'text-purple-600' : 'text-gray-400']"
                />
                <div>
                  <p class="font-medium text-sm text-gray-900 dark:text-white">Deliverable</p>
                  <p class="text-xs text-gray-500">Clean document for sharing</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Deliverable info -->
          <div v-if="presentationStyle === 'deliverable'" class="space-y-2">
            <p class="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5 bg-gray-50 dark:bg-slate-800 rounded-md px-2.5 py-2">
              <UIcon name="i-heroicons-information-circle" class="w-4 h-4 text-blue-500 flex-shrink-0" />
              <span>Formats as a professional document without conversation markers or AI attribution.</span>
            </p>
            <!-- Generated title preview -->
            <div v-if="generatingTitle" class="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2 px-2.5 py-2 bg-purple-50 dark:bg-purple-900/20 rounded-md">
              <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin text-purple-500" />
              <span>Generating document title...</span>
            </div>
            <div v-else-if="generatedTitle" class="text-xs bg-purple-50 dark:bg-purple-900/20 rounded-md px-2.5 py-2">
              <p class="font-medium text-gray-900 dark:text-white">{{ generatedTitle.title }}</p>
              <p class="text-gray-500 dark:text-gray-400">{{ generatedTitle.subtitle }}</p>
            </div>
          </div>
        </div>

        <!-- Format Selection -->
        <div class="space-y-3">
          <label class="text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
            Export Format
          </label>

          <div class="space-y-2">
            <!-- PDF Option -->
            <div
              :class="[
                'p-3 rounded-lg border-2 cursor-pointer transition-all',
                selectedFormat === 'pdf'
                  ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                  : 'border-gray-200 dark:border-slate-700 hover:border-purple-300'
              ]"
              @click="selectedFormat = 'pdf'"
            >
              <div class="flex items-start gap-3">
                <UIcon
                  :name="selectedFormat === 'pdf' ? 'i-heroicons-check-circle-solid' : 'i-heroicons-circle'"
                  :class="['w-5 h-5 mt-0.5', selectedFormat === 'pdf' ? 'text-purple-600' : 'text-gray-400']"
                />
                <div class="flex-1">
                  <div class="flex items-center gap-2">
                    <h4 class="font-medium text-gray-900 dark:text-white">PDF Document</h4>
                    <UBadge color="purple" variant="subtle" size="xs">Recommended</UBadge>
                  </div>
                  <p class="text-sm text-gray-600 dark:text-gray-400">
                    Professional document ready to share with stakeholders. Best for reports and presentations.
                  </p>
                </div>
              </div>
            </div>

            <!-- Markdown Option -->
            <div
              :class="[
                'p-3 rounded-lg border-2 cursor-pointer transition-all',
                selectedFormat === 'markdown'
                  ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                  : 'border-gray-200 dark:border-slate-700 hover:border-purple-300'
              ]"
              @click="selectedFormat = 'markdown'"
            >
              <div class="flex items-start gap-3">
                <UIcon
                  :name="selectedFormat === 'markdown' ? 'i-heroicons-check-circle-solid' : 'i-heroicons-circle'"
                  :class="['w-5 h-5 mt-0.5', selectedFormat === 'markdown' ? 'text-purple-600' : 'text-gray-400']"
                />
                <div class="flex-1">
                  <div class="flex items-center gap-2">
                    <h4 class="font-medium text-gray-900 dark:text-white">Markdown</h4>
                    <UBadge color="green" variant="subtle" size="xs">Editable</UBadge>
                  </div>
                  <p class="text-sm text-gray-600 dark:text-gray-400">
                    Plain text with formatting. Great for documentation or further editing.
                  </p>
                </div>
              </div>
            </div>

            <!-- JSON Option -->
            <div
              :class="[
                'p-3 rounded-lg border-2 cursor-pointer transition-all',
                selectedFormat === 'json'
                  ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                  : 'border-gray-200 dark:border-slate-700 hover:border-purple-300'
              ]"
              @click="selectedFormat = 'json'"
            >
              <div class="flex items-start gap-3">
                <UIcon
                  :name="selectedFormat === 'json' ? 'i-heroicons-check-circle-solid' : 'i-heroicons-circle'"
                  :class="['w-5 h-5 mt-0.5', selectedFormat === 'json' ? 'text-purple-600' : 'text-gray-400']"
                />
                <div class="flex-1">
                  <div class="flex items-center gap-2">
                    <h4 class="font-medium text-gray-900 dark:text-white">JSON</h4>
                    <UBadge color="blue" variant="subtle" size="xs">Technical</UBadge>
                  </div>
                  <p class="text-sm text-gray-600 dark:text-gray-400">
                    Complete structured data for programmatic processing or analysis.
                  </p>
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
                {{ exportMessageCount }} message{{ exportMessageCount !== 1 ? 's' : '' }} to export • Created {{ formatDate(threadData.createdAt) }}
              </p>
            </div>
            <div class="text-right">
              <p class="text-xs text-gray-500 dark:text-gray-400">Est. size</p>
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
            :loading="downloading || generatingTitle"
            :disabled="isExportDisabled"
            @click="handleDownload"
          >
            {{ downloadButtonText }}
          </UButton>
        </div>
      </template>
    </UCard>
  </UModal>
</template>

<script setup lang="ts">
import type { ChatThread, ChatMessage } from '#shared/types/chat-threads'
import { exportChatToPDF } from '~/utils/pdfExport.client'

const logger = createLogger('ChatExportModal')

interface Props {
  threadId: string | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  close: []
}>()

const isOpen = defineModel<boolean>({ required: true })
const toast = useToast()

// Content mode: what messages to export
type ContentMode = 'full' | 'selected' | 'lastResponse' | 'summary'

// State
const contentMode = ref<ContentMode>('full')
const selectedFormat = ref<'pdf' | 'markdown' | 'json'>('pdf')
const presentationStyle = ref<'conversation' | 'deliverable'>('conversation')
const downloading = ref(false)
const threadData = ref<ChatThread | null>(null)
const selectedMessageIds = ref<Set<string>>(new Set())
const generatingSummary = ref(false)
const summaryContent = ref<string | null>(null)
const generatingTitle = ref(false)
const generatedTitle = ref<{ title: string; subtitle: string } | null>(null)

// Number of messages to export based on content mode
const exportMessageCount = computed(() => {
  if (!threadData.value) return 0
  switch (contentMode.value) {
    case 'full':
      return threadData.value.messageCount
    case 'selected':
      return selectedMessageIds.value.size
    case 'lastResponse':
      return 1
    case 'summary':
      return threadData.value.messageCount // Original count, summary is generated
    default:
      return 0
  }
})

// Dynamic download button text
const downloadButtonText = computed(() => {
  if (downloading.value) {
    return contentMode.value === 'summary' ? 'Generating...' : 'Downloading...'
  }
  const formatLabel = selectedFormat.value.toUpperCase()
  return `Download ${formatLabel}`
})

// Estimated file size (rough calculation)
const estimatedFileSize = computed(() => {
  if (!threadData.value) return '0'
  const count = exportMessageCount.value
  const avgMessageSize = selectedFormat.value === 'json' ? 500 : selectedFormat.value === 'pdf' ? 400 : 300
  const totalSize = count * avgMessageSize
  return Math.ceil(totalSize / 1024).toString()
})

// Check if export should be disabled
const isExportDisabled = computed(() => {
  // Disable if no messages selected in selected mode
  if (contentMode.value === 'selected' && selectedMessageIds.value.size === 0) {
    return true
  }
  // Disable if deliverable mode but title not yet generated
  if (presentationStyle.value === 'deliverable' && selectedFormat.value === 'pdf' && !generatedTitle.value) {
    return true
  }
  return false
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
  if (!open) {
    // Reset state when modal closes
    contentMode.value = 'full'
    presentationStyle.value = 'conversation'
    selectedMessageIds.value = new Set()
    summaryContent.value = null
    generatedTitle.value = null
  }
})

// Watch for deliverable mode selection - generate title
watch(presentationStyle, async (style) => {
  if (style === 'deliverable' && !generatedTitle.value && threadData.value?.messages) {
    await generateTitle()
  }
})

// Load thread data
async function loadThreadData() {
  if (!props.threadId) return

  try {
    const response = await $fetch(`/api/chat/threads/${props.threadId}`)
    threadData.value = response.data
    // Pre-select all messages when switching to selected mode
    if (threadData.value?.messages) {
      selectedMessageIds.value = new Set(threadData.value.messages.map(m => m.messageId))
    }
  } catch (err: any) {
    logger.error('Error loading thread:', err)
    toast.add({
      title: 'Failed to load thread',
      description: err.data?.error?.message || 'Please try again',
      color: 'red'
    })
  }
}

// Generate document title for deliverable mode
async function generateTitle() {
  if (!threadData.value?.messages?.length) return

  generatingTitle.value = true

  try {
    const conversationText = threadData.value.messages
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n')

    const response = await $fetch('/api/strands/chat/generate-title', {
      method: 'POST',
      body: {
        conversationText,
        existingTitle: threadData.value.title
      }
    })

    if (response.success && response.data?.success) {
      generatedTitle.value = {
        title: response.data.title || 'Analysis Report',
        subtitle: response.data.subtitle || new Date().toLocaleDateString()
      }
    }
  } catch (err) {
    logger.error('Error generating title:', err)
    // Use fallback title
    generatedTitle.value = {
      title: threadData.value.title || 'Analysis Report',
      subtitle: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    }
  } finally {
    generatingTitle.value = false
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

// Message selection helpers
function toggleMessageSelection(messageId: string) {
  const newSet = new Set(selectedMessageIds.value)
  if (newSet.has(messageId)) {
    newSet.delete(messageId)
  } else {
    newSet.add(messageId)
  }
  selectedMessageIds.value = newSet
}

function selectAllMessages() {
  if (!threadData.value?.messages) return
  selectedMessageIds.value = new Set(threadData.value.messages.map(m => m.messageId))
}

function deselectAllMessages() {
  selectedMessageIds.value = new Set()
}

// Get messages to export based on content mode
function getMessagesToExport(): ChatMessage[] {
  if (!threadData.value?.messages) return []

  switch (contentMode.value) {
    case 'full':
      return threadData.value.messages
    case 'selected':
      return threadData.value.messages.filter(m => selectedMessageIds.value.has(m.messageId))
    case 'lastResponse': {
      // Find the last assistant message
      const messages = [...threadData.value.messages].reverse()
      const lastAssistant = messages.find(m => m.role === 'assistant')
      return lastAssistant ? [lastAssistant] : []
    }
    case 'summary':
      // For summary, we return a synthetic message with the generated summary
      if (summaryContent.value) {
        return [{
          messageId: 'summary',
          role: 'assistant',
          content: summaryContent.value,
          timestamp: new Date().toISOString()
        }]
      }
      return []
    default:
      return []
  }
}

// Generate AI summary of the conversation
async function generateSummary(): Promise<string> {
  if (!props.threadId || !threadData.value?.messages) {
    throw new Error('No conversation to summarize')
  }

  generatingSummary.value = true

  try {
    // Build conversation text for summarization
    const conversationText = threadData.value.messages
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n')

    // Call the summary endpoint
    const response = await $fetch('/api/strands/chat/summary', {
      method: 'POST',
      body: {
        threadId: props.threadId,
        conversationText,
        messageCount: threadData.value.messageCount
      }
    })

    if (!response.success || !response.data?.success || !response.data?.summary) {
      throw new Error(response.data?.error || 'Failed to generate summary')
    }

    summaryContent.value = response.data.summary
    return response.data.summary
  } finally {
    generatingSummary.value = false
  }
}

// Handle download
async function handleDownload() {
  if (!props.threadId) return

  downloading.value = true

  try {
    // For summary mode, generate summary first if not already done
    if (contentMode.value === 'summary' && !summaryContent.value) {
      await generateSummary()
    }

    const messages = getMessagesToExport()

    if (messages.length === 0) {
      toast.add({
        title: 'No content to export',
        description: 'Please select at least one message or choose a different content option',
        color: 'yellow'
      })
      return
    }

    // Generate filename
    const titleSlug = threadData.value?.title?.toLowerCase().replace(/\s+/g, '-') || props.threadId
    const timestamp = Date.now()
    const contentSuffix = contentMode.value === 'summary' ? '-summary' : contentMode.value === 'lastResponse' ? '-response' : ''

    if (selectedFormat.value === 'pdf') {
      // Client-side PDF generation
      const isDeliverable = presentationStyle.value === 'deliverable'

      // For deliverable mode, generate title if not already done
      if (isDeliverable && !generatedTitle.value) {
        await generateTitle()
      }

      // Title varies based on presentation style
      let pdfTitle: string
      let pdfSubtitle: string | undefined

      if (isDeliverable && generatedTitle.value) {
        // Use AI-generated title for deliverables
        pdfTitle = generatedTitle.value.title
        pdfSubtitle = generatedTitle.value.subtitle
      } else if (contentMode.value === 'summary') {
        pdfTitle = isDeliverable ? 'Analysis Summary' : 'Conversation Summary'
      } else if (contentMode.value === 'lastResponse') {
        pdfTitle = isDeliverable ? 'Analysis Report' : 'GHOST Analysis'
      } else {
        pdfTitle = isDeliverable
          ? (threadData.value?.title || 'Analysis Report')
          : (threadData.value?.title || 'GHOST Chat Export')
      }

      const blob = exportChatToPDF(messages, {
        title: pdfTitle,
        subtitle: pdfSubtitle,
        filename: `${isDeliverable ? 'report' : 'ghost-chat'}-${titleSlug}${contentSuffix}-${timestamp}.pdf`,
        isSummary: contentMode.value === 'summary',
        includeTimestamps: !isDeliverable && contentMode.value !== 'summary',
        isDeliverable,
        autoDownload: true
      })

      toast.add({
        title: 'Export successful!',
        description: 'PDF downloaded successfully',
        color: 'green'
      })
    } else {
      // Server-side export for JSON/Markdown
      // For selected messages or lastResponse, we need to send the filtered message IDs
      let url = `/api/chat/threads/${props.threadId}/export?format=${selectedFormat.value}`

      if (contentMode.value === 'selected') {
        const ids = Array.from(selectedMessageIds.value).join(',')
        url += `&messageIds=${encodeURIComponent(ids)}`
      } else if (contentMode.value === 'lastResponse') {
        url += `&lastResponseOnly=true`
      } else if (contentMode.value === 'summary' && summaryContent.value) {
        // For summary with non-PDF format, download the summary text
        const ext = selectedFormat.value === 'json' ? 'json' : 'md'
        const filename = `ghost-chat-${titleSlug}-summary-${timestamp}.${ext}`
        const content = selectedFormat.value === 'json'
          ? JSON.stringify({ summary: summaryContent.value, threadId: props.threadId, generatedAt: new Date().toISOString() }, null, 2)
          : `# Conversation Summary\n\n${summaryContent.value}\n\n---\n*Generated from GHOST Chat on ${new Date().toLocaleString()}*`

        const blob = new Blob([content], { type: selectedFormat.value === 'json' ? 'application/json' : 'text/markdown' })
        const blobUrl = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = blobUrl
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(blobUrl)

        toast.add({
          title: 'Export successful!',
          description: `Summary downloaded as ${selectedFormat.value.toUpperCase()}`,
          color: 'green'
        })
        close()
        return
      }

      const response = await fetch(url)

      if (!response.ok) {
        throw new Error('Export failed')
      }

      const blob = await response.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl

      const ext = selectedFormat.value === 'json' ? 'json' : 'md'
      a.download = `ghost-chat-${titleSlug}${contentSuffix}-${timestamp}.${ext}`

      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)

      toast.add({
        title: 'Export successful!',
        description: `Conversation downloaded as ${selectedFormat.value.toUpperCase()}`,
        color: 'green'
      })
    }

    close()
  } catch (err: any) {
    logger.error('Error exporting thread:', err)
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
