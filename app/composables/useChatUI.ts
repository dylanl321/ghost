/**
 * Unified Chat UI Composable
 * Single source of truth for ALL chat UI logic across all views
 * (GhostChatFullPage, StrandsChatPopup, ChatThreadsSidebar)
 *
 * ARCHITECTURE:
 * - Uses useBackgroundPolling as the SINGLE polling system
 * - Registers callbacks for live UI updates when viewing a thread
 * - No local polling - all polling goes through background service
 * - SHARED STATE: Core polling/loading state is shared across all instances
 *   to prevent state leakage between components
 */

import { ref, computed, nextTick, readonly, onUnmounted, reactive } from 'vue'
import { useChatThreadsStore } from '~/stores/useChatThreadsStore'
import { useBackgroundPolling, type PollingCallbacks } from './useBackgroundPolling'
import type { ChatMessage, StreamingChatMessage, SuggestedPrompt } from '~/shared/types/chat-threads'
import type { AWSEnclaveData } from '#shared/types/accounts'

// Chat state enum
export type ChatState = 'idle' | 'sending' | 'polling' | 'error' | 'canceled'

// Import error type from shared types
import type { ErrorType } from '#shared/types/chat-threads'

/**
 * Enhanced error classification system
 * Categorizes errors by type to provide appropriate user messaging and recovery actions
 */
function classifyError(error: string): ErrorType {
  const lowerError = error.toLowerCase()

  // Timeout errors
  if (lowerError.includes('timeout') ||
    lowerError.includes('timed out') ||
    lowerError.includes('request timeout') ||
    lowerError.includes('gateway timeout')) {
    return 'timeout'
  }

  // Network errors
  if (lowerError.includes('network') ||
    lowerError.includes('connection') ||
    lowerError.includes('fetch failed') ||
    lowerError.includes('network error') ||
    lowerError.includes('connection refused') ||
    lowerError.includes('connection reset') ||
    lowerError.includes('dns') ||
    lowerError.includes('unreachable')) {
    return 'network'
  }

  // Disambiguation errors
  if (lowerError.includes('multiple accounts') ||
    lowerError.includes('disambiguation') ||
    lowerError.includes('ambiguous') ||
    lowerError.includes('which account') ||
    lowerError.includes('clarify account')) {
    return 'disambiguation'
  }

  // Server errors
  if (lowerError.includes('server error') ||
    lowerError.includes('internal error') ||
    lowerError.includes('500') ||
    lowerError.includes('502') ||
    lowerError.includes('503') ||
    lowerError.includes('504') ||
    lowerError.includes('internal server error') ||
    lowerError.includes('service unavailable')) {
    return 'server'
  }

  return 'unknown'
}

/**
 * Get user-friendly error icon for display
 */
function getErrorIcon(errorType: ErrorType): string {
  const iconMap = {
    timeout: 'i-heroicons-clock',
    network: 'i-heroicons-wifi',
    disambiguation: 'i-heroicons-question-mark-circle',
    server: 'i-heroicons-exclamation-triangle',
    unknown: 'i-heroicons-exclamation-triangle'
  }
  return iconMap[errorType]
}

/**
 * Get user-friendly error title for display
 */
function getErrorTitle(error: string, errorType?: ErrorType): string {
  const type = errorType || classifyError(error)
  const titleMap = {
    timeout: 'Request Timed Out',
    network: 'Connection Error',
    disambiguation: 'Account Clarification Needed',
    server: 'Server Error',
    unknown: 'An Error Occurred'
  }
  return titleMap[type]
}

/**
 * Get user-friendly error description with actionable guidance
 */
function getErrorDescription(error: string, errorType?: ErrorType): string {
  const type = errorType || classifyError(error)
  const descriptionMap = {
    timeout: 'The query took too long to complete. Please try again or simplify your request.',
    network: 'Unable to connect to the server. Please check your connection and try again.',
    disambiguation: 'Multiple accounts match your query. Please select the specific account you meant.',
    server: 'An internal server error occurred. Please try again in a moment.',
    unknown: error
  }
  return descriptionMap[type]
}

/**
 * Get appropriate action text for error type
 */
function getErrorActionText(errorType: ErrorType): string {
  const actionMap = {
    timeout: 'Retry',
    network: 'Retry',
    disambiguation: 'Select Account',
    server: 'Retry',
    unknown: 'Retry'
  }
  return actionMap[errorType]
}

// ============================================================================
// SHARED PER-THREAD UI STATE (supports multiple concurrent jobs across threads)
// ============================================================================

interface ThreadUIState {
  chatState: ChatState
  currentJobId: string | null
  pollingProgress: string
  pollingPercent: number
  pollingToolsCalled: string[]
  pollingStatusHistory: Array<{ text: string; timestamp: number }>
  pendingBotMessageId: string | null
  errorMessage: string
  inputValue: string
}

function createDefaultThreadUIState(): ThreadUIState {
  return {
    chatState: 'idle',
    currentJobId: null,
    pollingProgress: 'Starting...',
    pollingPercent: 0,
    pollingToolsCalled: [],
    pollingStatusHistory: [],
    pendingBotMessageId: null,
    errorMessage: '',
    inputValue: ''
  }
}

const threadUiStates = reactive<Record<string, ThreadUIState>>({})

function getThreadUiState(threadId: string): ThreadUIState {
  if (!threadUiStates[threadId]) {
    threadUiStates[threadId] = createDefaultThreadUIState()
  }
  return threadUiStates[threadId]
}

function resetThreadUiState(threadId: string) {
  Object.assign(getThreadUiState(threadId), createDefaultThreadUIState())
}

/**
 * Pending placeholders must survive thread loads/switches.
 * We keep a lightweight in-memory registry keyed by threadId+jobId and re-inject
 * them into the viewed thread when needed.
 */
const pendingPlaceholdersByThread = new Map<string, Map<string, StreamingChatMessage>>()

function getPendingMap(threadId: string): Map<string, StreamingChatMessage> {
  let m = pendingPlaceholdersByThread.get(threadId)
  if (!m) {
    m = new Map()
    pendingPlaceholdersByThread.set(threadId, m)
  }
  return m
}

function ensurePlaceholderForJob(threadId: string, jobId: string, initial?: Partial<StreamingChatMessage>): StreamingChatMessage {
  const map = getPendingMap(threadId)
  const existing = map.get(jobId)
  if (existing) {
    // Refresh display fields from latest polling state (useful when re-entering a thread)
    if (initial?.timestamp) existing.timestamp = initial.timestamp
    if (initial?.content !== undefined) existing.content = initial.content
    if (existing.status && initial?.status) {
      existing.status.progress = initial.status.progress ?? existing.status.progress
      existing.status.toolsCalled = initial.status.toolsCalled ?? existing.status.toolsCalled
        ; (existing.status as any).statusHistory = (initial.status as any)?.statusHistory ?? (existing.status as any).statusHistory
      existing.status.jobId = jobId
    }
    return existing
  }

  const msg: StreamingChatMessage = {
    messageId: initial?.messageId || `pending-${jobId}`,
    role: 'assistant',
    content: initial?.content || '',
    timestamp: initial?.timestamp || new Date().toISOString(),
    status: {
      status: 'pending',
      jobId,
      progress: initial?.status?.progress || 'Starting...',
      toolsCalled: initial?.status?.toolsCalled || [],
      statusHistory: (initial?.status as any)?.statusHistory || []
    },
    streamBuffer: initial?.streamBuffer || ''
  }

  map.set(jobId, msg)
  return msg
}

function removePlaceholder(threadId: string, jobId: string) {
  const map = pendingPlaceholdersByThread.get(threadId)
  map?.delete(jobId)
  if (map && map.size === 0) pendingPlaceholdersByThread.delete(threadId)
}

// Options for the composable
export interface UseChatUIOptions {
  viewMode?: 'fullpage' | 'popup' | 'sidebar'
  initialGreeting?: string
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
  // CORE STATE (thread-aware; shared across instances via module-scope registry)
  // ============================================================================

  const activeThreadId = computed(() => threadsStore.activeThreadId)
  const currentThread = computed(() => threadsStore.currentThread)

  const chatState = computed<ChatState>({
    get: () => {
      const id = threadsStore.activeThreadId
      if (!id) return 'idle'
      return getThreadUiState(id).chatState
    },
    set: (value) => {
      const id = threadsStore.activeThreadId
      if (!id) return
      getThreadUiState(id).chatState = value

      // Emit state change event for cross-view synchronization
      if (process.client) {
        window.dispatchEvent(new CustomEvent('chat-state-changed', {
          detail: { threadId: id, chatState: value }
        }))
      }
    }
  })

  const errorMessage = computed<string>({
    get: () => {
      const id = threadsStore.activeThreadId
      if (!id) return ''
      return getThreadUiState(id).errorMessage
    },
    set: (value) => {
      const id = threadsStore.activeThreadId
      if (!id) return
      getThreadUiState(id).errorMessage = value
    }
  })

  const currentJobId = computed<string | null>({
    get: () => {
      const id = threadsStore.activeThreadId
      if (!id) return null
      return getThreadUiState(id).currentJobId
    },
    set: (value) => {
      const id = threadsStore.activeThreadId
      if (!id) return
      getThreadUiState(id).currentJobId = value
    }
  })

  const pollingProgress = computed<string>({
    get: () => {
      const id = threadsStore.activeThreadId
      if (!id) return 'Starting...'
      return getThreadUiState(id).pollingProgress
    },
    set: (value) => {
      const id = threadsStore.activeThreadId
      if (!id) return
      getThreadUiState(id).pollingProgress = value
    }
  })

  const pollingPercent = computed<number>({
    get: () => {
      const id = threadsStore.activeThreadId
      if (!id) return 0
      return getThreadUiState(id).pollingPercent
    },
    set: (value) => {
      const id = threadsStore.activeThreadId
      if (!id) return
      getThreadUiState(id).pollingPercent = value
    }
  })

  const pollingToolsCalled = computed<string[]>({
    get: () => {
      const id = threadsStore.activeThreadId
      if (!id) return []
      return getThreadUiState(id).pollingToolsCalled
    },
    set: (value) => {
      const id = threadsStore.activeThreadId
      if (!id) return
      getThreadUiState(id).pollingToolsCalled = value
    }
  })

  const pollingStatusHistory = computed<Array<{ text: string; timestamp: number }>>({
    get: () => {
      const id = threadsStore.activeThreadId
      if (!id) return []
      return getThreadUiState(id).pollingStatusHistory
    },
    set: (value) => {
      const id = threadsStore.activeThreadId
      if (!id) return
      getThreadUiState(id).pollingStatusHistory = value
    }
  })

  const pendingBotMessageId = computed<string | null>({
    get: () => {
      const id = threadsStore.activeThreadId
      if (!id) return null
      return getThreadUiState(id).pendingBotMessageId
    },
    set: (value) => {
      const id = threadsStore.activeThreadId
      if (!id) return
      getThreadUiState(id).pendingBotMessageId = value
    }
  })

  // Input value is now shared across views via thread UI state
  const inputValue = computed<string>({
    get: () => {
      const id = threadsStore.activeThreadId
      if (!id) return ''
      return getThreadUiState(id).inputValue
    },
    set: (value) => {
      const id = threadsStore.activeThreadId
      if (!id) return
      getThreadUiState(id).inputValue = value

      // Emit input change event for cross-view synchronization
      if (process.client) {
        window.dispatchEvent(new CustomEvent('chat-input-changed', {
          detail: { threadId: id, inputValue: value }
        }))
      }
    }
  })

  // Session state
  const sessionId = ref<string | undefined>(undefined)
  const userTimezone = ref<string>(Intl.DateTimeFormat().resolvedOptions().timeZone)

  // Cross-view synchronization trigger
  const syncTrigger = ref(0)

  // Disambiguation state
  const showDisambiguation = ref(false)
  const disambiguationData = ref<DisambiguationData | null>(null)
  const pendingMessage = ref('')

  // Scroll trigger for components to react to
  const scrollTrigger = ref(0)

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
  const isPolling = computed(() => {
    const id = threadsStore.activeThreadId
    if (!id) return false
    return backgroundPolling.hasActiveJobsForThread(id)
  })
  const isLoading = computed(() => chatState.value === 'sending' || isPolling.value)
  const hasError = computed(() => chatState.value === 'error')

  // Check if there's a streaming/pending message to show inline loader
  const hasStreamingMessage = computed(() => {
    return messages.value.some(msg =>
      msg.status?.status === 'pending' || msg.status?.status === 'streaming'
    )
  })

  // Show separate loader only when no inline streaming indicator
  const showLoader = computed(() => isLoading.value && !hasStreamingMessage.value)

  // Current thread info (already computed above)

  // ============================================================================
  // MENTION SYSTEM METHODS
  // ============================================================================

  function searchAccounts(query: string): AWSEnclaveData[] {
    const enclaves = Object.values(enclaveStore.enclaves || {})

    // Filter out decommissioned accounts
    const activeEnclaves = enclaves.filter(e => {
      const enclaveStatus = (e.enclaveStatus || '').toLowerCase()
      const accountStatus = (e.accountStatus || '').toLowerCase()
      return !enclaveStatus.includes('decommission') &&
        !accountStatus.includes('decommission')
    })

    // Require at least 1 character to search (search-first UX)
    if (!query || query.length === 0) {
      return []
    }

    const lowerQuery = query.toLowerCase()
    return activeEnclaves
      .filter(e =>
        e.projectName?.toLowerCase().includes(lowerQuery) ||
        e.awsGovCloudAccountID?.includes(query) ||
        e.awsStandardAccountID?.includes(query) ||
        e.awsAccountEmail?.toLowerCase().includes(lowerQuery)
      )
      .sort((a, b) => (a.projectName || '').localeCompare(b.projectName || ''))
      .slice(0, 25)
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
    // Always show dropdown when @ is typed (to show search hint or results)
    showMentionDropdown.value = true

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
    const threadId = threadsStore.activeThreadId
    if (!threadId) return false

    const jobs = backgroundPolling.getJobsForThread(threadId).filter(j => j.status === 'polling')
    if (jobs.length === 0) {
      // Ensure UI state is not stuck if we have no active jobs
      // Also remove any stale placeholders for this thread.
      pendingPlaceholdersByThread.delete(threadId)
      const threadMessages = threadsStore.currentThread?.messages
      if (threadMessages && threadsStore.currentThread?.threadId === threadId) {
        for (let i = threadMessages.length - 1; i >= 0; i--) {
          const s = (threadMessages[i] as any)?.status
          if (s && (s.status === 'pending' || s.status === 'streaming')) {
            threadMessages.splice(i, 1)
          }
        }
      }
      resetThreadUiState(threadId)
      return false
    }

    // Ensure placeholders exist for all active jobs for this thread
    for (const job of jobs) {
      const placeholder = ensurePlaceholderForJob(threadId, job.jobId, {
        timestamp: new Date(job.timestamp).toISOString(),
        status: {
          status: 'pending',
          jobId: job.jobId,
          progress: job.progress || 'Processing...',
          toolsCalled: job.toolsCalled || [],
          statusHistory: job.statusHistory || []
        } as any
      })

      // Inject placeholder into currently viewed thread if not present
      const threadMessages = threadsStore.currentThread?.messages
      if (threadMessages) {
        const alreadyInThread = threadMessages.some(m =>
          (m as any)?.status?.jobId === job.jobId &&
          ((m as any)?.status?.status === 'pending' || (m as any)?.status?.status === 'streaming')
        )
        if (!alreadyInThread) {
          // Reuse the same placeholder object so updates remain consistent
          threadMessages.push(placeholder as any)
        }
      }

      // Register callbacks for live UI updates while this thread is being viewed
      backgroundPolling.registerJobCallbacks(job.jobId, {
        onProgress: handlePollingProgress,
        onComplete: handlePollingComplete,
        onError: handlePollingError
      })
    }

    // Use most recent job for the shared "progress bar" UI
    const mostRecentJob = [...jobs].sort((a, b) => b.timestamp - a.timestamp)[0]
    currentJobId.value = mostRecentJob.jobId
    chatState.value = 'polling'
    pollingProgress.value = mostRecentJob.progress || 'Processing...'
    pollingPercent.value = mostRecentJob.progressPercent || 0
    pollingToolsCalled.value = mostRecentJob.toolsCalled || []

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
    const threadId = threadsStore.activeThreadId
    if (!threadId) return

    // Update the placeholder for this job regardless of which job is "current"
    updatePendingMessageStatus(jobId, progress, tools)

    // Only the most-recent/active job drives the shared polling UI
    if (currentJobId.value === jobId) {
      if (pollingProgress.value && progress !== pollingProgress.value) {
        pollingStatusHistory.value.push({
          text: pollingProgress.value,
          timestamp: Date.now()
        })
        if (pollingStatusHistory.value.length > 5) {
          pollingStatusHistory.value.shift()
        }
      }

      pollingProgress.value = progress
      pollingPercent.value = percent
      pollingToolsCalled.value = tools
    }

    // Emit progress update event for cross-view synchronization
    if (process.client) {
      window.dispatchEvent(new CustomEvent('chat-progress-update', {
        detail: { threadId, jobId, progress, percent, tools }
      }))
    }

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
      (m as any)?.status?.jobId === jobId &&
      (((m as any)?.status?.status === 'pending') || ((m as any)?.status?.status === 'streaming'))
    )

    if (pendingIndex !== -1) {
      // Update the pending message to show the response
      threadMessages[pendingIndex].content = response
      threadMessages[pendingIndex].metadata = metadata
      threadMessages[pendingIndex].suggestedLinks = suggestedLinks || []
      threadMessages[pendingIndex].suggestedPrompts = suggestedPrompts || []
        ; (threadMessages[pendingIndex] as any).status = { status: 'complete', jobId }
      delete (threadMessages[pendingIndex] as any).streamBuffer
    } else {
      // No pending message found - add the response directly
      // This can happen if the thread was reloaded during polling
      console.log('[useChatUI] No pending message found, adding response directly')
      if (threadsStore.currentThread?.messages) {
        threadsStore.currentThread.messages.push({
          messageId: `response-${Date.now()}`,
          role: 'assistant',
          content: response,
          timestamp: new Date().toISOString(),
          metadata,
          suggestedLinks: suggestedLinks || [],
          suggestedPrompts: suggestedPrompts || []
        } as any)
      }
    }

    // Cleanup placeholder registry for this job
    const threadId = threadsStore.activeThreadId
    if (threadId) {
      removePlaceholder(threadId, jobId)
    }

    // If this was the active job for the viewed thread, reset thread UI state.
    if (currentJobId.value === jobId && threadId) {
      resetThreadUiState(threadId)
    }

    // Emit completion event for cross-view synchronization
    if (process.client && threadId) {
      window.dispatchEvent(new CustomEvent('chat-job-complete', {
        detail: { threadId, jobId, response, metadata, suggestedLinks, suggestedPrompts }
      }))
    }

    // Trigger scroll
    scrollTrigger.value++

    // NOTE: Don't reload thread here - the message is being saved by useBackgroundPolling
    // and there's a race condition. The local update above is sufficient for UI display.
    // The message will be persisted by useBackgroundPolling.handleJobComplete() via API.
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
      (m as any)?.status?.jobId === jobId &&
      (((m as any)?.status?.status === 'pending') || ((m as any)?.status?.status === 'streaming'))
    )

    if (pendingIndex !== -1) {
      const errorType = classifyError(error)
      // Update message content to show user-friendly error message
      threadMessages[pendingIndex].content = `Error: ${getErrorTitle(error, errorType)}`
        ; (threadMessages[pendingIndex] as any).status = {
          status: 'error',
          error,
          errorType,
          jobId,
          // Preserve any existing status history
          statusHistory: (threadMessages[pendingIndex] as any)?.status?.statusHistory || []
        }
    }

    const threadId = threadsStore.activeThreadId
    if (threadId) {
      removePlaceholder(threadId, jobId)
    }

    // Only set global error UI if this was the active job for the viewed thread
    if (currentJobId.value === jobId) {
      chatState.value = 'error'
      errorMessage.value = error
      currentJobId.value = null
      pendingBotMessageId.value = null
      pollingProgress.value = 'Starting...'
      pollingPercent.value = 0
      pollingToolsCalled.value = []
      pollingStatusHistory.value = []
    }

    // Emit error event for cross-view synchronization
    if (process.client && threadId) {
      window.dispatchEvent(new CustomEvent('chat-job-error', {
        detail: { threadId, jobId, error }
      }))
    }

    scrollTrigger.value++
  }

  /**
   * Update the pending message status for UI display
   */
  function updatePendingMessageStatus(jobId: string, progress: string, tools: string[]) {
    const threadMessages = threadsStore.currentThread?.messages || []
    const pendingMsg = threadMessages.find(m =>
      (m as any)?.status?.jobId === jobId &&
      (((m as any)?.status?.status === 'pending') || ((m as any)?.status?.status === 'streaming'))
    ) as any

    if (pendingMsg && pendingMsg.status) {
      // Initialize history array if not present
      if (!pendingMsg.status.statusHistory) {
        pendingMsg.status.statusHistory = []
      }

      // Push old progress to history before updating (if different and not empty)
      const oldProgress = pendingMsg.status.progress
      if (oldProgress && oldProgress !== progress && oldProgress !== 'Starting...') {
        pendingMsg.status.statusHistory.push({
          text: oldProgress,
          timestamp: Date.now()
        })
        // Keep only the last 5 history items
        if (pendingMsg.status.statusHistory.length > 5) {
          pendingMsg.status.statusHistory.shift()
        }
      }

      pendingMsg.status.progress = progress
      pendingMsg.status.toolsCalled = tools
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

    // Ensure we have a thread BEFORE we set any per-thread UI state
    if (!threadsStore.activeThreadId) {
      console.log('[useChatUI] Creating new thread')
      await threadsStore.createThread()
    }

    // Reset input immediately
    inputValue.value = ''
    clearSelectedAccount()
    closeMentionDropdown()
    errorMessage.value = ''
    chatState.value = 'sending'

    try {
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

      // Create a local pending placeholder immediately; we will attach jobId once we have it.
      const pendingMsgId = `pending-local-${Date.now()}`
      pendingBotMessageId.value = pendingMsgId
      const localPlaceholder: StreamingChatMessage = {
        messageId: pendingMsgId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        status: {
          status: 'pending',
          jobId: pendingMsgId,
          progress: 'Starting...',
          toolsCalled: [],
          statusHistory: []
        } as any,
        streamBuffer: ''
      }

      if (threadsStore.currentThread?.messages) {
        threadsStore.currentThread.messages.push(localPlaceholder as any)
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

      // Attach real jobId to the placeholder and register it in the per-thread registry
      const jobId = response.jobId as string
      const threadMessages = threadsStore.currentThread?.messages || []
      const placeholderIndex = threadMessages.findIndex(m => (m as any)?.messageId === pendingMsgId)
      if (placeholderIndex !== -1) {
        ; (threadMessages[placeholderIndex] as any).status = {
          ...(threadMessages[placeholderIndex] as any).status,
          jobId
        }
        // Store a copy in the registry so it can be re-injected on thread reloads
        const map = getPendingMap(currentThreadId)
        map.set(jobId, threadMessages[placeholderIndex] as any)
        // Remove the temp entry if it existed in registry
        map.delete(pendingMsgId)
      } else {
        // Fallback: ensure we still have a job placeholder in registry
        ensurePlaceholderForJob(currentThreadId, jobId)
      }

      currentJobId.value = jobId
      pendingMessage.value = userInput
      chatState.value = 'polling'

      // Reset polling UI state
      pollingProgress.value = 'Starting...'
      pollingPercent.value = 0
      pollingToolsCalled.value = []
      pollingStatusHistory.value = []

      // Register with background polling service
      backgroundPolling.registerJob(jobId, currentThreadId, userInput)

      // Register callbacks for live UI updates
      backgroundPolling.registerJobCallbacks(jobId, {
        onProgress: handlePollingProgress,
        onComplete: handlePollingComplete,
        onError: handlePollingError
      })

      console.log('[useChatUI] Registered callbacks for job:', jobId)

    } catch (error: any) {
      console.error('[useChatUI] Error sending message:', error)
      // Handle local error (not from polling)
      const errorMsg = error.message || 'Failed to send message'

      // Find and update the pending message if it exists
      const threadMessages = threadsStore.currentThread?.messages || []
      const pendingIndex = threadMessages.findIndex(m =>
        ((m as any)?.status?.status === 'pending') || ((m as any)?.status?.status === 'streaming')
      )

      if (pendingIndex !== -1) {
        const errorType = classifyError(errorMsg)
        // Update message content to show user-friendly error message
        threadMessages[pendingIndex].content = `Error: ${getErrorTitle(errorMsg, errorType)}`
          ; (threadMessages[pendingIndex] as any).status = {
            status: 'error',
            error: errorMsg,
            errorType,
            jobId: (threadMessages[pendingIndex] as any)?.status?.jobId,
            // Preserve any existing status history
            statusHistory: (threadMessages[pendingIndex] as any)?.status?.statusHistory || []
          }
      }

      // Reset state
      chatState.value = 'error'
      errorMessage.value = errorMsg
      currentJobId.value = null
      pendingBotMessageId.value = null
      pollingProgress.value = 'Starting...'
      pollingPercent.value = 0
      pollingToolsCalled.value = []
      pollingStatusHistory.value = []

      scrollTrigger.value++
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
      (m as any)?.status?.jobId === currentJobId.value &&
      (((m as any)?.status?.status === 'pending') || ((m as any)?.status?.status === 'streaming'))
    )
    if (pendingIndex !== -1) {
      threadMessages[pendingIndex].content = '⚠️ Query canceled by user'
        ; (threadMessages[pendingIndex] as any).status = { status: 'canceled', jobId: currentJobId.value || undefined }
    }

    // Reset state
    const threadId = threadsStore.activeThreadId
    if (threadId && currentJobId.value) {
      removePlaceholder(threadId, currentJobId.value)
    }
    if (threadId) {
      resetThreadUiState(threadId)
    } else {
      chatState.value = 'idle'
      currentJobId.value = null
      pendingBotMessageId.value = null
      pollingProgress.value = 'Starting...'
      pollingPercent.value = 0
      pollingToolsCalled.value = []
      pollingStatusHistory.value = []
      errorMessage.value = ''
    }
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
    const oldThreadId = threadsStore.activeThreadId
    if (oldThreadId) {
      // Unregister callbacks for ALL jobs in the old thread (polling continues in background)
      const oldJobs = backgroundPolling.getJobsForThread(oldThreadId).filter(j => j.status === 'polling')
      for (const job of oldJobs) {
        backgroundPolling.unregisterJobCallbacks(job.jobId)
      }
    }

    // Load new thread
    await threadsStore.loadThread(threadId)
    scrollTrigger.value++

    // Check for pending job recovery in the new thread
    await checkAndRecoverPendingJob()

    // Emit thread switch event for cross-view synchronization
    if (process.client) {
      window.dispatchEvent(new CustomEvent('chat-thread-switched', {
        detail: { oldThreadId, newThreadId: threadId }
      }))
    }
  }

  async function createNewThread(): Promise<void> {
    const oldThreadId = threadsStore.activeThreadId
    if (oldThreadId) {
      // Unregister callbacks for jobs in current thread; polling continues in background
      const oldJobs = backgroundPolling.getJobsForThread(oldThreadId).filter(j => j.status === 'polling')
      for (const job of oldJobs) {
        backgroundPolling.unregisterJobCallbacks(job.jobId)
      }
    }

    await threadsStore.createThread()
    scrollTrigger.value++
  }

  // ============================================================================
  // CROSS-VIEW SYNCHRONIZATION
  // ============================================================================

  function handleCrossViewSync(event: CustomEvent) {
    const { threadId, chatState: newState } = event.detail
    const currentThreadId = threadsStore.activeThreadId

    // Only sync if we're viewing the same thread
    if (currentThreadId === threadId) {
      // Trigger reactivity update without causing infinite loop
      syncTrigger.value++
    }
  }

  function handleInputSync(event: CustomEvent) {
    const { threadId, inputValue: newInputValue } = event.detail
    const currentThreadId = threadsStore.activeThreadId

    // Only sync if we're viewing the same thread
    if (currentThreadId === threadId) {
      // Trigger reactivity update without causing infinite loop
      syncTrigger.value++
    }
  }

  function handleProgressUpdate(event: CustomEvent) {
    const { threadId, jobId, progress, percent, tools } = event.detail
    const currentThreadId = threadsStore.activeThreadId

    // Only sync if we're viewing the same thread
    if (currentThreadId === threadId) {
      // Update the placeholder for this job
      updatePendingMessageStatus(jobId, progress, tools)

      // Update shared polling UI if this is the current job
      if (currentJobId.value === jobId) {
        if (pollingProgress.value && progress !== pollingProgress.value) {
          pollingStatusHistory.value.push({
            text: pollingProgress.value,
            timestamp: Date.now()
          })
          if (pollingStatusHistory.value.length > 5) {
            pollingStatusHistory.value.shift()
          }
        }

        pollingProgress.value = progress
        pollingPercent.value = percent
        pollingToolsCalled.value = tools
      }

      // Trigger reactivity update
      scrollTrigger.value++
    }
  }

  function handleJobComplete(event: CustomEvent) {
    const { threadId, jobId, response, metadata, suggestedLinks, suggestedPrompts } = event.detail
    const currentThreadId = threadsStore.activeThreadId

    // Only sync if we're viewing the same thread
    if (currentThreadId === threadId) {
      // Find and update the pending message
      const threadMessages = threadsStore.currentThread?.messages || []
      const pendingIndex = threadMessages.findIndex(m =>
        (m as any)?.status?.jobId === jobId &&
        (((m as any)?.status?.status === 'pending') || ((m as any)?.status?.status === 'streaming'))
      )

      if (pendingIndex !== -1) {
        // Update the pending message to show the response
        threadMessages[pendingIndex].content = response
        threadMessages[pendingIndex].metadata = metadata
        threadMessages[pendingIndex].suggestedLinks = suggestedLinks || []
        threadMessages[pendingIndex].suggestedPrompts = suggestedPrompts || []
          ; (threadMessages[pendingIndex] as any).status = { status: 'complete', jobId }
        delete (threadMessages[pendingIndex] as any).streamBuffer
      }

      // Cleanup placeholder registry for this job
      removePlaceholder(threadId, jobId)

      // If this was the active job for the viewed thread, reset thread UI state
      if (currentJobId.value === jobId) {
        resetThreadUiState(threadId)
      }

      // Trigger reactivity update
      scrollTrigger.value++
    }
  }

  function handleJobError(event: CustomEvent) {
    const { threadId, jobId, error } = event.detail
    const currentThreadId = threadsStore.activeThreadId

    // Only sync if we're viewing the same thread
    if (currentThreadId === threadId) {
      // Find and update the pending message
      const threadMessages = threadsStore.currentThread?.messages || []
      const pendingIndex = threadMessages.findIndex(m =>
        (m as any)?.status?.jobId === jobId &&
        (((m as any)?.status?.status === 'pending') || ((m as any)?.status?.status === 'streaming'))
      )

      if (pendingIndex !== -1) {
        const errorType = classifyError(error)
        // Update message content to show user-friendly error message
        threadMessages[pendingIndex].content = `Error: ${getErrorTitle(error, errorType)}`
          ; (threadMessages[pendingIndex] as any).status = {
            status: 'error',
            error,
            errorType,
            jobId,
            // Preserve any existing status history
            statusHistory: (threadMessages[pendingIndex] as any)?.status?.statusHistory || []
          }
      }

      // Cleanup placeholder registry for this job
      removePlaceholder(threadId, jobId)

      // Only set global error UI if this was the active job for the viewed thread
      if (currentJobId.value === jobId) {
        chatState.value = 'error'
        errorMessage.value = error
        currentJobId.value = null
        pendingBotMessageId.value = null
        pollingProgress.value = 'Starting...'
        pollingPercent.value = 0
        pollingToolsCalled.value = []
        pollingStatusHistory.value = []
      }

      // Trigger reactivity update
      scrollTrigger.value++
    }
  }

  function handleThreadSwitch(event: CustomEvent) {
    const { oldThreadId, newThreadId } = event.detail
    const currentThreadId = threadsStore.activeThreadId

    // If we're not already on the new thread, switch to it
    if (currentThreadId !== newThreadId) {
      // Load the new thread without emitting another event (to prevent loops)
      threadsStore.loadThread(newThreadId).then(() => {
        // Check for pending job recovery in the new thread
        checkAndRecoverPendingJob()
        // Trigger reactivity update
        scrollTrigger.value++
      })
    }
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  async function initialize(): Promise<void> {
    console.log('[useChatUI] Initializing...')
    await threadsStore.fetchThreads()

    if (threadsStore.activeThreadId) {
      // Try to load the persisted active thread
      const loaded = await threadsStore.loadThread(threadsStore.activeThreadId)
      if (!loaded) {
        // Thread no longer exists - clear the stale reference
        // Don't auto-create, let user send first message to create thread
        console.log('[useChatUI] Persisted thread not found, clearing stale reference')
        threadsStore.setActiveThread(null)

        // Select most recent existing thread if available
        if (threadsStore.threads.length > 0) {
          const mostRecent = threadsStore.threads[0]
          console.log('[useChatUI] Selecting most recent thread:', mostRecent.threadId)
          await threadsStore.loadThread(mostRecent.threadId)
        }
      }
    } else if (threadsStore.threads.length > 0) {
      // No active thread but threads exist - select the most recent one
      const mostRecent = threadsStore.threads[0]
      console.log('[useChatUI] No active thread, selecting most recent:', mostRecent.threadId)
      await threadsStore.loadThread(mostRecent.threadId)
    }
    // If no active thread and no existing threads, don't create one
    // A thread will be created when the user sends their first message

    // Check for pending job recovery on initialization
    await checkAndRecoverPendingJob()

    // Set up cross-view synchronization listeners
    if (process.client) {
      window.addEventListener('chat-state-changed', handleCrossViewSync as EventListener)
      window.addEventListener('chat-input-changed', handleInputSync as EventListener)
      window.addEventListener('chat-progress-update', handleProgressUpdate as EventListener)
      window.addEventListener('chat-job-complete', handleJobComplete as EventListener)
      window.addEventListener('chat-job-error', handleJobError as EventListener)
      window.addEventListener('chat-thread-switched', handleThreadSwitch as EventListener)
    }

    console.log('[useChatUI] Initialization complete')
  }

  // ============================================================================
  // CLEANUP ON UNMOUNT
  // ============================================================================

  onUnmounted(() => {
    // Unregister callbacks but don't stop polling (background continues)
    const threadId = threadsStore.activeThreadId
    if (!threadId) return
    const jobs = backgroundPolling.getJobsForThread(threadId).filter(j => j.status === 'polling')
    for (const job of jobs) {
      backgroundPolling.unregisterJobCallbacks(job.jobId)
    }

    // Remove cross-view synchronization listeners
    if (process.client) {
      window.removeEventListener('chat-state-changed', handleCrossViewSync as EventListener)
      window.removeEventListener('chat-input-changed', handleInputSync as EventListener)
      window.removeEventListener('chat-progress-update', handleProgressUpdate as EventListener)
      window.removeEventListener('chat-job-complete', handleJobComplete as EventListener)
      window.removeEventListener('chat-job-error', handleJobError as EventListener)
      window.removeEventListener('chat-thread-switched', handleThreadSwitch as EventListener)
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
    mentionQuery: readonly(mentionQuery),
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
    userTimezone: readonly(userTimezone),

    // Cross-view synchronization
    syncTrigger: readonly(syncTrigger),

    // Error handling utilities
    classifyError,
    getErrorIcon,
    getErrorTitle,
    getErrorDescription,
    getErrorActionText
  }
}
