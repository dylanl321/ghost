/**
 * Shared chat logic for all Strands chat implementations
 * Uses async polling instead of SSE streaming for better reliability
 * Used by: StrandsChatbot, StrandsChatPopup, GhostChatFullPage
 */

import { ref, readonly, watch, nextTick } from 'vue'
import type { ChatMessage as ThreadChatMessage } from '~/shared/types/chat-threads'

/**
 * Convert thread messages to component chat messages
 */
function convertThreadMessagesToChatMessages(threadMessages: ThreadChatMessage[]): ChatMessage[] {
  return threadMessages.map(msg => ({
    text: msg.content,
    links: msg.links || [],
    sender: msg.role === 'user' ? 'user' : 'bot',
    metadata: msg.metadata || {},
    suggestedLinks: msg.suggestedLinks || [],
    suggestedPrompts: msg.suggestedPrompts || []
  }))
}

/**
 * Convert component chat message to thread message format
 */
function convertChatMessageToThreadMessage(chatMsg: ChatMessage): Omit<ThreadChatMessage, 'messageId' | 'timestamp'> {
  return {
    role: chatMsg.sender === 'user' ? 'user' : 'assistant',
    content: chatMsg.text,
    metadata: chatMsg.metadata,
    links: chatMsg.links,
    suggestedLinks: chatMsg.suggestedLinks,
    suggestedPrompts: chatMsg.suggestedPrompts
  }
}

export interface SuggestedPrompt {
  text: string
  type: 'question' | 'action' | 'clarification'
  priority: number
}

export interface ChatMessage {
  text: string
  links: string[]
  sender: 'user' | 'bot'
  metadata?: {
    accountId?: string
    mcpUsed?: string
    mcpType?: 'permanent' | 'temporary'
  }
  suggestedLinks?: any[]
  suggestedPrompts?: SuggestedPrompt[]
}

export interface StrandsChatOptions {
  initialGreeting?: string
  endpoint?: string
  threadsStore?: any
  loadMessagesFromThread?: boolean
}

export function useStrandsChat(options: StrandsChatOptions = {}) {
  const {
    initialGreeting = "Hello! I'm GHOST Chat, your AI assistant for AWS operations. I can help you with cost analysis, configuration lookups, security findings, and more.\n\nFor best results, be explicit about AWS account IDs in your queries.",
    endpoint = '/api/strands/chat/async',
    threadsStore = null,
    loadMessagesFromThread = false
  } = options

  // State - Initialize from thread if available
  const messages = ref<ChatMessage[]>(
    loadMessagesFromThread && threadsStore?.currentThread?.messages && threadsStore.currentThread.messages.length > 0
      ? convertThreadMessagesToChatMessages(threadsStore.currentThread.messages)
      : initialGreeting ? [{
          text: initialGreeting,
          links: [],
          sender: 'bot',
          metadata: {}
        }] : []
  )

  // Load existing thread messages after mount
  if (threadsStore?.currentThread?.messages && threadsStore.currentThread.messages.length > 0) {
    nextTick(() => {
      if (threadsStore.currentThread?.messages && threadsStore.currentThread.messages.length > 0) {
        messages.value = convertThreadMessagesToChatMessages(threadsStore.currentThread.messages)
        sessionId.value = threadsStore.currentThread.sessionId
      }
    })
  }

  const isLoading = ref(false)
  const sessionId = ref<string | undefined>(threadsStore?.currentThread?.sessionId || undefined)
  const scrollTrigger = ref(0)
  const isSendingMessage = ref(false)
  const isLoadingThread = ref(false)

  // Async polling state
  const currentJobId = ref<string | undefined>(undefined)
  const pollingProgress = ref<string>('Thinking...')
  const pollingPercent = ref(0)
  const toolsCalled = ref<string[]>([])

  // Error handling
  const hasError = ref(false)
  const errorMessage = ref<string>('')

  // Detect user's timezone
  const userTimezone = ref<string>(
    Intl.DateTimeFormat().resolvedOptions().timeZone
  )

  // Disambiguation state
  const showDisambiguation = ref(false)
  const disambiguationData = ref<any>(null)
  const pendingMessage = ref<string>('')

  // Track last synced thread to prevent duplicate reloads
  let lastSyncedThreadId: string | null = null

  // Watch for thread changes and reload messages when switching threads
  if (threadsStore) {
    watch(
      () => threadsStore.activeThreadId,
      async (newThreadId, oldThreadId) => {
        if (isSendingMessage.value || isLoadingThread.value) return
        if (newThreadId === lastSyncedThreadId) return

        if (newThreadId && oldThreadId && newThreadId !== oldThreadId && threadsStore.currentThread) {
          isLoadingThread.value = true

          try {
            const thread = threadsStore.currentThread
            lastSyncedThreadId = newThreadId

            if (thread.messages && thread.messages.length > 0) {
              messages.value = convertThreadMessagesToChatMessages(thread.messages)
              sessionId.value = thread.sessionId
            } else {
              messages.value = initialGreeting ? [{
                text: initialGreeting,
                links: [],
                sender: 'bot',
                metadata: {}
              }] : []
              sessionId.value = thread.sessionId
            }
          } finally {
            isLoadingThread.value = false
          }
        }
      }
    )

    // Watch for currentThread.messages changes to sync across components
    let syncTimeoutId: NodeJS.Timeout | null = null
    watch(
      () => threadsStore.currentThread?.messages,
      (newMessages) => {
        if (isSendingMessage.value || isLoadingThread.value) return
        if (!newMessages || !threadsStore.currentThread) return

        if (syncTimeoutId) {
          clearTimeout(syncTimeoutId)
        }

        syncTimeoutId = setTimeout(() => {
          if (!threadsStore.currentThread) {
            syncTimeoutId = null
            return
          }

          const currentMsgCount = messages.value.filter(m =>
            !(m.sender === 'bot' && m.text === initialGreeting)
          ).length

          const threadMsgCount = newMessages.length

          if (threadMsgCount !== currentMsgCount) {
            if (threadMsgCount > 0) {
              messages.value = convertThreadMessagesToChatMessages(newMessages)
            } else if (initialGreeting) {
              messages.value = [{
                text: initialGreeting,
                links: [],
                sender: 'bot',
                metadata: {}
              }]
            } else {
              messages.value = []
            }
          }

          syncTimeoutId = null
        }, 100)
      },
      { deep: true }
    )
  }

  /**
   * Main message sending function using async polling
   */
  async function sendMessage(userInput: string) {
    if (!userInput.trim() || isSendingMessage.value) {
      return
    }

    isSendingMessage.value = true
    isLoading.value = true
    hasError.value = false
    errorMessage.value = ''

    try {
      // Add user message immediately
      const userMessage: ChatMessage = {
        text: userInput,
        links: [],
        sender: 'user',
        metadata: {}
      }

      messages.value.push(userMessage)
      scrollTrigger.value++

      // Save user message to thread store
      if (threadsStore) {
        const messageData = convertChatMessageToThreadMessage(userMessage)
        const messageId = await threadsStore.addMessage(messageData)

        // Start streaming placeholder
        await threadsStore.startStreamingMessage('assistant', '', {})
      }

      // Get conversation history for context
      const conversationHistory = messages.value
        .filter(m => m.sender !== 'bot' || m.text !== initialGreeting)
        .map(m => ({
          role: m.sender === 'user' ? 'user' : 'assistant',
          content: m.text
        }))

      // Get active enclave for account context
      const enclaveStore = useEnclaveStore()
      const activeEnclave = enclaveStore.activeEnclave

      // Submit async query
      const response = await $fetch(endpoint, {
        method: 'POST',
        body: {
          message: userInput,
          accountIdentifier: activeEnclave?.id || undefined,
          conversationHistory: conversationHistory.slice(-10), // Last 10 messages for context
          timezone: userTimezone.value
        }
      })

      if (!response.success || !response.jobId) {
        throw new Error(response.error || 'Failed to submit query')
      }

      currentJobId.value = response.jobId

      // Start polling for results
      await pollJobStatus(response.jobId)

    } catch (error: any) {
      console.error('[StrandsChat] Error sending message:', error)
      hasError.value = true
      errorMessage.value = error.message || 'Failed to send message'

      // Update thread store with error
      if (threadsStore) {
        await threadsStore.handleStreamingError(
          'error',
          error.message || 'Failed to process query'
        )
      }

      // Add error message to UI
      messages.value.push({
        text: `❌ Error: ${error.message || 'Failed to send message'}`,
        links: [],
        sender: 'bot',
        metadata: {}
      })
      scrollTrigger.value++

    } finally {
      isLoading.value = false
      isSendingMessage.value = false
      currentJobId.value = undefined
      pollingProgress.value = 'Thinking...'
      pollingPercent.value = 0
      toolsCalled.value = []
    }
  }

  /**
   * Poll job status with adaptive backoff
   */
  async function pollJobStatus(jobId: string) {
    const maxAttempts = 300 // 5 minutes maximum
    const pollUrl = `${endpoint}/${jobId}`
    let attempts = 0
    let pollInterval = 1000 // Start with 1 second
    const maxInterval = 5000 // Cap at 5 seconds

    while (attempts < maxAttempts) {
      attempts++

      try {
        // Wait before polling (except first attempt)
        if (attempts > 1) {
          await new Promise(resolve => setTimeout(resolve, pollInterval))
        }

        // Poll for status
        const status = await $fetch(pollUrl, {
          method: 'GET'
        })

        if (!status.success) {
          throw new Error(status.error || 'Failed to poll job status')
        }

        // Update UI with progress
        pollingProgress.value = status.currentStep || 'Processing...'
        pollingPercent.value = status.progressPercent || 0
        toolsCalled.value = status.toolsCalled || []

        // Update thread store with progress
        if (threadsStore) {
          await threadsStore.updateStreamingStatus({
            status: 'streaming',
            progress: status.currentStep,
            toolsCalled: status.toolsCalled
          })
        }

        // Check if complete
        if (status.status === 'complete') {
          await handleJobComplete(status)
          return
        }

        // Check if errored
        if (status.status === 'error') {
          throw new Error(status.errorMessage || 'Query failed')
        }

        // Adaptive backoff - increase interval gradually
        if (status.status === 'running' || status.status === 'queued') {
          pollInterval = Math.min(pollInterval * 1.5, maxInterval)
        }

      } catch (error: any) {
        console.error('[StrandsChat] Polling error:', error)

        // Network errors - retry with delay
        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 2000))
          continue
        }

        // Max attempts reached
        throw error
      }
    }

    // Timeout
    throw new Error('Query timeout - operation took too long')
  }

  /**
   * Handle job completion
   */
  async function handleJobComplete(status: any) {
    const botResponse = status.response || 'No response received.'
    const metadata = status.metadata || {}

    // Simulate streaming effect (typewriter)
    await simulateStreamingEffect(botResponse, metadata, status.suggestedLinks, status.suggestedPrompts)
  }

  /**
   * Simulate typewriter streaming effect
   * Displays complete response character-by-character for better UX
   */
  async function simulateStreamingEffect(
    fullText: string,
    metadata: any,
    suggestedLinks: any[] = [],
    suggestedPrompts: SuggestedPrompt[] = []
  ) {
    // Add placeholder message
    const botMessage: ChatMessage = {
      text: '',
      links: [],
      sender: 'bot',
      metadata,
      suggestedLinks,
      suggestedPrompts
    }

    messages.value.push(botMessage)
    scrollTrigger.value++

    // Stream characters
    const charsPerFrame = 15 // Characters to add per frame (faster than real streaming)
    const frameDelay = 30 // ms between frames

    for (let i = 0; i < fullText.length; i += charsPerFrame) {
      const chunk = fullText.substring(i, i + charsPerFrame)
      botMessage.text += chunk

      // Update thread store
      if (threadsStore) {
        await threadsStore.appendStreamingContent(chunk, botMessage.text)
      }

      scrollTrigger.value++
      await new Promise(resolve => setTimeout(resolve, frameDelay))
    }

    // Complete the message
    if (threadsStore) {
      await threadsStore.completeStreamingMessage(
        fullText,
        metadata,
        suggestedLinks,
        suggestedPrompts
      )
    }
  }

  /**
   * Handle disambiguation selection
   */
  async function handleDisambiguationSelection(selectedAccountId: string) {
    showDisambiguation.value = false
    const messageToSend = pendingMessage.value
    disambiguationData.value = null
    pendingMessage.value = ''

    // Send original message with selected account
    await sendMessage(`[Account: ${selectedAccountId}] ${messageToSend}`)
  }

  /**
   * Cancel disambiguation
   */
  function cancelDisambiguation() {
    showDisambiguation.value = false
    disambiguationData.value = null
    pendingMessage.value = ''
    isLoading.value = false
    isSendingMessage.value = false
  }

  /**
   * Clear chat history
   */
  function clearMessages() {
    if (threadsStore) {
      threadsStore.clearCurrentThread()
    } else {
      messages.value = initialGreeting ? [{
        text: initialGreeting,
        links: [],
        sender: 'bot',
        metadata: {}
      }] : []
    }
    sessionId.value = undefined
    scrollTrigger.value++
  }

  return {
    messages: readonly(messages),
    isLoading: readonly(isLoading),
    sessionId: readonly(sessionId),
    scrollTrigger: readonly(scrollTrigger),
    userTimezone: readonly(userTimezone),
    showDisambiguation: readonly(showDisambiguation),
    disambiguationData: readonly(disambiguationData),
    pollingProgress: readonly(pollingProgress),
    pollingPercent: readonly(pollingPercent),
    toolsCalled: readonly(toolsCalled),
    hasError: readonly(hasError),
    errorMessage: readonly(errorMessage),
    sendMessage,
    handleDisambiguationSelection,
    cancelDisambiguation,
    clearMessages
  }
}
