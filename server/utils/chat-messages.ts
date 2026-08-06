import { GetItemCommand, PutItemCommand, TransactWriteItemsCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb'
import { marshall } from '@aws-sdk/util-dynamodb'
import { v4 as uuidv4 } from 'uuid'
import type { ChatMessage, ChatThread } from '#shared/types/chat-threads'
import type { AsyncChatJob } from '../types/strands-async'
import { getDynamoDBClient } from '../lib/aws-client-factory'
import { getTableName, getTableEnvironment, getTableAccountId } from '../lib/dynamodb-config'
import { batchWriteItems, queryItems } from './dynamodb'
import { logger } from './logger'

const DEFAULT_PAGE_SIZE = 100
const MESSAGE_TTL_DAYS = 90
let lastMessageTime = 0
let messageSequence = 0

function nextSortableId(): string {
  const now = Date.now()
  messageSequence = now === lastMessageTime ? messageSequence + 1 : 0
  lastMessageTime = now
  return `${now.toString(36).padStart(10, '0')}-${messageSequence.toString(36).padStart(4, '0')}-${uuidv4()}`
}

interface StoredChatMessage extends ChatMessage {
  threadId: string
  messageKey: string
  ttl: number
}

async function getMessagesTableConfig() {
  return {
    tableName: await getTableName('chatMessages'),
    environment: await getTableEnvironment('chatMessages'),
    accountId: await getTableAccountId('chatMessages')
  }
}

function createMessageKey(timestamp: string, suffix = nextSortableId()): string {
  return `${timestamp}#${suffix}`
}

function toPublicMessage(item: StoredChatMessage): ChatMessage {
  const { threadId: _threadId, messageKey: _messageKey, ttl: _ttl, ...message } = item
  return message
}

export async function migrateLegacyMessages(thread: ChatThread): Promise<void> {
  if (thread.messagesMigratedAt) return

  const config = await getMessagesTableConfig()
  const client = await getDynamoDBClient(config.environment, undefined, config.accountId)
  const messages = thread.messages || []

  for (const [index, message] of messages.entries()) {
    const timestamp = message.timestamp || thread.createdAt
    const messageKey = createMessageKey(timestamp, `${String(index).padStart(6, '0')}-${message.messageId}`)
    const item: StoredChatMessage = {
      ...message,
      threadId: thread.threadId,
      messageKey,
      ttl: thread.ttl || Math.floor(Date.now() / 1000) + MESSAGE_TTL_DAYS * 86400
    }

    try {
      await client.send(new PutItemCommand({
        TableName: config.tableName,
        Item: marshall(item, { removeUndefinedValues: true }),
        ConditionExpression: 'attribute_not_exists(threadId) AND attribute_not_exists(messageKey)'
      }))
    } catch (error: any) {
      if (error.name !== 'ConditionalCheckFailedException') throw error
    }
  }

  const migratedAt = new Date().toISOString()
  const lastMessagePreview = messages[messages.length - 1]?.content.substring(0, 100)
  const threadConfig = {
    tableName: await getTableName('chatThreads'),
    environment: await getTableEnvironment('chatThreads'),
    accountId: await getTableAccountId('chatThreads')
  }
  const threadClient = await getDynamoDBClient(threadConfig.environment, undefined, threadConfig.accountId)
  const migrationExpression = lastMessagePreview
    ? 'SET messagesMigratedAt = :migratedAt, lastMessagePreview = :preview REMOVE messages'
    : 'SET messagesMigratedAt = :migratedAt REMOVE messages'
  await threadClient.send(new UpdateItemCommand({
    TableName: threadConfig.tableName,
    Key: marshall({ threadId: thread.threadId, createdAt: thread.createdAt }),
    UpdateExpression: migrationExpression,
    ExpressionAttributeValues: marshall({
      ':migratedAt': migratedAt,
      ...(lastMessagePreview ? { ':preview': lastMessagePreview } : {})
    })
  }))
  thread.messagesMigratedAt = migratedAt
  thread.messages = []
}

export async function listThreadMessages(
  thread: ChatThread,
  options: { limit?: number; nextToken?: string; migrate?: boolean } = {}
): Promise<{ messages: ChatMessage[]; nextToken?: string; hasMore: boolean }> {
  if (!thread.messagesMigratedAt && options.migrate !== true) {
    const legacy = thread.messages || []
    const limit = Math.min(Math.max(options.limit || DEFAULT_PAGE_SIZE, 1), 200)
    let end = legacy.length
    if (options.nextToken) {
      try {
        const decoded = JSON.parse(Buffer.from(options.nextToken, 'base64').toString())
        if (typeof decoded.legacyOffset === 'number') end = decoded.legacyOffset
      } catch {
        end = legacy.length
      }
    }
    const start = Math.max(end - limit, 0)
    return {
      messages: legacy.slice(start, end),
      nextToken: start > 0 ? Buffer.from(JSON.stringify({ legacyOffset: start })).toString('base64') : undefined,
      hasMore: start > 0
    }
  }

  if (!thread.messagesMigratedAt) await migrateLegacyMessages(thread)

  const config = await getMessagesTableConfig()
  const result = await queryItems({
    tableName: config.tableName,
    queryExpression: 'threadId = :threadId',
    expressionAttributeValues: { ':threadId': thread.threadId },
    limit: Math.min(Math.max(options.limit || DEFAULT_PAGE_SIZE, 1), 200),
    scanIndexForward: false,
    nextToken: options.nextToken
  }, config.environment, config.accountId)

  return {
    messages: (result.items as StoredChatMessage[]).map(toPublicMessage).reverse(),
    nextToken: result.nextToken,
    hasMore: !!result.nextToken
  }
}

export async function listAllThreadMessages(thread: ChatThread): Promise<ChatMessage[]> {
  if (!thread.messagesMigratedAt) await migrateLegacyMessages(thread)
  const messages: ChatMessage[] = []
  let nextToken: string | undefined
  do {
    const page = await listThreadMessages(thread, { limit: 200, nextToken })
    messages.unshift(...page.messages)
    nextToken = page.nextToken
  } while (nextToken)
  return messages
}

export async function appendThreadMessage(
  thread: ChatThread,
  message: Omit<ChatMessage, 'messageId' | 'timestamp'> & { messageId?: string; timestamp?: string },
  options: { messageKey?: string; title?: string } = {}
): Promise<{ message: ChatMessage; inserted: boolean }> {
  await migrateLegacyMessages(thread)

  const timestamp = message.timestamp || new Date().toISOString()
  const messageId = message.messageId || nextSortableId()
  const fullMessage: ChatMessage = { ...message, messageId, timestamp }
  const item: StoredChatMessage = {
    ...fullMessage,
    threadId: thread.threadId,
    messageKey: options.messageKey || createMessageKey(timestamp, messageId),
    ttl: thread.ttl || Math.floor(Date.now() / 1000) + MESSAGE_TTL_DAYS * 86400
  }

  const config = await getMessagesTableConfig()
  const client = await getDynamoDBClient(config.environment, undefined, config.accountId)

  const threadConfig = {
    tableName: await getTableName('chatThreads')
  }
  const names: Record<string, string> = {
    '#count': 'messageCount',
    '#last': 'lastMessageAt',
    '#modified': 'lastModifiedAt',
    '#preview': 'lastMessagePreview'
  }
  const values: Record<string, any> = {
    ':one': 1,
    ':now': timestamp,
    ':preview': fullMessage.content.substring(0, 100)
  }
  const sets = ['#last = :now', '#modified = :now', '#preview = :preview']
  if (options.title) {
    names['#title'] = 'title'
    values[':title'] = options.title
    sets.push('#title = :title')
  }

  try {
    await client.send(new TransactWriteItemsCommand({
      TransactItems: [
        {
          Put: {
            TableName: config.tableName,
            Item: marshall(item, { removeUndefinedValues: true }),
            ConditionExpression: 'attribute_not_exists(threadId) AND attribute_not_exists(messageKey)'
          }
        },
        {
          Update: {
            TableName: threadConfig.tableName,
            Key: marshall({ threadId: thread.threadId, createdAt: thread.createdAt }),
            UpdateExpression: `SET ${sets.join(', ')} ADD #count :one`,
            ExpressionAttributeNames: names,
            ExpressionAttributeValues: marshall(values),
            ConditionExpression: 'attribute_exists(threadId)'
          }
        }
      ]
    }))
  } catch (error: any) {
    let duplicate = false
    if (error.name === 'TransactionCanceledException') {
      const existing = await client.send(new GetItemCommand({
        TableName: config.tableName,
        Key: marshall({ threadId: thread.threadId, messageKey: item.messageKey })
      }))
      duplicate = !!existing.Item
    }
    if (!duplicate) throw error
    return { message: fullMessage, inserted: false }
  }

  return { message: fullMessage, inserted: true }
}

export async function createQueuedJobWithUserMessage(
  thread: ChatThread,
  job: AsyncChatJob,
  metadata?: ChatMessage['metadata']
): Promise<ChatMessage> {
  await migrateLegacyMessages(thread)
  const timestamp = new Date().toISOString()
  const messageId = nextSortableId()
  const message: ChatMessage = { messageId, role: 'user', content: job.query, timestamp, metadata }
  const config = await getMessagesTableConfig()
  const client = await getDynamoDBClient(config.environment, undefined, config.accountId)
  const item: StoredChatMessage = {
    ...message,
    threadId: thread.threadId,
    messageKey: createMessageKey(timestamp, messageId),
    ttl: thread.ttl || Math.floor(Date.now() / 1000) + MESSAGE_TTL_DAYS * 86400
  }
  const title = thread.messageCount === 0 && thread.title === 'New Conversation'
    ? job.query.replace(/[#*_`~[\]]/g, '').replace(/\n+/g, ' ').trim().substring(0, 35) || 'New Conversation'
    : undefined
  const names: Record<string, string> = {
    '#count': 'messageCount',
    '#last': 'lastMessageAt',
    '#modified': 'lastModifiedAt',
    '#preview': 'lastMessagePreview'
  }
  const values: Record<string, any> = {
    ':one': 1,
    ':now': timestamp,
    ':preview': job.query.substring(0, 100)
  }
  const sets = ['#last = :now', '#modified = :now', '#preview = :preview']
  if (title) {
    names['#title'] = 'title'
    values[':title'] = title
    sets.push('#title = :title')
  }

  await client.send(new TransactWriteItemsCommand({
    TransactItems: [
      {
        Put: {
          TableName: config.tableName,
          Item: marshall(item, { removeUndefinedValues: true }),
          ConditionExpression: 'attribute_not_exists(threadId) AND attribute_not_exists(messageKey)'
        }
      },
      {
        Update: {
          TableName: await getTableName('chatThreads'),
          Key: marshall({ threadId: thread.threadId, createdAt: thread.createdAt }),
          UpdateExpression: `SET ${sets.join(', ')} ADD #count :one`,
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: marshall(values),
          ConditionExpression: 'attribute_exists(threadId)'
        }
      },
      {
        Put: {
          TableName: await getTableName('asyncChatJobs'),
          Item: marshall(job, { removeUndefinedValues: true }),
          ConditionExpression: 'attribute_not_exists(jobId)'
        }
      }
    ]
  }))
  return message
}

export async function deleteAllThreadMessages(threadId: string): Promise<void> {
  const config = await getMessagesTableConfig()
  let nextToken: string | undefined

  do {
    const result = await queryItems({
      tableName: config.tableName,
      queryExpression: 'threadId = :threadId',
      expressionAttributeValues: { ':threadId': threadId },
      projectionExpression: 'threadId, messageKey',
      limit: 100,
      nextToken
    }, config.environment, config.accountId)

    if (result.items.length > 0) {
      await batchWriteItems(
        config.tableName,
        result.items.map(item => ({ deleteRequest: { threadId: item.threadId, messageKey: item.messageKey } })),
        config.environment,
        config.accountId
      )
    }
    nextToken = result.nextToken
  } while (nextToken)

  logger.info(`[Chat Messages] Deleted messages for thread ${threadId}`)
}
