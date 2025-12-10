/**
 * GET /api/organization/overview/progress/[requestId]
 * 
 * Track progress of async organization overview generation
 * Provides real-time updates on processing status, completion percentage, and ETA
 */

import { defineEventHandler, getRouterParam } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../../../utils/api-response'
import { registerEndpoint } from '../../../../plugins/swagger'

// Register OpenAPI documentation
registerEndpoint('/api/organization/overview/progress/[requestId]', 'GET', {
  summary: 'Get organization overview processing progress',
  description: 'Check the status and progress of an async organization overview request',
  tags: ['Organization'],
  parameters: [
    {
      name: 'requestId',
      in: 'path',
      required: true,
      schema: { type: 'string' },
      description: 'Unique request identifier returned by the async overview endpoint'
    }
  ],
  responses: {
    200: {
      description: 'Processing status and progress information',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  requestId: { type: 'string' },
                  status: { 
                    type: 'string', 
                    enum: ['pending', 'processing', 'completed', 'failed'],
                    description: 'Current processing status'
                  },
                  progress: { 
                    type: 'integer', 
                    minimum: 0, 
                    maximum: 100,
                    description: 'Completion percentage'
                  },
                  currentStep: { 
                    type: 'string',
                    description: 'Description of current processing step'
                  },
                  duration: { 
                    type: 'string',
                    description: 'Time elapsed since request started'
                  },
                  estimatedCompletion: { 
                    type: 'string', 
                    format: 'date-time',
                    description: 'Estimated completion time'
                  },
                  result: {
                    type: 'object',
                    description: 'Complete overview data (only present when status is completed)',
                    nullable: true
                  },
                  error: {
                    type: 'string',
                    description: 'Error message (only present when status is failed)',
                    nullable: true
                  }
                }
              }
            }
          }
        }
      }
    },
    404: { $ref: '#/components/schemas/Error' },
    500: { $ref: '#/components/schemas/Error' }
  }
})

// In-memory storage for progress tracking (in production, use Redis or database)
const processingJobs = new Map<string, {
  requestId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  currentStep: string
  startTime: number
  estimatedCompletion?: Date
  result?: any
  error?: string
}>()

export default defineEventHandler(handleAsync(async (event) => {
  const requestId = getRouterParam(event, 'requestId') as string
  
  if (!requestId) {
    return errors.badRequest(event, 'Request ID is required')
  }
  
  // Check if job exists
  const job = processingJobs.get(requestId)
  
  if (!job) {
    return errors.notFound(event, `Processing job not found: ${requestId}`)
  }
  
  // Calculate duration
  const duration = Date.now() - job.startTime
  const durationString = `${(duration / 1000).toFixed(1)}s`
  
  // Prepare response
  const response: any = {
    requestId: job.requestId,
    status: job.status,
    progress: job.progress,
    currentStep: job.currentStep,
    duration: durationString
  }
  
  // Add estimated completion if available
  if (job.estimatedCompletion) {
    response.estimatedCompletion = job.estimatedCompletion.toISOString()
  }
  
  // Add result if completed
  if (job.status === 'completed' && job.result) {
    response.result = job.result
  }
  
  // Add error if failed
  if (job.status === 'failed' && job.error) {
    response.error = job.error
  }
  
  return sendSuccess(event, response)
}))

// Export functions for use by the main overview endpoint
export { processingJobs }