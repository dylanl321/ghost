/**
 * Unified Chat UI Composable
 * Single source of truth for ALL chat UI logic across all views
 * (GhostChatFullPage, StrandsChatPopup, ChatThreadsSidebar)
 *
 * ARCHITECTURE:
 * - Uses useBackgroundPolling as the SINGLE polling system
 * - Registers callbacks for live UI updates when viewing a thread
 * - No local polling - all polling goes through background service
 */

import { ref, computed, watch, nextTick, readonly } from 'vue'
import { useChatThreadsStore } from '~/stores/useChatThreadsStore'
import { useBackgroundPolling, type PollingCallbacks } from './useBackgroundPolling'
import type { ChatMessage, StreamingChatMessage } from '~/shared/types/chat-threads'
import type { AWSEnclaveData } from '#shared/types/accounts'

// Chat state enum
export type ChatState = 'idle' | 'sending' | 'polling' | 'error'

// Options for the composable
export interface UseChatUIOptions {
  viewMode?: 'fullpage' | 'popup' | 'sidebar'
  initialGreeting?: string
}

// Suggested prompt type
export interface SuggestedPrompt {
  text: string
  type: 'question' | 'action' | 'clarification'
  priority: number
}

// Disambiguation data type
export interface DisambiguationData {
  search_term: string
  message: string
  matches: Array<{
    request_id: string
    account_alias: string
    display_name: string
    match_score: number
    match_reason: string
    govcloud_account_id?: string
    commercial_account_id?: string
  }>
}

export function useChatUI(options: UseChatUIOptions = {}) {
  const {
    viewMode = 'fullpage',
    initialGreeting = "Hello! I'm GHOST Chat, your AI assistant for AWS operations. I can help you with:\n\n• **Cost Analysis** - Query spending and forecasts\n• **Configuration** - Look up resource configurations\n• **Security** - Check security findings and compliance\n• **Resources** - List and analyze AWS resources\n\nClick any example below to get started, or ask your own question. For best results, be explicit about AWS account IDs."
  } = options

  // Get stores and services
  const threadsStore = useChatThreadsStore()
  const enclaveStore = useEnclaveStore()
  const backgroundPolling = useBackgroundPolling()

  // ============================================================================
  // CORE STATE
  // ============================================================================

  const chatState = ref<ChatState>('idle')
  const inputValue = ref('')
  const errorMessage = ref('')

  // Current job tracking (owned by background polling)
  const currentJobId = ref<string | null>(null)

  // UI-only polling display state (updated via callbacks)
  const pollingProgress = ref('Starting...')
  const pollingPercent = ref(0)
  const pollingToolsCalled = ref<string[]>([])
  const pollingStatusHistory = ref<Array<{ text: string; timestamp: number }>>([])

  // Session state
  const sessionId = ref<string | undefined>(undefined)
  const userTimezone = ref<string>(Intl.DateTimeFormat().resolvedOptions().timeZone)

  // Disambiguation state
  const showDisambiguation = ref(false)
  const disambiguationData = ref<DisambiguationData | null>(null)
  const pendingMessage = ref('')

  // Scroll trigger for components to react to
  const scrollTrigger = ref(0)

  // Pending message tracking (for UI only - not persisted)
  const pendingBotMessageId = ref<string | null>(null)

  // ============================================================================
  // MENTION SYSTEM STATE
  // ============================================================================

  const showMentionDropdown = ref(false)
  const mentionQuery = ref('')
  const mentionPosition = ref(0)
  const selectedAccountForMessage = ref<AWSEnclaveData | null>(null)
  const filteredAccounts = ref<AWSEnclaveData[]>([])
  const selectedMentionIndex = ref(0)

  // ============================================================================
  // COMPUTED STATE
  // ============================================================================

  // Messages from store - single source of truth
  const messages = computed(() => {
    const threadMessages = threadsStore.currentThread?.messages || []
    return threadMessages
  })

  // Welcome/examples visibility
  const showWelcome = computed(() => {
    const msgs = threadsStore.currentThread?.messages || []
    if (msgs.length === 0) return true
    if (msgs.length === 1 && msgs[0].role === 'assistant') return true
    return false
  })

  // Loading states
  const isLoading = computed(() => chatState.value === 'sending' || chatState.value === 'polling')
  const isPolling = computed(() => chatState.value === 'polling')
  const hasError = computed(() => chatState.value === 'error')

  // Check if there's a streaming/pending message to show inline loader
  const hasStreamingMessage = computed(() => {
    return messages.value.some(msg =>
      msg.status?.status === 'pending' || msg.status?.status === 'streaming'
    )
  })

  // Show separate loader only when no inline streaming indicator
  const showLoader = computed(() => isLoading.value && !hasStreamingMessage.value)

  // Current thread info
  const currentThread = computed(() => threadsStore.currentThread)
  const activeThreadId = computed(() => threadsStore.activeThreadId)

  // ============================================================================
  // MENTION SYSTEM METHODS
  // ============================================================================

  function searchAccounts(query: string): AWSEnclaveData[] {
    if (!query) {
      return Object.values(enclaveStore.enclaves || {}).slice(0, 10)
    }
    const lowerQuery = query.toLowerCase()
    const enclaves = Object.values(enclaveStore.enclaves || {})
    return enclaves
      .filter(e =>
        e.projectName?.toLowerCase().includes(lowerQuery) ||
        e.awsGovCloudAccountID?.includes(query) ||
        e.awsStandardAccountID?.includes(query) ||
        e.awsAccountEmail?.toLowerCase().includes(lowerQuery)
      )
      .slice(0, 10)
  }

  function handleMentionInput(value: string, cursorPosition: number): boolean {
    const textBeforeCursor = value.substring(0, cursorPosition)
    const lastAtIndex = textBeforeCursor.lastIndexOf('@')

    if (lastAtIndex === -1) {
      showMentionDropdown.value = false
      return false
    }

    const charBeforeAt = lastAtIndex > 0 ? textBeforeCursor[lastAtIndex - 1] : ' '
    const isValidMentionStart = charBeforeAt === ' ' || lastAtIndex === 0

    if (!isValidMentionStart) {
      showMentionDropdown.value = false
      return false
    }

    const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1)
    if (textAfterAt.includes(' ')) {
      showMentionDropdown.value = false
      return false
    }

    mentionQuery.value = textAfterAt
    mentionPosition.value = lastAtIndex
    filteredAccounts.value = searchAccounts(textAfterAt)
    selectedMentionIndex.value = 0
    showMentionDropdown.value = filteredAccounts.value.length > 0

    return true
  }

  function selectAccount(account: AWSEnclaveData): string {
    selectedAccountForMessage.value = account
    const beforeMention = inputValue.value.substring(0, mentionPosition.value)
    const afterMention = inputValue.value.substring(mentionPosition.value + mentionQuery.value.length + 1)
    const accountDisplay = account.projectName || account.accountId
    const newValue = `${beforeMention}@${accountDisplay} ${afterMention}`
    showMentionDropdown.value = false
    mentionQuery.value = ''
    inputValue.value = newValue
    return newValue
  }

  function navigateMentions(direction: 'up' | 'down') {
    if (!showMentionDropdown.value || filteredAccounts.value.length === 0) return
    if (direction === 'down') {
      selectedMentionIndex.value = Math.min(selectedMentionIndex.value + 1, filteredAccounts.value.length - 1)
    } else {
      selectedMentionIndex.value = Math.max(selectedMentionIndex.value - 1, 0)
    }
  }

  function selectHighlightedAccount(): string | null {
    if (!showMentionDropdown.value || filteredAccounts.value.length === 0) return null
    const account = filteredAccounts.value[selectedMentionIndex.value]
    return selectAccount(account)
  }

  function closeMentionDropdown() {
    showMentionDropdown.value = false
    mentionQuery.value = ''
    selectedMentionIndex.value = 0
  }

  function clearSelectedAccount() {
    selectedAccountForMessage.value = null
  }

  function getAccountDisplay(account: AWSEnclaveData): string {
    return account.projectName || account.accountId
  }

  function getAccountSubtitle(account: AWSEnclaveData): string {
    const parts = []
    if (account.awsStandardAccountID) parts.push(`Comm: ${account.awsStandardAccountID}`)
    if (account.awsGovCloudAccountID) parts.push(`Gov: ${account.awsGovCloudAccountID}`)
    return parts.join(' | ') || account.accountId
  }

  function setMentionIndex(index: number) {
    selectedMentionIndex.value = index
  }

  // ============================================================================
  // RECOVERY LOGIC
  // ============================================================================

  /**
   * Check for and recover any pending jobs when switching to a thread
   */
  async function checkAndRecoverPendingJob(): Promise<boolean> {
    const currentThreadId = threadsStore.activeThreadId
    if (!currentThreadId) return false

    // Check if background polling has jobs for this thread
    const activeJobs = backgroundPolling.getJobsForThread(currentThreadId)
    if (activeJobs.length === 0) return false

    const job = activeJobs[0]
    console.log('[useChatUI] Recovering pending job:', job.jobId)

    // Update UI state
    currentJobId.value = job.jobId
    chatState.value = 'polling'
    pollingProgress.value = job.progress || 'Processing...'
    pollingPercent.value = job.progressPercent || 0
    pollingToolsCalled.value = job.toolsCalled || []

    // Check if there's already a pending message in the thread
    const threadMessages = threadsStore.currentThread?.messages || []
    const hasPending = threadMessages.some(m =>
      m.status?.status === 'pending' || m.status?.status === 'streaming'
    )

    if (!hasPending) {
      // Add a pending message placeholder for the recovered job
      const pendingBotMessage: ChatMessage = {
        messageId: `recovered-${Date.now()}`,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        status: {
          status: 'pending',
          progress: job.progress || 'Recovering...',
          toolsCalled: job.toolsCalled || [],
          statusHistory: job.statusHistory || []
        },
        streamBuffer: ''
      }

      if (threadsStore.currentThread?.messages) {
        threadsStore.currentThread.messages.push(pendingBotMessage)
      }
    }

    // Register callbacks for live UI updates
    backgroundPolling.registerJobCallbacks(job.jobId, {
      onProgress: handlePollingProgress,
      onComplete: handlePollingComplete,
      onError: handlePollingError
    })

    return true
  }

  // ============================================================================
  // POLLING CALLBACK HANDLERS
  // ============================================================================

  /**
   * Handle progress updates from background polling
   */
  function handlePollingProgress(jobId: string, progress: string, percent: number, tools: string[]) {
    console.log('[useChatUI] Progress update:', jobId, progress, percent)

    // Track status history
    if (pollingProgress.value && progress !== pollingProgress.value) {
      pollingStatusHistory.value.push({
        text: pollingProgress.value,
        timestamp: Date.now()
      })
      // Keep only last 5
      if (pollingStatusHistory.value.length > 5) {
        pollingStatusHistory.value.shift()
      }
    }

    // Update UI state
    pollingProgress.value = progress
    pollingPercent.value = percent
    pollingToolsCalled.value = tools

    // Update pending message in UI
    updatePendingMessageStatus(progress, tools)
    scrollTrigger.value++
  }

  /**
   * Handle job completion from background polling
   */
  function handlePollingComplete(
    jobId: string,
    response: string,
    metadata: any,
    suggestedLinks?: any[],
    suggestedPrompts?: any[]
  ) {
    console.log('[useChatUI] Job complete:', jobId)

    // Find and update the pending message
    const threadMessages = threadsStore.currentThread?.messages || []
    const pendingIndex = threadMessages.findIndex(m =>
      m.status?.status === 'pending' || m.status?.status === 'streaming'
    )

    if (pendingIndex !== -1) {
      // Update the pending message to show the response
      threadMessages[pendingIndex].content = response
      threadMessages[pendingIndex].metadata = metadata
      threadMessages[pendingIndex].suggestedLinks = suggestedLinks || []
      threadMessages[pendingIndex].suggestedPrompts = suggestedPrompts || []
      threadMessages[pendingIndex].status = { status: 'complete' }
      delete threadMessages[pendingIndex].streamBuffer
    }

    // Reset state
    chatState.value = 'idle'
    currentJobId.value = null
    pendingBotMessageId.value = null
    pollingProgress.value = 'Starting...'
    pollingPercent.value = 0
    pollingToolsCalled.value = []
    pollingStatusHistory.value = []
    errorMessage.value = ''

    // Trigger scroll
    scrollTrigger.value++

    // Reload thread to get fresh data from server
    if (threadsStore.activeThreadId) {
      threadsStore.loadThread(threadsStore.activeThreadId)
    }
  }

  /**
   * Handle job error from background polling
   */
  function handlePollingError(jobId: string, error: string) {
    console.error('[useChatUI] Job error:', jobId, error)

    // Check for disambiguation
    if (error.includes('Multiple accounts found matching')) {
      const disambig = parseDisambiguationError(error)
      if (disambig) {
        showDisambiguation.value = true
        disambiguationData.value = disambig
        // Keep polling state, waiting for user selection
        return
      }
    }

    // Find and update the pending message
    const threadMessages = threadsStore.currentThread?.messages || []
    const pendingIndex = threadMessages.findIndex(m =>
      m.status?.status === 'pending' || m.status?.status === 'streaming'
    )

    if (pendingIndex !== -1) {
      threadMessages[pendingIndex].content = `❌ ${error}`
      threadMessages[pendingIndex].status = { status: 'error', error }
    }

    // Reset state
    chatState.value = 'error'
    errorMessage.value = error
    currentJobId.value = null
    pendingBotMessageId.value = null
    pollingProgress.value = 'Starting...'
    pollingPercent.value = 0
    pollingToolsCalled.value = []
    pollingStatusHistory.value = []

    scrollTrigger.value++
  }

  /**
   * Update the pending message status for UI display
   */
  function updatePendingMessageStatus(progress: string, tools: string[]) {
    const threadMessages = threadsStore.currentThread?.messages || []
    const pendingMsg = threadMessages.find(m =>
      m.status?.status === 'pending' || m.status?.status === 'streaming'
    )

    if (pendingMsg && pendingMsg.status) {
      pendingMsg.status.progress = progress
      pendingMsg.status.toolsCalled = tools
      pendingMsg.status.statusHistory = [...pollingStatusHistory.value]
    }
  }

  /**
   * Parse disambiguation error to extract account matches
   */
  function parseDisambiguationError(errorMsg: string): DisambiguationData | null {
    try {
      const match = errorMsg.match(/\[(.*?)\]/)
      if (match) {
        const accountsStr = match[1]
        const accountNames = accountsStr.split(',').map((a: string) =>
          a.trim().replace(/'/g, '').replace(/"/g, '')
        )

        return {
          search_term: 'account',
          message: errorMsg,
          matches: accountNames.map((name: string, idx: number) => ({
            request_id: `match-${idx}`,
            account_alias: name,
            display_name: name,
            match_score: 1,
            match_reason: 'partial match'
          }))
        }
      }
    } catch {
      // Ignore parsing errors
    }
    return null
  }

  // ============================================================================
  // CORE ACTIONS
  // ============================================================================

  async function sendMessage(text?: string): Promise<void> {
    const messageText = text || inputValue.value
    if (!messageText.trim() || isLoading.value) return

    const userInput = messageText.trim()
    const mentionedAccount = selectedAccountForMessage.value

    console.log('[useChatUI] Sending message:', userInput.substring(0, 50))

    // Reset input immediately
    inputValue.value = ''
    clearSelectedAccount()
    closeMentionDropdown()
    errorMessage.value = ''
    chatState.value = 'sending'

    try {
      // Auto-create thread if needed
      if (!threadsStore.activeThreadId) {
        console.log('[useChatUI] Creating new thread')
        await threadsStore.createThread()
      }

      const currentThreadId = threadsStore.activeThreadId!

      // Add user message to store immediately
      await threadsStore.addMessage({
        role: 'user',
        content: userInput,
        metadata: mentionedAccount ? {
          accountId: mentionedAccount.accountId,
          accountName: getAccountDisplay(mentionedAccount)
        } : undefined
      })
      scrollTrigger.value++

      // Create pending bot message placeholder for UI display
      const pendingMsgId = `pending-${Date.now()}`
      pendingBotMessageId.value = pendingMsgId
      const pendingBotMessage: ChatMessage = {
        messageId: pendingMsgId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        status: {
          status: 'pending',
          progress: 'Starting...',
          toolsCalled: [],
          statusHistory: []
        },
        streamBuffer: ''
      }

      // Add pending message to thread for display
      if (threadsStore.currentThread?.messages) {
        threadsStore.currentThread.messages.push(pendingBotMessage)
      }
      scrollTrigger.value++

      // Get conversation history (exclude pending messages)
      const conversationHistory = (threadsStore.currentThread?.messages || [])
        .filter(m => !m.status || m.status.status === 'complete')
        .slice(-10)
        .map(m => ({
          role: m.role === 'user' ? 'user' as const : 'assistant' as const,
          content: m.content
        }))

      // Get active enclave for context
      const activeEnclave = enclaveStore.activeEnclave

      console.log('[useChatUI] Submitting async query')

      // Submit async query
      const response = await $fetch('/api/strands/chat/async', {
        method: 'POST',
        body: {
          message: userInput,
          accountIdentifier: mentionedAccount?.accountId || activeEnclave?.id,
          conversationHistory,
          timezone: userTimezone.value
        }
      }) as any

      console.log('[useChatUI] Async query response:', response)

      if (!response.success || !response.jobId) {
        throw new Error(response.error || 'Failed to submit query')
      }

      currentJobId.value = response.jobId
      pendingMessage.value = userInput
      chatState.value = 'polling'

      // Reset polling UI state
      pollingProgress.value = 'Starting...'
      pollingPercent.value = 0
      pollingToolsCalled.value = []
      pollingStatusHistory.value = []

      // Register with background polling service
      backgroundPolling.registerJob(response.jobId, currentThreadId, userInput)

      // Register callbacks for live UI updates
      backgroundPolling.registerJobCallbacks(response.jobId, {
        onProgress: handlePollingProgress,
        onComplete: handlePollingComplete,
        onError: handlePollingError
      })

      console.log('[useChatUI] Registered callbacks for job:', response.jobId)

    } catch (error: any) {
      console.error('[useChatUI] Error sending message:', error)
      await handleJobError(error.message || 'Failed to send message')
    }
  }

  async function retryLastMessage(): Promise<void> {
    // Find the last user message
    const threadMessages = threadsStore.currentThread?.messages || []
    const lastUserMsg = [...threadMessages].reverse().find(m => m.role === 'user')

    if (!lastUserMsg) {
      console.warn('[useChatUI] No user message to retry')
      return
    }

    // Remove error message if present
    const errorIndex = threadMessages.findIndex(m => m.status?.status === 'error')
    if (errorIndex !== -1) {
      threadMessages.splice(errorIndex, 1)
    }

    // Reset error state
    errorMessage.value = ''
    chatState.value = 'idle'

    // Resend the message
    await sendMessage(lastUserMsg.content)
  }

  async function cancelQuery(): Promise<void> {
    console.log('[useChatUI] Canceling query')

    // Unregister callbacks and job from background polling
    if (currentJobId.value) {
      backgroundPolling.unregisterJobCallbacks(currentJobId.value)
      backgroundPolling.unregisterJob(currentJobId.value)

      // Cancel on server
      try {
        await $fetch(`/api/strands/chat/async/${currentJobId.value}/cancel`, {
          method: 'POST'
        })
      } catch (err) {
        console.warn('[useChatUI] Failed to cancel on server:', err)
      }
    }

    // Find pending message and update to canceled
    const threadMessages = threadsStore.currentThread?.messages || []
    const pendingIndex = threadMessages.findIndex(m =>
      m.status?.status === 'pending' || m.status?.status === 'streaming'
    )
    if (pendingIndex !== -1) {
      threadMessages[pendingIndex].content = '⚠️ Query canceled by user'
      threadMessages[pendingIndex].status = { status: 'error', error: 'Canceled' }
    }

    // Reset state
    chatState.value = 'idle'
    currentJobId.value = null
    pendingBotMessageId.value = null
    pollingProgress.value = 'Starting...'
    pollingPercent.value = 0
    pollingToolsCalled.value = []
    pollingStatusHistory.value = []
    errorMessage.value = ''
    scrollTrigger.value++
  }

  async function clearConversation(): Promise<void> {
    if (threadsStore.activeThreadId) {
      await threadsStore.clearThread(threadsStore.activeThreadId)
    }
    chatState.value = 'idle'
    errorMessage.value = ''
    scrollTrigger.value++
  }

  // ============================================================================
  // DISAMBIGUATION HANDLERS
  // ============================================================================

  async function handleAccountSelected(accountId: string): Promise<void> {
    showDisambiguation.value = false
    const messageToSend = pendingMessage.value
    disambiguationData.value = null
    pendingMessage.value = ''

    // Resend with account context
    await sendMessage(`[Account: ${accountId}] ${messageToSend}`)
  }

  function cancelDisambiguation(): void {
    showDisambiguation.value = false
    disambiguationData.value = null
    pendingMessage.value = ''
    chatState.value = 'idle'

    // Remove pending message
    const threadMessages = threadsStore.currentThread?.messages
    if (threadMessages) {
      const pendingIndex = threadMessages.findIndex(m =>
        m.status?.status === 'pending' || m.status?.status === 'streaming'
      )
      if (pendingIndex !== -1) {
        threadMessages.splice(pendingIndex, 1)
      }
    }
  }

  // ============================================================================
  // THREAD MANAGEMENT
  // ============================================================================

  async function switchThread(threadId: string): Promise<void> {
    const oldJobId = currentJobId.value

    // Unregister callbacks if we had an active job (polling continues in background)
    if (oldJobId) {
      console.log('[useChatUI] Unregistering callbacks for job:', oldJobId)
      backgroundPolling.unregisterJobCallbacks(oldJobId)
    }

    // Reset LOCAL state (polling continues in background)
    chatState.value = 'idle'
    currentJobId.value = null
    pendingBotMessageId.value = null
    pollingProgress.value = 'Starting...'
    pollingPercent.value = 0
    pollingToolsCalled.value = []
    pollingStatusHistory.value = []
    errorMessage.value = ''

    // Load new thread
    await threadsStore.loadThread(threadId)
    scrollTrigger.value++

    // Check for pending job recovery in the new thread
    await checkAndRecoverPendingJob()
  }

  async function createNewThread(): Promise<void> {
    // Unregister callbacks if we had an active job
    if (currentJobId.value) {
      backgroundPolling.unregisterJobCallbacks(currentJobId.value)
    }

    // Reset ALL state including polling display state
    chatState.value = 'idle'
    currentJobId.value = null
    pendingBotMessageId.value = null
    pollingProgress.value = 'Starting...'
    pollingPercent.value = 0
    pollingToolsCalled.value = []
    pollingStatusHistory.value = []
    errorMessage.value = ''

    await threadsStore.createThread()
    scrollTrigger.value++
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  async function initialize(): Promise<void> {
    console.log('[useChatUI] Initializing...')
    await threadsStore.fetchThreads()

    if (threadsStore.activeThreadId) {
      await threadsStore.loadThread(threadsStore.activeThreadId)
    }

    // Check for pending job recovery on initialization
    await checkAndRecoverPendingJob()

    console.log('[useChatUI] Initialization complete')
  }

  // ============================================================================
  // CLEANUP ON UNMOUNT
  // ============================================================================

  onUnmounted(() => {
    // Unregister callbacks but don't stop polling (background continues)
    if (currentJobId.value) {
      backgroundPolling.unregisterJobCallbacks(currentJobId.value)
    }
  })

  // ============================================================================
  // RETURN PUBLIC API
  // ============================================================================

  return {
    // Core state
    messages: readonly(messages),
    chatState: readonly(chatState),
    inputValue,
    showWelcome: readonly(showWelcome),
    isLoading: readonly(isLoading),
    isPolling: readonly(isPolling),
    hasError: readonly(hasError),
    errorMessage: readonly(errorMessage),
    showLoader: readonly(showLoader),
    scrollTrigger: readonly(scrollTrigger),

    // Polling state
    pollingProgress: readonly(pollingProgress),
    pollingPercent: readonly(pollingPercent),
    pollingToolsCalled: readonly(pollingToolsCalled),

    // Core actions
    sendMessage,
    retryLastMessage,
    cancelQuery,
    clearConversation,

    // Mention system
    showMentionDropdown: readonly(showMentionDropdown),
    filteredAccounts: readonly(filteredAccounts),
    selectedAccountForMessage: readonly(selectedAccountForMessage),
    selectedMentionIndex: readonly(selectedMentionIndex),
    handleMentionInput,
    selectAccount,
    navigateMentions,
    selectHighlightedAccount,
    closeMentionDropdown,
    clearSelectedAccount,
    getAccountDisplay,
    getAccountSubtitle,
    setMentionIndex,

    // Disambiguation
    showDisambiguation: readonly(showDisambiguation),
    disambiguationData: readonly(disambiguationData),
    handleAccountSelected,
    cancelDisambiguation,

    // Thread management
    currentThread: readonly(currentThread),
    activeThreadId: readonly(activeThreadId),
    switchThread,
    createNewThread,
    initialize,

    // Session
    sessionId: readonly(sessionId),
    userTimezone: readonly(userTimezone)
  }
}
