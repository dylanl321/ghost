/**
 * GET /api/health
 * Lightweight health check endpoint for ALB health checks
 *
 * This endpoint returns immediately without performing any AWS checks or system metrics.
 * For detailed health diagnostics, use /api/health/ready instead.
 */

import { defineEventHandler } from 'h3'
import { sendSuccess, handleAsync } from '../utils/api-response'
import { registerEndpoint } from '../plugins/swagger'

// Register OpenAPI documentation
registerEndpoint('/api/health', 'GET', {
  summary: 'Lightweight health check',
  description: 'Fast health check endpoint for load balancer health monitoring. Returns immediately without performing AWS or dependency checks. For detailed health diagnostics, use /api/health/ready.',
  tags: ['System'],
  responses: {
    200: {
      description: 'Service is alive',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  status: { type: 'string', enum: ['ok'] },
                  timestamp: { type: 'string', format: 'date-time' }
                }
              }
            }
          }
        }
      }
    }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  return sendSuccess(event, {
    status: 'ok',
    timestamp: new Date().toISOString()
  })
}))
