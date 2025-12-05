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
    activeStreams: new Set()
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
        const { data } = await $fetch<{ data: ChatThread }>(`/api/chat/threads/${threadId}`)

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
      }

      try {
        const { data } = await $fetch<{ data: ChatThread }>(`/api/chat/threads/${this.activeThreadId}/messages`, {
          method: 'POST',
          body: { message }
        })

        // Update current thread
        this.currentThread = data

        // Update in threads list
        const index = this.threads.findIndex(t => t.threadId === this.activeThreadId)
        if (index !== -1) {
          this.threads[index] = data
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

      // Add to current thread's messages if this is the active thread
      if (this.currentThread?.threadId === threadId) {
        this.currentThread.messages.push(message)
      }

      return message
    },

    /**
     * Update streaming message status
     */
    updateStreamingStatus(messageId: string, status: MessageStatus) {
      const message = this.streamingMessages.get(messageId)
      if (message) {
        message.status = status

        // Update in current thread messages too
        if (this.currentThread) {
          const msgIndex = this.currentThread.messages.findIndex(m => m.messageId === messageId)
          if (msgIndex !== -1) {
            this.currentThread.messages[msgIndex].status = status
          }
        }
      }
    },

    /**
     * Append content chunk to streaming message
     */
    appendStreamingContent(messageId: string, delta: string) {
      const message = this.streamingMessages.get(messageId)
      if (message) {
        message.streamBuffer = (message.streamBuffer || '') + delta
        message.content = message.streamBuffer

        // Update in current thread messages too
        if (this.currentThread) {
          const msgIndex = this.currentThread.messages.findIndex(m => m.messageId === messageId)
          if (msgIndex !== -1) {
            this.currentThread.messages[msgIndex].content = message.content
            this.currentThread.messages[msgIndex].streamBuffer = message.streamBuffer
          }
        }
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
      const message = this.streamingMessages.get(messageId)
      if (!message) return false

      // Update final content and metadata
      message.content = finalContent
      message.metadata = metadata
      message.suggestedLinks = suggestedLinks
      message.suggestedPrompts = suggestedPrompts
      message.status = { status: 'complete' }
      delete message.streamBuffer

      // Update in current thread messages
      if (this.currentThread) {
        const msgIndex = this.currentThread.messages.findIndex(m => m.messageId === messageId)
        if (msgIndex !== -1) {
          this.currentThread.messages[msgIndex] = message
        }
      }

      // Save to database (remove messageId and timestamp as they're generated by backend)
      const success = await this.addMessage({
        role: message.role,
        content: message.content,
        metadata: message.metadata,
        links: message.links,
        suggestedLinks: message.suggestedLinks,
        suggestedPrompts: message.suggestedPrompts
      })

      // Cleanup
      this.streamingMessages.delete(messageId)
      this.activeStreams.delete(messageId)

      return success
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
        if (this.currentThread) {
          const msgIndex = this.currentThread.messages.findIndex(m => m.messageId === messageId)
          if (msgIndex !== -1) {
            this.currentThread.messages[msgIndex].content = error
            this.currentThread.messages[msgIndex].status = message.status
          }
        }
      }

      this.activeStreams.delete(messageId)
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
    },

    /**
     * Get count of active streams
     */
    getActiveStreamCount(): number {
      return this.activeStreams.size
    }
  }
}, {
  persist: {
    pick: ['activeThreadId'] // Only persist active thread ID
  }
})
