/**
 * Strands Agent HTTP Client
 * Client for communicating with Strands ECS service via ALB
 * Endpoint: http://internal-lz-mcp-servers-dev-alb-1428009891.us-gov-west-1.elb.amazonaws.com:80/query
 */

import { logger } from './logger'
import { getConfigValue } from './site-config'
import type {
  StrandsQueryRequest,
  StrandsQueryResponse,
  StrandsErrorResponse,
  StrandsClientConfig,
  StrandsMetadata
} from '../types/strands'

/**
 * Get Strands client configuration
 * Priority: Site config (DynamoDB) > Environment variables > Defaults
 */
export async function getStrandsConfig(): Promise<StrandsClientConfig> {
  // Try to get config from site config system
  try {

    const serverUrl = await getConfigValue<string>('services.strands.serverUrl') ||
      process.env.STRANDS_SERVER_URL
    const timeout = await getConfigValue<number>('services.strands.timeout') ||
      parseInt(process.env.STRANDS_TIMEOUT || '300000', 10)
    const retries = await getConfigValue<number>('services.strands.retries') ||
      parseInt(process.env.STRANDS_RETRIES || '2', 10)
    const retryDelay = await getConfigValue<number>('services.strands.retryDelay') ||
      parseInt(process.env.STRANDS_RETRY_DELAY || '2000', 10)

    if (!serverUrl) {
      throw new Error('STRANDS_SERVER_URL must be configured in site config or environment variables')
    }

    return {
      serverUrl: serverUrl.replace(/\/$/, ''), // Remove trailing slash
      timeout,
      retries,
      retryDelay
    }
  } catch (error) {
    // Fallback to environment variables if site config fails
    logger.warn('[Strands Client] Failed to load site config, using environment variables:', error)

    const serverUrl = process.env.STRANDS_SERVER_URL
    if (!serverUrl) {
      throw new Error('STRANDS_SERVER_URL environment variable is required')
    }

    return {
      serverUrl: serverUrl.replace(/\/$/, ''),
      timeout: parseInt(process.env.STRANDS_TIMEOUT || '300000', 10),
      retries: parseInt(process.env.STRANDS_RETRIES || '2', 10),
      retryDelay: parseInt(process.env.STRANDS_RETRY_DELAY || '2000', 10)
    }
  }
}

/**
 * Strands client error
 */
export class StrandsClientError extends Error {
  constructor(
    message: string,
    public code?: string,
    public statusCode?: number,
    public details?: any
  ) {
    super(message)
    this.name = 'StrandsClientError'
  }
}

/**
 * Send a query to Strands ALB endpoint
 * The agent will infer the AWS account ID from the query text if not provided
 * For best results, always provide accountIdentifier explicitly
 *
 * Architecture:
 * - 3 permanent MCP servers: 374673712317 (Gov Master), 083876038518 (Monitoring), 205950196477 (Commercial Master)
 * - Temporary stdio MCP servers spawned for other accounts (~2 min startup, 15 min idle timeout)
 * - Use mcp_id: 'account-specific' to force local MCP spawn
 *
 * @param message - User's query/question
 * @param options - Optional parameters (accountIdentifier, conversationHistory, sessionId, timezone, region, mcpId, preferGovcloud)
 */
export async function sendStrandsQuery(
  message: string,
  options?: {
    accountIdentifier?: string
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string | object | any[] }>
    sessionId?: string
    timezone?: string
    region?: string
    mcpId?: string
    preferGovcloud?: boolean
  }
): Promise<StrandsQueryResponse> {
  const config = await getStrandsConfig()
  const url = `${config.serverUrl}/query`

  // Build request with all supported fields
  const request: StrandsQueryRequest = {
    message,
    sessionId: options?.sessionId,
    account_identifier: options?.accountIdentifier,
    region: options?.region,
    mcp_id: options?.mcpId,
    prefer_govcloud: options?.preferGovcloud,
    timezone: options?.timezone,
    conversationHistory: options?.conversationHistory
  }

  // Remove undefined fields to keep request clean
  Object.keys(request).forEach(key => {
    if (request[key as keyof StrandsQueryRequest] === undefined) {
      delete request[key as keyof StrandsQueryRequest]
    }
  })

  logger.debug('[Strands Client] Sending query to:', url)
  logger.debug('[Strands Client] Message:', message.substring(0, 100) + (message.length > 100 ? '...' : ''))
  if (options?.mcpId) {
    logger.debug('[Strands Client] MCP ID:', options.mcpId)
  }
  if (options?.accountIdentifier) {
    logger.debug('[Strands Client] Account Identifier:', options.accountIdentifier)
  }
  if (options?.timezone) {
    logger.debug('[Strands Client] Timezone:', options.timezone)
  }
  if (options?.region) {
    logger.debug('[Strands Client] Region:', options.region)
  }

  let lastError: Error | null = null
  const maxRetries = config.retries || 2

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), config.timeout)

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(request),
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        let errorData: StrandsErrorResponse | null = null
        let rawErrorBody: string | null = null
        try {
          const text = await response.text()
          rawErrorBody = text
          errorData = JSON.parse(text) as StrandsErrorResponse
        } catch (e) {
          // If response is not JSON, log the raw response
          logger.error('[Strands Client] Non-JSON error response:', rawErrorBody || response.statusText)
        }

        const errorMessage = errorData?.error?.message || `HTTP ${response.status}: ${response.statusText}`
        const errorCode = errorData?.error?.code || `HTTP_${response.status}`

        // Log detailed error info for 500 errors
        if (response.status >= 500) {
          logger.error('[Strands Client] Server error details:', {
            status: response.status,
            statusText: response.statusText,
            errorData,
            rawBody: rawErrorBody?.substring(0, 500)
          })
        }

        // Don't retry on client errors (4xx)
        if (response.status >= 400 && response.status < 500) {
          throw new StrandsClientError(
            errorMessage,
            errorCode,
            response.status,
            errorData?.error?.details
          )
        }

        // Retry on server errors (5xx) or network errors
        lastError = new StrandsClientError(
          errorMessage,
          errorCode,
          response.status,
          errorData?.error?.details
        )

        if (attempt < maxRetries) {
          const delay = config.retryDelay! * Math.pow(2, attempt)
          logger.warn(`[Strands Client] Request failed, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1})`)
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }

        throw lastError
      }

      const rawData = await response.json()

      // Strands may return nested format with 'data' wrapper
      // Check if response has 'data' property and unwrap if needed
      const data = rawData.data ? rawData.data : rawData as StrandsQueryResponse

      // Handle new responseBody field (Strands now uses this instead of result)
      // Normalize the response to use 'result' for backward compatibility
      if (data.responseBody && !data.result) {
        data.result = data.responseBody
      }

      // CRITICAL: Extract sessionId from data.sessionId (not metadata)
      // Backend now generates sessionId if not provided
      if (!data.sessionId && rawData.data?.sessionId) {
        data.sessionId = rawData.data.sessionId
      }

      // Extract account_id from metadata if not at top level
      if (!data.account_id && data.metadata?.accountId) {
        data.account_id = data.metadata.accountId
      }

      // Extract mcp_used from metadata if not at top level
      if (!data.mcp_used && data.metadata?.mcpUsed) {
        data.mcp_used = data.metadata.mcpUsed
      }

      logger.debug('[Strands Client] Response received:', {
        sessionId: data.sessionId,
        accountId: data.account_id,
        mcpUsed: data.mcp_used,
        hasResult: !!(data.result || data.responseBody),
        hasError: !!data.error,
        hasDisambiguation: !!data.disambiguation
      })

      // If Strands returned an error, throw it
      if (data.error) {
        throw new StrandsClientError(
          data.error,
          'STRANDS_QUERY_ERROR',
          200, // HTTP succeeded but query failed
          { accountId: data.account_id, mcpUsed: data.mcp_used }
        )
      }

      return data

    } catch (error: any) {
      // Handle abort (timeout)
      if ((error instanceof Error ? error.name : "Error") === 'AbortError') {
        lastError = new StrandsClientError(
          `Request timeout after ${config.timeout}ms. Strands MCP operations can take 2+ minutes for new accounts.`,
          'TIMEOUT',
          408
        )
      } else if (error instanceof StrandsClientError) {
        lastError = error
        // If it's a client error, don't retry
        if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
          throw error
        }
      } else {
        // Network or other errors
        lastError = new StrandsClientError(
          (error instanceof Error ? error.message : String(error)) || 'Network error',
          'NETWORK_ERROR',
          undefined,
          error
        )
      }

      // Retry logic
      if (attempt < maxRetries) {
        const delay = config.retryDelay! * Math.pow(2, attempt)
        logger.warn(`[Strands Client] Request failed, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1}):`, (error instanceof Error ? error.message : String(error)))
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }

      // All retries exhausted
      logger.error('[Strands Client] All retry attempts exhausted:', lastError)
      throw lastError
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError || new StrandsClientError('Unknown error', 'UNKNOWN_ERROR')
}

/**
 * Extract metadata from Strands response
 */
export function extractStrandsMetadata(response: StrandsQueryResponse): StrandsMetadata {
  // Handle cases where mcp_used might be undefined (e.g., error responses)
  const mcpType = response.mcp_used?.toLowerCase().includes('stdio')
    ? 'temporary' as const
    : 'permanent' as const

  return {
    accountId: response.account_id,
    mcpUsed: response.mcp_used,
    mcpType
  }
}

/**
 * Check if Strands server is available
 */
export async function checkStrandsHealth(): Promise<boolean> {
  try {
    const config = await getStrandsConfig()
    const url = `${config.serverUrl}/health`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000) // Quick health check

    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal
    })

    clearTimeout(timeoutId)
    return response.ok
  } catch {
    return false
  }
}

/**
 * Submit async query to Strands (for polling-based approach)
 * Returns jobId that can be polled for status
 */
export async function sendStrandsAsyncQuery(
  message: string,
  options?: {
    accountIdentifier?: string
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string | object | any[] }>
    timezone?: string
    region?: string
    preferGovcloud?: boolean
  }
): Promise<{ jobId: string; status: string; pollUrl?: string }> {
  const config = await getStrandsConfig()
  const url = `${config.serverUrl}/query/async`

  const request: any = {
    message,
    account_identifier: options?.accountIdentifier,
    region: options?.region,
    prefer_govcloud: options?.preferGovcloud,
    timezone: options?.timezone,
    conversationHistory: options?.conversationHistory
  }

  // Remove undefined fields
  Object.keys(request).forEach(key => {
    if (request[key] === undefined) {
      delete request[key]
    }
  })

  logger.debug('[Strands Client] Submitting async query to:', url)
  logger.debug('[Strands Client] Message:', message.substring(0, 100) + (message.length > 100 ? '...' : ''))

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), config.timeout)

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request),
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text()
      throw new StrandsClientError(
        `Failed to submit async query: ${response.statusText}`,
        `HTTP_${response.status}`,
        response.status,
        errorText
      )
    }

    const data = await response.json()

    logger.debug('[Strands Client] Async query submitted:', {
      jobId: data.jobId,
      status: data.status
    })

    return data

  } catch (error: any) {
    logger.error('[Strands Client] Failed to submit async query:', error)
    throw error instanceof StrandsClientError ? error : new StrandsClientError(
      (error instanceof Error ? error.message : String(error)) || 'Network error',
      'NETWORK_ERROR',
      undefined,
      error
    )
  }
}

/**
 * Poll async job status from Strands
 */
export async function pollStrandsJobStatus(
  jobId: string
): Promise<{
  jobId: string
  status: 'queued' | 'running' | 'complete' | 'error'
  currentStep: string
  progressPercent: number
  eventCount: number
  response: string | null
  errorMessage: string | null
  metadata?: any
  createdAt: string
  lastUpdated: string
}> {
  const config = await getStrandsConfig()
  const url = `${config.serverUrl}/query/status/${jobId}`

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000) // 10s timeout

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new StrandsClientError(
        `Failed to poll job status: ${response.statusText}`,
        `HTTP_${response.status}`,
        response.status
      )
    }

    const data = await response.json()

    logger.debug('[Strands Client] Job status polled:', {
      jobId,
      status: data.status,
      progressPercent: data.progressPercent
    })

    return data

  } catch (error: any) {
    logger.error('[Strands Client] Failed to poll job status:', error)
    throw error instanceof StrandsClientError ? error : new StrandsClientError(
      (error instanceof Error ? error.message : String(error)) || 'Network error',
      'NETWORK_ERROR',
      undefined,
      error
    )
  }
}

