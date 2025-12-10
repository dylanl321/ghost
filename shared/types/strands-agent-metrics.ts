/**
 * Strands Agent Metrics Types
 *
 * Backend agent execution metrics collected by the Strands MCP Agent.
 * Tracks query execution, tool usage, errors, and performance.
 */

/**
 * Query metric record from agent execution
 */
export interface StrandsQueryMetric {
  metric_id: string
  timestamp: string
  metric_type: 'query'
  session_id: string
  query: string
  query_length: number
  account_id: string
  account_alias: string
  mcp_id: string
  mcp_type: 'permanent' | 'temporary' | 'aggregated'
  success: boolean
  error_message: string
  execution_time_ms: number
  tools_used: string[]
  tool_calls_count: number
  response_length: number
  streaming: boolean
  ttl: number
}

/**
 * Error metric record from agent execution
 */
export interface StrandsErrorMetric {
  metric_id: string
  timestamp: string
  metric_type: 'error'
  session_id: string
  error_type: string
  error_message: string
  error_step: string
  account_id: string
  mcp_id: string
  ttl: number
}

/**
 * Tool call metric record (future feature)
 */
export interface StrandsToolCallMetric {
  metric_id: string
  timestamp: string
  metric_type: 'tool_call'
  session_id: string
  tool_name: string
  tool_input: string
  success: boolean
  execution_time_ms: number
  ttl: number
}

/**
 * Union type for all Strands metrics
 */
export type StrandsMetric = StrandsQueryMetric | StrandsErrorMetric | StrandsToolCallMetric

/**
 * Aggregated agent performance metrics
 */
export interface StrandsAgentDashboardMetrics {
  // Time period
  period: '24h' | '7d' | '30d'
  startDate: string
  endDate: string

  // Query metrics
  totalQueries: number
  successfulQueries: number
  failedQueries: number
  successRate: number

  // Performance
  avgExecutionTime: number
  p50ExecutionTime: number
  p95ExecutionTime: number
  p99ExecutionTime: number
  slowQueries: number // > 5 seconds

  // Tool usage
  totalToolCalls: number
  avgToolCallsPerQuery: number
  topTools: Array<{
    toolName: string
    usageCount: number
    avgExecutionTime: number
  }>

  // MCP usage
  mcpUsage: Array<{
    mcpId: string
    mcpType: 'permanent' | 'temporary' | 'aggregated'
    queryCount: number
    avgExecutionTime: number
  }>

  // Account metrics
  topAccounts: Array<{
    accountId: string
    accountAlias: string
    queryCount: number
    avgExecutionTime: number
    successRate: number
  }>

  // Error analysis
  totalErrors: number
  errorRate: number
  errorsByType: Array<{
    errorType: string
    count: number
    percentage: number
  }>
  errorsByStep: Array<{
    errorStep: string
    count: number
    percentage: number
  }>

  // Trends
  queryTrend: Array<{
    timestamp: string
    queryCount: number
    successRate: number
    avgExecutionTime: number
  }>
}

/**
 * Session trace - all metrics for a specific session
 */
export interface SessionTrace {
  sessionId: string
  metrics: StrandsMetric[]
  summary: {
    totalQueries: number
    successfulQueries: number
    failedQueries: number
    totalExecutionTime: number
    toolsUsed: string[]
    accountsAccessed: string[]
    mcpsUsed: string[]
    errors: Array<{
      errorType: string
      errorMessage: string
      errorStep: string
      timestamp: string
    }>
  }
}

/**
 * API response types
 */
export interface StrandsAgentMetricsResponse {
  success: boolean
  metrics: StrandsAgentDashboardMetrics
}

export interface SessionTraceResponse {
  success: boolean
  trace: SessionTrace
}

export interface StrandsMetricsQueryResponse {
  success: boolean
  metrics: StrandsMetric[]
  count: number
  nextToken?: string
}
