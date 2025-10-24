/**
 * API Response Utilities
 * Standardized response formatting and error handling
 */

import { setResponseStatus, getQuery } from 'h3'
import type { H3Event } from 'h3'
import type { APIResponse, PaginatedResponse } from '../types'
import { logger } from './logger'

/**
 * Send a successful response
 */
export function sendSuccess<T>(
  event: H3Event,
  data: T,
  metadata?: Record<string, any>
): APIResponse<T> {
  const response: APIResponse<T> = {
    success: true,
    data,
    metadata: {
      timestamp: new Date().toISOString(),
      ...metadata
    }
  }
  
  setResponseStatus(event, 200)
  return response
}

/**
 * Send a paginated response
 */
export function sendPaginated<T>(
  event: H3Event,
  items: T[],
  pagination: {
    page: number
    limit: number
    total: number
  },
  metadata?: Record<string, any>
): PaginatedResponse<T> {
  const response: PaginatedResponse<T> = {
    success: true,
    data: items,
    pagination: {
      ...pagination,
      hasMore: pagination.page * pagination.limit < pagination.total
    },
    metadata: {
      timestamp: new Date().toISOString(),
      ...metadata
    }
  }
  
  setResponseStatus(event, 200)
  return response
}

/**
 * Send an error response
 */
export function sendApiError(
  event: H3Event,
  code: string,
  message: string,
  statusCode: number = 400,
  details?: any
): APIResponse {
  const response: APIResponse = {
    success: false,
    error: {
      code,
      message,
      details
    },
    metadata: {
      timestamp: new Date().toISOString()
    }
  }
  
  setResponseStatus(event, statusCode)
  return response
}

/**
 * Common error responses
 */
export const errors = {
  badRequest: (event: H3Event, message: string, details?: any) =>
    sendApiError(event, 'BAD_REQUEST', message, 400, details),
    
  unauthorized: (event: H3Event, message = 'Unauthorized') =>
    sendApiError(event, 'UNAUTHORIZED', message, 401),
    
  forbidden: (event: H3Event, message = 'Forbidden') =>
    sendApiError(event, 'FORBIDDEN', message, 403),
    
  notFound: (event: H3Event, resource: string) =>
    sendApiError(event, 'NOT_FOUND', `${resource} not found`, 404),
    
  conflict: (event: H3Event, message: string) =>
    sendApiError(event, 'CONFLICT', message, 409),
    
  validationError: (event: H3Event, errors: any) =>
    sendApiError(event, 'VALIDATION_ERROR', 'Validation failed', 422, errors),
    
  serverError: (event: H3Event, message = 'Internal server error', details?: any) =>
    sendApiError(event, 'INTERNAL_ERROR', message, 500, details),
    
  awsError: (event: H3Event, error: any) => {
    const message = error.message || 'AWS service error'
    const code = error.name || 'AWS_ERROR'
    return sendApiError(event, code, message, 500, {
      service: error.$metadata?.service,
      operation: error.$metadata?.operation,
      requestID: error.$metadata?.requestID
    })
  }
}

/**
 * Parse query parameters with defaults
 */
export function parseQueryParams(event: H3Event) {
  const query = getQuery(event)
  
  return {
    environment: (query.environment as 'commercial' | 'govcloud') || 'commercial',
    limit: parseInt(query.limit as string) || 20,
    page: parseInt(query.page as string) || 1,
    nextToken: query.nextToken as string | undefined,
    sortBy: query.sortBy as string | undefined,
    sortOrder: (query.sortOrder as 'asc' | 'desc') || 'desc'
  }
}

/**
 * Validate environment parameter
 */
export function validateEnvironment(env: string): env is 'commercial' | 'govcloud' {
  return env === 'commercial' || env === 'govcloud'
}

/**
 * Handle async route errors
 */
export function handleAsync<T extends (...args: any[]) => Promise<any>>(fn: T): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args)
    } catch (error: any) {
      const event = args[0] as H3Event
      
      // Check if it's an AWS error
      if (error.$metadata) {
        return errors.awsError(event, error)
      }
      
      // Generic error handling
      logger.error('API Error:', error)
      return errors.serverError(event, error.message || 'An unexpected error occurred')
    }
  }) as T
}