<template>
  <div :class="`message ${message.role === 'user' ? 'user' : 'bot'}`">
    <div class="message-content">
      <!-- Streaming status indicator (GHOST thinking) with fade transition -->
      <Transition
        enter-active-class="transition-opacity duration-300 ease-in-out"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition-opacity duration-200 ease-in-out"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div v-if="message.status?.status === 'pending' || message.status?.status === 'streaming'" class="streaming-status mb-3">
        <div class="flex items-center gap-3 mb-2">
          <div class="ghost-loading">
            <UIcon name="i-fa6-solid-ghost" class="ghost-icon text-emerald-400" style="width: 24px; height: 24px;" />
            <div class="ghost-dots">
              <div class="ghost-dot"></div>
              <div class="ghost-dot"></div>
              <div class="ghost-dot"></div>
            </div>
          </div>
          <div class="flex flex-col gap-1 flex-1">
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">GHOST is thinking...</span>
            <span v-if="message.status.progress && message.status.progress !== 'Starting...'" class="text-xs text-gray-600 dark:text-gray-400">{{ message.status.progress }}</span>
            <span v-else class="text-xs text-gray-600 dark:text-gray-400">Processing your request...</span>
            <!-- Status History with fixed height container -->
            <div class="status-history-container">
              <div
                v-for="(historyItem, idx) in statusHistoryDisplay"
                :key="historyItem.timestamp || idx"
                :style="{
                  opacity: [0.7, 0.4, 0.2][idx] || 0
                }"
                class="status-history-item"
                :title="historyItem.text || ''"
              >
                {{ historyItem.text }}
              </div>
            </div>
          </div>
          <button
            v-if="!readOnly"
            @click="$emit('cancel')"
            class="px-3 py-1.5 text-xs rounded-lg bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 active:bg-red-300 dark:active:bg-red-900/70 text-red-700 dark:text-red-300 transition-all duration-150 flex items-center gap-1.5 flex-shrink-0 active:scale-95"
            title="Cancel query"
          >
            <UIcon name="i-heroicons-x-circle" class="w-4 h-4" />
            Cancel
          </button>
        </div>
        <div v-if="message.status.toolsCalled && message.status.toolsCalled.length > 0" class="flex flex-wrap gap-1.5">
          <span v-for="tool in message.status.toolsCalled" :key="tool" class="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
            <UIcon name="i-heroicons-wrench-screwdriver" class="w-3 h-3" />
            {{ tool }}
          </span>
        </div>
        <div class="text-xs text-gray-500 dark:text-gray-400 mt-2">
          Complex queries may take 30-120 seconds to complete
        </div>
      </div>
      </Transition>

      <!-- AI Thinking Block (for assistant messages with reasoning from API) -->
      <AIThinkingBlock
        v-if="message.role === 'assistant' && !message.status?.status && message.reasoning"
        :thinking="message.reasoning"
      />

      <!-- Only render markdown for assistant messages to prevent XSS -->
      <div v-if="message.role === 'assistant'" class="markdown-container" v-html="formattedContent" @click="$emit('enriched-click', $event)"></div>
      <!-- User messages rendered as plain text (safely escaped by Vue) -->
      <p v-else class="whitespace-pre-wrap text-sm">{{ message.content }}</p>
      <span v-if="message.streamBuffer && (message.status?.status === 'pending' || message.status?.status === 'streaming')" class="cursor-blink">|</span>

      <!-- Cancellation Status with fade transition -->
      <Transition
        enter-active-class="transition-opacity duration-300 ease-in-out"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition-opacity duration-200 ease-in-out"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div v-if="message.status?.status === 'canceled'" class="canceled-status">
        <UIcon name="i-heroicons-x-circle" class="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
        <span class="text-xs text-yellow-700 dark:text-yellow-300">Query was canceled</span>
      </div>
      </Transition>

      <!-- Enhanced Error Display with fade transition -->
      <Transition
        enter-active-class="transition-opacity duration-300 ease-in-out"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition-opacity duration-200 ease-in-out"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div v-if="message.status?.status === 'error'" class="error-container">
        <div class="error-content">
          <UIcon :name="getErrorIcon(message.status.errorType || classifyError(message.status.error || ''))" class="error-icon" />
          <div class="error-message">
            <p class="error-title">{{ getErrorTitle(message.status.error || '', message.status.errorType) }}</p>
            <p class="error-description">{{ getErrorDescription(message.status.error || '', message.status.errorType) }}</p>
          </div>
        </div>
        <div v-if="!readOnly" class="error-actions">
          <button
            v-if="(message.status.errorType || classifyError(message.status.error || '')) !== 'disambiguation'"
            @click="$emit('retry')"
            class="retry-button"
            :title="`${getErrorActionText(message.status.errorType || classifyError(message.status.error || ''))} this query`"
          >
            <UIcon name="i-heroicons-arrow-path" class="w-4 h-4" />
            {{ getErrorActionText(message.status.errorType || classifyError(message.status.error || '')) }}
          </button>
          <button
            v-if="(message.status.errorType || classifyError(message.status.error || '')) === 'disambiguation'"
            @click="$emit('disambiguate')"
            class="disambiguate-button"
            title="Choose the specific account you meant"
          >
            <UIcon name="i-heroicons-question-mark-circle" class="w-4 h-4" />
            {{ getErrorActionText('disambiguation') }}
          </button>
        </div>
      </div>
      </Transition>

      <!-- External Links -->
      <div v-if="message.links && message.links.length > 0" class="mt-3">
        <div v-for="(link, linkIndex) in message.links" :key="linkIndex" class="link-box">
          <span class="bullet">•</span>
          <a :href="link" target="_blank" class="external-link">
            {{ link }}
            <UIcon name="i-heroicons-arrow-top-right-on-square" class="external-link-icon" />
          </a>
        </div>
      </div>

      <!-- Metadata -->
      <div v-if="message.metadata && (message.metadata.accountId || message.metadata.mcpUsed)" class="tools-used">
        <div class="metadata-container">
          <span v-if="message.metadata.accountId" class="metadata-badge account-badge">
            <UIcon :name="message.metadata.accountId === 'aggregated' ? 'i-heroicons-building-office-2' : 'i-heroicons-building-library'" class="w-3 h-3" />
            {{ message.metadata.accountId === 'aggregated' ? 'Organization-wide' : `Account: ${message.metadata.accountId}` }}
          </span>
          <span v-if="message.metadata.mcpUsed" class="metadata-badge mcp-badge" :class="{ 'permanent-mcp': message.metadata.mcpType === 'permanent', 'temporary-mcp': message.metadata.mcpType === 'temporary' }">
            <UIcon :name="message.metadata.mcpType === 'permanent' ? 'i-heroicons-server-stack' : 'i-heroicons-cpu-chip'" class="w-3 h-3" />
            {{ message.metadata.mcpUsed }}
          </span>
          <!-- Copy Markdown Button -->
          <button
            v-if="message.role === 'assistant' && !message.status?.status"
            @click="handleCopy"
            class="metadata-badge copy-badge hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors cursor-pointer"
            :title="copied ? 'Copied!' : 'Copy full markdown including AI reasoning'"
          >
            <UIcon :name="copied ? 'i-heroicons-check' : 'i-heroicons-clipboard-document'" class="w-3 h-3" :class="{ 'text-green-600 dark:text-green-400': copied }" />
            {{ copied ? 'Copied!' : 'Copy' }}
          </button>
        </div>
      </div>

      <!-- Copy Button (for messages without metadata) -->
      <div v-else-if="message.role === 'assistant' && !message.status?.status" class="tools-used">
        <div class="metadata-container">
          <button
            @click="handleCopy"
            class="metadata-badge copy-badge hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors cursor-pointer"
            :title="copied ? 'Copied!' : 'Copy full markdown including AI reasoning'"
          >
            <UIcon :name="copied ? 'i-heroicons-check' : 'i-heroicons-clipboard-document'" class="w-3 h-3" :class="{ 'text-green-600 dark:text-green-400': copied }" />
            {{ copied ? 'Copied!' : 'Copy Markdown' }}
          </button>
        </div>
      </div>

      <!-- Suggested Links -->
      <div v-if="message.suggestedLinks && message.suggestedLinks.length > 0" class="suggested-links">
        <StrandsLinkCard
          v-for="(link, linkIdx) in message.suggestedLinks"
          :key="linkIdx"
          :link="link"
        />
      </div>

      <!-- Suggested Prompts (hidden in read-only mode) -->
      <div v-if="!readOnly && message.suggestedPrompts && message.suggestedPrompts.length > 0" class="mt-4">
        <p class="text-xs text-gray-600 dark:text-gray-400 mb-2 flex items-center gap-1.5">
          <UIcon name="i-heroicons-chat-bubble-bottom-center-text" class="w-4 h-4" />
          Continue the conversation:
        </p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="(prompt, promptIdx) in message.suggestedPrompts"
            :key="promptIdx"
            @click="$emit('prompt-click', prompt.text)"
            class="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/40 active:bg-purple-200 dark:active:bg-purple-900/60 text-purple-700 dark:text-purple-300 transition-all duration-150 hover:scale-105 active:scale-100"
          >
            <UIcon
              :name="prompt.type === 'question' ? 'i-heroicons-question-mark-circle' : prompt.type === 'action' ? 'i-heroicons-arrow-right-circle' : 'i-heroicons-information-circle'"
              class="w-4 h-4 flex-shrink-0"
            />
            <span>{{ prompt.text }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * ChatMessage - Shared message rendering component
 *
 * Used by both GhostChatFullPage and StrandsChatPopup for consistent rendering.
 * Handles all message display features:
 * - Streaming status with history gradient
 * - AI reasoning block (from API reasoning field)
 * - Markdown rendering with entity enrichment
 * - Copy to clipboard
 * - Metadata badges
 * - Suggested links and prompts
 */

import type { StreamingChatMessage as ChatMessageType, ErrorType } from '#shared/types/chat-threads'

const props = defineProps<{
  message: ChatMessageType & {
    reasoning?: string | null  // New API field for AI thinking
  }
  viewMode: 'fullpage' | 'popup'
  readOnly?: boolean  // For shared/public views - disables interactive elements
}>()

const emit = defineEmits<{
  (e: 'retry'): void
  (e: 'cancel'): void
  (e: 'prompt-click', text: string): void
  (e: 'enriched-click', event: MouseEvent): void
  (e: 'disambiguate'): void
}>()

// Import error handling utilities from useChatUI
const { 
  classifyError, 
  getErrorIcon, 
  getErrorTitle, 
  getErrorDescription, 
  getErrorActionText 
} = useChatUI()

// Entity enrichment for message rendering
const { enrichStrandsResponse } = useStrandsResponseEnricher()

// Format message content using entity-aware enricher
const formattedContent = computed(() => {
  if (!props.message.content || typeof props.message.content !== 'string') {
    return ''
  }

  try {
    // For assistant messages, the content is now ONLY the response (no thinking text)
    // The reasoning is in the separate reasoning field
    return enrichStrandsResponse(props.message.content)
  } catch (error) {
    console.error('[ChatMessage] Error enriching message content:', error)
    return props.message.content.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
  }
})

// Copy state for visual feedback
const copied = ref(false)
const toast = useToast()

// Handle copy with visual feedback
async function handleCopy() {
  try {
    // Combine reasoning and content for full context
    let fullText = ''
    if (props.message.reasoning) {
      fullText = `## AI Reasoning\n\n${props.message.reasoning}\n\n## Response\n\n${props.message.content}`
    } else {
      fullText = props.message.content
    }

    await navigator.clipboard.writeText(fullText)
    copied.value = true
    toast.add({
      title: 'Copied to clipboard',
      description: props.message.reasoning ? 'Full markdown copied (including AI reasoning)' : 'Message copied',
      icon: 'i-heroicons-clipboard-document-check',
      color: 'green',
      timeout: 2000
    })
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch (err) {
    console.error('Failed to copy:', err)
    toast.add({
      title: 'Copy failed',
      description: 'Please try selecting and copying manually',
      icon: 'i-heroicons-exclamation-triangle',
      color: 'red',
      timeout: 0
    })
  }
}

// Status history display with fixed 3-item structure to prevent dimension changes
const statusHistoryDisplay = computed(() => {
  const history = props.message.status?.statusHistory || []
  const recent = history.slice(-3).reverse()
  
  // Always return exactly 3 items to maintain consistent container dimensions
  const result = []
  for (let i = 0; i < 3; i++) {
    if (i < recent.length && recent[i]) {
      result.push({
        text: recent[i].text || '',
        timestamp: recent[i].timestamp || Date.now() + i
      })
    } else {
      // Add empty placeholder to maintain structure
      result.push({
        text: '',
        timestamp: Date.now() + i
      })
    }
  }
  
  return result
})
</script>

<style scoped>
.message {
  @apply flex;
}

.message.user {
  @apply justify-end;
}

.message.bot {
  @apply justify-start;
}

.message-content {
  @apply max-w-[80%] p-4 rounded-lg;
}

.message.user .message-content {
  @apply bg-purple-600 text-white;
}

.message.bot .message-content {
  @apply bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700;
}

.markdown-container {
  @apply prose prose-sm dark:prose-invert max-w-none;
}

.markdown-container :deep(pre) {
  @apply bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-700;
}

.markdown-container :deep(pre code) {
  @apply text-gray-800 dark:text-gray-100;
}

.message.user .markdown-container {
  @apply text-white;
}

.message.user .markdown-container strong {
  @apply text-white font-bold;
}

.message.user .markdown-container code {
  @apply bg-purple-700 text-purple-100 px-1 py-0.5 rounded;
}

.link-box {
  @apply flex items-center gap-2 mt-2;
}

.bullet {
  @apply text-gray-500;
}

.external-link {
  @apply text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 text-sm;
}

.tools-used {
  @apply mt-3 pt-3 border-t border-gray-200 dark:border-gray-600;
}

.metadata-container {
  @apply flex flex-wrap gap-2 items-center;
}

.metadata-badge {
  @apply text-xs px-2 py-1 rounded flex items-center gap-1;
}

.account-badge {
  @apply bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200;
}

.mcp-badge {
  @apply bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300;
}

.permanent-mcp {
  @apply bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200;
}

.temporary-mcp {
  @apply bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200;
}

.copy-badge {
  @apply bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 active:scale-95;
}

.suggested-links {
  @apply mt-3 space-y-2;
}

/* Ghost Loading Animation */
.ghost-loading {
  @apply flex items-center gap-3;
}

.ghost-icon {
  @apply w-6 h-6 text-emerald-400;
  animation: ghostFloat 2s ease-in-out infinite;
}

.ghost-dots {
  @apply flex gap-1;
}

.ghost-dot {
  @apply w-2 h-2 bg-emerald-400 rounded-full;
  animation: ghostDotPulse 1.4s ease-in-out infinite;
}

.ghost-dot:nth-child(1) {
  animation-delay: 0s;
}

.ghost-dot:nth-child(2) {
  animation-delay: 0.2s;
}

.ghost-dot:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes ghostFloat {
  0%, 100% {
    transform: translateY(0px);
  }
  50% {
    transform: translateY(-8px);
  }
}

@keyframes ghostDotPulse {
  0%, 100% {
    opacity: 0.3;
    transform: scale(0.8);
  }
  50% {
    opacity: 1;
    transform: scale(1.2);
  }
}

.streaming-status {
  @apply mb-3 pb-2 border-b border-gray-200 dark:border-gray-700;
}

.cursor-blink {
  @apply inline-block ml-1 text-purple-600 dark:text-purple-400 animate-pulse font-bold;
}

/* Cancellation Status Styles */
.canceled-status {
  @apply flex items-center gap-2 mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg;
}

/* Enhanced Error Display Styles */
.error-container {
  @apply mt-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg;
}

.error-content {
  @apply flex items-start gap-3 mb-3;
}

.error-icon {
  @apply w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5;
}

.error-message {
  @apply flex-1 min-w-0;
}

.error-title {
  @apply text-sm font-semibold text-red-800 dark:text-red-200 mb-1;
}

.error-description {
  @apply text-xs text-red-700 dark:text-red-300 leading-relaxed;
}

.error-actions {
  @apply flex items-center gap-2;
}

.retry-button {
  @apply inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md bg-red-600 hover:bg-red-700 active:bg-red-800 text-white transition-all duration-150 active:scale-95;
}

.disambiguate-button {
  @apply inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white transition-all duration-150 active:scale-95;
}

/* Fixed height status history container - reserves space for exactly 3 items */
.status-history-container {
  @apply mt-1;
  height: 48px; /* Fixed height for exactly 3 lines (14px each + 2px gap between) */
  min-height: 48px;
  max-height: 48px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 2px; /* Fixed gap between items */
}

.status-history-item {
  @apply text-gray-500 dark:text-gray-500 font-mono;
  height: 14px; /* Fixed height per line */
  line-height: 14px;
  font-size: 11px; /* Consistent font size */
  flex-shrink: 0; /* Prevent items from shrinking */
  white-space: nowrap; /* Ensure single line */
  overflow: hidden; /* Hide overflow text */
  text-overflow: ellipsis; /* Show ellipsis for long text */
  
  /* Fixed width to prevent layout changes from long text */
  width: 100%;
  max-width: 100%;
  min-width: 0; /* Allow text to shrink and truncate */
  
  /* Opacity-only transition - no layout properties */
  transition: opacity 300ms ease-in-out;
  /* Explicitly prevent transitions on layout properties */
  transition-property: opacity;
  will-change: opacity; /* Optimize for opacity changes only */
}
</style>
