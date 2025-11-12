/**
 * TypeScript type definitions for Strands server integration
 */

/**
 * Chat message structure for Strands conversation
 */
export interface StrandsMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp?: string
}

/**
 * Request to send to Strands server
 */
export interface StrandsChatRequest {
  messages: StrandsMessage[]
  sessionId?: string
  stream?: boolean
}

/**
 * Response from Strands server
 */
export interface StrandsChatResponse {
  message: string
  sessionId?: string
  metadata?: {
    model?: string
    tokens?: {
      input?: number
      output?: number
    }
    toolsUsed?: string[]
  }
}

/**
 * Error response from Strands server
 */
export interface StrandsErrorResponse {
  error: {
    code: string
    message: string
    details?: any
  }
}

/**
 * Configuration for Strands client
 */
export interface StrandsClientConfig {
  serverUrl: string
  timeout: number
  retries?: number
  retryDelay?: number
}

