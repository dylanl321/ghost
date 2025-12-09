/**
 * Unified Chat UI Composable
 * Single source of truth for ALL chat UI logic across all views
 * (GhostChatFullPage, StrandsChatPopup, ChatThreadsSidebar)
 */

import { ref, computed, watch, nextTick, readonly, triggerRef } from 'vue'
import { useChatThreadsStore } from '~/stores/useChatThreadsStore'
import { useBackgroundPolling } from './useBackgroundPolling'
import type { ChatMessage } from '~/shared/types/chat-threads'
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

// Storage key for pending job recovery
const PENDING_JOB_KEY = 'ghost-chat-pending-job'

interface PendingJobInfo {
  jobId: string
  threadId: string
  userMessage: string
  timestamp: number
}

// ============================================================================
// SHARED STATE (singleton across all useChatUI instances)
// This prevents multiple component instances from interfering with each other
// ============================================================================
const sharedPollingState = {
  currentJobId: null as string | null,
  currentThreadId: null as string | null,  // Track which thread owns the polling
  pollAbortToken: null as { aborted: boolean } | null,
  isPolling: false
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

  // Polling state (local refs for UI, but actual polling uses shared state)
  const currentJobId = ref<string | null>(null)
  const pollingThreadId = ref<string | null>(null) // Track which thread owns the polling
  const pollingProgress = ref('Starting...')
  const pollingPercent = ref(0)
  const pollingToolsCalled = ref<string[]>([])
  // Note: pollAbortToken is now in sharedPollingState to prevent race conditions

  // Session state
  const sessionId = ref<string | undefined>(undefined)
  const userTimezone = ref<string>(Intl.DateTimeFormat().resolvedOptions().timeZone)

  // Disambiguation state
  const showDisambiguation = ref(false)
  const disambiguationData = ref<DisambiguationData | null>(null)
  const pendingMessage = ref('')

  // Scroll trigger for components to react to
  const scrollTrigger = ref(0)

  // Force reactivity trigger
  const messagesTrigger = ref(0)

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
    // Touch the trigger to ensure reactivity
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _ = messagesTrigger.value

    const threadMessages = threadsStore.currentThread?.messages || []
    // Don't show initial greeting - it causes rendering issues
    // The welcome screen will be shown via showWelcome computed instead
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
  // PENDING JOB PERSISTENCE (for recovery)
  // ============================================================================

  function savePendingJob(jobId: string, threadId: string, userMessage: string) {
    const info: PendingJobInfo = {
      jobId,
      threadId,
      userMessage,
      timestamp: Date.now()
    }
    try {
      localStorage.setItem(PENDING_JOB_KEY, JSON.stringify(info))
      console.log('[useChatUI] Saved pending job for recovery:', jobId)
    } catch (e) {
      console.warn('[useChatUI] Failed to save pending job:', e)
    }
  }

  function getPendingJob(): PendingJobInfo | null {
    try {
      const stored = localStorage.getItem(PENDING_JOB_KEY)
      if (!stored) return null
      const info = JSON.parse(stored) as PendingJobInfo
      // Expire after 10 minutes
      if (Date.now() - info.timestamp > 10 * 60 * 1000) {
        clearPendingJob()
        return null
      }
      return info
    } catch (e) {
      return null
    }
  }

  function clearPendingJob() {
    try {
      localStorage.removeItem(PENDING_JOB_KEY)
    } catch (e) {
      // Ignore
    }
  }

  // ============================================================================
  // POLLING LOGIC
  // ============================================================================

  async function pollJobStatus(jobId: string, threadId: string): Promise<void> {
    console.log('[useChatUI] Starting polling for job:', jobId, 'thread:', threadId)

    // Store which thread owns this polling operation
    pollingThreadId.value = threadId

    // Check if another polling is already active for this job
    if (sharedPollingState.isPolling && sharedPollingState.currentJobId === jobId) {
      console.log('[useChatUI] Polling already active for this job, skipping')
      return
    }

    // Abort any existing polling for a different job
    if (sharedPollingState.pollAbortToken) {
      sharedPollingState.pollAbortToken.aborted = true
    }

    const maxAttempts = 300 // 5 minutes maximum
    const pollUrl = `/api/strands/chat/async/${jobId}`
    let attempts = 0
    let pollInterval = 1000
    const maxInterval = 5000
    const abortToken = { aborted: false }

    // Set shared state
    sharedPollingState.pollAbortToken = abortToken
    sharedPollingState.currentJobId = jobId
    sharedPollingState.currentThreadId = threadId  // Track thread ownership
    sharedPollingState.isPolling = true

    chatState.value = 'polling'

    try {
      while (attempts < maxAttempts) {
        attempts++

        // Wait before polling (except first attempt)
        if (attempts > 1) {
          await new Promise(resolve => setTimeout(resolve, pollInterval))
        }

        // Check if aborted (only check our own token, not the shared ref)
        if (abortToken.aborted) {
          console.log('[useChatUI] Polling aborted')
          return
        }

        try {
          console.log(`[useChatUI] Polling attempt ${attempts} for job ${jobId}`)
          const status = await $fetch(pollUrl, { method: 'GET' }) as any

          // Check abort again after fetch
          if (abortToken.aborted) {
            console.log('[useChatUI] Polling aborted after fetch')
            return
          }

          if (!status.success) {
            console.error('[useChatUI] Poll returned error:', status.error)
            throw new Error(status.error || 'Failed to poll job status')
          }

          console.log('[useChatUI] Poll status:', status.status, 'progress:', status.currentStep)

          // Update UI with progress
          pollingProgress.value = status.currentStep || 'Processing...'
          pollingPercent.value = status.progressPercent || 0
          pollingToolsCalled.value = status.toolsCalled || []

          // Update background polling progress (for footer indicator)
          backgroundPolling.updateJobProgress(
            jobId,
            status.currentStep || 'Processing...',
            status.progressPercent || 0,
            status.toolsCalled || []
          )

          // Update message status in-place and trigger reactivity (only if viewing this thread)
          updatePendingMessageStatus(status.currentStep, status.progressPercent, status.toolsCalled, threadId)

          // Check if complete
          if (status.status === 'complete') {
            console.log('[useChatUI] Job complete!')
            await handleJobComplete(status)
            clearPendingJob()
            return
          }

          // Check if errored
          if (status.status === 'error') {
            const errorMsg = status.errorMessage || 'Query failed'
            console.error('[useChatUI] Job error:', errorMsg)

            // Check for disambiguation
            if (errorMsg.includes('Multiple accounts found')) {
              handleDisambiguationError(errorMsg)
              return
            }

            await handleJobError(errorMsg)
            clearPendingJob()
            return
          }

          // Adaptive backoff for running/queued status
          if (status.status === 'running' || status.status === 'queued') {
            pollInterval = Math.min(pollInterval * 1.2, maxInterval)
          }
        } catch (fetchError: any) {
          console.error('[useChatUI] Polling fetch error:', fetchError)
          // Don't fail immediately on network errors - retry
          if (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 2000))
            continue
          }
          if (abortToken.aborted) {
            return
          }
          throw fetchError
        }
      }

      // Timeout
      throw new Error('Query timeout - operation took too long')
    } catch (error: any) {
      console.error('[useChatUI] Polling failed:', error)
      await handleJobError(error.message || 'Polling failed')
      clearPendingJob()
    } finally {
      // Reset shared polling state
      if (sharedPollingState.currentJobId === jobId) {
        sharedPollingState.isPolling = false
        sharedPollingState.currentJobId = null
        sharedPollingState.currentThreadId = null
        sharedPollingState.pollAbortToken = null
      }
    }
  }

  function updatePendingMessageStatus(progress?: string, percent?: number, tools?: string[], targetThreadId?: string) {
    // Only update if we're viewing the target thread
    if (targetThreadId && threadsStore.currentThread?.threadId !== targetThreadId) {
      console.log('[useChatUI] Not updating message status - viewing different thread (target:', targetThreadId, 'current:', threadsStore.currentThread?.threadId, ')')
      return
    }

    const threadMessages = threadsStore.currentThread?.messages
    if (!threadMessages) return

    const pendingMsg = threadMessages.find(m =>
      m.status?.status === 'pending' || m.status?.status === 'streaming'
    )
    if (pendingMsg) {
      pendingMsg.status = {
        status: 'streaming',
        progress: progress || 'Processing...',
        progressPercent: percent || 0,
        toolsCalled: tools || []
      }
      // Trigger reactivity
      messagesTrigger.value++
    }
  }

  async function handleJobComplete(status: any) {
    console.log('[useChatUI] Handling job complete')
    const botResponse = status.response || 'No response received.'
    const metadata = status.metadata || {}

    // Add to recent completions (local polling is responsible for this)
    if (currentJobId.value && pendingMessage.value) {
      backgroundPolling.addToRecentCompletions({
        jobId: currentJobId.value,
        threadId: threadsStore.activeThreadId!,
        userMessage: pendingMessage.value,
        timestamp: Date.now()
      }, true, botResponse.substring(0, 200))
    }

    // Unregister from background polling (we handled it locally)
    if (currentJobId.value) {
      backgroundPolling.unregisterJob(currentJobId.value)
    }

    // Find the pending message and update it
    const threadMessages = threadsStore.currentThread?.messages
    if (threadMessages) {
      const pendingIndex = threadMessages.findIndex(m =>
        m.status?.status === 'pending' || m.status?.status === 'streaming'
      )
      if (pendingIndex !== -1) {
        // Update in place
        threadMessages[pendingIndex].content = botResponse
        threadMessages[pendingIndex].metadata = metadata
        threadMessages[pendingIndex].suggestedLinks = status.suggestedLinks || []
        threadMessages[pendingIndex].suggestedPrompts = status.suggestedPrompts || []
        threadMessages[pendingIndex].status = { status: 'complete' }
        delete threadMessages[pendingIndex].streamBuffer
        
        // Trigger reactivity
        messagesTrigger.value++
      }
    }

    // Save to database (don't include the pending message ID since it's temporary)
    try {
      await threadsStore.addMessage({
        role: 'assistant',
        content: botResponse,
        metadata,
        suggestedLinks: status.suggestedLinks || [],
        suggestedPrompts: status.suggestedPrompts || []
      })
    } catch (err) {
      console.error('[useChatUI] Failed to save message to DB:', err)
    }

    // Reset state
    chatState.value = 'idle'
    currentJobId.value = null
    pollingProgress.value = 'Starting...'
    pollingPercent.value = 0
    pollingToolsCalled.value = []
    // Note: pollAbortToken now in sharedPollingState
    scrollTrigger.value++
  }

  async function handleJobError(errorMsg: string) {
    console.error('[useChatUI] Handling job error:', errorMsg)
    errorMessage.value = errorMsg
    chatState.value = 'error'

    // Unregister from background polling (we handled it locally)
    if (currentJobId.value) {
      backgroundPolling.unregisterJob(currentJobId.value)
    }

    // Find pending message and update to error
    const threadMessages = threadsStore.currentThread?.messages
    if (threadMessages) {
      const pendingIndex = threadMessages.findIndex(m =>
        m.status?.status === 'pending' || m.status?.status === 'streaming'
      )
      if (pendingIndex !== -1) {
        threadMessages[pendingIndex].content = `❌ ${errorMsg}`
        threadMessages[pendingIndex].status = { status: 'error', error: errorMsg }
        messagesTrigger.value++
      }
    }

    // Save error to DB
    try {
      await threadsStore.addMessage({
        role: 'assistant',
        content: `❌ ${errorMsg}`,
        metadata: { error: true }
      })
    } catch (err) {
      console.error('[useChatUI] Failed to save error message:', err)
    }

    // Reset polling state
    currentJobId.value = null
    pollingProgress.value = 'Starting...'
    pollingPercent.value = 0
    pollingToolsCalled.value = []
    // Note: pollAbortToken now in sharedPollingState
    scrollTrigger.value++
  }

  function handleDisambiguationError(errorMsg: string) {
    const match = errorMsg.match(/\[(.*?)\]/)
    if (match) {
      const accountsStr = match[1]
      const accountNames = accountsStr.split(',').map((a: string) =>
        a.trim().replace(/'/g, '').replace(/"/g, '')
      )

      disambiguationData.value = {
        search_term: pendingMessage.value || inputValue.value,
        message: 'Multiple accounts matched your query. Please select the account you want to query:',
        matches: accountNames.map((name: string) => ({
          request_id: name,
          account_alias: name,
          display_name: name,
          match_score: 100,
          match_reason: 'Matched account name'
        }))
      }
      pendingMessage.value = inputValue.value
      showDisambiguation.value = true
    }

    chatState.value = 'idle'
    currentJobId.value = null
    // Note: pollAbortToken now in sharedPollingState
  }

  // ============================================================================
  // RECOVERY LOGIC
  // ============================================================================

  async function checkAndRecoverPendingJob(): Promise<boolean> {
    const pendingJob = getPendingJob()
    if (!pendingJob) return false

    console.log('[useChatUI] Found pending job to recover:', pendingJob.jobId)

    // Don't recover jobs from less than 5 seconds ago (likely just switched away)
    const timeSinceCreation = Date.now() - pendingJob.timestamp
    if (timeSinceCreation < 5000) {
      console.log('[useChatUI] Job too recent (', timeSinceCreation, 'ms), skipping recovery')
      clearPendingJob()
      return false
    }

    // Ensure job belongs to current thread
    if (threadsStore.activeThreadId !== pendingJob.threadId) {
      console.log('[useChatUI] Thread mismatch, skipping recovery')
      clearPendingJob()
      return false
    }

    // Check if background polling is already handling this job
    const backgroundJob = backgroundPolling.getJob(pendingJob.jobId)
    if (backgroundJob) {
      console.log('[useChatUI] Background polling already handling job:', pendingJob.jobId)
      // Just update local state to show the polling indicator
      currentJobId.value = pendingJob.jobId
      pollingThreadId.value = pendingJob.threadId
      chatState.value = 'polling'
      pollingProgress.value = backgroundJob.progress || 'Processing...'
      pollingPercent.value = backgroundJob.progressPercent || 0
      pollingToolsCalled.value = backgroundJob.toolsCalled || []
      return true
    }

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
          progress: 'Recovering...',
          toolsCalled: []
        },
        streamBuffer: ''
      }

      if (threadsStore.currentThread?.messages) {
        threadsStore.currentThread.messages.push(pendingBotMessage)
        messagesTrigger.value++
      }
    }

    // Resume local polling (also register with background polling for redundancy)
    currentJobId.value = pendingJob.jobId
    backgroundPolling.registerJob(pendingJob.jobId, pendingJob.threadId, pendingJob.userMessage)

    // CRITICAL: Mark as handled locally to prevent background polling from saving duplicates
    backgroundPolling.markAsHandledLocally(pendingJob.jobId)

    // Start polling in background (don't await to not block initialization)
    pollJobStatus(pendingJob.jobId, pendingJob.threadId).catch(err => {
      console.error('[useChatUI] Recovery polling failed:', err)
    })

    return true
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

      // Add user message to store immediately
      await threadsStore.addMessage({
        role: 'user',
        content: userInput,
        metadata: mentionedAccount ? {
          accountId: mentionedAccount.accountId,
          accountName: getAccountDisplay(mentionedAccount)
        } : undefined
      })
      messagesTrigger.value++
      scrollTrigger.value++

      // Create pending bot message placeholder
      const pendingMessageId = `pending-${Date.now()}`
      const pendingBotMessage: ChatMessage = {
        messageId: pendingMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        status: {
          status: 'pending',
          progress: 'Starting...',
          toolsCalled: []
        },
        streamBuffer: ''
      }

      // Add pending message to thread
      if (threadsStore.currentThread?.messages) {
        threadsStore.currentThread.messages.push(pendingBotMessage)
        messagesTrigger.value++
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

      // Register with background polling service (for recovery if user navigates away)
      backgroundPolling.registerJob(response.jobId, threadsStore.activeThreadId!, userInput)
      
      // Mark as handled locally - prevents background polling from saving duplicate responses
      backgroundPolling.markAsHandledLocally(response.jobId)

      // Also save for local recovery
      savePendingJob(response.jobId, threadsStore.activeThreadId!, userInput)

      // Start local polling for live UI updates
      console.log('[useChatUI] Starting polling for job:', response.jobId)
      await pollJobStatus(response.jobId, threadsStore.activeThreadId!)

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
      messagesTrigger.value++
    }

    // Reset error state
    errorMessage.value = ''
    chatState.value = 'idle'

    // Resend the message
    await sendMessage(lastUserMsg.content)
  }

  async function cancelQuery(): Promise<void> {
    console.log('[useChatUI] Canceling query')

    // Abort polling
    if (sharedPollingState.pollAbortToken) {
      sharedPollingState.pollAbortToken.aborted = true
    }

    // Unregister from background polling
    if (currentJobId.value) {
      backgroundPolling.unregisterJob(currentJobId.value)
    }

    // Find pending message and update to canceled
    const threadMessages = threadsStore.currentThread?.messages || []
    const pendingIndex = threadMessages.findIndex(m =>
      m.status?.status === 'pending' || m.status?.status === 'streaming'
    )
    if (pendingIndex !== -1) {
      threadMessages[pendingIndex].content = '⚠️ Query canceled by user'
      threadMessages[pendingIndex].status = { status: 'error', error: 'Canceled' }
      messagesTrigger.value++
    }

    // Save cancellation to DB
    try {
      await threadsStore.addMessage({
        role: 'assistant',
        content: '⚠️ Query canceled by user',
        metadata: { canceled: true }
      })
    } catch (err) {
      console.error('[useChatUI] Failed to save cancellation message:', err)
    }

    // Reset state
    chatState.value = 'idle'
    currentJobId.value = null
    pollingProgress.value = 'Starting...'
    pollingPercent.value = 0
    pollingToolsCalled.value = []
    errorMessage.value = ''
    clearPendingJob()
    scrollTrigger.value++
  }

  async function clearConversation(): Promise<void> {
    if (threadsStore.activeThreadId) {
      await threadsStore.clearThread(threadsStore.activeThreadId)
    }
    chatState.value = 'idle'
    errorMessage.value = ''
    messagesTrigger.value++
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
        messagesTrigger.value++
      }
    }
  }

  // ============================================================================
  // THREAD MANAGEMENT
  // ============================================================================

  async function switchThread(threadId: string): Promise<void> {
    const oldThreadId = threadsStore.activeThreadId
    const oldJobId = currentJobId.value
    const wasPollingLocally = chatState.value === 'polling' && currentJobId.value

    // Step 1: If we're locally polling, DON'T abort completely - transfer to background
    if (wasPollingLocally && oldJobId) {
      console.log('[useChatUI] Transferring local polling to background:', oldJobId)

      // Remove the handledLocally flag so background can take over
      const job = backgroundPolling.getJob(oldJobId)
      if (job && job.handledLocally) {
        backgroundPolling.markAsNotHandledLocally(oldJobId)
      }

      // Abort LOCAL polling (so UI updates stop) but job continues in background
      if (sharedPollingState.pollAbortToken) {
        sharedPollingState.pollAbortToken.aborted = true
      }
    } else {
      // Not currently polling, safe to abort any lingering state
      if (sharedPollingState.pollAbortToken) {
        sharedPollingState.pollAbortToken.aborted = true
      }
    }

    // Step 2: Reset LOCAL state (polling continues in background if transferred)
    chatState.value = 'idle'
    currentJobId.value = null
    pollingThreadId.value = null
    pollingProgress.value = 'Starting...'
    pollingPercent.value = 0
    pollingToolsCalled.value = []
    errorMessage.value = ''
    // DON'T clear localStorage - background polling needs it for the transferred job

    // Step 3: Load new thread
    await threadsStore.loadThread(threadId)
    messagesTrigger.value++
    scrollTrigger.value++

    // Step 4: Check for pending job recovery
    await checkAndRecoverPendingJob()
  }

  async function createNewThread(): Promise<void> {
    // Abort any current polling
    if (sharedPollingState.pollAbortToken) {
      sharedPollingState.pollAbortToken.aborted = true
    }

    // Reset state
    chatState.value = 'idle'
    currentJobId.value = null
    errorMessage.value = ''

    await threadsStore.createThread()
    messagesTrigger.value++
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
    if (sharedPollingState.pollAbortToken) {
      sharedPollingState.pollAbortToken.aborted = true
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
