<template>
  <div class="ghost-chat-container">
    <!-- Chat Messages Area -->
    <div class="chat-messages" ref="chatBoxRef">
      <div
        v-for="(msg, index) in messages"
        :key="msg.messageId || `msg-${index}`"
        :class="`message ${msg.role === 'user' ? 'user' : 'bot'}`"
      >
        <div class="message-content">
          <!-- Streaming status indicator (GHOST thinking) -->
          <div v-if="msg.status?.status === 'pending' || msg.status?.status === 'streaming'" class="streaming-status mb-3">
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
                <span class="text-xs text-gray-600 dark:text-gray-400">{{ msg.status.progress || pollingProgress || 'Starting...' }}</span>
              </div>
            </div>
            <div v-if="(msg.status.toolsCalled && msg.status.toolsCalled.length > 0) || (pollingToolsCalled && pollingToolsCalled.length > 0)" class="flex flex-wrap gap-1.5">
              <span v-for="tool in (msg.status.toolsCalled || pollingToolsCalled)" :key="tool" class="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                <UIcon name="i-heroicons-wrench-screwdriver" class="w-3 h-3" />
                {{ tool }}
              </span>
            </div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Complex queries may take 30-120 seconds to complete
            </div>
          </div>

          <!-- AI Thinking Block (for assistant messages with thinking text) -->
          <AIThinkingBlock 
            v-if="msg.role === 'assistant' && !msg.status?.status" 
            :thinking="getParsedResponse(msg.content).thinking" 
          />

          <div class="markdown-container" v-html="formatMessage(msg.content, msg.role)" @click="handleEnrichedClick"></div>
          <span v-if="msg.streamBuffer && (msg.status?.status === 'pending' || msg.status?.status === 'streaming')" class="cursor-blink">|</span>

          <!-- Error status -->
          <div v-if="msg.status?.status === 'error'" class="error-status">
            <UIcon name="i-heroicons-exclamation-triangle" class="w-4 h-4 text-red-500" />
            <span class="text-xs text-red-600 dark:text-red-400">{{ msg.status.error }}</span>
            <button @click="retryLastMessage" class="ml-2 text-xs text-blue-600 dark:text-blue-400 hover:underline">
              Retry
            </button>
          </div>

          <!-- External Links -->
          <div v-if="msg.links && msg.links.length > 0" class="mt-3">
            <div v-for="(link, linkIndex) in msg.links" :key="linkIndex" class="link-box">
              <span class="bullet">•</span>
              <a :href="link" target="_blank" class="external-link">
                {{ link }}
                <UIcon name="i-heroicons-arrow-top-right-on-square" class="external-link-icon" />
              </a>
            </div>
          </div>

          <!-- Metadata -->
          <div v-if="msg.metadata && (msg.metadata.accountId || msg.metadata.mcpUsed)" class="tools-used">
            <div class="metadata-container">
              <span v-if="msg.metadata.accountId" class="metadata-badge account-badge">
                <UIcon :name="msg.metadata.accountId === 'aggregated' ? 'i-heroicons-building-office-2' : 'i-heroicons-building-library'" class="w-3 h-3" />
                {{ msg.metadata.accountId === 'aggregated' ? 'Organization-wide' : `Account: ${msg.metadata.accountId}` }}
              </span>
              <span v-if="msg.metadata.mcpUsed" class="metadata-badge mcp-badge" :class="{ 'permanent-mcp': msg.metadata.mcpType === 'permanent', 'temporary-mcp': msg.metadata.mcpType === 'temporary' }">
                <UIcon :name="msg.metadata.mcpType === 'permanent' ? 'i-heroicons-server-stack' : 'i-heroicons-cpu-chip'" class="w-3 h-3" />
                {{ msg.metadata.mcpUsed }}
              </span>
            </div>
          </div>

          <!-- Suggested Links -->
          <div v-if="msg.suggestedLinks && msg.suggestedLinks.length > 0" class="suggested-links">
            <StrandsLinkCard
              v-for="(link, linkIdx) in msg.suggestedLinks"
              :key="linkIdx"
              :link="link"
            />
          </div>

          <!-- Suggested Prompts -->
          <div v-if="msg.suggestedPrompts && msg.suggestedPrompts.length > 0" class="mt-4">
            <p class="text-xs text-gray-600 dark:text-gray-400 mb-2 flex items-center gap-1.5">
              <UIcon name="i-heroicons-chat-bubble-bottom-center-text" class="w-4 h-4" />
              Continue the conversation:
            </p>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="(prompt, promptIdx) in msg.suggestedPrompts"
                :key="promptIdx"
                @click="handlePromptClick(prompt.text)"
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

      <!-- Example Questions (when welcome is shown) -->
      <div v-if="showWelcome" class="example-questions">
        <div class="flex items-center gap-2 mb-3">
          <UIcon name="i-heroicons-light-bulb" class="w-5 h-5 text-purple-500" />
          <p class="text-sm font-medium text-gray-700 dark:text-gray-300">Try these examples (click to use):</p>
        </div>
        <div
          v-for="(question, index) in exampleQuestionsList"
          :key="index"
          class="example-question group"
          :tabindex="index + 1"
          @click="handleExampleClick(question)"
          @keydown.enter="handleExampleClick(question)"
          @keydown.space.prevent="handleExampleClick(question)"
          :style="{ animationDelay: `${0.1 * index}s` }"
        >
          <UIcon name="i-heroicons-chat-bubble-left-right" class="w-5 h-5 text-purple-500 flex-shrink-0" />
          <span class="flex-1">{{ question }}</span>
          <UIcon name="i-heroicons-arrow-right" class="w-4 h-4 text-gray-400 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>

      <!-- Ghost Loading Indicator (only for non-streaming fallback) -->
      <div v-if="showLoader" class="message bot">
        <div class="message-content ghost-loading-container">
          <div class="ghost-loading">
            <UIcon name="i-fa6-solid-ghost" class="ghost-icon" />
            <div class="ghost-dots">
              <div class="ghost-dot"></div>
              <div class="ghost-dot"></div>
              <div class="ghost-dot"></div>
            </div>
          </div>
          <div class="flex flex-col gap-1">
            <span class="ghost-loading-text">
              {{ pollingProgress || 'GHOST is thinking...' }}
              <span v-if="pollingPercent">({{ pollingPercent }}%)</span>
            </span>
            <span class="text-xs text-gray-500 dark:text-gray-400">Complex queries may take 30-120 seconds to complete</span>
            <div v-if="pollingToolsCalled && pollingToolsCalled.length" class="flex flex-wrap gap-1 mt-1">
              <span
                v-for="tool in pollingToolsCalled"
                :key="tool"
                class="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
              >
                <UIcon name="i-heroicons-wrench-screwdriver" class="w-3 h-3" />
                {{ tool }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Chat Input Area -->
    <div class="chat-input-container">
      <form @submit.prevent="handleSubmit" class="input-form">
        <div class="input-wrapper">
          <!-- Account Mention Dropdown -->
          <div
            v-if="showMentionDropdown"
            class="mention-dropdown"
            ref="mentionDropdownRef"
          >
            <div
              v-for="(account, index) in filteredAccounts"
              :key="account.accountId"
              :class="['mention-item', { 'mention-item-selected': index === selectedMentionIndex }]"
              @click="handleMentionClick(account)"
              @mouseenter="setMentionIndex(index)"
            >
              <UIcon name="i-heroicons-building-library" class="w-4 h-4 text-blue-500 flex-shrink-0" />
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {{ getAccountDisplay(account) }}
                </div>
                <div class="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {{ getAccountSubtitle(account) }}
                </div>
              </div>
            </div>
            <div v-if="filteredAccounts.length === 0" class="mention-empty">
              No accounts found
            </div>
          </div>

          <input
            v-model="inputValue"
            type="text"
            :disabled="isLoading"
            placeholder="Ask about AWS costs, configurations, security... (use @ to mention accounts)"
            ref="inputRef"
            class="chat-input"
            @input="handleInputUpdate"
            @keydown="handleKeyDown"
          />
          <button type="submit" :disabled="isLoading || !inputValue.trim()" class="send-button">
            <UIcon name="i-heroicons-paper-airplane" class="w-5 h-5" />
          </button>
        </div>
        <p class="input-hint">
          Tip: Use <kbd class="kbd">@</kbd> to mention accounts or type "help" for examples.
          <span v-if="selectedAccountForMessage" class="ml-2 inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-xs">
            <UIcon name="i-heroicons-building-library" class="w-3 h-3" />
            Context: {{ getAccountDisplay(selectedAccountForMessage) }}
          </span>
        </p>
      </form>
    </div>

    <!-- Account Disambiguation Modal -->
    <AccountDisambiguationModal
      v-if="showDisambiguation && disambiguationData"
      :disambiguation="disambiguationData"
      :sessionId="sessionId || ''"
      @selected="handleAccountSelected"
      @cancel="cancelDisambiguation"
    />

    <!-- Entity Popover -->
    <EntityPopover />
  </div>
</template>

<script setup lang="ts">
/**
 * GhostChatFullPage - Full-page chat interface
 * Uses unified useChatUI composable for all logic
 */

import { parseAIResponse, type ParsedAIResponse } from '~/utils/parseAIResponse'

// Get unified chat logic
const {
  // Core state
  messages,
  chatState,
  inputValue,
  showWelcome,
  isLoading,
  showLoader,
  scrollTrigger,
  
  // Polling state
  pollingProgress,
  pollingPercent,
  pollingToolsCalled,
  
  // Actions
  sendMessage,
  retryLastMessage,
  
  // Mention system
  showMentionDropdown,
  filteredAccounts,
  selectedAccountForMessage,
  selectedMentionIndex,
  handleMentionInput,
  selectAccount,
  navigateMentions,
  selectHighlightedAccount,
  closeMentionDropdown,
  getAccountDisplay,
  getAccountSubtitle,
  setMentionIndex,
  
  // Disambiguation
  showDisambiguation,
  disambiguationData,
  handleAccountSelected,
  cancelDisambiguation,
  
  // Session
  sessionId,
  
  // Initialize
  initialize
} = useChatUI({ viewMode: 'fullpage' })

// Entity enrichment for message rendering
const { enrichStrandsResponse, handleEnrichedClick } = useStrandsResponseEnricher()

// Get user's favorite and recent accounts for personalized prompts
const { favorites } = useFavoriteAccounts()
const { recentAccounts } = useRecentAccounts()

// Local UI refs
const chatBoxRef = ref<HTMLDivElement | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)
const mentionDropdownRef = ref<HTMLDivElement | null>(null)

// Default prompts
const defaultPrompts = [
  "What are the AWS costs for this month?",
  "Show me security findings from Security Hub",
  "List all EC2 instances across accounts",
  "What are the top cost drivers this month?",
  "Show me recent CloudTrail events",
]

// Personalized example questions
const exampleQuestionsList = computed(() => {
  const prompts: string[] = []
  const userAccounts = favorites.value.length > 0 ? favorites.value : recentAccounts.value

  if (userAccounts.length === 0) {
    return defaultPrompts
  }

  const account1 = userAccounts[0]
  const account2 = userAccounts[1]
  const account3 = userAccounts[2]

  if (account1) {
    prompts.push(`What are the AWS costs for ${account1.projectName || account1.accountId} this month?`)
    prompts.push(`Show me security findings from Security Hub for ${account1.projectName || account1.accountId}`)
  }

  if (account2) {
    prompts.push(`List EC2 instances in ${account2.projectName || account2.accountId}`)
  } else if (account1) {
    prompts.push(`List EC2 instances in ${account1.projectName || account1.accountId}`)
  }

  if (account3 || account2 || account1) {
    const account = account3 || account2 || account1
    prompts.push(`Analyze costs by service for ${account.projectName || account.accountId}`)
  }

  if (account1) {
    prompts.push(`What S3 buckets exist in ${account1.projectName || account1.accountId}?`)
  }

  while (prompts.length < 5) {
    prompts.push(defaultPrompts[prompts.length])
  }

  return prompts
})

// Cache for parsed responses to avoid re-parsing
const parsedResponseCache = new Map<string, ParsedAIResponse>()

// Get parsed response (with caching)
function getParsedResponse(content: string): ParsedAIResponse {
  if (!content) return { content: '', thinking: null, hasThinking: false }
  
  // Check cache first
  if (parsedResponseCache.has(content)) {
    return parsedResponseCache.get(content)!
  }
  
  // Parse and cache
  const parsed = parseAIResponse(content)
  parsedResponseCache.set(content, parsed)
  return parsed
}

// Format message content using entity-aware enricher
function formatMessage(content: string, role?: string): string {
  if (!content || typeof content !== 'string') {
    return ''
  }
  try {
    // For assistant messages, use the parsed content (without thinking text)
    const textToFormat = role === 'assistant' 
      ? getParsedResponse(content).content 
      : content
    
    return enrichStrandsResponse(textToFormat)
  } catch (error) {
    console.error('[GhostChat] Error enriching message content:', error)
    return content.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
  }
}

// Handle input updates for @ mention detection
function handleInputUpdate(event: Event) {
  const target = event.target as HTMLInputElement
  const cursorPosition = target.selectionStart || 0
  handleMentionInput(inputValue.value, cursorPosition)
}

// Handle keyboard events for mention navigation
function handleKeyDown(event: KeyboardEvent) {
  if (!showMentionDropdown.value) return

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    navigateMentions('down')
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    navigateMentions('up')
  } else if (event.key === 'Enter' && showMentionDropdown.value) {
    event.preventDefault()
    selectHighlightedAccount()
    nextTick(() => {
      if (inputRef.value) {
        inputRef.value.focus()
        inputRef.value.setSelectionRange(inputValue.value.length, inputValue.value.length)
      }
    })
  } else if (event.key === 'Escape') {
    closeMentionDropdown()
  }
}

// Handle mention click
function handleMentionClick(account: any) {
  selectAccount(account)
  nextTick(() => {
    if (inputRef.value) {
      inputRef.value.focus()
      inputRef.value.setSelectionRange(inputValue.value.length, inputValue.value.length)
    }
  })
}

// Handle form submission
async function handleSubmit(e: Event) {
  e.preventDefault()
  if (!inputValue.value.trim()) return

  if (inputValue.value.trim().toLowerCase() === "help") {
    // Show examples - the welcome computed will handle this based on messages
    inputValue.value = ''
    return
  }

  await sendMessage()
}

// Handle example question clicks
async function handleExampleClick(message: string) {
  await sendMessage(message)
}

// Handle suggested prompt clicks
async function handlePromptClick(promptText: string) {
  await sendMessage(promptText)
}

// Auto scroll when messages change
watch(scrollTrigger, () => {
  nextTick(() => {
    if (chatBoxRef.value) {
      chatBoxRef.value.scrollTo({
        top: chatBoxRef.value.scrollHeight,
        behavior: 'smooth'
      })
    }
  })
})

// Also scroll on messages change
watch(messages, () => {
  nextTick(() => {
    if (chatBoxRef.value) {
      chatBoxRef.value.scrollTo({
        top: chatBoxRef.value.scrollHeight,
        behavior: 'smooth'
      })
    }
  })
}, { deep: true })

// Refocus input after loading completes
watch(isLoading, (newLoading) => {
  if (!newLoading && inputRef.value) {
    inputRef.value.focus()
  }
})

// Initialize on mount
onMounted(async () => {
  await initialize()
  if (inputRef.value) {
    inputRef.value.focus()
  }
})
</script>

<style scoped>
.ghost-chat-container {
  @apply flex flex-col h-full bg-white dark:bg-gray-900;
}

.chat-messages {
  @apply flex-1 overflow-y-auto p-6 space-y-6 max-w-[1400px] mx-auto w-full min-h-0;
}

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

.suggested-links {
  @apply mt-3 space-y-2;
}

.example-questions {
  @apply space-y-2 max-w-2xl mx-auto my-6;
}

.example-question {
  @apply flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg cursor-pointer transition-all duration-200 border border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-600 animate-fade-in hover:shadow-md hover:scale-[1.02] active:scale-[0.98];
}

.example-question:hover {
  @apply transform translate-x-1;
}

.example-question span {
  @apply text-sm text-gray-700 dark:text-gray-300;
}

/* Ghost Loading Animation */
.ghost-loading-container {
  @apply flex flex-col items-start gap-2;
}

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

.ghost-loading-text {
  @apply text-xs text-gray-500 dark:text-gray-400 italic;
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

.chat-input-container {
  @apply flex-shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4;
}

.input-form {
  @apply max-w-[1400px] mx-auto;
}

.input-wrapper {
  @apply flex gap-3 items-center relative;
}

.chat-input {
  @apply flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent;
}

.send-button {
  @apply p-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed;
}

.input-hint {
  @apply text-xs text-gray-500 dark:text-gray-400 mt-2;
}

.kbd {
  @apply inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-mono bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded border border-gray-300 dark:border-gray-600;
}

/* Mention Dropdown Styles */
.mention-dropdown {
  @apply absolute bottom-full left-0 right-0 mb-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-64 overflow-y-auto z-50;
}

.mention-item {
  @apply flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border-b border-gray-200 dark:border-gray-700 last:border-b-0;
}

.mention-item-selected {
  @apply bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/30;
}

.mention-empty {
  @apply px-4 py-3 text-sm text-gray-500 dark:text-gray-400 text-center;
}

@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in {
  animation: fade-in 0.3s ease-out;
}

/* Custom scrollbar */
.chat-messages::-webkit-scrollbar {
  width: 8px;
}

.chat-messages::-webkit-scrollbar-track {
  @apply bg-gray-100 dark:bg-gray-800;
}

.chat-messages::-webkit-scrollbar-thumb {
  @apply bg-gray-300 dark:bg-gray-600 rounded;
}

.chat-messages::-webkit-scrollbar-thumb:hover {
  @apply bg-gray-400 dark:bg-gray-500;
}

/* Markdown Content Styling */
.markdown-container :deep(h1) {
  @apply text-2xl font-bold text-gray-900 dark:text-white mb-3 mt-4 first:mt-0 pb-2 border-b-2 border-gray-200 dark:border-gray-600;
}

.markdown-container :deep(h2) {
  @apply text-xl font-bold text-gray-900 dark:text-white mb-2 mt-3 pb-1 border-b border-gray-200 dark:border-gray-600;
}

.markdown-container :deep(h3) {
  @apply text-lg font-semibold text-blue-600 dark:text-blue-400 mb-2 mt-3;
}

.markdown-container :deep(h4) {
  @apply text-base font-semibold text-gray-800 dark:text-gray-200 mb-2 mt-2;
}

.markdown-container :deep(h5) {
  @apply text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1 mt-2;
}

.markdown-container :deep(h6) {
  @apply text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1 mt-1;
}

.markdown-container :deep(p) {
  @apply text-sm leading-normal mb-2 text-gray-700 dark:text-gray-300;
}

.markdown-container :deep(ul) {
  @apply space-y-1 mb-3 pl-5 list-disc;
}

.markdown-container :deep(ol) {
  @apply space-y-1 mb-3 pl-5 list-decimal;
}

.markdown-container :deep(li) {
  @apply text-sm text-gray-700 dark:text-gray-300 leading-relaxed;
}

.markdown-container :deep(ul li::marker) {
  @apply text-blue-500 dark:text-blue-400;
}

.markdown-container :deep(ol li::marker) {
  @apply text-blue-600 dark:text-blue-400 font-semibold;
}

.markdown-container :deep(code) {
  @apply bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded font-mono text-xs text-blue-600 dark:text-blue-400 border border-gray-300 dark:border-gray-600;
}

.markdown-container :deep(pre) {
  @apply bg-gray-900 dark:bg-gray-950 p-3 rounded-lg overflow-x-auto my-3 border border-gray-700;
}

.markdown-container :deep(pre code) {
  @apply bg-transparent border-0 text-gray-100 text-xs leading-normal block p-0;
}

.markdown-container :deep(a) {
  @apply text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline decoration-blue-400/50 hover:decoration-blue-600 underline-offset-2 transition-colors;
}

.markdown-container :deep(blockquote) {
  @apply border-l-4 border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20 pl-3 pr-2 py-2 my-3 italic text-sm text-gray-700 dark:text-gray-300 rounded-r;
}

.markdown-container :deep(hr) {
  @apply my-4 border-0 border-t-2 border-gray-300 dark:border-gray-600;
}

.markdown-container :deep(strong) {
  @apply font-semibold text-gray-900 dark:text-white;
}

.markdown-container :deep(em) {
  @apply italic text-gray-600 dark:text-gray-400;
}

.markdown-container :deep(table) {
  @apply w-full my-3 border-collapse bg-white dark:bg-gray-800 rounded-lg overflow-hidden shadow-sm text-sm;
}

.markdown-container :deep(th) {
  @apply bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 px-2 py-1 text-left font-semibold text-gray-900 dark:text-white text-xs;
}

.markdown-container :deep(td) {
  @apply border border-gray-300 dark:border-gray-600 px-2 py-1 text-gray-700 dark:text-gray-300 text-xs;
}

.markdown-container :deep(tbody tr) {
  @apply hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors;
}

/* Streaming UI Styles */
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
