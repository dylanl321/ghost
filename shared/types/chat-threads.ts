/**
 * TypeScript type definitions for Chat Threads
 * Shared between frontend and backend
 */

/**
 * Suggested link to GHOST pages
 */
export interface SuggestedLink {
  label: string
  url: string
  description: string
  icon: string
  type: 'cost' | 'explorer' | 'users' | 'org-chart' | 'reports' | 'security' | 'admin' | 'organization' | 'accounts'
}

/**
 * Suggested follow-up prompt extracted from AI response
 */
export interface SuggestedPrompt {
  text: string
  type: 'question' | 'action' | 'clarification'
  priority: number
}

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
    accountName?: string
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
  suggestedPrompts?: SuggestedPrompt[] // Follow-up prompts for user
  jobId?: string // Async job that produced this message (idempotency)
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
  lastMessagePreview?: string

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
  messagesMigratedAt?: string // Set after embedded messages move to ChatMessages
  hasMoreMessages?: boolean // More messages are available before the current page
  messagesNextToken?: string // Opaque token for loading earlier messages
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
 * Export format options for chat threads
 */
export type ChatExportFormat = 'json' | 'markdown'

/**
 * Request to export a thread
 */
export interface ExportThreadRequest {
  format: ChatExportFormat
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

// =============================================================================
// Admin Monitoring Types
// =============================================================================

/**
 * Chat metrics for admin monitoring
 */
export interface ChatMetrics {
  period: '24h' | '7d' | '30d' | 'all'
  startDate: string
  endDate: string
  totalThreads: number
  totalMessages: number
  totalQueries: number
  uniqueUsers: number
  averageMessagesPerThread: number
  averageResponseTime?: number // In seconds
  mcpTypeDistribution: {
    permanent: number
    temporary: number
    unknown: number
  }
  topAccounts: Array<{
    accountId: string
    queryCount: number
  }>
  topUsers: Array<{
    userId: string
    threadCount: number
    messageCount: number
  }>
  errorRate: number
  sharedThreadsCount: number
  pinnedThreadsCount: number
  archivedThreadsCount: number

  // Async job tracking (PRIORITY 1)
  asyncJobsQueued: number
  asyncJobsRunning: number
  asyncJobsComplete: number
  asyncJobsErrored: number
  averageAsyncDuration?: number  // seconds

  // Query cancellation tracking (PRIORITY 2)
  cancelledQueriesCount: number

  // AI reasoning usage (PRIORITY 2)
  reasoningUsageRate: number  // percentage of responses with reasoning

  // TODO: Future - Add token usage aggregates
  // TODO: Future - Add streaming performance metrics
}

/**
 * CloudWatch log event (formatted)
 */
export interface CloudWatchLogEntry {
  timestamp?: number
  logStreamName?: string
  message?: string
  eventId?: string
  level: string // 'INFO', 'ERROR', 'WARN', 'DEBUG'
  parsedJSON?: any
  isJSON: boolean
}

/**
 * Chat request log for admin debugging
 */
export interface ChatRequestLog {
  requestId: string
  userId: string
  timestamp: number // Unix timestamp
  request: {
    message?: string
    conversationHistory?: number
    sessionId?: string
    mcpId?: string
    timezone?: string
    region?: string
    accountIdentifier?: string
    preferGovcloud?: boolean
  } | null
  response: {
    resultLength?: number
    hasError?: boolean
    hasDisambiguation?: boolean
    error?: string | null
    metadata?: {
      accountId?: string
      mcpUsed?: string
      mcpType?: 'permanent' | 'temporary'
      sessionId?: string
    }
    responseTimeMs?: number
  } | null
  error: {
    message?: string
    statusCode?: number
    code?: string
    stack?: string
    responseTimeMs?: number
  } | null
}

/**
 * Admin view of async chat jobs
 */
export interface AdminAsyncJobSummary {
  jobId: string
  userId: string
  threadId?: string
  status: 'queued' | 'running' | 'complete' | 'error' | 'canceled'
  progress?: string
  progressPercent?: number
  currentStep?: string
  toolsCalled?: string[]
  createdAt: string
  startedAt?: string
  completedAt?: string
  duration?: number  // seconds
  error?: string
  // TODO: Future - Add resource usage metrics
}

/**
 * Admin thread summary with additional fields
 */
export interface AdminThreadSummary extends ChatThreadSummary {
  userId: string
  createdAt: string
  sessionId?: string
  shareId?: string
  lastQuery?: string
}

// =============================================================================
// SSE Streaming Types
// =============================================================================

/**
 * SSE event types from Strands streaming endpoint
 */
export type SSEEventType =
  | 'status'           // Progress updates
  | 'tool_call'        // Tool invocation
  | 'response'         // Partial text chunks
  | 'complete'         // Final result
  | 'error'            // Error occurred
  | 'disambiguation'   // Multiple accounts match

/**
 * Status event data - progress updates during query execution
 */
export interface StatusEvent {
  message: string
  step: string
  account_id?: string
  account_alias?: string
  mcp_id?: string
  mcp_name?: string
}

/**
 * Tool call event data - when agent calls an AWS MCP tool
 */
export interface ToolCallEvent {
  tool_name: string
  tool_input: any
  message: string
}

/**
 * Response event data - streaming text chunks for typewriter effect
 */
export interface ResponseEvent {
  delta: string           // New text chunk
  accumulated: string     // Full text so far
}

/**
 * Complete event data - final query result
 */
export interface CompleteEvent {
  response: string
  sessionId: string
  metadata: {
    accountId: string
    mcpUsed: string
    mcpType: 'permanent' | 'temporary'
    toolCallsCount: number
  }
  suggestedLinks?: SuggestedLink[]
  suggestedPrompts?: SuggestedPrompt[]
}

/**
 * Error event data - query failure
 */
export interface ErrorEvent {
  message: string
  step?: string
}

/**
 * Error type classification for enhanced error handling
 */
export type ErrorType = 'timeout' | 'network' | 'disambiguation' | 'server' | 'unknown'

/**
 * Message status for streaming UI
 */
export interface MessageStatus {
  status: 'pending' | 'streaming' | 'complete' | 'error' | 'canceled'
  /**
   * Async job id that produced this message (used to correctly map progress/completion
   * events back onto the right placeholder while users switch threads).
   */
  jobId?: string
  progress?: string          // Current step (e.g., "Resolving account...")
  toolsCalled?: string[]     // List of tools used
  statusHistory?: Array<{ text: string; timestamp: number }> // Recent step history (optional)
  error?: string             // Error message if failed
  errorType?: ErrorType      // Classified error type for enhanced display
}

/**
 * Enhanced chat message for streaming support
 */
export interface StreamingChatMessage extends ChatMessage {
  status?: MessageStatus
  streamBuffer?: string     // Partial content being streamed
}
