<template>
  <USlideover
    v-model="chatSidebar.isOpen.value"
    side="right"
    :ui="{
      width: 'max-w-md',
      background: 'bg-white dark:bg-slate-800',
      overlay: {
        background: 'bg-gray-200/75 dark:bg-gray-800/75'
      }
    }"
  >
    <div class="flex flex-col h-full">
      <!-- Header -->
      <div class="p-4 border-b border-gray-200 dark:border-slate-700">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-chat-bubble-left-right" class="w-5 h-5 text-purple-500" />
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white">AI Assistant</h2>
          </div>
          <UButton
            icon="i-heroicons-x-mark"
            variant="ghost"
            color="gray"
            size="sm"
            @click="chatSidebar.close()"
          />
        </div>

        <!-- Thread Selector and Actions -->
        <div class="flex items-center gap-2">
          <!-- Thread Dropdown -->
          <USelectMenu
            v-model="selectedThreadId"
            :options="threadOptions"
            placeholder="Select thread..."
            value-attribute="value"
            option-attribute="label"
            class="flex-1"
            size="sm"
            @update:model-value="handleThreadChange"
          >
            <template #label>
              <span v-if="currentThread" class="truncate">
                {{ currentThread.title }}
              </span>
              <span v-else class="text-gray-400">New conversation</span>
            </template>
          </USelectMenu>

          <!-- New Thread Button -->
          <UButton
            icon="i-heroicons-plus"
            variant="ghost"
            color="gray"
            size="sm"
            title="New conversation"
            @click="handleNewThread"
          />

          <!-- Clear Thread Button -->
          <UButton
            v-if="currentThread && currentThread.messageCount > 0"
            icon="i-heroicons-trash"
            variant="ghost"
            color="red"
            size="sm"
            title="Clear messages"
            @click="handleClearThread"
          />
        </div>

        <!-- Link to Full Page -->
        <div class="mt-3">
          <NuxtLink
            to="/chat"
            class="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
            @click="chatSidebar.close()"
          >
            <UIcon name="i-heroicons-arrow-top-right-on-square" class="w-3 h-3" />
            Open full page for advanced features
          </NuxtLink>
        </div>
      </div>

      <!-- Chat Messages -->
      <div class="flex-1 overflow-y-auto p-4" ref="chatBoxRef">
        <!-- Welcome Message -->
        <div v-if="!chatSidebar.hasSeenWelcome.value && showWelcome" class="mb-4 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
          <div class="flex items-start gap-3">
            <UIcon name="i-heroicons-sparkles" class="w-5 h-5 text-purple-600 dark:text-purple-400 mt-0.5" />
            <div>
              <h3 class="font-semibold text-purple-900 dark:text-purple-100 mb-1">Welcome to GHOST AI Assistant!</h3>
              <p class="text-sm text-purple-700 dark:text-purple-300">
                Ask me about AWS costs, configurations, security findings, and more. Your conversations are automatically saved.
              </p>
            </div>
          </div>
        </div>

        <!-- Messages -->
        <div
          v-for="(msg, index) in messages"
          :key="msg.messageId || `msg-${index}`"
          :class="`mb-4 ${msg.role === 'user' ? 'text-right' : ''}`"
        >
          <div
            :class="[
              'inline-block max-w-[85%] rounded-lg p-3',
              msg.role === 'user'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-100 dark:bg-slate-700 text-gray-900 dark:text-gray-100'
            ]"
          >
            <!-- Streaming status indicator -->
            <div v-if="msg.status?.status === 'pending' || msg.status?.status === 'streaming'" class="streaming-status-sidebar mb-2">
              <div class="flex items-center gap-2 mb-1.5">
                <div class="ghost-loading-sidebar-inline">
                  <UIcon name="i-fa6-solid-ghost" class="ghost-icon-sidebar" />
                  <div class="flex gap-1">
                    <div class="ghost-dot-sidebar"></div>
                    <div class="ghost-dot-sidebar"></div>
                    <div class="ghost-dot-sidebar"></div>
                  </div>
                </div>
                <div class="flex flex-col gap-0.5">
                  <span class="text-xs font-medium text-gray-700 dark:text-gray-300">GHOST is thinking...</span>
                  <span class="text-xs text-gray-600 dark:text-gray-400">{{ msg.status.progress || pollingProgress || 'Starting...' }}</span>
                </div>
              </div>
              <div v-if="(msg.status.toolsCalled && msg.status.toolsCalled.length > 0) || (pollingToolsCalled && pollingToolsCalled.length > 0)" class="flex flex-wrap gap-1">
                <span v-for="tool in (msg.status.toolsCalled || pollingToolsCalled)" :key="tool" class="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                  <UIcon name="i-heroicons-wrench-screwdriver" class="w-3 h-3" />
                  {{ tool }}
                </span>
              </div>
              <div class="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                Complex queries may take 30-120 seconds
              </div>
            </div>

            <div
              class="prose prose-sm dark:prose-invert max-w-none"
              :class="{ 'prose-invert': msg.role === 'user' }"
              v-html="formatMessage(msg.content)"
              @click="handleLinkClick"
            ></div>
            <span v-if="msg.streamBuffer && (msg.status?.status === 'pending' || msg.status?.status === 'streaming')" class="cursor-blink">|</span>

            <!-- Canceled status -->
            <div v-if="msg.status?.status === 'canceled'" class="canceled-status-sidebar">
              <UIcon name="i-heroicons-x-circle" class="w-3.5 h-3.5 text-yellow-500" />
              <span class="text-xs text-yellow-600 dark:text-yellow-400">Canceled</span>
            </div>

            <!-- Error status with retry -->
            <div v-if="msg.status?.status === 'error'" class="error-status-sidebar">
              <UIcon name="i-heroicons-exclamation-triangle" class="w-3.5 h-3.5 text-red-500" />
              <span class="text-xs text-red-600 dark:text-red-400">{{ msg.status.error }}</span>
              <button @click="retryLastMessage" class="ml-2 text-xs text-blue-600 dark:text-blue-400 hover:underline">
                Retry
              </button>
            </div>

            <!-- Metadata -->
            <div v-if="msg.metadata && (msg.metadata.accountId || msg.metadata.mcpUsed)" class="mt-2 pt-2 border-t border-gray-200/50 dark:border-gray-700/50">
              <div class="flex flex-wrap gap-2 text-xs">
                <span v-if="msg.metadata.accountId" :class="msg.metadata.accountId === 'aggregated' ? 'inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300' : 'inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'">
                  <UIcon :name="msg.metadata.accountId === 'aggregated' ? 'i-heroicons-building-office-2' : 'i-heroicons-building-library'" class="w-3 h-3" />
                  {{ msg.metadata.accountId === 'aggregated' ? 'Organization-wide' : msg.metadata.accountId }}
                </span>
                <span v-if="msg.metadata.mcpUsed" class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                  <UIcon name="i-heroicons-cpu-chip" class="w-3 h-3" />
                  {{ msg.metadata.mcpUsed }}
                </span>
              </div>
            </div>

            <!-- Suggested Links -->
            <div v-if="msg.suggestedLinks && msg.suggestedLinks.length > 0" class="mt-2 space-y-2">
              <StrandsLinkCard
                v-for="(link, linkIdx) in msg.suggestedLinks"
                :key="linkIdx"
                :link="link"
              />
            </div>

            <!-- Suggested Prompts -->
            <div v-if="msg.suggestedPrompts && msg.suggestedPrompts.length > 0" class="mt-2 space-y-2">
              <p class="text-xs text-gray-600 dark:text-gray-400 mb-1.5 flex items-center gap-1">
                <UIcon name="i-heroicons-chat-bubble-bottom-center-text" class="w-3.5 h-3.5" />
                Continue:
              </p>
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="(prompt, promptIdx) in msg.suggestedPrompts"
                  :key="promptIdx"
                  @click="handlePromptClick(prompt.text)"
                  class="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-purple-200 dark:border-purple-800 bg-white dark:bg-purple-900/20 hover:bg-purple-50 dark:hover:bg-purple-900/40 text-purple-700 dark:text-purple-300 transition-colors"
                >
                  <UIcon
                    :name="prompt.type === 'question' ? 'i-heroicons-question-mark-circle' : prompt.type === 'action' ? 'i-heroicons-arrow-right-circle' : 'i-heroicons-information-circle'"
                    class="w-3 h-3 flex-shrink-0"
                  />
                  <span>{{ prompt.text }}</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Timestamp -->
          <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {{ formatTimestamp(msg.timestamp) }}
          </div>
        </div>

        <!-- Ghost Loading Indicator (fallback) -->
        <div v-if="showLoader" class="ghost-loading-sidebar">
          <UIcon name="i-fa6-solid-ghost" class="ghost-icon-sidebar" />
          <div class="flex gap-1">
            <div class="ghost-dot-sidebar"></div>
            <div class="ghost-dot-sidebar"></div>
            <div class="ghost-dot-sidebar"></div>
          </div>
          <div class="flex flex-col gap-1">
            <span class="text-sm text-gray-500 dark:text-gray-400 italic">
              {{ pollingProgress || 'GHOST is thinking...' }}
              <span v-if="pollingPercent">({{ pollingPercent }}%)</span>
            </span>
            <span class="text-xs text-gray-400 dark:text-gray-500">Complex queries may take 30-120 seconds</span>
            <div v-if="pollingToolsCalled && pollingToolsCalled.length" class="flex flex-wrap gap-1 mt-1">
              <span
                v-for="tool in pollingToolsCalled"
                :key="tool"
                class="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] rounded bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-200"
              >
                <UIcon name="i-heroicons-wrench-screwdriver" class="w-3 h-3" />
                {{ tool }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Input Form -->
      <div class="p-4 border-t border-gray-200 dark:border-slate-700">
        <form @submit.prevent="handleSubmit" class="flex flex-col gap-2">
          <div class="flex gap-2 relative">
            <!-- Account Mention Dropdown -->
            <div
              v-if="showMentionDropdown"
              class="mention-dropdown-sidebar"
            >
              <div
                v-for="(account, index) in filteredAccounts"
                :key="account.accountId"
                :class="['mention-item-sidebar', { 'mention-item-selected': index === selectedMentionIndex }]"
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
              <div v-if="filteredAccounts.length === 0" class="mention-empty-sidebar">
                No active accounts found
              </div>
            </div>

            <input
              v-model="inputValue"
              placeholder="Ask about AWS costs, config... (use @ to mention accounts)"
              :disabled="isLoading"
              class="sidebar-input"
              ref="inputRef"
              @input="handleInputUpdate"
              @keydown="handleKeyDown"
            />
            <UButton
              type="submit"
              icon="i-heroicons-paper-airplane"
              :disabled="isLoading || !inputValue.trim()"
              color="purple"
              size="lg"
            />
          </div>
          <p v-if="selectedAccountForMessage" class="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1 px-2">
            <UIcon name="i-heroicons-building-library" class="w-3 h-3 text-blue-500" />
            Context: {{ getAccountDisplay(selectedAccountForMessage) }}
          </p>
        </form>
      </div>
    </div>

    <!-- Clear Confirmation Modal -->
    <UModal v-model="showClearConfirm" :ui="{ width: 'max-w-md' }">
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-exclamation-triangle" class="w-5 h-5 text-yellow-500" />
            <h3 class="text-lg font-semibold">Clear conversation?</h3>
          </div>
        </template>

        <p class="text-gray-600 dark:text-gray-400">
          This will remove all messages from the current thread. The thread itself will remain in your history.
        </p>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" color="gray" @click="showClearConfirm = false">
              Cancel
            </UButton>
            <UButton color="red" @click="confirmClearThread">
              Clear Messages
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Account Disambiguation Modal -->
    <AccountDisambiguationModal
      v-if="showDisambiguation && disambiguationData"
      :disambiguation="disambiguationData"
      :sessionId="sessionId || ''"
      @selected="handleAccountSelected"
      @cancel="cancelDisambiguation"
    />
  </USlideover>
</template>

<script setup lang="ts">
/**
 * ChatThreadsSidebar - Slide-over chat sidebar
 * Uses unified useChatUI composable for all logic
 * Now uses async polling instead of legacy sync API!
 */

import { useChatThreadsStore } from '~/stores/useChatThreadsStore'

const chatSidebar = useChatSidebar()
const threadsStore = useChatThreadsStore()
const { parseMarkdownWithLinks, handleLinkClick } = useMarkdownLinkParser()
const toast = useToast()

// Get unified chat logic
const {
  // Core state
  messages,
  showWelcome,
  isLoading,
  showLoader,
  scrollTrigger,
  inputValue,
  
  // Polling state  
  pollingProgress,
  pollingPercent,
  pollingToolsCalled,
  
  // Actions
  sendMessage,
  retryLastMessage,
  clearConversation,
  switchThread,
  createNewThread,
  
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
  
  // Thread management
  currentThread,
  activeThreadId,
  
  // Initialize
  initialize
} = useChatUI({ viewMode: 'sidebar', initialGreeting: '' })

// Local UI state
const chatBoxRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)
const showClearConfirm = ref(false)
const selectedThreadId = ref<string | null>(null)

// Thread options for dropdown
const threadOptions = computed(() => {
  const options: any[] = []

  // Add pinned threads
  if (threadsStore.pinnedThreads.length > 0) {
    options.push({
      label: 'Pinned',
      value: null,
      disabled: true
    })
    threadsStore.pinnedThreads.forEach(thread => {
      options.push({
        label: thread.title,
        value: thread.threadId,
        icon: 'i-heroicons-bookmark-solid'
      })
    })
  }

  // Add recent threads
  if (threadsStore.unpinnedThreads.length > 0) {
    if (options.length > 0) {
      options.push({
        label: 'Recent',
        value: null,
        disabled: true
      })
    }
    threadsStore.unpinnedThreads.slice(0, 10).forEach(thread => {
      options.push({
        label: thread.title,
        value: thread.threadId
      })
    })
  }

  return options
})

// Initialize on mount
onMounted(async () => {
  chatSidebar.initialize()
  await initialize()
  selectedThreadId.value = activeThreadId.value
})

// Sync selected thread with active thread
watch(activeThreadId, (newId) => {
  selectedThreadId.value = newId
})

// Handle thread change from dropdown
async function handleThreadChange(threadIdOrOption: string | any) {
  if (!threadIdOrOption) return

  const threadId = typeof threadIdOrOption === 'string'
    ? threadIdOrOption
    : threadIdOrOption?.value || threadIdOrOption?.threadId

  if (threadId && typeof threadId === 'string' && threadId.length > 0) {
    await switchThread(threadId)
    selectedThreadId.value = threadId
  }
}

// Handle new thread
async function handleNewThread() {
  await createNewThread()
  selectedThreadId.value = activeThreadId.value

  toast.add({
    title: 'New conversation started',
    color: 'green'
  })
}

// Handle clear thread
function handleClearThread() {
  showClearConfirm.value = true
}

async function confirmClearThread() {
  showClearConfirm.value = false

  const success = await clearConversation()

  if (success !== false) {
    toast.add({
      title: 'Conversation cleared',
      color: 'green'
    })
  } else {
    toast.add({
      title: 'Failed to clear conversation',
      color: 'red'
    })
  }
}

// Format message with markdown
function formatMessage(content: string) {
  return parseMarkdownWithLinks(content)
}

// Format timestamp
function formatTimestamp(timestamp: string) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (minutes > 0) return `${minutes}m ago`
  return 'Just now'
}

// Scroll to bottom
function scrollToBottom() {
  if (chatBoxRef.value) {
    chatBoxRef.value.scrollTop = chatBoxRef.value.scrollHeight
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
        const length = inputValue.value.length
        inputRef.value.setSelectionRange(length, length)
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
      const length = inputValue.value.length
      inputRef.value.setSelectionRange(length, length)
    }
  })
}

// Handle suggested prompt clicks
async function handlePromptClick(promptText: string) {
  await sendMessage(promptText)
}

// Handle form submission
async function handleSubmit() {
  if (!inputValue.value.trim() || isLoading.value) return
  await sendMessage()
}

// Auto scroll when messages change
watch([scrollTrigger, messages], () => {
  nextTick(() => {
    nextTick(() => {
      scrollToBottom()
    })
  })
}, { deep: true })
</script>

<style scoped>
/* Markdown styling for chat messages */
:deep(.prose) {
  @apply text-sm;
}

:deep(.prose p) {
  @apply my-1;
}

:deep(.prose ul),
:deep(.prose ol) {
  @apply my-2;
}

:deep(.prose code) {
  @apply bg-gray-200 dark:bg-gray-700 px-1 py-0.5 rounded text-xs;
}

:deep(.prose pre) {
  @apply bg-gray-100 dark:bg-gray-800 p-2 rounded my-2 overflow-x-auto;
}

:deep(.prose pre code) {
  @apply bg-transparent p-0;
}

:deep(.prose a) {
  @apply text-blue-600 dark:text-blue-400 hover:underline;
}

:deep(.prose-invert a) {
  @apply text-blue-300 hover:text-blue-200;
}

/* Sidebar Input Styling */
.sidebar-input {
  @apply flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm;
}

/* Mention Dropdown Styles for Sidebar */
.mention-dropdown-sidebar {
  @apply absolute bottom-full left-0 right-14 mb-2 bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg shadow-lg max-h-48 overflow-y-auto z-[100];
}

.mention-item-sidebar {
  @apply flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors border-b border-gray-200 dark:border-slate-600 last:border-b-0;
}

.mention-item-selected {
  @apply bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/30;
}

.mention-empty-sidebar {
  @apply px-3 py-2 text-xs text-gray-500 dark:text-gray-400 text-center;
}

/* Ghost Loading Animation for Sidebar */
.ghost-loading-sidebar {
  @apply flex items-center gap-2 p-3 bg-gray-50 dark:bg-slate-800 rounded-lg;
}

.ghost-loading-sidebar-inline {
  @apply flex items-center gap-2;
}

.ghost-icon-sidebar {
  @apply w-5 h-5 text-emerald-400;
  animation: ghostFloat 2s ease-in-out infinite;
}

.ghost-dot-sidebar {
  @apply w-2 h-2 bg-emerald-400 rounded-full;
  animation: ghostDotPulse 1.4s ease-in-out infinite;
}

.ghost-dot-sidebar:nth-child(1) {
  animation-delay: 0s;
}

.ghost-dot-sidebar:nth-child(2) {
  animation-delay: 0.2s;
}

.ghost-dot-sidebar:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes ghostFloat {
  0%, 100% {
    transform: translateY(0px);
  }
  50% {
    transform: translateY(-6px);
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

/* Streaming status */
.streaming-status-sidebar {
  @apply pb-2 border-b border-gray-200 dark:border-gray-600;
}

.cursor-blink {
  @apply inline-block ml-0.5 text-purple-600 dark:text-purple-400 animate-pulse font-bold;
}

.canceled-status-sidebar {
  @apply flex items-center gap-1.5 mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded text-xs;
}

.error-status-sidebar {
  @apply flex items-center gap-1.5 mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded text-xs;
}
</style>
