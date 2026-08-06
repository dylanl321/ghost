/**
 * Chat Threads Store
 * Manages chat thread state and persistence operations
 * Note: UI state (polling, loading indicators) is handled by useChatUI composable
 */

import { defineStore } from 'pinia'
import type {
  ChatThread,
  ChatMessage,
  ChatThreadFilters,
  ChatThreadSummary,
  ShareThreadResponse
} from '#shared/types/chat-threads'

const logger = createLogger('Chat Threads Store')

interface ChatThreadsState {
  threads: ChatThread[]
  activeThreadId: string | null
  currentThread: ChatThread | null
  loading: boolean
  error: string | null
  filters: ChatThreadFilters
  hasMoreThreads: boolean
  nextThreadKey: ChatThreadFilters['lastKey']
}

export const useChatThreadsStore = defineStore('chatThreads', {
  state: (): ChatThreadsState => ({
    threads: [],
    activeThreadId: null,
    currentThread: null,
    loading: false,
    error: null,
    hasMoreThreads: false,
    nextThreadKey: undefined,
    filters: {
      isArchived: false,
      limit: 50
    }
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
        lastMessagePreview: thread.lastMessagePreview || thread.messages?.[thread.messages.length - 1]?.content?.substring(0, 100) || '',
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
    async fetchThreads(filters?: ChatThreadFilters, append = false) {
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
        if (append && this.nextThreadKey) {
          params.append('lastKey', JSON.stringify(this.nextThreadKey))
        }

        const { data } = await $fetch<{ data: { threads: ChatThread[]; hasMore: boolean; lastKey?: ChatThreadFilters['lastKey'] } }>(
          `/api/chat/threads/list?${params.toString()}`
        )

        this.threads = append ? [...this.threads, ...data.threads] : data.threads
        this.hasMoreThreads = data.hasMore
        this.nextThreadKey = data.lastKey
        this.filters = appliedFilters
      } catch (err: any) {
        this.error = err.data?.error?.message || 'Failed to fetch threads'
        logger.error('Error fetching threads:', err)
      } finally {
        this.loading = false
      }
    },

    async loadMoreThreads(): Promise<void> {
      if (!this.hasMoreThreads || this.loading) return
      await this.fetchThreads(this.filters, true)
    },

    /**
     * Create a new thread
     */
    async createThread(title?: string, initialMessage?: string): Promise<ChatThread | null> {
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
        logger.error('Error creating thread:', err)
        return null
      }
    },

    /**
     * Load a specific thread
     */
    async loadThread(threadId: string): Promise<boolean> {
      this.error = null

      try {
        const { data } = await $fetch<{ data: ChatThread }>(`/api/chat/threads/${threadId}`)

        // Ensure messages array exists and is a new reference for reactivity
        data.messages = data.messages ? [...data.messages] : []

        // Completely replace current thread (not mutate) to trigger reactivity
        this.currentThread = { ...data }
        this.activeThreadId = threadId

        // Update in threads list if exists (also create new reference)
        const index = this.threads.findIndex(t => t.threadId === threadId)
        if (index !== -1) {
          this.threads[index] = { ...data }
        }

        return true
      } catch (err: any) {
        this.error = err.data?.error?.message || 'Failed to load thread'
        logger.error('Error loading thread:', err)
        return false
      }
    },

    async loadEarlierMessages(): Promise<boolean> {
      if (!this.currentThread?.hasMoreMessages || !this.currentThread.messagesNextToken) return false
      try {
        const token = encodeURIComponent(this.currentThread.messagesNextToken)
        const { data } = await $fetch<{ data: ChatThread }>(
          `/api/chat/threads/${this.currentThread.threadId}?limit=100&nextToken=${token}`
        )
        this.currentThread.messages = [...(data.messages || []), ...(this.currentThread.messages || [])]
        this.currentThread.hasMoreMessages = data.hasMoreMessages
        this.currentThread.messagesNextToken = data.messagesNextToken
        return true
      } catch (err: any) {
        this.error = err.data?.error?.message || 'Failed to load earlier messages'
        return false
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
        logger.error('Error updating thread:', err)
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
        if (!thread || !this.currentThread) {
          return false
        }
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

        // Preserve any pending/streaming messages in memory (managed by useChatUI)
        const pendingMessages = (this.currentThread?.messages || []).filter(m =>
          m.status && (m.status?.status === 'pending' || m.status?.status === 'streaming')
        )

        // Update current thread
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

          // Merge DB messages with pending messages
          if (pendingMessages.length > 0) {
            this.currentThread.messages = [...data.messages, ...pendingMessages]
          } else {
            this.currentThread.messages = data.messages
          }
        } else {
          this.currentThread = data
        }

        // Update in threads list
        const index = this.threads.findIndex(t => t.threadId === this.activeThreadId)
        if (index !== -1) {
          this.threads[index] = { ...data }
          if (pendingMessages.length > 0) {
            this.threads[index].messages = [...data.messages, ...pendingMessages]
          }
        }

        return true
      } catch (err: any) {
        this.error = err.data?.error?.message || 'Failed to add message'
        logger.error('Error adding message:', err)
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
        logger.error('Error clearing thread:', err)
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
        logger.error('Error deleting thread:', err)
        return false
      }
    },

    /**
     * Delete a thread and automatically create a new one
     */
    async deleteThreadAndCreateNew(threadId: string): Promise<ChatThread | null> {
      try {
        const deleteSuccess = await this.deleteThread(threadId)
        if (!deleteSuccess) {
          return null
        }

        const newThread = await this.createThread('New Conversation')
        if (!newThread) {
          logger.error('Failed to create new thread after deletion')
          return null
        }

        return newThread
      } catch (err: any) {
        this.error = err.data?.error?.message || 'Failed to delete thread and create new'
        logger.error('Error in deleteThreadAndCreateNew:', err)
        return null
      }
    },

    /**
     * Share a thread
     */
    async shareThread(threadId: string, expiresInDays: number = 30): Promise<ShareThreadResponse | null> {
      try {
        const { data } = await $fetch<{ data: ShareThreadResponse }>(`/api/chat/threads/${threadId}/share`, {
          method: 'POST',
          body: { expiresInDays }
        })

        // Update thread in list
        const index = this.threads.findIndex(t => t.threadId === threadId)
        if (index !== -1) {
          const thread = this.threads[index]
          if (thread) {
            thread.isShared = true
            thread.shareId = data.shareId
            thread.shortCode = data.shortCode
            thread.shortUrl = data.shortUrl
          }
        }

        // Update current thread
        if (this.activeThreadId === threadId && this.currentThread) {
          this.currentThread.isShared = true
          this.currentThread.shareId = data.shareId
          this.currentThread.shortCode = data.shortCode
          this.currentThread.shortUrl = data.shortUrl
        }

        return data
      } catch (err: any) {
        this.error = err.data?.error?.message || 'Failed to share thread'
        logger.error('Error sharing thread:', err)
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
          const thread = this.threads[index]
          if (thread) {
            thread.isShared = false
            thread.shareId = undefined
            thread.shortCode = undefined
            thread.shortUrl = undefined
          }
        }

        // Update current thread
        if (this.activeThreadId === threadId && this.currentThread) {
          this.currentThread.isShared = false
        }

        return true
      } catch (err: any) {
        this.error = err.data?.error?.message || 'Failed to unshare thread'
        logger.error('Error unsharing thread:', err)
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

        useEventBus().emit('chat.thread_exported', { threadId, format })
        return true
      } catch (err: any) {
        this.error = 'Failed to export thread'
        logger.error('Error exporting thread:', err)
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
    }
  }
}, {
  persist: {
    pick: ['activeThreadId']
  }
})
