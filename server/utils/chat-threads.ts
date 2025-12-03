/**
 * Chat Threads Utility Functions
 * CRUD operations for managing chat threads in DynamoDB
 */

import { v4 as uuidv4 } from 'uuid'
import { getItem, putItem, deleteItem, queryItems, updateItem } from './dynamodb'
import type {
  ChatThread,
  ChatMessage,
  ChatThreadFilters,
  ListThreadsResponse,
  ChatThreadSummary
} from '~/shared/types/chat-threads'
import { logger } from './logger'

// DynamoDB table name from environment or default
const THREADS_TABLE = process.env.CHAT_THREADS_TABLE_NAME || 'ghost-chat-threads'

// Default TTL: 90 days
const DEFAULT_TTL_DAYS = 90

/**
 * Calculate TTL timestamp (Unix seconds)
 */
function calculateTTL(days: number = DEFAULT_TTL_DAYS): number {
  const now = Date.now()
  const ttlMs = now + (days * 24 * 60 * 60 * 1000)
  return Math.floor(ttlMs / 1000)
}

/**
 * Generate a default thread title based on timestamp
 */
function generateDefaultTitle(): string {
  const now = new Date()
  return `Conversation from ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`
}

/**
 * Create a new chat thread
 */
export async function createThread(
  userId: string,
  options: {
    title?: string
    initialMessage?: ChatMessage
  } = {}
): Promise<ChatThread> {
  const threadId = uuidv4()
  const now = new Date().toISOString()

  const thread: ChatThread = {
    threadId,
    createdAt: now,
    userId,
    title: options.title || generateDefaultTitle(),
    messages: options.initialMessage ? [options.initialMessage] : [],
    messageCount: options.initialMessage ? 1 : 0,
    isPinned: false,
    isArchived: false,
    lastMessageAt: now,
    lastModifiedAt: now,
    isShared: false,
    ttl: calculateTTL(),
    expiresAt: new Date(Date.now() + (DEFAULT_TTL_DAYS * 24 * 60 * 60 * 1000)).toISOString()
  }

  await putItem(THREADS_TABLE, thread, 'govcloud')

  logger.info(`[Chat Threads] Created thread ${threadId} for user ${userId}`)
  return thread
}

/**
 * Get a thread by ID with ownership validation
 */
export async function getThread(
  threadId: string,
  userId: string,
  options: { allowShared?: boolean } = {}
): Promise<ChatThread | null> {
  const thread = await getItem(
    THREADS_TABLE,
    { threadId, createdAt: '*' }, // We need to query since we don't have exact createdAt
    'govcloud'
  )

  if (!thread) {
    return null
  }

  // Validate ownership unless it's a shared thread
  if (!options.allowShared && thread.userId !== userId) {
    logger.warn(`[Chat Threads] User ${userId} attempted to access thread ${threadId} owned by ${thread.userId}`)
    return null
  }

  return thread as ChatThread
}

/**
 * Get a thread by ID (optimized - queries with threadId hash key)
 */
export async function getThreadById(
  threadId: string,
  userId?: string
): Promise<ChatThread | null> {
  // Query by threadId (hash key)
  const result = await queryItems({
    tableName: THREADS_TABLE,
    queryExpression: 'threadId = :threadId',
    expressionAttributeValues: {
      ':threadId': threadId
    },
    limit: 1
  }, 'govcloud')

  if (!result.items || result.items.length === 0) {
    return null
  }

  const thread = result.items[0] as ChatThread

  // Validate ownership if userId provided
  if (userId && thread.userId !== userId) {
    logger.warn(`[Chat Threads] User ${userId} attempted to access thread ${threadId} owned by ${thread.userId}`)
    return null
  }

  return thread
}

/**
 * Get a thread by share ID (for public access)
 */
export async function getThreadByShareId(shareId: string): Promise<ChatThread | null> {
  const result = await queryItems({
    tableName: THREADS_TABLE,
    indexName: 'ShareIdIndex',
    queryExpression: 'shareId = :shareId',
    expressionAttributeValues: {
      ':shareId': shareId
    },
    limit: 1
  }, 'govcloud')

  if (!result.items || result.items.length === 0) {
    return null
  }

  const thread = result.items[0] as ChatThread

  // Validate shared and not expired
  if (!thread.isShared) {
    logger.warn(`[Chat Threads] Attempted to access non-shared thread via shareId: ${shareId}`)
    return null
  }

  if (thread.shareExpiresAt && new Date(thread.shareExpiresAt) < new Date()) {
    logger.warn(`[Chat Threads] Attempted to access expired shared thread: ${shareId}`)
    return null
  }

  return thread
}

/**
 * List threads for a user with filters and pagination
 */
export async function getUserThreads(
  userId: string,
  filters: ChatThreadFilters = {}
): Promise<ListThreadsResponse> {
  // Build filter expression
  const filterParts: string[] = []
  const expressionAttributeNames: Record<string, string> = {}
  const expressionAttributeValues: Record<string, any> = {
    ':userId': userId
  }

  // Apply filters
  if (filters.isPinned !== undefined) {
    filterParts.push('#isPinned = :isPinned')
    expressionAttributeNames['#isPinned'] = 'isPinned'
    expressionAttributeValues[':isPinned'] = filters.isPinned
  }

  if (filters.isArchived !== undefined) {
    filterParts.push('#isArchived = :isArchived')
    expressionAttributeNames['#isArchived'] = 'isArchived'
    expressionAttributeValues[':isArchived'] = filters.isArchived
  }

  if (filters.isShared !== undefined) {
    filterParts.push('#isShared = :isShared')
    expressionAttributeNames['#isShared'] = 'isShared'
    expressionAttributeValues[':isShared'] = filters.isShared
  }

  if (filters.startDate) {
    filterParts.push('#lastMessageAt >= :startDate')
    expressionAttributeNames['#lastMessageAt'] = 'lastMessageAt'
    expressionAttributeValues[':startDate'] = filters.startDate
  }

  if (filters.endDate) {
    filterParts.push('#lastMessageAt <= :endDate')
    expressionAttributeNames['#lastMessageAt'] = 'lastMessageAt'
    expressionAttributeValues[':endDate'] = filters.endDate
  }

  // Query using UserIdIndex GSI (sorted by lastMessageAt descending)
  const result = await queryItems({
    tableName: THREADS_TABLE,
    indexName: 'UserIdIndex',
    queryExpression: 'userId = :userId',
    filterExpression: filterParts.length > 0 ? filterParts.join(' AND ') : undefined,
    expressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
    expressionAttributeValues,
    limit: filters.limit || 50,
    scanIndexForward: false, // Descending order (most recent first)
    nextToken: filters.lastKey ? Buffer.from(JSON.stringify(filters.lastKey)).toString('base64') : undefined
  }, 'govcloud')

  const threads = result.items as ChatThread[]

  // Apply search filter if provided (client-side filtering)
  let filteredThreads = threads
  if (filters.searchQuery) {
    const query = filters.searchQuery.toLowerCase()
    filteredThreads = threads.filter(thread =>
      thread.title.toLowerCase().includes(query) ||
      thread.messages.some(msg => msg.content.toLowerCase().includes(query))
    )
  }

  return {
    threads: filteredThreads,
    lastKey: result.nextToken ? JSON.parse(Buffer.from(result.nextToken, 'base64').toString()) : undefined,
    hasMore: !!result.nextToken
  }
}

/**
 * Update thread metadata
 */
export async function updateThread(
  threadId: string,
  userId: string,
  updates: {
    title?: string
    description?: string
    isPinned?: boolean
    isArchived?: boolean
  }
): Promise<ChatThread | null> {
  // First, get the thread to validate ownership and get createdAt
  const thread = await getThreadById(threadId, userId)
  if (!thread) {
    return null
  }

  // Prepare updates
  const updateData: Record<string, any> = {
    ...updates,
    lastModifiedAt: new Date().toISOString()
  }

  // Update the thread
  const updated = await updateItem(
    THREADS_TABLE,
    { threadId, createdAt: thread.createdAt },
    updateData,
    'govcloud'
  )

  logger.info(`[Chat Threads] Updated thread ${threadId} for user ${userId}`)
  return updated as ChatThread
}

/**
 * Add a message to a thread
 */
export async function addMessageToThread(
  threadId: string,
  userId: string,
  message: Omit<ChatMessage, 'messageId' | 'timestamp'>
): Promise<ChatThread | null> {
  // Get the thread
  const thread = await getThreadById(threadId, userId)
  if (!thread) {
    return null
  }

  // Create full message with ID and timestamp
  const fullMessage: ChatMessage = {
    ...message,
    messageId: uuidv4(),
    timestamp: new Date().toISOString()
  }

  // Update messages array and metadata
  const updatedMessages = [...thread.messages, fullMessage]
  const now = new Date().toISOString()

  const updates = {
    messages: updatedMessages,
    messageCount: updatedMessages.length,
    lastMessageAt: now,
    lastModifiedAt: now
  }

  const updated = await updateItem(
    THREADS_TABLE,
    { threadId, createdAt: thread.createdAt },
    updates,
    'govcloud'
  )

  logger.info(`[Chat Threads] Added message to thread ${threadId}`)
  return updated as ChatThread
}

/**
 * Clear all messages from a thread (reset to welcome)
 */
export async function clearThreadMessages(
  threadId: string,
  userId: string
): Promise<ChatThread | null> {
  // Get the thread
  const thread = await getThreadById(threadId, userId)
  if (!thread) {
    return null
  }

  // Clear messages
  const now = new Date().toISOString()
  const updates = {
    messages: [],
    messageCount: 0,
    sessionId: null, // Clear Strands session
    lastModifiedAt: now
  }

  const updated = await updateItem(
    THREADS_TABLE,
    { threadId, createdAt: thread.createdAt },
    updates,
    'govcloud'
  )

  logger.info(`[Chat Threads] Cleared messages in thread ${threadId}`)
  return updated as ChatThread
}

/**
 * Delete a thread
 */
export async function deleteThread(
  threadId: string,
  userId: string
): Promise<boolean> {
  // Get the thread to validate ownership and get createdAt
  const thread = await getThreadById(threadId, userId)
  if (!thread) {
    return false
  }

  await deleteItem(
    THREADS_TABLE,
    { threadId, createdAt: thread.createdAt },
    'govcloud'
  )

  logger.info(`[Chat Threads] Deleted thread ${threadId} for user ${userId}`)
  return true
}

/**
 * Share a thread (mark as shared and generate shareId)
 */
export async function shareThread(
  threadId: string,
  userId: string,
  expiresInDays: number = 90
): Promise<{ shareId: string; expiresAt: string } | null> {
  // Get the thread
  const thread = await getThreadById(threadId, userId)
  if (!thread) {
    return null
  }

  const shareId = uuidv4()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + (expiresInDays * 24 * 60 * 60 * 1000)).toISOString()

  const updates = {
    isShared: true,
    shareId,
    sharedAt: now.toISOString(),
    shareExpiresAt: expiresAt,
    lastModifiedAt: now.toISOString()
  }

  await updateItem(
    THREADS_TABLE,
    { threadId, createdAt: thread.createdAt },
    updates,
    'govcloud'
  )

  logger.info(`[Chat Threads] Shared thread ${threadId} with shareId ${shareId}`)
  return { shareId, expiresAt }
}

/**
 * Unshare a thread (remove sharing)
 */
export async function unshareThread(
  threadId: string,
  userId: string
): Promise<boolean> {
  // Get the thread
  const thread = await getThreadById(threadId, userId)
  if (!thread) {
    return false
  }

  const updates = {
    isShared: false,
    shareId: null,
    shortCode: null,
    shortUrl: null,
    sharedAt: null,
    shareExpiresAt: null,
    lastModifiedAt: new Date().toISOString()
  }

  await updateItem(
    THREADS_TABLE,
    { threadId, createdAt: thread.createdAt },
    updates,
    'govcloud'
  )

  logger.info(`[Chat Threads] Unshared thread ${threadId}`)
  return true
}

/**
 * Get thread summaries for list views (lightweight)
 */
export function getThreadSummary(thread: ChatThread): ChatThreadSummary {
  const lastMessage = thread.messages[thread.messages.length - 1]
  const lastMessagePreview = lastMessage?.content.substring(0, 100) || ''

  return {
    threadId: thread.threadId,
    title: thread.title,
    messageCount: thread.messageCount,
    lastMessageAt: thread.lastMessageAt,
    lastMessagePreview,
    isPinned: thread.isPinned,
    isArchived: thread.isArchived,
    isShared: thread.isShared
  }
}
