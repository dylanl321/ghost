/**
 * Type definitions for Strands Async Polling API
 */

export type AsyncChatJobStatus = 'queued' | 'running' | 'complete' | 'error'

/**
 * Async chat job stored in DynamoDB
 */
export interface AsyncChatJob {
  jobId: string
  strandsJobId: string | null
  userId: string
  status: AsyncChatJobStatus
  query: string
  queryOptions: {
    accountIdentifier?: string
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string | object | any[] }>
    timezone?: string
    region?: string
    preferGovcloud?: boolean
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
  createdAt: string
  lastUpdated: string
  completedAt: string | null
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
  status: 'queued' | 'running' | 'complete' | 'error'
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
