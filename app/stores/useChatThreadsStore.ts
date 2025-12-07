/**
 * Chat Threads Store
 * Manages chat thread state and operations
 */

import { defineStore } from 'pinia'
import type {
  ChatThread,
  ChatMessage,
  ChatThreadFilters,
  ChatThreadSummary,
  ShareThreadResponse,
  StreamingChatMessage,
  MessageStatus
} from '~/shared/types/chat-threads'

interface ChatThreadsState {
  threads: ChatThread[]
  activeThreadId: string | null
  currentThread: ChatThread | null
  loading: boolean
  error: string | null
  filters: ChatThreadFilters
  // Streaming state
  streamingMessages: Map<string, StreamingChatMessage>
  activeStreams: Set<string>
  activeStreamCount: number // Simple counter for reactivity
}

export const useChatThreadsStore = defineStore('chatThreads', {
  state: (): ChatThreadsState => ({
    threads: [],
    activeThreadId: null,
    currentThread: null,
    loading: false,
    error: null,
    filters: {
      isArchived: false, // By default, don't show archived threads
      limit: 50
    },
    // Streaming state
    streamingMessages: new Map(),
    activeStreams: new Set(),
    activeStreamCount: 0
  }),

  getters: {
    /**
     * Get pinned threads (sorted by last message)
     */
    pinnedThreads: (state): ChatThread[] => {
      return state.threads
        .filter(t => t.isPinned && !t.isArchived)
        .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())
    },

    /**
     * Get unpinned threads (sorted by last message)
     */
    unpinnedThreads: (state): ChatThread[] => {
      return state.threads
        .filter(t => !t.isPinned && !t.isArchived)
        .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())
    },

    /**
     * Get archived threads
     */
    archivedThreads: (state): ChatThread[] => {
      return state.threads
        .filter(t => t.isArchived)
        .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())
    },

    /**
     * Check if there's an active thread
     */
    hasActiveThread: (state): boolean => {
      return !!state.activeThreadId && !!state.currentThread
    },

    /**
     * Get thread summaries for list view
     */
    threadSummaries: (state): ChatThreadSummary[] => {
      return state.threads.map(thread => ({
        threadId: thread.threadId,
        title: thread.title,
        messageCount: thread.messageCount,
        lastMessageAt: thread.lastMessageAt,
        lastMessagePreview: thread.messages[thread.messages.length - 1]?.content.substring(0, 100) || '',
        isPinned: thread.isPinned,
        isArchived: thread.isArchived,
        isShared: thread.isShared
      }))
    },

    /**
     * Get count of active streams (reactive getter)
     * Uses a simple counter for reactivity (Set.size isn't reactive in Vue 3)
     */
    getActiveStreamCount: (state): number => {
      return state.activeStreamCount
    }
  },

  actions: {
    /**
     * Fetch all threads for the user
     */
    async fetchThreads(filters?: ChatThreadFilters) {
      this.loading = true
      this.error = null

      try {
        const params = new URLSearchParams()

        const appliedFilters = { ...this.filters, ...filters }

        if (appliedFilters.isPinned !== undefined) {
          params.append('isPinned', String(appliedFilters.isPinned))
        }
        if (appliedFilters.isArchived !== undefined) {
          params.append('isArchived', String(appliedFilters.isArchived))
        }
        if (appliedFilters.isShared !== undefined) {
          params.append('isShared', String(appliedFilters.isShared))
        }
        if (appliedFilters.searchQuery) {
          params.append('searchQuery', appliedFilters.searchQuery)
        }
        if (appliedFilters.limit) {
          params.append('limit', String(appliedFilters.limit))
        }
        if (appliedFilters.startDate) {
          params.append('startDate', appliedFilters.startDate)
        }
        if (appliedFilters.endDate) {
          params.append('endDate', appliedFilters.endDate)
        }

        const { data } = await $fetch<{ data: { threads: ChatThread[] } }>(
          `/api/chat/threads/list?${params.toString()}`
        )

        this.threads = data.threads
        this.filters = appliedFilters
      } catch (err: any) {
        this.error = err.data?.error?.message || 'Failed to fetch threads'
        console.error('[Chat Threads Store] Error fetching threads:', err)
      } finally {
        this.loading = false
      }
    },

    /**
     * Create a new thread
     */
    async createThread(title?: string, initialMessage?: string): Promise<ChatThread | null> {
      this.loading = true
      this.error = null

      try {
        const { data } = await $fetch<{ data: ChatThread }>('/api/chat/threads/create', {
          method: 'POST',
          body: { title, initialMessage }
        })

        // Ensure messages array is initialized
        if (!data.messages) {
          data.messages = []
        }

        // Add to threads list
        this.threads.unshift(data)

        // Set as active thread
        this.activeThreadId = data.threadId
        this.currentThread = data

        return data
      } catch (err: any) {
        this.error = err.data?.error?.message || 'Failed to create thread'
        console.error('[Chat Threads Store] Error creating thread:', err)
        return null
      } finally {
        this.loading = false
      }
    },

    /**
     * Load a specific thread
     */
    async loadThread(threadId: string): Promise<boolean> {
      this.loading = true
      this.error = null

      try {
        // Clean up any lingering streaming state for this thread BEFORE loading
        // This prevents stuck "GHOST is thinking" indicators
        const streamingMessagesToCleanup: string[] = []
        for (const [messageId, msg] of this.streamingMessages.entries()) {
          // Check if this streaming message belongs to the thread we're loading
          // or if it's been in 'complete' status (shouldn't happen but defensive)
          if (msg.threadId === threadId || msg.status?.status === 'complete') {
            streamingMessagesToCleanup.push(messageId)
          }
        }

        // Cleanup identified messages
        for (const messageId of streamingMessagesToCleanup) {
          this.streamingMessages.delete(messageId)
          this.activeStreams.delete(messageId)
          this.activeStreamCount = Math.max(0, this.activeStreamCount - 1)
        }

        if (streamingMessagesToCleanup.length > 0) {
          console.log('[Store] Cleaned up', streamingMessagesToCleanup.length, 'lingering streaming messages for thread', threadId)
        }

        const { data } = await $fetch<{ data: ChatThread }>(`/api/chat/threads/${threadId}`)

        // Ensure messages array exists first
        if (!data.messages) {
          data.messages = []
        }

        // Preserve any in-memory streaming messages before loading
        // Defensive check: ensure currentThread and messages exist before filtering
        const inMemoryStreamingMessages = (this.currentThread?.threadId === threadId &&
                                          this.currentThread.messages &&
                                          Array.isArray(this.currentThread.messages))
          ? this.currentThread.messages.filter(m =>
              m.status && (m.status.status === 'pending' || m.status.status === 'streaming')
            )
          : []

        // Merge DB messages with in-memory streaming messages
        if (inMemoryStreamingMessages.length > 0) {
          data.messages = [...data.messages, ...inMemoryStreamingMessages]
          console.log('[Store] Preserved', inMemoryStreamingMessages.length, 'streaming messages during loadThread')
        }

        this.currentThread = data
        this.activeThreadId = threadId

        // Update in threads list if exists
        const index = this.threads.findIndex(t => t.threadId === threadId)
        if (index !== -1) {
          this.threads[index] = data
        }

        return true
      } catch (err: any) {
        this.error = err.data?.error?.message || 'Failed to load thread'
        console.error('[Chat Threads Store] Error loading thread:', err)
        return false
      } finally {
        this.loading = false
      }
    },

    /**
     * Update thread metadata
     */
    async updateThread(
      threadId: string,
      updates: { title?: string; description?: string; isPinned?: boolean; isArchived?: boolean }
    ): Promise<boolean> {
      try {
        const { data } = await $fetch<{ data: ChatThread }>(`/api/chat/threads/${threadId}`, {
          method: 'PATCH',
          body: updates
        })

        // Update in threads list
        const index = this.threads.findIndex(t => t.threadId === threadId)
        if (index !== -1) {
          this.threads[index] = data
        }

        // Update current thread if it's the active one
        if (this.activeThreadId === threadId) {
          this.currentThread = data
        }

        return true
      } catch (err: any) {
        this.error = err.data?.error?.message || 'Failed to update thread'
        console.error('[Chat Threads Store] Error updating thread:', err)
        return false
      }
    },

    /**
     * Add a message to the current thread
     */
    async addMessage(message: Omit<ChatMessage, 'messageId' | 'timestamp'>): Promise<boolean> {
      // Auto-create thread if no active thread
      if (!this.activeThreadId || !this.currentThread) {
        const thread = await this.createThread()
        if (!thread) {
          return false
        }
        // Ensure messages array is initialized after thread creation
        if (!this.currentThread.messages) {
          this.currentThread.messages = []
        }
      }

      try {
        const { data } = await $fetch<{ data: ChatThread }>(`/api/chat/threads/${this.activeThreadId}/messages`, {
          method: 'POST',
          body: { message }
        })

        // Ensure messages array exists
        if (!data.messages) {
          data.messages = []
        }

        // Merge messages from DB with any in-memory streaming messages to prevent loss
        // This fixes the bug where streaming messages would disappear when reloading from DB
        // Defensive check: ensure currentThread and messages exist before filtering
        const inMemoryStreamingMessages = (this.currentThread && Array.isArray(this.currentThread.messages))
          ? this.currentThread.messages.filter(m =>
              m.status && (m.status.status === 'pending' || m.status.status === 'streaming')
            )
          : []

        // Update current thread metadata but preserve streaming messages
        if (this.currentThread) {
          this.currentThread.threadId = data.threadId
          this.currentThread.userId = data.userId
          this.currentThread.title = data.title
          this.currentThread.messageCount = data.messageCount
          this.currentThread.lastMessageAt = data.lastMessageAt
          this.currentThread.lastModifiedAt = data.lastModifiedAt
          this.currentThread.isPinned = data.isPinned
          this.currentThread.isArchived = data.isArchived
          this.currentThread.isShared = data.isShared

          // Merge DB messages with in-memory streaming messages
          if (inMemoryStreamingMessages.length > 0) {
            this.currentThread.messages = [...data.messages, ...inMemoryStreamingMessages]
            console.log('[Store] Preserved', inMemoryStreamingMessages.length, 'streaming messages during addMessage')
          } else {
            this.currentThread.messages = data.messages
          }
        } else {
          // No current thread yet (shouldn't happen, but be defensive)
          this.currentThread = data
        }

        // Update in threads list
        const index = this.threads.findIndex(t => t.threadId === this.activeThreadId)
        if (index !== -1) {
          this.threads[index] = { ...data }
          // Also preserve streaming messages in the threads list
          if (inMemoryStreamingMessages.length > 0) {
            this.threads[index].messages = [...data.messages, ...inMemoryStreamingMessages]
          }
        }

        return true
      } catch (err: any) {
        this.error = err.data?.error?.message || 'Failed to add message'
        console.error('[Chat Threads Store] Error adding message:', err)
        return false
      }
    },

    /**
     * Clear all messages from a thread
     */
    async clearThread(threadId: string): Promise<boolean> {
      try {
        const { data } = await $fetch<{ data: ChatThread }>(`/api/chat/threads/${threadId}/clear`, {
          method: 'POST'
        })

        // Update in threads list
        const index = this.threads.findIndex(t => t.threadId === threadId)
        if (index !== -1) {
          this.threads[index] = data
        }

        // Update current thread if it's the active one
        if (this.activeThreadId === threadId) {
          this.currentThread = data
        }

        return true
      } catch (err: any) {
        this.error = err.data?.error?.message || 'Failed to clear thread'
        console.error('[Chat Threads Store] Error clearing thread:', err)
        return false
      }
    },

    /**
     * Delete a thread
     */
    async deleteThread(threadId: string): Promise<boolean> {
      try {
        await $fetch(`/api/chat/threads/${threadId}`, {
          method: 'DELETE'
        })

        // Remove from threads list
        this.threads = this.threads.filter(t => t.threadId !== threadId)

        // Clear active thread if it was deleted
        if (this.activeThreadId === threadId) {
          this.activeThreadId = null
          this.currentThread = null
        }

        return true
      } catch (err: any) {
        this.error = err.data?.error?.message || 'Failed to delete thread'
        console.error('[Chat Threads Store] Error deleting thread:', err)
        return false
      }
    },

    /**
     * Delete a thread and automatically create a new one
     * This ensures the user always has an active thread
     */
    async deleteThreadAndCreateNew(threadId: string): Promise<ChatThread | null> {
      try {
        // First delete the thread
        const deleteSuccess = await this.deleteThread(threadId)
        if (!deleteSuccess) {
          return null
        }

        // Then create a new empty thread
        const newThread = await this.createThread('New Conversation')
        if (!newThread) {
          console.error('[Chat Threads Store] Failed to create new thread after deletion')
          return null
        }

        console.log('[Chat Threads Store] Deleted thread and created new thread:', newThread.threadId)
        return newThread
      } catch (err: any) {
        this.error = err.data?.error?.message || 'Failed to delete thread and create new'
        console.error('[Chat Threads Store] Error in deleteThreadAndCreateNew:', err)
        return null
      }
    },

    /**
     * Share a thread
     */
    async shareThread(threadId: string, expiresInDays: number = 90): Promise<ShareThreadResponse | null> {
      try {
        const { data } = await $fetch<{ data: ShareThreadResponse }>(`/api/chat/threads/${threadId}/share`, {
          method: 'POST',
          body: { expiresInDays }
        })

        // Update thread in list to mark as shared
        const index = this.threads.findIndex(t => t.threadId === threadId)
        if (index !== -1) {
          this.threads[index].isShared = true
          this.threads[index].shareId = data.shareId
          this.threads[index].shortCode = data.shortCode
          this.threads[index].shortUrl = data.shortUrl
        }

        // Update current thread if it's the active one
        if (this.activeThreadId === threadId && this.currentThread) {
          this.currentThread.isShared = true
          this.currentThread.shareId = data.shareId
          this.currentThread.shortCode = data.shortCode
          this.currentThread.shortUrl = data.shortUrl
        }

        return data
      } catch (err: any) {
        this.error = err.data?.error?.message || 'Failed to share thread'
        console.error('[Chat Threads Store] Error sharing thread:', err)
        return null
      }
    },

    /**
     * Unshare a thread
     */
    async unshareThread(threadId: string): Promise<boolean> {
      try {
        await $fetch(`/api/chat/threads/${threadId}/unshare`, {
          method: 'DELETE'
        })

        // Update thread in list
        const index = this.threads.findIndex(t => t.threadId === threadId)
        if (index !== -1) {
          this.threads[index].isShared = false
          this.threads[index].shareId = undefined
          this.threads[index].shortCode = undefined
          this.threads[index].shortUrl = undefined
        }

        // Update current thread if it's the active one
        if (this.activeThreadId === threadId && this.currentThread) {
          this.currentThread.isShared = false
        }

        return true
      } catch (err: any) {
        this.error = err.data?.error?.message || 'Failed to unshare thread'
        console.error('[Chat Threads Store] Error unsharing thread:', err)
        return false
      }
    },

    /**
     * Export a thread
     */
    async exportThread(threadId: string, format: 'json' | 'markdown'): Promise<boolean> {
      try {
        const response = await fetch(`/api/chat/threads/${threadId}/export?format=${format}`)

        if (!response.ok) {
          throw new Error('Export failed')
        }

        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `chat-${threadId}-${Date.now()}.${format === 'json' ? 'json' : 'md'}`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)

        return true
      } catch (err: any) {
        this.error = 'Failed to export thread'
        console.error('[Chat Threads Store] Error exporting thread:', err)
        return false
      }
    },

    /**
     * Set active thread
     */
    setActiveThread(threadId: string | null) {
      this.activeThreadId = threadId

      if (threadId) {
        const thread = this.threads.find(t => t.threadId === threadId)
        if (thread) {
          this.currentThread = thread
        } else {
          // Load thread if not in list
          this.loadThread(threadId)
        }
      } else {
        this.currentThread = null
      }
    },

    /**
     * Clear error
     */
    clearError() {
      this.error = null
    },

    // =============================================================================
    // Streaming Actions
    // =============================================================================

    /**
     * Start streaming a message
     */
    startStreamingMessage(threadId: string, messageId: string, role: 'assistant'): StreamingChatMessage {
      const message: StreamingChatMessage = {
        messageId,
        role,
        content: '',
        timestamp: new Date().toISOString(),
        status: {
          status: 'pending',
          progress: 'Starting...',
          toolsCalled: []
        },
        streamBuffer: ''
      }

      this.streamingMessages.set(messageId, message)
      this.activeStreams.add(messageId)
      this.activeStreamCount++ // Increment counter for reactivity

      // Add to current thread's messages if this is the active thread
      if (this.currentThread?.threadId === threadId) {
        // Ensure messages array exists before pushing
        if (!this.currentThread.messages) {
          this.currentThread.messages = []
        }
        this.currentThread.messages.push(message)
      }

      return message
    },

    /**
     * Update streaming message status
     */
    updateStreamingStatus(messageId: string, status: MessageStatus) {
      console.log('[Store] updateStreamingStatus called:', messageId, status)
      const message = this.streamingMessages.get(messageId)
      if (message) {
        message.status = status

        // Update in current thread messages too
        if (this.currentThread?.messages && Array.isArray(this.currentThread.messages)) {
          const msgIndex = this.currentThread.messages.findIndex(m => m.messageId === messageId)
          if (msgIndex !== -1) {
            this.currentThread.messages[msgIndex].status = status
            console.log('[Store] Updated status in currentThread.messages at index:', msgIndex)
          } else {
            console.warn('[Store] Message not found in currentThread.messages:', messageId)
          }
        }
      } else {
        console.warn('[Store] Message not found in streamingMessages:', messageId)
      }
    },

    /**
     * Append content chunk to streaming message
     */
    appendStreamingContent(messageId: string, delta: string) {
      console.log('[Store] appendStreamingContent called, delta length:', delta?.length)
      const message = this.streamingMessages.get(messageId)
      if (message) {
        message.streamBuffer = (message.streamBuffer || '') + delta
        message.content = message.streamBuffer
        console.log('[Store] New content length:', message.content.length)

        // Update in current thread messages too
        if (this.currentThread?.messages && Array.isArray(this.currentThread.messages)) {
          const msgIndex = this.currentThread.messages.findIndex(m => m.messageId === messageId)
          if (msgIndex !== -1) {
            this.currentThread.messages[msgIndex].content = message.content
            this.currentThread.messages[msgIndex].streamBuffer = message.streamBuffer
            console.log('[Store] Updated content in currentThread.messages at index:', msgIndex)
          }
        }
      } else {
        console.warn('[Store] Message not found in appendStreamingContent:', messageId)
      }
    },

    /**
     * Complete streaming message and save to database
     */
    async completeStreamingMessage(
      messageId: string,
      finalContent: string,
      metadata?: any,
      suggestedLinks?: any[],
      suggestedPrompts?: any[]
    ): Promise<boolean> {
      console.log('[Store] completeStreamingMessage called:', messageId, 'content length:', finalContent?.length)
      const message = this.streamingMessages.get(messageId)
      if (!message) {
        console.warn('[Store] Message not found in completeStreamingMessage:', messageId)
        return false
      }

      // Update final content and metadata
      message.content = finalContent
      message.metadata = metadata
      message.suggestedLinks = suggestedLinks
      message.suggestedPrompts = suggestedPrompts
      message.status = { status: 'complete' }
      delete message.streamBuffer

      // Create the completed message object
      const completedMessage = {
        messageId: message.messageId,
        role: message.role,
        content: message.content,
        timestamp: message.timestamp,
        metadata: message.metadata,
        links: message.links,
        suggestedLinks: message.suggestedLinks,
        suggestedPrompts: message.suggestedPrompts
        // No status - it's complete, don't show streaming indicator
      }

      // Update in current thread messages
      if (this.currentThread?.messages && Array.isArray(this.currentThread.messages)) {
        const msgIndex = this.currentThread.messages.findIndex(m => m.messageId === messageId)
        if (msgIndex !== -1) {
          // Update the message in place (keep it as a regular ChatMessage)
          this.currentThread.messages[msgIndex] = completedMessage
          console.log('[Store] Completed message in currentThread.messages at index:', msgIndex)
        } else {
          console.warn('[Store] Message not found in currentThread.messages for completion:', messageId)
        }
      }

      // Save the completed message to database immediately to prevent disappearing on next addMessage
      // This fixes the bug where completed messages would disappear when the thread is reloaded from DB
      if (this.activeThreadId && this.currentThread) {
        try {
          const { data } = await $fetch<{ data: ChatThread }>(`/api/chat/threads/${this.activeThreadId}/messages`, {
            method: 'POST',
            body: {
              message: {
                role: completedMessage.role,
                content: completedMessage.content,
                metadata: completedMessage.metadata,
                links: completedMessage.links,
                suggestedLinks: completedMessage.suggestedLinks,
                suggestedPrompts: completedMessage.suggestedPrompts
              }
            }
          })
          console.log('[Store] Saved completed streaming message to database')

          // Don't replace currentThread with DB data to avoid losing any other in-memory state
          // Just update the message count and timestamp
          if (data.messageCount) {
            this.currentThread.messageCount = data.messageCount
          }
          if (data.lastMessageAt) {
            this.currentThread.lastMessageAt = data.lastMessageAt
          }
        } catch (err: any) {
          console.error('[Store] Failed to save completed streaming message:', err)
          // Don't fail the completion - the message is still in memory
        }
      }

      // Cleanup streaming state immediately (removes "query running" indicator)
      this.streamingMessages.delete(messageId)
      this.activeStreams.delete(messageId)
      this.activeStreamCount = Math.max(0, this.activeStreamCount - 1) // Decrement counter (prevent negatives)
      console.log('[Store] Cleaned up streaming state, activeStreamCount:', this.activeStreamCount)

      return true
    },

    /**
     * Handle streaming error
     */
    handleStreamingError(messageId: string, error: string) {
      const message = this.streamingMessages.get(messageId)
      if (message) {
        message.status = {
          status: 'error',
          error
        }
        message.content = error

        // Update in current thread messages too
        if (this.currentThread?.messages && Array.isArray(this.currentThread.messages)) {
          const msgIndex = this.currentThread.messages.findIndex(m => m.messageId === messageId)
          if (msgIndex !== -1) {
            this.currentThread.messages[msgIndex].content = error
            this.currentThread.messages[msgIndex].status = message.status
          }
        }
      }

      this.activeStreams.delete(messageId)
      this.activeStreamCount = Math.max(0, this.activeStreamCount - 1) // Decrement counter (prevent negatives)
    },

    /**
     * Check if a message is currently streaming
     */
    isMessageStreaming(messageId: string): boolean {
      return this.activeStreams.has(messageId)
    },

    /**
     * Get streaming message by ID
     */
    getStreamingMessage(messageId: string): StreamingChatMessage | undefined {
      return this.streamingMessages.get(messageId)
    }
  }
}, {
  persist: {
    pick: ['activeThreadId'] // Only persist active thread ID
  }
})
