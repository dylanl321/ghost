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
        <div v-if="!chatSidebar.hasSeenWelcome.value && messages.length === 0" class="mb-4 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
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
        <div v-for="(msg, index) in messages" :key="index" :class="`mb-4 ${msg.sender === 'user' ? 'text-right' : ''}`">
          <div
            :class="[
              'inline-block max-w-[85%] rounded-lg p-3',
              msg.sender === 'user'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-100 dark:bg-slate-700 text-gray-900 dark:text-gray-100'
            ]"
          >
            <div
              class="prose prose-sm dark:prose-invert max-w-none"
              :class="{ 'prose-invert': msg.sender === 'user' }"
              v-html="formatMessage(msg.text)"
              @click="handleLinkClick"
            ></div>

            <!-- Metadata -->
            <div v-if="msg.metadata && (msg.metadata.accountId || msg.metadata.mcpUsed)" class="mt-2 pt-2 border-t border-gray-200/50 dark:border-gray-700/50">
              <div class="flex flex-wrap gap-2 text-xs">
                <span v-if="msg.metadata.accountId" class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                  <UIcon name="i-heroicons-building-library" class="w-3 h-3" />
                  {{ msg.metadata.accountId }}
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
          </div>

          <!-- Timestamp -->
          <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {{ formatTimestamp(msg.timestamp) }}
          </div>
        </div>

        <!-- Ghost Loading Indicator -->
        <div v-if="isLoading" class="ghost-loading-sidebar">
          <UIcon name="i-fa6-solid-ghost" class="ghost-icon-sidebar" />
          <div class="flex gap-1">
            <div class="ghost-dot-sidebar"></div>
            <div class="ghost-dot-sidebar"></div>
            <div class="ghost-dot-sidebar"></div>
          </div>
          <span class="text-sm text-gray-500 dark:text-gray-400 italic">GHOST is thinking...</span>
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
                No accounts found
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
      @cancel="handleDisambiguationCancel"
    />
  </USlideover>
</template>

<script setup lang="ts">
import { useChatThreadsStore } from '~/stores/useChatThreadsStore'
import type { ChatMessage } from '~/shared/types/chat-threads'

const chatSidebar = useChatSidebar()
const threadsStore = useChatThreadsStore()
const { parseMarkdownWithLinks, handleLinkClick } = useMarkdownLinkParser()
const toast = useToast()

// Use account mention composable
const {
  showMentionDropdown,
  filteredAccounts,
  selectedAccountForMessage,
  selectedMentionIndex,
  handleInputChange,
  selectAccount,
  navigateMentions,
  selectHighlightedAccount,
  closeMentionDropdown,
  clearSelectedAccount,
  getAccountDisplay,
  getAccountSubtitle,
  setMentionIndex
} = useChatAccountMention()

// Chat state
const messages = ref<any[]>([])
const inputValue = ref('')
const isLoading = ref(false)
const chatBoxRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLElement | null>(null)
const sessionId = ref<string | undefined>(undefined)
const userTimezone = ref<string>(Intl.DateTimeFormat().resolvedOptions().timeZone)

// Disambiguation state
const showDisambiguation = ref(false)
const disambiguationData = ref<any>(null)
const pendingMessage = ref<string>('')

// Clear confirmation
const showClearConfirm = ref(false)

// Thread selection
const selectedThreadId = ref<string | null>(null)
const currentThread = computed(() => threadsStore.currentThread)

// Thread options for dropdown
const threadOptions = computed(() => {
  const options: any[] = []

  // Add pinned threads
  if (threadsStore.pinnedThreads.length > 0) {
    options.push({
      label: 'Pinned',
      value: null, // Null value prevents selection
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
        value: null, // Null value prevents selection
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
  await threadsStore.fetchThreads()

  // Load active thread if exists
  if (threadsStore.activeThreadId) {
    await loadThread(threadsStore.activeThreadId)
  }
})

// Watch for active thread changes
watch(() => threadsStore.activeThreadId, async (newId) => {
  if (newId) {
    await loadThread(newId)
  }
})

// Load thread messages
async function loadThread(threadId: string) {
  selectedThreadId.value = threadId
  const success = await threadsStore.loadThread(threadId)

  if (success && threadsStore.currentThread) {
    // Convert thread messages to display format
    // Handle case where messages might be undefined (empty array was sanitized)
    const threadMessages = threadsStore.currentThread.messages || []
    messages.value = threadMessages.map(msg => ({
      text: msg.content,
      sender: msg.role === 'user' ? 'user' : 'bot',
      metadata: msg.metadata,
      suggestedLinks: msg.suggestedLinks,
      timestamp: msg.timestamp
    }))

    nextTick(() => scrollToBottom())
  }
}

// Handle thread change
async function handleThreadChange(threadIdOrOption: string | any) {
  // Ignore null/undefined selections (disabled header items)
  if (!threadIdOrOption) return

  // Extract thread ID if an option object is passed
  const threadId = typeof threadIdOrOption === 'string'
    ? threadIdOrOption
    : threadIdOrOption?.value || threadIdOrOption?.threadId

  // Only load if we have a valid string thread ID
  if (threadId && typeof threadId === 'string' && threadId.length > 0) {
    await loadThread(threadId)
  }
}

// Handle new thread
async function handleNewThread() {
  const thread = await threadsStore.createThread()
  if (thread) {
    selectedThreadId.value = thread.threadId
    messages.value = []
    sessionId.value = undefined
    inputValue.value = ''

    toast.add({
      title: 'New conversation started',
      color: 'green'
    })
  }
}

// Handle clear thread
function handleClearThread() {
  showClearConfirm.value = true
}

async function confirmClearThread() {
  showClearConfirm.value = false

  if (selectedThreadId.value) {
    const success = await threadsStore.clearThread(selectedThreadId.value)

    if (success) {
      messages.value = []
      sessionId.value = undefined

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
  handleInputChange(inputValue.value, cursorPosition)
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
    const newValue = selectHighlightedAccount(inputValue.value)
    if (newValue) {
      inputValue.value = newValue
      nextTick(() => {
        if (inputRef.value) {
          inputRef.value.focus()
          const length = inputValue.value.length
          inputRef.value.setSelectionRange(length, length)
        }
      })
    }
  } else if (event.key === 'Escape') {
    closeMentionDropdown()
  }
}

// Handle mention click
function handleMentionClick(account: any) {
  const newValue = selectAccount(account, inputValue.value)
  inputValue.value = newValue
  nextTick(() => {
    if (inputRef.value) {
      inputRef.value.focus()
      const length = inputValue.value.length
      inputRef.value.setSelectionRange(length, length)
    }
  })
}


// Handle message submission
async function handleSubmit() {
  if (!inputValue.value.trim() || isLoading.value) return

  const userMessage = inputValue.value.trim()
  const mentionedAccount = selectedAccountForMessage.value

  inputValue.value = ''
  clearSelectedAccount()

  // Add user message to UI
  messages.value.push({
    text: userMessage,
    sender: 'user',
    timestamp: new Date().toISOString()
  })

  nextTick(() => scrollToBottom())

  isLoading.value = true

  try {
    // Save user message to thread
    await threadsStore.addMessage({
      role: 'user',
      content: userMessage
    })

    // Call Strands API
    const requestBody: any = {
      message: userMessage,
      sessionId: sessionId.value,
      timezone: userTimezone.value
    }

    // Add mentioned account context if available
    if (mentionedAccount) {
      requestBody.mentionedAccount = {
        accountId: mentionedAccount.accountId,
        accountName: getAccountDisplay(mentionedAccount)
      }
    }

    const response = await $fetch('/api/strands/chat', {
      method: 'POST',
      body: requestBody
    })

    // Update session ID
    if (response.sessionId) {
      sessionId.value = response.sessionId
    }

    // Check for disambiguation
    if (response.needsDisambiguation) {
      showDisambiguation.value = true
      disambiguationData.value = response
      pendingMessage.value = userMessage
      isLoading.value = false
      return
    }

    // Extract response
    const botResponse = response.result || response.responseBody || 'No response received'

    // Add bot message to UI
    messages.value.push({
      text: botResponse,
      sender: 'bot',
      metadata: {
        accountId: response.metadata?.accountId || response.account_id,
        mcpUsed: response.metadata?.mcpUsed || response.mcp_used,
        mcpType: response.metadata?.mcpType
      },
      suggestedLinks: response.suggestedLinks || [],
      timestamp: new Date().toISOString()
    })

    // Save assistant message to thread
    await threadsStore.addMessage({
      role: 'assistant',
      content: botResponse,
      metadata: {
        accountId: response.metadata?.accountId || response.account_id,
        mcpUsed: response.metadata?.mcpUsed || response.mcp_used,
        mcpType: response.metadata?.mcpType
      },
      suggestedLinks: response.suggestedLinks
    })

    nextTick(() => scrollToBottom())
  } catch (error: any) {
    console.error('Error sending message:', error)

    messages.value.push({
      text: `Error: ${error.data?.error?.message || 'Failed to send message'}`,
      sender: 'bot',
      timestamp: new Date().toISOString()
    })

    toast.add({
      title: 'Failed to send message',
      description: error.data?.error?.message || 'Please try again',
      color: 'red'
    })
  } finally {
    isLoading.value = false
  }
}

// Handle account disambiguation
async function handleAccountSelected(accountId: string) {
  showDisambiguation.value = false

  if (!pendingMessage.value) return

  isLoading.value = true

  try {
    const response = await $fetch('/api/strands/chat', {
      method: 'POST',
      body: {
        message: pendingMessage.value,
        sessionId: sessionId.value,
        timezone: userTimezone.value,
        selectedAccountId: accountId
      }
    })

    const botResponse = response.result || response.responseBody || 'No response received'

    messages.value.push({
      text: botResponse,
      sender: 'bot',
      metadata: {
        accountId: response.metadata?.accountId || response.account_id,
        mcpUsed: response.metadata?.mcpUsed || response.mcp_used,
        mcpType: response.metadata?.mcpType
      },
      suggestedLinks: response.suggestedLinks || [],
      timestamp: new Date().toISOString()
    })

    await threadsStore.addMessage({
      role: 'assistant',
      content: botResponse,
      metadata: {
        accountId: response.metadata?.accountId || response.account_id,
        mcpUsed: response.metadata?.mcpUsed || response.mcp_used,
        mcpType: response.metadata?.mcpType
      },
      suggestedLinks: response.suggestedLinks
    })

    nextTick(() => scrollToBottom())
  } catch (error: any) {
    console.error('Error after disambiguation:', error)

    messages.value.push({
      text: `Error: ${error.data?.error?.message || 'Failed to send message'}`,
      sender: 'bot',
      timestamp: new Date().toISOString()
    })
  } finally {
    isLoading.value = false
    pendingMessage.value = ''
    disambiguationData.value = null
  }
}

function handleDisambiguationCancel() {
  showDisambiguation.value = false
  disambiguationData.value = null
  pendingMessage.value = ''
  isLoading.value = false
}
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
</style>
