<template>
  <div :class="`message ${message.role === 'user' ? 'user' : 'bot'}`">
    <div class="message-content">
      <!-- Streaming status indicator (GHOST thinking) -->
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
          <div class="flex flex-col gap-1">
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">GHOST is thinking...</span>
            <span class="text-xs text-gray-600 dark:text-gray-400">{{ message.status.progress || 'Starting...' }}</span>
            <!-- Status History with gradient -->
            <div v-if="message.status?.statusHistory && message.status.statusHistory.length > 0"
                 class="mt-1 space-y-0.5">
              <div
                v-for="(historyItem, idx) in message.status.statusHistory.slice(-3).reverse()"
                :key="idx"
                :style="{
                  opacity: [0.7, 0.4, 0.2][idx],
                  fontSize: ['11px', '10px', '9px'][idx]
                }"
                class="text-gray-500 dark:text-gray-500 font-mono truncate transition-opacity"
                :title="historyItem.text"
              >
                {{ historyItem.text }}
              </div>
            </div>
          </div>
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

      <!-- AI Thinking Block (for assistant messages with reasoning from API) -->
      <AIThinkingBlock
        v-if="message.role === 'assistant' && !message.status?.status && message.reasoning"
        :thinking="message.reasoning"
      />

      <div class="markdown-container" v-html="formattedContent" @click="$emit('enriched-click', $event)"></div>
      <span v-if="message.streamBuffer && (message.status?.status === 'pending' || message.status?.status === 'streaming')" class="cursor-blink">|</span>

      <!-- Error status -->
      <div v-if="message.status?.status === 'error'" class="error-status">
        <UIcon name="i-heroicons-exclamation-triangle" class="w-4 h-4 text-red-500" />
        <span class="text-xs text-red-600 dark:text-red-400">{{ message.status.error }}</span>
        <button @click="$emit('retry')" class="ml-2 text-xs text-blue-600 dark:text-blue-400 hover:underline">
          Retry
        </button>
      </div>

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
            @click="$emit('copy', message)"
            class="metadata-badge copy-badge hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors cursor-pointer"
            title="Copy full markdown including AI reasoning"
          >
            <UIcon name="i-heroicons-clipboard-document" class="w-3 h-3" />
            Copy
          </button>
        </div>
      </div>

      <!-- Copy Button (for messages without metadata) -->
      <div v-else-if="message.role === 'assistant' && !message.status?.status" class="tools-used">
        <div class="metadata-container">
          <button
            @click="$emit('copy', message)"
            class="metadata-badge copy-badge hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors cursor-pointer"
            title="Copy full markdown including AI reasoning"
          >
            <UIcon name="i-heroicons-clipboard-document" class="w-3 h-3" />
            Copy Markdown
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

      <!-- Suggested Prompts -->
      <div v-if="message.suggestedPrompts && message.suggestedPrompts.length > 0" class="mt-4">
        <p class="text-xs text-gray-600 dark:text-gray-400 mb-2 flex items-center gap-1.5">
          <UIcon name="i-heroicons-chat-bubble-bottom-center-text" class="w-4 h-4" />
          Continue the conversation:
        </p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="(prompt, promptIdx) in message.suggestedPrompts"
            :key="promptIdx"
            @click="$emit('prompt-click', prompt.text)"
            class="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/40 text-purple-700 dark:text-purple-300 transition-colors hover:scale-105"
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

import type { ChatMessage as ChatMessageType } from '~/shared/types/chat-threads'

const props = defineProps<{
  message: ChatMessageType & {
    reasoning?: string | null  // New API field for AI thinking
  }
  viewMode: 'fullpage' | 'popup'
}>()

const emit = defineEmits<{
  (e: 'retry'): void
  (e: 'copy', message: any): void
  (e: 'prompt-click', text: string): void
  (e: 'enriched-click', event: MouseEvent): void
}>()

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
  @apply bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300;
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

.error-status {
  @apply flex items-center gap-2 mt-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg;
}
</style>
