import { sendSuccess, errors, handleAsync } from '../../../utils/api-response'
import { registerEndpoint } from '../../../plugins/swagger'
import { logger } from '../../../utils/logger'
import { getErrorDetailsForPipeline } from '../../../utils/athena-pipeline-queries'

// Register OpenAPI documentation
registerEndpoint('/api/pipelines/{id}/errors', 'GET', {
  summary: 'Get error details for a specific pipeline',
  description: 'Returns detailed error information for a pipeline run including error messages, categories, severity, and affected resources. Data is cached for 10 minutes.',
  tags: ['Pipelines'],
  parameters: [
    {
      name: 'id',
      in: 'path',
      required: true,
      schema: { type: 'string' },
      description: 'Pipeline ID'
    }
  ],
  responses: {
    200: {
      description: 'Error details for pipeline',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    pipeline_id: { type: 'string' },
                    account_id: { type: 'string' },
                    timestamp: { type: 'string' },
                    error_phase: { type: 'string' },
                    error_category: { type: 'string' },
                    error_severity: { type: 'string' },
                    error_message: { type: 'string' },
                    error_resource_type: { type: 'string' }
                  }
                }
              },
              metadata: {
                type: 'object',
                properties: {
                  responseTimeMs: { type: 'number' },
                  count: { type: 'number' }
                }
              }
            }
          }
        }
      }
    },
    500: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  const startTime = Date.now()
  const pipelineId = getRouterParam(event, 'id')

  if (!pipelineId) {
    return errors.badRequest(event, 'Pipeline ID is required')
  }
  if (!/^\d+$/.test(pipelineId)) {
    return errors.badRequest(event, 'Pipeline ID must contain only digits')
  }

  const environment = 'govcloud' as const

  logger.info(`[Pipelines API] Fetching error details for pipeline ${pipelineId}`)

  try {
    const errorDetails = await getErrorDetailsForPipeline(pipelineId, environment)

    const metadata = {
      responseTimeMs: Date.now() - startTime,
      count: errorDetails.length
    }

    logger.info(`[Pipelines API] Found ${errorDetails.length} errors for pipeline ${pipelineId}`)

    return sendSuccess(event, errorDetails, metadata)

  } catch (error: any) {
    logger.error(`[Pipelines API] Failed to fetch error details for pipeline ${pipelineId}:`, error)
    return errors.serverError(event, `Failed to fetch error details: ${error.message || 'Unknown error'}`)
  }
}))
