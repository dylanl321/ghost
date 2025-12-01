/**
 * Strands Agent HTTP Client
 * Client for communicating with Strands ECS service via ALB
 * Endpoint: http://internal-lz-mcp-servers-dev-alb-1428009891.us-gov-west-1.elb.amazonaws.com:80/query
 */

import { logger } from './logger'
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
async function getStrandsConfig(): Promise<StrandsClientConfig> {
  // Try to get config from site config system
  try {
    const { getConfigValue } = await import('./site-config')

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
 * The agent will infer the AWS account ID from the query text
 * For more explicit queries, mention the account ID in the query
 *
 * Architecture:
 * - 3 permanent MCP servers: 374673712317 (Gov Master), 083876038518 (Monitoring), 205950196477 (Commercial Master)
 * - Temporary stdio MCP servers spawned for other accounts (~2 min startup, 15 min idle timeout)
 * - Use mcp_id: 'account-specific' to force local MCP spawn
 */
export async function sendStrandsQuery(
  query: string,
  mcpId?: string
): Promise<StrandsQueryResponse> {
  const config = await getStrandsConfig()
  const url = `${config.serverUrl}/query`

  const request: StrandsQueryRequest = { query }
  if (mcpId) {
    request.mcp_id = mcpId
  }

  logger.debug('[Strands Client] Sending query to:', url)
  logger.debug('[Strands Client] Query:', query.substring(0, 100) + (query.length > 100 ? '...' : ''))
  if (mcpId) {
    logger.debug('[Strands Client] MCP ID:', mcpId)
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
        try {
          errorData = await response.json() as StrandsErrorResponse
        } catch {
          // If response is not JSON, use status text
        }

        const errorMessage = errorData?.error?.message || `HTTP ${response.status}: ${response.statusText}`
        const errorCode = errorData?.error?.code || `HTTP_${response.status}`

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

      const data = await response.json() as StrandsQueryResponse

      logger.debug('[Strands Client] Response received:', {
        accountId: data.account_id,
        mcpUsed: data.mcp_used,
        hasResult: !!data.result,
        hasError: !!data.error
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
      if (error.name === 'AbortError') {
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
          error.message || 'Network error',
          'NETWORK_ERROR',
          undefined,
          error
        )
      }

      // Retry logic
      if (attempt < maxRetries) {
        const delay = config.retryDelay! * Math.pow(2, attempt)
        logger.warn(`[Strands Client] Request failed, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1}):`, error.message)
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
  const mcpType = response.mcp_used.toLowerCase().includes('stdio')
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
    const config = getStrandsConfig()
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

