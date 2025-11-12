/**
 * Strands Server HTTP Client
 * Simple HTTP client for communicating with Strands server
 */

import { logger } from './logger'
import type {
  StrandsChatRequest,
  StrandsChatResponse,
  StrandsErrorResponse,
  StrandsClientConfig
} from '../types/strands'

/**
 * Get Strands client configuration from environment
 */
function getStrandsConfig(): StrandsClientConfig {
  const serverUrl = process.env.STRANDS_SERVER_URL
  if (!serverUrl) {
    throw new Error('STRANDS_SERVER_URL environment variable is required')
  }

  return {
    serverUrl: serverUrl.replace(/\/$/, ''), // Remove trailing slash
    timeout: parseInt(process.env.STRANDS_TIMEOUT || '30000', 10),
    retries: parseInt(process.env.STRANDS_RETRIES || '2', 10),
    retryDelay: parseInt(process.env.STRANDS_RETRY_DELAY || '1000', 10)
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
 * Send a chat request to Strands server
 */
export async function sendStrandsChatRequest(
  request: StrandsChatRequest
): Promise<StrandsChatResponse> {
  const config = getStrandsConfig()
  const url = `${config.serverUrl}/chat`

  logger.debug('[Strands Client] Sending request to:', url)
  logger.debug('[Strands Client] Request payload:', {
    messageCount: request.messages.length,
    sessionId: request.sessionId,
    stream: request.stream
  })

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

      const data = await response.json() as StrandsChatResponse

      logger.debug('[Strands Client] Response received:', {
        messageLength: data.message?.length,
        sessionId: data.sessionId,
        toolsUsed: data.metadata?.toolsUsed?.length || 0
      })

      return data

    } catch (error: any) {
      // Handle abort (timeout)
      if (error.name === 'AbortError') {
        lastError = new StrandsClientError(
          `Request timeout after ${config.timeout}ms`,
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

