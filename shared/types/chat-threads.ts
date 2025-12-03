/**
 * TypeScript type definitions for Chat Threads
 * Shared between frontend and backend
 */

import type { SuggestedLink } from '~/server/utils/strands-link-generator'

/**
 * Individual message in a chat thread
 */
export interface ChatMessage {
  messageId: string // UUID for individual message tracking
  role: 'user' | 'assistant'
  content: string
  timestamp: string // ISO timestamp
  metadata?: {
    accountId?: string
    mcpUsed?: string
    mcpType?: 'permanent' | 'temporary'
    model?: string
    tokens?: {
      input?: number
      output?: number
    }
  }
  links?: string[] // External reference links
  suggestedLinks?: SuggestedLink[] // GHOST page links
}

/**
 * Chat thread containing conversation history
 */
export interface ChatThread {
  // Primary Keys
  threadId: string // UUID
  createdAt: string // ISO timestamp

  // User & Ownership
  userId: string // User email from session

  // Thread Metadata
  title: string // Auto-generated or user-edited
  description?: string // Optional thread description

  // Messages
  messages: ChatMessage[]

  // Session State
  sessionId?: string // Strands session ID for context
  messageCount: number

  // Status & Tracking
  isPinned: boolean
  isArchived: boolean
  lastMessageAt: string // ISO timestamp (for sorting)
  lastModifiedAt: string // ISO timestamp

  // Sharing (if shared)
  isShared: boolean
  shareId?: string // UUID for shared threads
  shortCode?: string // From shortlinks table
  shortUrl?: string // Full short URL
  sharedAt?: string // ISO timestamp
  shareExpiresAt?: string // ISO timestamp

  // TTL & Cleanup
  ttl?: number // Unix timestamp (auto-delete after X days)
  expiresAt?: string // ISO timestamp
}

/**
 * Request to create a new thread
 */
export interface CreateThreadRequest {
  title?: string // Optional initial title
  initialMessage?: string // Optional first user message
}

/**
 * Request to update thread metadata
 */
export interface UpdateThreadRequest {
  title?: string
  description?: string
  isPinned?: boolean
  isArchived?: boolean
}

/**
 * Request to add a message to a thread
 */
export interface AddMessageRequest {
  message: Omit<ChatMessage, 'messageId' | 'timestamp'>
}

/**
 * Filters for querying user's threads
 */
export interface ChatThreadFilters {
  // Status filters
  isPinned?: boolean
  isArchived?: boolean
  isShared?: boolean

  // Date range
  startDate?: string // ISO timestamp
  endDate?: string // ISO timestamp

  // Search
  searchQuery?: string // Search in title/messages

  // Pagination
  limit?: number
  lastKey?: {
    threadId: string
    lastMessageAt: string
  }
}

/**
 * Response for list threads endpoint
 */
export interface ListThreadsResponse {
  threads: ChatThread[]
  lastKey?: {
    threadId: string
    lastMessageAt: string
  }
  hasMore: boolean
  total?: number
}

/**
 * Request to share a thread
 */
export interface ShareThreadRequest {
  expiresInDays?: number // Default: 90 days
}

/**
 * Response from share endpoint
 */
export interface ShareThreadResponse {
  shareId: string
  shortCode: string
  shortUrl: string
  expiresAt: string
}

/**
 * Export format options
 */
export type ExportFormat = 'json' | 'markdown'

/**
 * Request to export a thread
 */
export interface ExportThreadRequest {
  format: ExportFormat
}

/**
 * Thread summary for list views
 */
export interface ChatThreadSummary {
  threadId: string
  title: string
  messageCount: number
  lastMessageAt: string
  lastMessagePreview?: string // First 100 chars of last message
  isPinned: boolean
  isArchived: boolean
  isShared: boolean
}
