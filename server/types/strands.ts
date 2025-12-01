/**
 * TypeScript type definitions for Strands server integration
 * Based on: http://internal-lz-mcp-servers-dev-alb-1428009891.us-gov-west-1.elb.amazonaws.com:80/query
 */

/**
 * Request to send to Strands ALB endpoint
 * The agent infers account_id from the query text
 */
export interface StrandsQueryRequest {
  query: string
  mcp_id?: string // Optional: 'account-specific' to force local MCP spawn
}

/**
 * Response from Strands ALB endpoint
 * Based on QueryResponse model from Strands agent
 */
export interface StrandsQueryResponse {
  account_id: string
  mcp_used: string // e.g., "account-specific [stdio]" or permanent MCP name
  result: string | null
  error: string | null
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

