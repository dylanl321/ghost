/**
 * Shared chat logic for all Strands chat implementations
 * Used by: StrandsChatbot, StrandsChatPopup, GhostChatFullPage
 */

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
  threadsStore?: any // Optional Pinia store for persisting messages
  loadMessagesFromThread?: boolean // If true, load messages from thread instead of using initialGreeting
}

export function useStrandsChat(options: StrandsChatOptions = {}) {
  const {
    initialGreeting = "Hello! I'm GHOST Chat, your AI assistant for AWS operations. I can help you with cost analysis, configuration lookups, security findings, and more.\n\nFor best results, be explicit about AWS account IDs in your queries.",
    endpoint = '/api/strands/chat',
    threadsStore = null,
    loadMessagesFromThread = false
  } = options

  // State - Initialize from thread if available, otherwise use greeting
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

  // If we have a thread with messages, load them after component mount
  // This handles the case where the thread exists but messages weren't loaded initially
  if (threadsStore?.currentThread?.messages && threadsStore.currentThread.messages.length > 0) {
    // Use nextTick to ensure reactive updates are processed
    nextTick(() => {
      // Double-check the thread still exists and has messages
      if (threadsStore.currentThread?.messages && threadsStore.currentThread.messages.length > 0) {
        messages.value = convertThreadMessagesToChatMessages(threadsStore.currentThread.messages)
        sessionId.value = threadsStore.currentThread.sessionId
      }
    })
  }

  const isLoading = ref(false)
  const sessionId = ref<string | undefined>(threadsStore?.currentThread?.sessionId || undefined)
  const scrollTrigger = ref(0) // Increment to trigger scroll in components
  const isSendingMessage = ref(false) // Track if we're in the middle of sending a message

  // Detect user's timezone
  const userTimezone = ref<string>(
    Intl.DateTimeFormat().resolvedOptions().timeZone
  )

  // Disambiguation state
  const showDisambiguation = ref(false)
  const disambiguationData = ref<any>(null)
  const pendingMessage = ref<string>('')

  // Watch for thread changes and reload messages when switching threads
  if (threadsStore) {
    watch(
      () => threadsStore.activeThreadId,
      (newThreadId, oldThreadId) => {
        // Don't reload if we're in the middle of sending a message
        if (isSendingMessage.value) return

        // Only reload if:
        // 1. Switching from one existing thread to another (both have values)
        // 2. Don't reload when going from null -> UUID (first message creation)
        if (newThreadId && oldThreadId && newThreadId !== oldThreadId && threadsStore.currentThread) {
          const thread = threadsStore.currentThread
          if (thread.messages && thread.messages.length > 0) {
            // Thread has messages - reload them
            messages.value = convertThreadMessagesToChatMessages(thread.messages)
            sessionId.value = thread.sessionId
          } else {
            // New empty thread - show welcome message
            messages.value = initialGreeting ? [{
              text: initialGreeting,
              links: [],
              sender: 'bot',
              metadata: {}
            }] : []
            sessionId.value = thread.sessionId
          }
        }
      }
    )

    // Watch for currentThread.messages changes to sync across components
    // This ensures popup and full page stay in sync
    watch(
      () => threadsStore.currentThread?.messages,
      (newMessages, oldMessages) => {
        // Don't reload if we're in the middle of sending a message
        if (isSendingMessage.value) return

        // Only sync if the messages array actually changed
        if (!newMessages || !threadsStore.currentThread) return

        // Calculate actual message count (excluding welcome message)
        const currentMsgCount = messages.value.filter(m =>
          !(m.sender === 'bot' && m.text === initialGreeting)
        ).length

        const threadMsgCount = newMessages.length

        // Sync if thread has different message count than our local state
        if (threadMsgCount !== currentMsgCount) {
          if (threadMsgCount > 0) {
            messages.value = convertThreadMessagesToChatMessages(newMessages)
            sessionId.value = threadsStore.currentThread.sessionId
          } else {
            // Thread was cleared - show welcome message
            messages.value = initialGreeting ? [{
              text: initialGreeting,
              links: [],
              sender: 'bot',
              metadata: {}
            }] : []
            sessionId.value = threadsStore.currentThread.sessionId
          }
        }
      },
      { deep: true, immediate: true }
    )

    // Also watch for currentThread changes (handles initial load case)
    watch(
      () => threadsStore.currentThread,
      (newThread) => {
        // Don't reload if we're in the middle of sending a message
        if (isSendingMessage.value) return

        // Only reload if we don't have messages yet and the thread has messages
        if (newThread && newThread.messages && newThread.messages.length > 0 && messages.value.length <= 1) {
          // Check if we only have the welcome message
          const hasOnlyWelcome = messages.value.length === 1 && messages.value[0].sender === 'bot'
          if (hasOnlyWelcome || messages.value.length === 0) {
            messages.value = convertThreadMessagesToChatMessages(newThread.messages)
            sessionId.value = newThread.sessionId
          }
        }
      },
      { immediate: true }
    )
  }

  // Build conversation history from messages
  const getConversationHistory = () => {
    const history = messages.value
      .filter(msg => msg.sender === 'user' || msg.sender === 'bot')
      .map(msg => ({
        role: msg.sender === 'user' ? 'user' as const : 'assistant' as const,
        content: msg.text
      }))

    // Only skip the first message if we have an initial greeting
    // Popup has no greeting, so we need all messages
    if (initialGreeting && history.length > 0 && history[0].role === 'assistant') {
      return history.slice(1)
    }

    return history
  }

  // Execute query (core API logic)
  const executeQuery = async (userMessage: string, mentionedAccount?: { accountId: string; accountName: string }) => {
    try {
      const conversationHistory = getConversationHistory()

      const requestData: any = {
        message: userMessage,
        conversationHistory,
        sessionId: sessionId.value,
        timezone: userTimezone.value
      }

      // Add mentioned account context if available
      if (mentionedAccount) {
        requestData.mentionedAccount = mentionedAccount
      }

      const data = await $fetch<{
        data: {
          responseBody: string
          sessionId?: string
          metadata?: {
            accountId?: string
            mcpUsed?: string
            mcpType?: 'permanent' | 'temporary'
          }
          references?: Array<{ document: string }>
          disambiguation?: any
          suggestedLinks?: any[]
          suggestedPrompts?: SuggestedPrompt[]
          error?: string | null
        }
      }>(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestData,
        // Match backend timeout (5 minutes) - Strands MCP operations can take 2+ minutes
        timeout: 300000
      })

      // Update session ID if provided
      if (data.data?.sessionId) {
        sessionId.value = data.data.sessionId

        // Update thread with session ID if using threads store
        if (threadsStore?.activeThreadId && threadsStore.currentThread) {
          // Store session ID in thread (we'll update the thread metadata)
          threadsStore.currentThread.sessionId = data.data.sessionId
        }
      }

      // Check for disambiguation first
      if (data.data?.disambiguation) {
        disambiguationData.value = data.data.disambiguation
        pendingMessage.value = userMessage
        showDisambiguation.value = true
        isLoading.value = false
        return
      }

      // Check for error field (Strands returns errors with HTTP 200)
      if (data.data?.error) {
        const errorMessage: ChatMessage = {
          text: data.data.error,
          links: [],
          sender: 'bot',
          metadata: data.data.metadata || {}
        }
        messages.value.push(errorMessage)
        scrollTrigger.value++

        // Save error message to thread if using threads store
        if (threadsStore) {
          await threadsStore.addMessage(convertChatMessageToThreadMessage(errorMessage))
        }
        return
      }

      let message = data.data.responseBody || 'No response generated'

      // Remove any markdown code spans from response
      message = message.replaceAll("```markdown", "")
      message = message.replaceAll("```", "")

      // Handle references if provided
      const links = (data.data.references || []).map(ref => ref.document)

      // Remove duplicates
      const uniqueLinks = [...new Set(links)]

      const botMessage: ChatMessage = {
        text: message,
        links: uniqueLinks,
        sender: 'bot',
        metadata: data.data.metadata || {},
        suggestedLinks: data.data.suggestedLinks || [],
        suggestedPrompts: data.data.suggestedPrompts || []
      }

      messages.value.push(botMessage)
      scrollTrigger.value++ // Trigger scroll after bot message

      // Save bot message to thread if using threads store
      if (threadsStore) {
        await threadsStore.addMessage(convertChatMessageToThreadMessage(botMessage))
      }
    } catch (error: any) {
      console.error('Strands API error:', error)

      // Provide more helpful error messages based on error type
      let errorText = 'Sorry, something went wrong. The GHOST Chat service may be unavailable.'

      if (error.name === 'AbortError' || error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
        errorText = 'The request timed out. This can happen with complex queries or when accessing accounts for the first time (MCP startup can take 2+ minutes). Please try your query again.'
      } else if (error.statusCode === 503) {
        errorText = 'The GHOST Chat service is temporarily unavailable. Please try again in a moment.'
      } else if (error.data?.error?.message) {
        errorText = error.data.error.message
      }

      const errorMessage: ChatMessage = {
        text: errorText,
        links: [],
        sender: 'bot',
        metadata: {}
      }
      messages.value.push(errorMessage)
      scrollTrigger.value++ // Trigger scroll after error message

      // Save error message to thread if using threads store
      if (threadsStore) {
        await threadsStore.addMessage(convertChatMessageToThreadMessage(errorMessage))
      }
    } finally {
      isLoading.value = false
    }
  }

  // Check if streaming is enabled for this user
  // Note: Streaming is enabled by default. Configuration is managed server-side.
  const isStreamingEnabled = async (): Promise<boolean> => {
    // Streaming is enabled by default
    // The server will handle any rollout logic if needed
    return true
  }

  // Send message with SSE streaming (with reconnection support)
  const sendMessageStreaming = async (
    userInput: string,
    mentionedAccount?: { accountId: string; accountName: string },
    reconnectAttempt = 0
  ) => {
    if (!userInput.trim() || isLoading.value) return

    // Set flag to prevent watch from interfering
    isSendingMessage.value = true

    const toast = useToast()

    try {
      const userMessage: ChatMessage = {
        text: userInput.trim(),
        links: [],
        sender: 'user',
        metadata: {}
      }
      messages.value.push(userMessage)
      scrollTrigger.value++ // Trigger scroll after user message

      // Save user message to thread if using threads store
      if (threadsStore) {
        await threadsStore.addMessage(convertChatMessageToThreadMessage(userMessage))
      }

      // Create placeholder for bot response
      const botMessageId = `msg-${Date.now()}-${Math.random().toString(36).substring(7)}`
      if (threadsStore && threadsStore.activeThreadId) {
        threadsStore.startStreamingMessage(
          threadsStore.activeThreadId,
          botMessageId,
          'assistant'
        )
      }

      isLoading.value = true

      // Build conversation history
      const conversationHistory = getConversationHistory()

      // Connect to SSE endpoint
      const requestData: any = {
        message: userInput,
        conversationHistory,
        sessionId: sessionId.value,
        timezone: userTimezone.value
      }

      if (mentionedAccount) {
        requestData.mentionedAccount = mentionedAccount
      }

      const response = await fetch('/api/strands/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream'
        },
        body: JSON.stringify(requestData)
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      if (!response.body) {
        throw new Error('Response body is empty')
      }

      // Read SSE stream
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim()) continue

          const [eventLine, dataLine] = line.split('\n')
          if (!eventLine?.startsWith('event:') || !dataLine?.startsWith('data:')) {
            continue
          }

          const eventType = eventLine.substring(7).trim()
          const data = JSON.parse(dataLine.substring(6))

          // Handle events
          switch (eventType) {
            case 'status':
              if (threadsStore) {
                const currentStatus = threadsStore.getStreamingMessage(botMessageId)?.status
                threadsStore.updateStreamingStatus(botMessageId, {
                  status: 'streaming',
                  progress: data.message,
                  toolsCalled: currentStatus?.toolsCalled || []
                })
              }
              break

            case 'tool_call':
              if (threadsStore) {
                const currentStatus = threadsStore.getStreamingMessage(botMessageId)?.status
                threadsStore.updateStreamingStatus(botMessageId, {
                  status: 'streaming',
                  progress: data.message,
                  toolsCalled: [...(currentStatus?.toolsCalled || []), data.tool_name]
                })
              }
              break

            case 'response':
              if (threadsStore) {
                threadsStore.appendStreamingContent(botMessageId, data.delta)
              }
              scrollTrigger.value++
              break

            case 'complete':
              if (threadsStore) {
                await threadsStore.completeStreamingMessage(
                  botMessageId,
                  data.response,
                  data.metadata,
                  data.suggestedLinks,
                  data.suggestedPrompts
                )
              }
              if (data.sessionId) {
                sessionId.value = data.sessionId
              }
              scrollTrigger.value++
              break

            case 'error':
              if (threadsStore) {
                threadsStore.handleStreamingError(botMessageId, data.message)
              }
              scrollTrigger.value++
              break

            case 'disambiguation':
              disambiguationData.value = data
              pendingMessage.value = userInput
              showDisambiguation.value = true
              if (threadsStore) {
                threadsStore.handleStreamingError(botMessageId, 'Account disambiguation required')
              }
              break
          }
        }
      }
    } catch (error: any) {
      console.error('[useStrandsChat] Streaming error:', error)

      // Check if this is a connection error that should trigger reconnection
      const isConnectionError = error.name === 'AbortError' ||
                               error.message?.includes('timeout') ||
                               error.message?.includes('network') ||
                               error.message?.includes('connection')

      // Use hardcoded defaults for reconnection config
      const maxAttempts = 3
      const showIndicator = true

      if (isConnectionError && reconnectAttempt < maxAttempts) {
        // Show reconnection toast
        if (showIndicator) {
          toast.add({
            title: 'Connection Lost',
            description: `Reconnecting... (Attempt ${reconnectAttempt + 1}/${maxAttempts})`,
            icon: 'i-heroicons-arrow-path',
            color: 'orange',
            timeout: 3000
          })
        }

        // Wait with exponential backoff
        const delayMs = Math.pow(2, reconnectAttempt) * 1000 // 1s, 2s, 4s
        await new Promise(resolve => setTimeout(resolve, delayMs))

        // Retry
        isSendingMessage.value = false // Reset flag before retry
        return sendMessageStreaming(userInput, mentionedAccount, reconnectAttempt + 1)
      }

      // Max retries exceeded or non-connection error
      if (reconnectAttempt >= maxAttempts && showIndicator) {
        toast.add({
          title: 'Connection Failed',
          description: `Unable to reconnect after ${maxAttempts} attempts. Please try again.`,
          icon: 'i-heroicons-exclamation-triangle',
          color: 'red',
          timeout: 5000,
          actions: [{
            label: 'Retry',
            click: () => {
              sendMessage(userInput, mentionedAccount)
            }
          }]
        })
      }

      // Create error message
      const errorMessage: ChatMessage = {
        text: reconnectAttempt >= maxAttempts
          ? `Connection failed after ${maxAttempts} attempts. Please try again.`
          : error.message || 'An error occurred while processing your query',
        links: [],
        sender: 'bot',
        metadata: {}
      }
      messages.value.push(errorMessage)
      scrollTrigger.value++

      if (threadsStore) {
        await threadsStore.addMessage(convertChatMessageToThreadMessage(errorMessage))
      }
    } finally {
      isLoading.value = false
      isSendingMessage.value = false
    }
  }

  // Send message (adds user message then executes query)
  const sendMessage = async (userInput: string, mentionedAccount?: { accountId: string; accountName: string }) => {
    // Check if streaming is enabled and use it if threads store is available
    if (threadsStore && await isStreamingEnabled()) {
      return sendMessageStreaming(userInput, mentionedAccount)
    }

    // Fallback to legacy non-streaming
    if (!userInput.trim() || isLoading.value) return

    // Set flag to prevent watch from interfering
    isSendingMessage.value = true

    try {
      const userMessage: ChatMessage = {
        text: userInput.trim(),
        links: [],
        sender: 'user',
        metadata: {}
      }
      messages.value.push(userMessage)
      scrollTrigger.value++ // Trigger scroll after user message

      // Save user message to thread if using threads store
      // The store will auto-create a thread if one doesn't exist
      if (threadsStore) {
        await threadsStore.addMessage(convertChatMessageToThreadMessage(userMessage))
      }

      isLoading.value = true
      await executeQuery(userInput.trim(), mentionedAccount)
    } catch (error) {
      console.error('Error sending message:', error)
      // Don't rethrow - let executeQuery handle errors
    } finally {
      isSendingMessage.value = false
      // Note: isLoading is set to false in executeQuery's finally block
    }
  }

  // Handle account selection from disambiguation modal
  const handleAccountSelected = async (requestId: string) => {
    try {
      // Submit selection to backend (camelCase format)
      await $fetch('/api/strands/account/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          sessionId: sessionId.value,
          requestId: requestId
        }
      })

      // Close modal
      showDisambiguation.value = false

      // Re-execute the original query with the selected account
      isLoading.value = true
      await executeQuery(pendingMessage.value)
      pendingMessage.value = ''

    } catch (error: any) {
      console.error('Error selecting account:', error)
      const errorMessage: ChatMessage = {
        text: error.data?.error?.message || 'Failed to select account. Please try again.',
        links: [],
        sender: 'bot',
        metadata: {}
      }
      messages.value.push(errorMessage)
      showDisambiguation.value = false
      isLoading.value = false
    }
  }

  // Handle disambiguation cancel
  const handleDisambiguationCancel = () => {
    showDisambiguation.value = false
    disambiguationData.value = null
    pendingMessage.value = ''
    isLoading.value = false
  }

  // Clear chat
  const clearChat = () => {
    messages.value = [{
      text: initialGreeting,
      links: [],
      sender: 'bot',
      metadata: {}
    }]
    sessionId.value = undefined
  }

  return {
    // State
    messages,
    isLoading,
    sessionId,
    userTimezone,
    showDisambiguation,
    disambiguationData,
    pendingMessage,
    scrollTrigger,

    // Methods
    sendMessage,
    executeQuery,
    handleAccountSelected,
    handleDisambiguationCancel,
    clearChat,
    getConversationHistory
  }
}
