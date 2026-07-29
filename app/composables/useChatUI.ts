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

import { ref, computed, readonly, onUnmounted, reactive } from 'vue'
import { useChatThreadsStore } from '~/stores/useChatThreadsStore'
import {
  useBackgroundPolling,
  type PollingCompleteEvent,
  type PollingDisambiguationEvent,
  type PollingErrorEvent,
  type PollingProgressEvent
} from './useBackgroundPolling'
import type { StreamingChatMessage, ErrorType } from '#shared/types/chat-threads'
import type { AWSEnclaveData } from '#shared/types/accounts'
import type { ChatPageContext } from '#shared/types/chat-context'
import { validateChatPageContext } from '#shared/types/chat-context'

// Chat state enum
export type ChatState = 'idle' | 'sending' | 'polling' | 'error' | 'canceled'

const logger = createLogger('useChatUI')
const newThreadDraft = ref('')
let sendWithoutThreadInFlight = false
let chatUiInstanceCounter = 0
let chatThreadsInitializationPromise: Promise<void> | null = null

/**
 * Enhanced error classification system
 * Categorizes errors by type to provide appropriate user messaging and recovery actions
 */
export function classifyError(error: string): ErrorType {
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
export function getErrorIcon(errorType: ErrorType): string {
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
export function getErrorTitle(error: string, errorType?: ErrorType): string {
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
export function getErrorDescription(error: string, errorType?: ErrorType): string {
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
export function getErrorActionText(errorType: ErrorType): string {
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
      existing.status.statusHistory = initial.status.statusHistory ?? existing.status.statusHistory
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
      statusHistory: initial?.status?.statusHistory || []
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
  viewMode?: 'fullpage' | 'popup' | 'sidebar' | 'dashboard'
  initialGreeting?: string
}

// Disambiguation data type
export interface DisambiguationData {
  sessionId: string
  originalQuery: string
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
  void options

  // Get stores and services
  const threadsStore = useChatThreadsStore()
  const enclaveStore = useEnclaveStore()
  const backgroundPolling = useBackgroundPolling()
  const callbackOwner = `chat-ui-${++chatUiInstanceCounter}`
  let listenersRegistered = false
  const route = useRoute()

  function contextFromRoute(): ChatPageContext | null {
    if (typeof route.query.context === 'string') {
      try {
        return validateChatPageContext(JSON.parse(route.query.context))
      } catch {
        return null
      }
    }
    if (route.path === '/chat') return null
    return validateChatPageContext({
      sourcePage: route.path,
      accountIds: route.query.accounts || route.query.account,
      resourceIds: route.query.resources || route.query.resourceId,
      timeframe: route.query.timeframe,
      dataMode: route.query.mode,
      services: route.query.services,
      severities: route.query.severity
    })
  }

  const pageContext = ref<ChatPageContext | null>(contextFromRoute())
  const contextChips = computed(() => {
    const context = pageContext.value
    if (!context) return []
    return [
      ...((context.accountIds || []).map(value => ({ key: 'accountIds' as const, value, label: `Account ${value}` }))),
      ...((context.resourceIds || []).map(value => ({ key: 'resourceIds' as const, value, label: value }))),
      ...(context.timeframe ? [{ key: 'timeframe' as const, value: context.timeframe, label: context.timeframe }] : []),
      ...(context.dataMode ? [{ key: 'dataMode' as const, value: context.dataMode, label: context.dataMode }] : []),
      ...((context.services || []).map(value => ({ key: 'services' as const, value, label: value }))),
      ...((context.severities || []).map(value => ({ key: 'severities' as const, value, label: value })))
    ]
  })

  function removeContextChip(key: keyof ChatPageContext, value: string) {
    if (!pageContext.value) return
    const current = pageContext.value[key]
    if (Array.isArray(current)) {
      ;(pageContext.value as any)[key] = current.filter(item => item !== value)
    } else {
      Reflect.deleteProperty(pageContext.value, key)
    }
  }

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
      if (import.meta.client) {
        window.dispatchEvent(new CustomEvent('chat-state-changed', {
          detail: { threadId: id, chatState: value }
        }))
      }
    }
  })

  const errorMessage = computed<string>({
    get: () => {
      const id = threadsStore.activeThreadId
      if (!id) return newThreadDraft.value
      return getThreadUiState(id).errorMessage
    },
    set: (value) => {
      const id = threadsStore.activeThreadId
      if (!id) {
        newThreadDraft.value = value
        return
      }
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
      if (import.meta.client) {
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

  function openDisambiguationModal() {
    if (!disambiguationData.value) return
    showDisambiguation.value = true
  }

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
  // Cast to StreamingChatMessage[] since pending/streaming messages are injected with status fields
  const messages = computed<StreamingChatMessage[]>(() => {
    const threadMessages = (threadsStore.currentThread?.messages || []) as StreamingChatMessage[]
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

    const charBeforeAt = lastAtIndex > 0 ? (textBeforeCursor[lastAtIndex - 1] ?? ' ') : ' '
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
    if (!account) return null
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

    const threadJobs = backgroundPolling.getJobsForThread(threadId)
    const waitingJob = threadJobs.find(job => job.status === 'waiting_for_input' && job.disambiguation)
    if (waitingJob?.disambiguation) {
      const presented = presentDisambiguation(waitingJob.jobId, threadId, waitingJob.disambiguation)
      if (presented) backgroundPolling.unregisterJob(waitingJob.jobId)
      return presented
    }

    const jobs = threadJobs.filter(j => j.status === 'polling')
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
        }
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
      backgroundPolling.registerJobCallbacks(job.jobId, callbackOwner, {
        onProgress: handlePollingProgress,
        onComplete: handlePollingComplete,
        onError: handlePollingError,
        onDisambiguation: handlePollingDisambiguation
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
  function handlePollingProgress(event: PollingProgressEvent) {
    const { jobId, threadId, progress, percent, tools } = event
    logger.info('Progress update:', jobId, progress, percent)

    updatePendingMessageStatus(threadId, jobId, progress, tools)
    if (threadsStore.activeThreadId !== threadId) return

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
    if (import.meta.client) {
      window.dispatchEvent(new CustomEvent('chat-progress-update', {
        detail: { threadId, jobId, progress, percent, tools }
      }))
    }

    scrollTrigger.value++
  }

  /**
   * Handle job completion from background polling
   */
  function handlePollingComplete(event: PollingCompleteEvent) {
    const { jobId, threadId, response, metadata, suggestedLinks, suggestedPrompts } = event
    logger.info('Job complete:', jobId)

    removePlaceholder(threadId, jobId)
    if (threadsStore.activeThreadId !== threadId) return

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
      logger.info('No pending message found, adding response directly')
      const alreadyPresent = threadMessages.some(message =>
        (message as any).jobId === jobId || (message as any).status?.jobId === jobId
      )
      if (!alreadyPresent && threadsStore.currentThread?.messages) {
        threadsStore.currentThread.messages.push({
          messageId: `response-${Date.now()}`,
          role: 'assistant',
          content: response,
          timestamp: new Date().toISOString(),
          metadata,
          suggestedLinks: suggestedLinks || [],
          suggestedPrompts: suggestedPrompts || [],
          jobId
        } as any)
      }
    }

    // Cleanup placeholder registry for this job
    // If this was the active job for the viewed thread, reset thread UI state.
    if (currentJobId.value === jobId && threadId) {
      resetThreadUiState(threadId)
    }

    // Emit completion event for cross-view synchronization
    if (import.meta.client && threadId) {
      window.dispatchEvent(new CustomEvent('chat-job-complete', {
        detail: { threadId, jobId, response, metadata, suggestedLinks, suggestedPrompts }
      }))
    }

    // Trigger scroll
    scrollTrigger.value++

    // The worker has already persisted this message. Local replacement avoids a reload flicker.
  }

  /**
   * Handle job error from background polling
   */
  function presentDisambiguation(jobId: string, threadId: string, disambiguation: any): boolean {
    if (threadsStore.activeThreadId !== threadId) {
      removePlaceholder(threadId, jobId)
      return false
    }

    const job = backgroundPolling.getJob(jobId)
    const disambig = {
      ...disambiguation,
      sessionId: disambiguation.sessionId || disambiguation.session_id || jobId,
      originalQuery: job?.userMessage || pendingMessage.value
    }
    if (!Array.isArray(disambig.matches) || disambig.matches.length === 0) return false

    showDisambiguation.value = true
    disambiguationData.value = disambig
    removePlaceholder(threadId, jobId)
    const threadMessages = threadsStore.currentThread?.messages || []
    const placeholderIndex = threadMessages.findIndex(message => (message as any).status?.jobId === jobId)
    if (placeholderIndex !== -1) threadMessages.splice(placeholderIndex, 1)
    resetThreadUiState(threadId)
    return true
  }

  function handlePollingDisambiguation(event: PollingDisambiguationEvent) {
    if (presentDisambiguation(event.jobId, event.threadId, event.disambiguation)) {
      backgroundPolling.unregisterJob(event.jobId)
    }
  }

  function handlePollingError(event: PollingErrorEvent) {
    const { jobId, threadId, error, recoverable, disambiguation } = event
    logger.error('Job error:', jobId, error)

    if (threadsStore.activeThreadId !== threadId) {
      if (!recoverable) removePlaceholder(threadId, jobId)
      return
    }

    // Check for disambiguation
    if (disambiguation || error.includes('Multiple accounts found matching')) {
      const job = backgroundPolling.getJob(jobId)
      const disambig = disambiguation || parseDisambiguationError(error, jobId, job?.userMessage || pendingMessage.value)
      if (disambig && presentDisambiguation(jobId, threadId, disambig)) return
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
          recoverable,
          // Preserve any existing status history
          statusHistory: (threadMessages[pendingIndex] as any)?.status?.statusHistory || []
        }
    }

    if (!recoverable) {
      removePlaceholder(threadId, jobId)
    }

    // Only set global error UI if this was the active job for the viewed thread
    if (currentJobId.value === jobId) {
      chatState.value = 'error'
      errorMessage.value = error
      currentJobId.value = recoverable ? jobId : null
      pendingBotMessageId.value = null
      pollingProgress.value = 'Starting...'
      pollingPercent.value = 0
      pollingToolsCalled.value = []
      pollingStatusHistory.value = []
    }

    // Emit error event for cross-view synchronization
    if (import.meta.client && threadId) {
      window.dispatchEvent(new CustomEvent('chat-job-error', {
        detail: { threadId, jobId, error, recoverable }
      }))
    }

    scrollTrigger.value++
  }

  /**
   * Update the pending message status for UI display
   */
  function updatePendingMessageStatus(threadId: string, jobId: string, progress: string, tools: string[]) {
    const registeredPlaceholder = pendingPlaceholdersByThread.get(threadId)?.get(jobId)
    if (registeredPlaceholder?.status) {
      registeredPlaceholder.status.progress = progress
      registeredPlaceholder.status.toolsCalled = tools
    }
    if (threadsStore.activeThreadId !== threadId) return
    const threadMessages = threadsStore.currentThread?.messages || []
    const pendingMsg = threadMessages.find(m =>
      (m as any)?.status?.jobId === jobId &&
      (((m as any)?.status?.status === 'pending') || ((m as any)?.status?.status === 'streaming'))
    ) as any

    if (pendingMsg?.status) {
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
  function parseDisambiguationError(errorMsg: string, activeSessionId: string, originalQuery: string): DisambiguationData | null {
    try {
      const match = errorMsg.match(/\[(.*?)\]/)
      if (match?.[1]) {
        const accountsStr = match[1]
        const accountNames = accountsStr.split(',').map((a: string) =>
          a.trim().replace(/'/g, '').replace(/"/g, '')
        )

        return {
          sessionId: activeSessionId,
          originalQuery,
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

  async function sendMessage(text?: string, accountIdentifier?: string): Promise<void> {
    const messageText = text || inputValue.value
    if (!messageText.trim() || isLoading.value) return

    const userInput = messageText.trim()
    const mentionedAccount = selectedAccountForMessage.value

    logger.info('Sending message:', userInput.substring(0, 50))

    // Guard first-send thread creation, since no per-thread sending state exists yet.
    if (!threadsStore.activeThreadId) {
      if (sendWithoutThreadInFlight) return
      sendWithoutThreadInFlight = true
      logger.info('Creating new thread')
      try {
        const thread = await threadsStore.createThread()
        if (!thread) {
          newThreadDraft.value = userInput
          return
        }
      } finally {
        sendWithoutThreadInFlight = false
      }
    }

    // Reset input immediately
    inputValue.value = ''
    newThreadDraft.value = ''
    clearSelectedAccount()
    closeMentionDropdown()
    errorMessage.value = ''
    chatState.value = 'sending'

    const currentThreadId = threadsStore.activeThreadId!
    const localUserMessageId = `user-local-${Date.now()}`
    const pendingMsgId = `pending-local-${Date.now()}`

    try {

      // Optimistically render; the submission endpoint persists this message.
      threadsStore.currentThread?.messages.push({
        messageId: localUserMessageId,
        role: 'user',
        content: userInput,
        timestamp: new Date().toISOString(),
        metadata: mentionedAccount || accountIdentifier ? {
          accountId: accountIdentifier || mentionedAccount?.accountId,
          accountName: mentionedAccount ? getAccountDisplay(mentionedAccount) : undefined
        } : undefined
      } as any)
      scrollTrigger.value++

      // Create a local pending placeholder immediately; we will attach jobId once we have it.
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
        },
        streamBuffer: ''
      }

      if (threadsStore.currentThread?.messages) {
        threadsStore.currentThread.messages.push(localPlaceholder as any)
      }
      scrollTrigger.value++

      // Get conversation history (exclude pending messages)
      const conversationHistory = ((threadsStore.currentThread?.messages || []) as StreamingChatMessage[])
        .filter((m: StreamingChatMessage) => !m.status || m.status.status === 'complete')
        .filter((m: StreamingChatMessage) => !m.messageId.startsWith('user-local-'))
        .slice(-10)
        .map((m: StreamingChatMessage) => ({
          role: m.role === 'user' ? 'user' as const : 'assistant' as const,
          content: m.content
        }))

      logger.info('Submitting async query')

      // Submit async query
      const response = await $fetch('/api/strands/chat/async', {
        method: 'POST',
        body: {
          message: userInput,
          threadId: currentThreadId,
          accountIdentifier: accountIdentifier || mentionedAccount?.accountId || undefined,
          conversationHistory,
          timezone: userTimezone.value,
          pageContext: pageContext.value
        }
      }) as any

      logger.info('Async query response:', response)

      if (!response.success || !response.jobId) {
        throw new Error(response.error || 'Failed to submit query')
      }

      const localUserIndex = threadsStore.currentThread?.messages.findIndex(
        message => message.messageId === localUserMessageId
      ) ?? -1
      if (localUserIndex !== -1 && response.userMessage && threadsStore.currentThread) {
        threadsStore.currentThread.messages.splice(localUserIndex, 1, response.userMessage)
      }

      // Attach real jobId to the placeholder and register it in the per-thread registry
      const jobId = response.jobId as string
      const isOriginThreadActive = threadsStore.currentThread?.threadId === currentThreadId
      const threadMessages = isOriginThreadActive ? threadsStore.currentThread?.messages || [] : []
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

      const originState = getThreadUiState(currentThreadId)
      originState.currentJobId = jobId
      originState.pendingBotMessageId = pendingMsgId
      originState.chatState = 'polling'
      originState.pollingProgress = 'Starting...'
      originState.pollingPercent = 0
      originState.pollingToolsCalled = []
      originState.pollingStatusHistory = []
      pendingMessage.value = userInput

      useEventBus().emit('ai.chat.sent', { message: userInput })

      // Register with background polling service
      backgroundPolling.registerJob(jobId, currentThreadId, userInput)

      // Register callbacks for live UI updates
      if (threadsStore.activeThreadId === currentThreadId) {
        backgroundPolling.registerJobCallbacks(jobId, callbackOwner, {
          onProgress: handlePollingProgress,
          onComplete: handlePollingComplete,
          onError: handlePollingError,
          onDisambiguation: handlePollingDisambiguation
        })
      }

      logger.info('Registered callbacks for job:', jobId)

    } catch (error: any) {
      logger.error('Error sending message:', error)
      // Handle local error (not from polling)
      const errorMsg = error.message || 'Failed to send message'

      const originState = getThreadUiState(currentThreadId)
      if (threadsStore.currentThread?.threadId === currentThreadId) {
        const threadMessages = threadsStore.currentThread.messages || []
        const failedIds = new Set([localUserMessageId, pendingMsgId])
        threadsStore.currentThread.messages = threadMessages.filter(message => !failedIds.has(message.messageId))
        inputValue.value = userInput
      } else {
        originState.inputValue = userInput
      }

      // Reset state
      Object.assign(originState, {
        chatState: 'error',
        errorMessage: errorMsg,
        currentJobId: null,
        pendingBotMessageId: null,
        pollingProgress: 'Starting...',
        pollingPercent: 0,
        pollingToolsCalled: [],
        pollingStatusHistory: []
      })

      scrollTrigger.value++
    }
  }

  async function retryLastMessage(): Promise<void> {
    // Find the last user message
    const threadMessages = (threadsStore.currentThread?.messages || []) as StreamingChatMessage[]
    const lastUserMsg = [...threadMessages].reverse().find((m: StreamingChatMessage) => m?.role === 'user')

    if (!lastUserMsg) {
      logger.warn('No user message to retry')
      return
    }

    // Remove error message if present
    const errorIndex = threadMessages.findIndex((m: StreamingChatMessage) => m.status?.status === 'error')
    if (errorIndex !== -1) {
      threadMessages.splice(errorIndex, 1)
    }

    // Reset error state
    errorMessage.value = ''
    chatState.value = 'idle'

    // Resend the message
    await sendMessage(lastUserMsg.content)
  }

  async function retryMessage(messageId: string, jobId?: string): Promise<void> {
    const threadMessages = (threadsStore.currentThread?.messages || []) as StreamingChatMessage[]
    const messageIndex = threadMessages.findIndex(message => message.messageId === messageId)
    if (messageIndex === -1) return

    if (jobId && threadMessages[messageIndex]?.status?.recoverable && backgroundPolling.reconnectJob(jobId)) {
      threadMessages[messageIndex]!.content = ''
      threadMessages[messageIndex]!.status = {
        status: 'pending',
        jobId,
        progress: 'Reconnecting...',
        toolsCalled: [],
        statusHistory: []
      }
      currentJobId.value = jobId
      chatState.value = 'polling'
      return
    }

    const original = [...threadMessages.slice(0, messageIndex)].reverse().find(message => message.role === 'user')
    if (!original) return
    threadMessages.splice(messageIndex, 1)
    chatState.value = 'idle'
    errorMessage.value = ''
    await sendMessage(original.content)
  }

  async function cancelQuery(jobId?: string): Promise<void> {
    logger.info('Canceling query')
    const targetJobId = jobId || currentJobId.value
    if (!targetJobId) return

    try {
      const response = await $fetch<{ success: boolean; error?: string }>(`/api/strands/chat/async/${targetJobId}/cancel`, {
        method: 'POST'
      })
      if (!response.success) throw new Error(response.error || 'Cancellation was not confirmed')
    } catch (err: any) {
      logger.warn('Failed to cancel on server:', err)
      errorMessage.value = err?.message || 'Unable to cancel this query. Monitoring will continue.'
      return
    }

    // Find pending message and update to canceled
    const threadMessages = threadsStore.currentThread?.messages || []
    const pendingIndex = threadMessages.findIndex(m =>
      (m as any)?.status?.jobId === targetJobId &&
      (((m as any)?.status?.status === 'pending') || ((m as any)?.status?.status === 'streaming'))
    )
    if (pendingIndex !== -1) {
      threadMessages[pendingIndex].content = 'Query canceled by user'
        ; (threadMessages[pendingIndex] as any).status = { status: 'canceled', jobId: targetJobId }
    }

    // Reset state
    const threadId = threadsStore.activeThreadId
    if (threadId) {
      removePlaceholder(threadId, targetJobId)
    }
    backgroundPolling.unregisterJobCallbacks(targetJobId, callbackOwner)
    backgroundPolling.unregisterJob(targetJobId)
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

  async function clearConversation(): Promise<boolean> {
    let success = true
    if (threadsStore.activeThreadId) {
      success = await threadsStore.clearThread(threadsStore.activeThreadId)
    }
    chatState.value = 'idle'
    errorMessage.value = ''
    scrollTrigger.value++
    return success
  }

  async function loadEarlierMessages(): Promise<void> {
    const loaded = await threadsStore.loadEarlierMessages()
    if (loaded) scrollTrigger.value++
  }

  // ============================================================================
  // DISAMBIGUATION HANDLERS
  // ============================================================================

  async function handleAccountSelected(accountId: string): Promise<void> {
    const current = disambiguationData.value
    if (!current) return

    const matchedAccount = current.matches.find(match => match.request_id === accountId)
    let selectedAccount = matchedAccount
    const matchedAccountId = matchedAccount?.govcloud_account_id || matchedAccount?.commercial_account_id

    // Structured disambiguation matches already contain the account ID needed
    // to rerun the query. Only ask Strands to resolve legacy matches that do not.
    if (!matchedAccountId) {
      try {
        const response = await $fetch<{ data: { account: DisambiguationData['matches'][number] } }>('/api/strands/account/select', {
          method: 'POST',
          body: { sessionId: current.sessionId, requestId: accountId }
        })
        selectedAccount = response.data.account || matchedAccount
      } catch (error: any) {
        logger.warn('Upstream account selection failed; using selected match metadata', error)
      }
    }

    const selectedAccountId = selectedAccount?.govcloud_account_id || selectedAccount?.commercial_account_id ||
      matchedAccount?.govcloud_account_id || matchedAccount?.commercial_account_id
    if (!selectedAccountId) {
      errorMessage.value = 'The selected account did not include an account ID. Please choose another account.'
      return
    }

    showDisambiguation.value = false
    disambiguationData.value = null
    pendingMessage.value = ''
    await sendMessage(current.originalQuery, selectedAccountId)
  }

  function cancelDisambiguation(): void {
    showDisambiguation.value = false
    disambiguationData.value = null
    pendingMessage.value = ''
    chatState.value = 'idle'

    // Remove pending message
    const threadMessages = threadsStore.currentThread?.messages as StreamingChatMessage[] | undefined
    if (threadMessages) {
      const pendingIndex = threadMessages.findIndex((m: StreamingChatMessage) =>
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
        backgroundPolling.unregisterJobCallbacks(job.jobId, callbackOwner)
      }
    }

    // Load new thread
    await threadsStore.loadThread(threadId)
    scrollTrigger.value++

    // Check for pending job recovery in the new thread
    await checkAndRecoverPendingJob()

    // Emit thread switch event for cross-view synchronization
    if (import.meta.client) {
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
        backgroundPolling.unregisterJobCallbacks(job.jobId, callbackOwner)
      }
    }

    await threadsStore.createThread()
    scrollTrigger.value++
  }

  // ============================================================================
  // CROSS-VIEW SYNCHRONIZATION
  // ============================================================================

  function handleCrossViewSync(event: CustomEvent) {
    const { threadId } = event.detail
    const currentThreadId = threadsStore.activeThreadId

    // Only sync if we're viewing the same thread
    if (currentThreadId === threadId) {
      // Trigger reactivity update without causing infinite loop
      syncTrigger.value++
    }
  }

  function handleInputSync(event: CustomEvent) {
    const { threadId } = event.detail
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
      updatePendingMessageStatus(threadId, jobId, progress, tools)

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
    const { threadId, jobId, error, recoverable = false } = event.detail
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
            recoverable,
            // Preserve any existing status history
            statusHistory: (threadMessages[pendingIndex] as any)?.status?.statusHistory || []
          }
      }

      // Cleanup placeholder registry for this job
      if (!recoverable) removePlaceholder(threadId, jobId)

      // Only set global error UI if this was the active job for the viewed thread
      if (currentJobId.value === jobId) {
        chatState.value = 'error'
        errorMessage.value = error
        currentJobId.value = recoverable ? jobId : null
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
    const { newThreadId } = event.detail
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
    logger.info('Initializing...')
    if (!chatThreadsInitializationPromise) {
      chatThreadsInitializationPromise = (async () => {
        await threadsStore.fetchThreads()

        if (threadsStore.activeThreadId) {
          const loaded = await threadsStore.loadThread(threadsStore.activeThreadId)
          if (!loaded) {
            logger.info('Persisted thread not found, clearing stale reference')
            threadsStore.setActiveThread(null)

            if (threadsStore.threads.length > 0) {
              const mostRecent = threadsStore.threads[0]
              await threadsStore.loadThread(mostRecent.threadId)
            }
          }
        } else if (threadsStore.threads.length > 0) {
          const mostRecent = threadsStore.threads[0]
          await threadsStore.loadThread(mostRecent.threadId)
        }
      })().catch((error) => {
        chatThreadsInitializationPromise = null
        throw error
      })
    }
    await chatThreadsInitializationPromise

    // Check for pending job recovery on initialization
    await checkAndRecoverPendingJob()

    // Set up cross-view synchronization listeners
    if (import.meta.client && !listenersRegistered) {
      listenersRegistered = true
      window.addEventListener('chat-state-changed', handleCrossViewSync as EventListener)
      window.addEventListener('chat-input-changed', handleInputSync as EventListener)
      window.addEventListener('chat-progress-update', handleProgressUpdate as EventListener)
      window.addEventListener('chat-job-complete', handleJobComplete as EventListener)
      window.addEventListener('chat-job-error', handleJobError as EventListener)
      window.addEventListener('chat-thread-switched', handleThreadSwitch as EventListener)
    }

    logger.info('Initialization complete')
  }

  // ============================================================================
  // CLEANUP ON UNMOUNT
  // ============================================================================

  onUnmounted(() => {
    // Unregister callbacks but don't stop polling (background continues)
    const threadId = threadsStore.activeThreadId
    if (threadId) {
      const jobs = backgroundPolling.getJobsForThread(threadId).filter(j => j.status === 'polling' || j.status === 'paused')
      for (const job of jobs) {
        backgroundPolling.unregisterJobCallbacks(job.jobId, callbackOwner)
      }
    }

    // Remove cross-view synchronization listeners
    if (import.meta.client && listenersRegistered) {
      listenersRegistered = false
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
    messages,
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
    pageContext: readonly(pageContext),
    contextChips: readonly(contextChips),
    removeContextChip,

    // Core actions
    sendMessage,
    retryLastMessage,
    retryMessage,
    cancelQuery,
    clearConversation,
    loadEarlierMessages,
    hasMoreMessages: computed(() => !!threadsStore.currentThread?.hasMoreMessages),

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
    disambiguationData: computed(() => disambiguationData.value),
    openDisambiguationModal,
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
