/**
 * Type definitions for Strands Async Polling API
 */

export type AsyncChatJobStatus = 'queued' | 'running' | 'complete' | 'error' | 'canceled'

/**
 * Async chat job stored in DynamoDB
 */
export interface AsyncChatJob {
  jobId: string
  strandsJobId: string | null
  threadId: string
  userId: string
  status: AsyncChatJobStatus
  query: string
  queryOptions: {
    accountIdentifier?: string
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string | object | any[] }>
    timezone?: string
    region?: string
    preferGovcloud?: boolean
    userContext?: string
  }
  progress: string
  progressPercent: number
  eventCount: number
  toolsCalled?: string[]
  response: string | null
  errorMessage: string | null
  metadata: {
    accountId?: string
    mcpUsed?: string
    mcpType?: 'permanent' | 'temporary'
    toolCallsCount?: number
    executionTimeMs?: number
  } | null
  suggestedLinks?: Array<Record<string, any>>
  suggestedPrompts?: Array<Record<string, any>>
  createdAt: string
  lastUpdated: string
  completedAt: string | null
  startedAt?: string | null
  heartbeatAt?: string | null
  workerId?: string | null
  attemptCount: number
  cancelRequested: boolean
  resultMessageKey: string
  ttl: number
}

/**
 * Request to Strands async submission endpoint
 */
export interface StrandsAsyncSubmitRequest {
  message: string
  account_identifier?: string
  region?: string
  prefer_govcloud?: boolean
  timezone?: string
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string | object | any[] }>
}

/**
 * Response from Strands async submission endpoint
 */
export interface StrandsAsyncSubmitResponse {
  jobId: string
  status: string
  message?: string
  pollUrl?: string
}

/**
 * Response from Strands status polling endpoint
 */
export interface StrandsAsyncStatusResponse {
  jobId: string
  status: AsyncChatJobStatus
  currentStep: string
  progressPercent: number
  eventCount: number
  response: string | null
  errorMessage: string | null
  metadata?: {
    accountId?: string
    mcpUsed?: string
    mcpType?: 'permanent' | 'temporary'
    toolCallsCount?: number
    executionTimeMs?: number
  }
  createdAt: string
  lastUpdated: string
}
