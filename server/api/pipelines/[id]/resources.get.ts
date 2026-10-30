import { sendSuccess, errors, handleAsync } from '../../../utils/api-response'
import { registerEndpoint } from '../../../plugins/swagger'
import { logger } from '../../../utils/logger'
import { getResourceChangesForPipeline, clampIntParam } from '../../../utils/athena-pipeline-queries'

// Register OpenAPI documentation
registerEndpoint('/api/pipelines/{id}/resources', 'GET', {
  summary: 'Get resource changes for a specific pipeline',
  description: 'Returns individual resource changes for a pipeline run including module names, change actions, and application status. Data is cached for 10 minutes.',
  tags: ['Pipelines'],
  parameters: [
    {
      name: 'id',
      in: 'path',
      required: true,
      schema: { type: 'string' },
      description: 'Pipeline ID'
    },
    {
      name: 'limit',
      in: 'query',
      required: false,
      schema: { type: 'number', default: 500 },
      description: 'Maximum number of resource changes to return'
    }
  ],
  responses: {
    200: {
      description: 'Resource changes for pipeline',
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
                    account_id: { type: 'string' },
                    resource_address: { type: 'string' },
                    resource_type: { type: 'string' },
                    module_name: { type: 'string' },
                    change_action: { type: 'string' },
                    applied: { type: 'boolean' },
                    apply_success: { type: 'boolean' },
                    timestamp: { type: 'string' }
                  }
                }
              },
              metadata: {
                type: 'object',
                properties: {
                  responseTimeMs: { type: 'number' },
                  count: { type: 'number' },
                  limit: { type: 'number' }
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
  const query = getQuery(event)
  const limit = clampIntParam(query.limit, 500, 1, 5000)

  if (!pipelineId) {
    return errors.badRequest(event, 'Pipeline ID is required')
  }
  if (!/^\d+$/.test(pipelineId)) {
    return errors.badRequest(event, 'Pipeline ID must contain only digits')
  }

  const environment = 'govcloud' as const

  logger.info(`[Pipelines API] Fetching resource changes for pipeline ${pipelineId} (limit: ${limit})`)

  try {
    const resourceChanges = await getResourceChangesForPipeline(pipelineId, limit, environment)

    const metadata = {
      responseTimeMs: Date.now() - startTime,
      count: resourceChanges.length,
      limit
    }

    logger.info(`[Pipelines API] Found ${resourceChanges.length} resource changes for pipeline ${pipelineId}`)

    return sendSuccess(event, resourceChanges, metadata)

  } catch (error: any) {
    logger.error(`[Pipelines API] Failed to fetch resource changes for pipeline ${pipelineId}:`, error)
    return errors.serverError(event, `Failed to fetch resource changes: ${error.message || 'Unknown error'}`)
  }
}))
