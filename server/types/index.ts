/**
 * Server-side type definitions
 */

export interface AWSEnvironment {
  type: 'commercial' | 'govcloud'
  region: string
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
}

export interface AWSConfig {
  commercial?: AWSEnvironment
  govcloud?: AWSEnvironment
}

export interface APIResponse<T = any> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
    details?: any
  }
  metadata?: {
    timestamp: string
    requestID?: string
  }
}

export interface PaginatedResponse<T> extends APIResponse<T[]> {
  pagination: {
    page: number
    limit: number
    total: number
    hasMore: boolean
  }
}

export interface DynamoDBQueryParams {
  tableName: string
  key?: Record<string, any>
  queryExpression?: string
  filterExpression?: string
  projectionExpression?: string
  expressionAttributeNames?: Record<string, string>
  expressionAttributeValues?: Record<string, any>
  limit?: number
  nextToken?: string
  indexName?: string
  scanIndexForward?: boolean
}

export interface CostExplorerParams {
  startDate: string
  endDate: string
  granularity: 'DAILY' | 'MONTHLY' | 'HOURLY'
  metrics: string[]
  groupBy?: Array<{
    type: 'DIMENSION' | 'TAG'
    key: string
  }>
  filter?: any
}