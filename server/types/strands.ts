/**
 * TypeScript type definitions for Strands server integration
 * Based on: http://internal-lz-mcp-servers-dev-alb-1428009891.us-gov-west-1.elb.amazonaws.com:80/query
 */

/**
 * Request to send to Strands ALB endpoint
 * The agent infers account_id from the query text, but account_identifier is recommended
 */
export interface StrandsQueryRequest {
  query: string
  mcp_id?: string // Optional: 'account-specific' to force local MCP spawn
  account_identifier?: string // Optional but recommended: AWS account ID to query
  conversationHistory?: Array<{
    role: 'user' | 'assistant'
    content: string
  }>
  sessionId?: string
}

/**
 * Response from Strands ALB endpoint
 * Based on QueryResponse model from Strands agent
 * Note: Strands may return nested format with 'data' wrapper or flat format
 * Update: Strands now returns responseBody instead of result
 */
export interface StrandsQueryResponse {
  account_id?: string
  mcp_used?: string // e.g., "account-specific [stdio]" or permanent MCP name
  result?: string | null
  responseBody?: string | null // New field name from Strands
  error?: string | null
  sessionId?: string
  metadata?: {
    accountId?: string
    mcpUsed?: string
    mcpType?: 'permanent' | 'temporary'
  }
  references?: Array<{ document: string }>
  suggestedLinks?: any[]
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
  serverUrl: string // ALB URL without trailing slash
  timeout: number // Request timeout in ms (default: 300000 for 5 min)
  retries?: number
  retryDelay?: number
}

/**
 * Metadata extracted from Strands result
 */
export interface StrandsMetadata {
  accountId?: string
  mcpUsed?: string
  mcpType?: 'permanent' | 'temporary'
}

