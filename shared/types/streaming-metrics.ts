/**
 * Streaming Metrics Types
 *
 * Types for tracking and analyzing SSE streaming chat performance
 */

/**
 * Main streaming metrics stored in DynamoDB
 */
export interface StreamingMetrics {
  // Partition & Sort Keys
  metricDate: string          // YYYY-MM-DD (partition key)
  metricType: string          // "daily" | "user:{email}" | "account:{accountId}" (sort key)

  // Counters
  totalStreams: number
  completedStreams: number
  erroredStreams: number
  timeoutStreams: number
  reconnectStreams: number

  // Timing (milliseconds)
  avgDuration: number
  minDuration: number
  maxDuration: number
  totalDuration: number

  // Event counts
  statusEvents: number
  toolCallEvents: number
  responseEvents: number

  // By event type
  eventBreakdown: {
    [eventType: string]: {
      count: number
      avgTimeToFirst: number    // ms from start to first event of this type
    }
  }

  // Tool usage
  toolsUsed: {
    [toolName: string]: number  // count of times used
  }

  // Completion rate
  completionRate: number        // percentage (0-100)
  errorRate: number            // percentage (0-100)

  // Metadata
  timestamp: string            // ISO timestamp
  ttl: number                  // Unix timestamp (auto-delete after 90 days)
}

/**
 * Individual stream event for detailed tracking
 */
export interface StreamEvent {
  streamId: string            // Unique ID for this stream
  eventType: 'status' | 'tool_call' | 'response' | 'complete' | 'error' | 'disambiguation'
  eventData: any
  timestamp: number           // Unix timestamp (ms)
  timeFromStart: number       // ms from stream start
}

/**
 * Stream session tracking
 */
export interface StreamSession {
  streamId: string
  userId: string
  sessionId: string
  threadId?: string
  messageId: string

  // Query details
  query: string
  accountId?: string

  // Timing
  startTime: number           // Unix timestamp (ms)
  endTime?: number            // Unix timestamp (ms)
  duration?: number           // ms

  // Status
  status: 'active' | 'completed' | 'errored' | 'timeout'

  // Events
  events: StreamEvent[]

  // Tools
  toolsCalled: string[]

  // Reconnections
  reconnectAttempts: number
  reconnectSuccess: boolean

  // Result
  error?: string
  finalResponse?: string
}

/**
 * Aggregated metrics for admin dashboard
 */
export interface StreamingDashboardMetrics {
  // Time period
  period: '24h' | '7d' | '30d'
  startDate: string
  endDate: string

  // Overview
  totalStreams: number
  activeStreams: number
  completedStreams: number
  erroredStreams: number

  // Performance
  avgDuration: number
  p50Duration: number
  p95Duration: number
  p99Duration: number

  // Success rates
  completionRate: number
  errorRate: number
  timeoutRate: number
  reconnectSuccessRate: number

  // Event statistics
  avgEventsPerStream: number
  avgToolCallsPerStream: number

  // Top lists
  topUsers: Array<{
    userId: string
    streamCount: number
    avgDuration: number
    errorRate: number
  }>

  topAccounts: Array<{
    accountId: string
    streamCount: number
    avgDuration: number
  }>

  topTools: Array<{
    toolName: string
    usageCount: number
    avgExecutionTime: number
  }>

  // Errors
  recentErrors: Array<{
    streamId: string
    userId: string
    error: string
    timestamp: string
  }>

  // Hourly breakdown (for charts)
  hourlyStats: Array<{
    hour: string            // ISO timestamp truncated to hour
    streamCount: number
    completionRate: number
    avgDuration: number
  }>
}

/**
 * Active stream info for real-time monitoring
 */
export interface ActiveStreamInfo {
  streamId: string
  userId: string
  userEmail: string
  query: string
  accountId?: string

  startTime: string           // ISO timestamp
  elapsedTime: number         // ms

  // Current status
  currentStep: string
  progress?: string
  toolsCalled: string[]

  // Thread info
  threadId?: string
  threadTitle?: string
}

/**
 * Streaming logs query parameters
 */
export interface StreamingLogsQuery {
  startTime?: string          // ISO timestamp
  endTime?: string            // ISO timestamp
  userId?: string
  sessionId?: string
  eventType?: string
  filterPattern?: string
  limit?: number
  nextToken?: string
}

/**
 * Streaming log entry
 */
export interface StreamingLogEntry {
  timestamp: string           // ISO timestamp
  streamId: string
  userId: string
  eventType: string
  message: string
  data?: any
  error?: string
  level: 'INFO' | 'WARN' | 'ERROR'
}

/**
 * Metrics collector request
 */
export interface CollectMetricsRequest {
  streamSession: StreamSession
  metricDate: string
}

/**
 * API response types
 */
export interface StreamingMetricsResponse {
  success: boolean
  metrics: StreamingDashboardMetrics
}

export interface ActiveStreamsResponse {
  success: boolean
  streams: ActiveStreamInfo[]
  count: number
}

export interface StreamingLogsResponse {
  success: boolean
  logs: StreamingLogEntry[]
  nextToken?: string
  count: number
}
