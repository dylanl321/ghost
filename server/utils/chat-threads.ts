/**
 * Chat Threads Utility Functions
 * CRUD operations for managing chat threads in DynamoDB
 */

import { v4 as uuidv4 } from 'uuid'
import { TransactWriteItemsCommand } from '@aws-sdk/client-dynamodb'
import { marshall } from '@aws-sdk/util-dynamodb'
import { getItem, putItem, deleteItem, queryItems, updateItem } from './dynamodb'
import type {
  ChatThread,
  ChatMessage,
  ChatThreadFilters,
  ListThreadsResponse,
  ChatThreadSummary
} from '#shared/types/chat-threads'
import { logger } from './logger'
import { getDynamoDBClient } from '../lib/aws-client-factory'
import { getTableName, getTableEnvironment, getTableAccountId } from '../lib/dynamodb-config'
import {
  appendThreadMessage,
  deleteAllThreadMessages,
  listThreadMessages,
  migrateLegacyMessages
} from './chat-messages'

// Get table configuration using centralized config system
// Returns tableName, environment, and accountId for proper role assumption
async function getThreadsTableConfig() {
  const tableName = await getTableName('chatThreads')
  const environment = await getTableEnvironment('chatThreads')
  const accountId = await getTableAccountId('chatThreads')
  return { tableName, environment, accountId }
}

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
  return 'New Conversation'
}

/**
 * Generate a title from the first user message
 * Truncates to 35 characters and removes markdown formatting
 */
function generateTitleFromMessage(content: string): string {
  // Remove markdown formatting
  let cleaned = content
    .replace(/[#*_`~[\]]/g, '') // Remove markdown symbols
    .replace(/\n+/g, ' ') // Replace newlines with spaces
    .trim()

  // Truncate to 35 characters
  if (cleaned.length > 35) {
    cleaned = cleaned.substring(0, 32) + '...'
  }

  return cleaned || 'New Conversation'
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
  const config = await getThreadsTableConfig()
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

  await putItem(config.tableName, thread, config.environment, config.accountId)

  logger.info(`[Chat Threads] Created thread ${threadId} for user ${userId}`)
  return thread
}

export async function createThreadWithInitialMessage(
  userId: string,
  content: string,
  options: { title?: string; messageKey: string }
): Promise<ChatThread> {
  const threadConfig = await getThreadsTableConfig()
  const messageConfig = {
    tableName: await getTableName('chatMessages'),
    environment: await getTableEnvironment('chatMessages'),
    accountId: await getTableAccountId('chatMessages')
  }
  if (threadConfig.environment !== messageConfig.environment || threadConfig.accountId !== messageConfig.accountId) {
    throw new Error('Chat thread and message tables must share one DynamoDB transaction boundary.')
  }
  const client = await getDynamoDBClient(threadConfig.environment, undefined, threadConfig.accountId)
  const threadId = uuidv4()
  const now = new Date().toISOString()
  const ttl = calculateTTL()
  const message: ChatMessage = { messageId: uuidv4(), role: 'user', content, timestamp: now }
  const thread: ChatThread = {
    threadId,
    createdAt: now,
    userId,
    title: options.title || generateTitleFromMessage(content),
    messages: [],
    messageCount: 1,
    isPinned: false,
    isArchived: false,
    lastMessageAt: now,
    lastModifiedAt: now,
    lastMessagePreview: content.substring(0, 100),
    messagesMigratedAt: now,
    isShared: false,
    ttl,
    expiresAt: new Date(ttl * 1000).toISOString()
  }
  await client.send(new TransactWriteItemsCommand({
    TransactItems: [
      { Put: { TableName: threadConfig.tableName, Item: marshall(thread, { removeUndefinedValues: true }), ConditionExpression: 'attribute_not_exists(threadId)' } },
      { Put: { TableName: messageConfig.tableName, Item: marshall({ ...message, threadId, messageKey: `${now}#${options.messageKey}`, ttl }, { removeUndefinedValues: true }), ConditionExpression: 'attribute_not_exists(threadId) AND attribute_not_exists(messageKey)' } }
    ]
  }))
  return { ...thread, messages: [message] }
}

/**
 * Get a thread by ID with ownership validation
 */
export async function getThread(
  threadId: string,
  userId: string,
  options: { allowShared?: boolean } = {}
): Promise<ChatThread | null> {
  const config = await getThreadsTableConfig()
  const thread = await getItem(
    config.tableName,
    { threadId, createdAt: '*' }, // We need to query since we don't have exact createdAt
    config.environment,
    config.accountId
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
  const config = await getThreadsTableConfig()
  // Query by threadId (hash key)
  const result = await queryItems({
    tableName: config.tableName,
    queryExpression: 'threadId = :threadId',
    expressionAttributeValues: {
      ':threadId': threadId
    },
    limit: 1
  }, config.environment, config.accountId)

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
export async function getThreadByShareId(
  shareId: string,
  options: { limit?: number; nextToken?: string } = {}
): Promise<ChatThread | null> {
  const config = await getThreadsTableConfig()
  const result = await queryItems({
    tableName: config.tableName,
    indexName: 'ShareIdIndex',
    queryExpression: 'shareId = :shareId',
    expressionAttributeValues: {
      ':shareId': shareId
    },
    limit: 1
  }, config.environment, config.accountId)

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

  const page = await listThreadMessages(thread, {
    limit: options.limit || 100,
    nextToken: options.nextToken
  })
  return { ...thread, messages: page.messages, hasMoreMessages: page.hasMore, messagesNextToken: page.nextToken }
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
  const config = await getThreadsTableConfig()
  const threads: ChatThread[] = []
  let nextToken = filters.lastKey ? Buffer.from(JSON.stringify(filters.lastKey)).toString('base64') : undefined

  try {
    const limit = filters.limit || 50
    do {
      const result = await queryItems({
        tableName: config.tableName,
        indexName: 'UserIdIndex',
        queryExpression: 'userId = :userId',
        filterExpression: filterParts.length > 0 ? filterParts.join(' AND ') : undefined,
        expressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
        expressionAttributeValues,
        limit: Math.max(1, limit - threads.length),
        scanIndexForward: false,
        nextToken
      }, config.environment, config.accountId)
      const page = result.items as ChatThread[]
      const query = filters.searchQuery?.toLowerCase()
      threads.push(...(query ? page.filter(thread =>
        thread.title.toLowerCase().includes(query) ||
        thread.description?.toLowerCase().includes(query) ||
        thread.lastMessagePreview?.toLowerCase().includes(query) ||
        (thread.messages || []).some(msg => msg.content.toLowerCase().includes(query))
      ) : page))
      nextToken = result.nextToken
    } while (nextToken && threads.length < limit)
  } catch (error: any) {
    // If table doesn't exist yet, return empty list instead of throwing
    if (error.name === 'ResourceNotFoundException' || error.message?.includes('Requested resource not found')) {
      logger.warn(`[Chat Threads] Table ${config.tableName} not found - returning empty list`)
      return {
        threads: [],
        hasMore: false
      }
    }
    // Re-throw other errors
    throw error
  }

  return {
    threads: threads.slice(0, filters.limit || 50),
    lastKey: nextToken ? JSON.parse(Buffer.from(nextToken, 'base64').toString()) : undefined,
    hasMore: !!nextToken
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
    shortCode?: string
    shortUrl?: string
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
  const config = await getThreadsTableConfig()
  const updated = await updateItem(
    config.tableName,
    { threadId, createdAt: thread.createdAt },
    updateData,
    config.environment,
    config.accountId
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
  message: Omit<ChatMessage, 'messageId' | 'timestamp'>,
  options: { messageKey?: string } = {}
): Promise<ChatThread | null> {
  // Get the thread
  const thread = await getThreadById(threadId, userId)
  if (!thread) {
    return null
  }

  const title = message.role === 'user' && thread.messageCount === 0 &&
    (thread.title === 'New Conversation' || thread.title.startsWith('Conversation from'))
    ? generateTitleFromMessage(message.content)
    : undefined
  const { message: fullMessage, inserted } = await appendThreadMessage(thread, message, { title, messageKey: options.messageKey })
  const updated = inserted ? {
    ...thread,
    title: title || thread.title,
    messageCount: thread.messageCount + 1,
    lastMessageAt: fullMessage.timestamp,
    lastModifiedAt: fullMessage.timestamp,
    lastMessagePreview: fullMessage.content.substring(0, 100)
  } : thread
  const page = await listThreadMessages(updated, { limit: 100 })
  logger.info(`[Chat Threads] Added message to thread ${threadId}`)
  return { ...updated, messages: page.messages, hasMoreMessages: page.hasMore, messagesNextToken: page.nextToken }
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

  await migrateLegacyMessages(thread)
  await deleteAllThreadMessages(threadId)

  // Clear metadata
  const now = new Date().toISOString()
  const updates = {
    messageCount: 0,
    sessionId: null, // Clear Strands session
    lastModifiedAt: now
  }

  const config = await getThreadsTableConfig()
  const updated = await updateItem(
    config.tableName,
    { threadId, createdAt: thread.createdAt },
    updates,
    config.environment,
    config.accountId
  )

  logger.info(`[Chat Threads] Cleared messages in thread ${threadId}`)
  return { ...(updated as ChatThread), messages: [] }
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

  const config = await getThreadsTableConfig()
  await migrateLegacyMessages(thread)
  await deleteAllThreadMessages(threadId)
  await deleteItem(
    config.tableName,
    { threadId, createdAt: thread.createdAt },
    config.environment,
    config.accountId
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
  expiresInDays: number = 30
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

  const config = await getThreadsTableConfig()
  await updateItem(
    config.tableName,
    { threadId, createdAt: thread.createdAt },
    updates,
    config.environment,
    config.accountId
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

  const config = await getThreadsTableConfig()
  await updateItem(
    config.tableName,
    { threadId, createdAt: thread.createdAt },
    updates,
    config.environment,
    config.accountId
  )

  logger.info(`[Chat Threads] Unshared thread ${threadId}`)
  return true
}

/**
 * Get thread summaries for list views (lightweight)
 */
export function getThreadSummary(thread: ChatThread): ChatThreadSummary {
  const messages = thread.messages || []
  const lastMessage = messages[messages.length - 1]
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
