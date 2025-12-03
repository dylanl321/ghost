/**
 * TypeScript type definitions for Strands server integration
 * Based on: http://internal-lz-mcp-servers-dev-alb-1428009891.us-gov-west-1.elb.amazonaws.com:80/query
 */

/**
 * Request to send to Strands ALB endpoint
 * The agent infers account_id from the query text, but account_identifier is recommended
 */
export interface StrandsQueryRequest {
  // Required fields
  message: string // User's query/question (renamed from 'query' to match API spec)

  // Optional session management
  sessionId?: string // Session identifier for context

  // Optional account identification
  account_identifier?: string // Account ID, alias, name, email, username

  // Optional AWS configuration
  region?: string // AWS region (e.g., "us-gov-west-1")
  mcp_id?: string // Explicit MCP server to use ('account-specific' to force local MCP spawn)
  prefer_govcloud?: boolean // Prefer GovCloud account ID (default: true)

  // Optional user context
  timezone?: string // IANA timezone (e.g., "America/New_York", "America/Los_Angeles")

  // Optional conversation context
  conversationHistory?: Array<{
    role: 'user' | 'assistant'
    content: string | object | any[]
  }>
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
  disambiguation?: AccountDisambiguation // If multiple accounts match
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

/**
 * Account disambiguation when multiple accounts match
 */
export interface AccountDisambiguation {
  search_term: string // What user searched for
  message: string // Instructions for user
  matches: AccountDisambiguationOption[] // List of matching accounts
}

/**
 * Single account option in disambiguation response
 */
export interface AccountDisambiguationOption {
  request_id: string // Unique identifier for selection
  account_alias: string // Account name
  govcloud_account_id?: string // GovCloud ID if exists
  commercial_account_id?: string // Commercial ID if exists
  display_name: string // Formatted for display
  match_score: number // Relevance score (0-100)
  match_reason: string // Why it matched
}

/**
 * Request to select an account after disambiguation
 */
export interface AccountSelectionRequest {
  session_id: string // Session identifier
  request_id: string // Selected account's request ID from disambiguation
}

/**
 * Response from account selection
 */
export interface AccountSelectionResponse {
  status: 'success'
  message: string // Confirmation message
  account: AccountDisambiguationOption
}

