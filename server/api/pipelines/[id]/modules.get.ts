import { sendSuccess, errors, handleAsync } from '../../../utils/api-response'
import { registerEndpoint } from '../../../plugins/swagger'
import { logger } from '../../../utils/logger'
import { getModuleBreakdownForPipeline } from '../../../utils/athena-pipeline-queries'

// Register OpenAPI documentation
registerEndpoint('/api/pipelines/{id}/modules', 'GET', {
  summary: 'Get module-level breakdown for a specific pipeline',
  description: 'Returns aggregated resource changes grouped by Terraform module for a pipeline run. Data is cached for 10 minutes.',
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
      description: 'Module breakdown for pipeline',
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
                    module_name: { type: 'string' },
                    total_changes: { type: 'number' },
                    creates: { type: 'number' },
                    updates: { type: 'number' },
                    destroys: { type: 'number' }
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

  const environment = 'govcloud' as const

  logger.info(`[Pipelines API] Fetching module breakdown for pipeline ${pipelineId}`)

  try {
    const moduleBreakdown = await getModuleBreakdownForPipeline(pipelineId, environment)

    const metadata = {
      responseTimeMs: Date.now() - startTime,
      count: moduleBreakdown.length
    }

    logger.info(`[Pipelines API] Found ${moduleBreakdown.length} modules for pipeline ${pipelineId}`)

    return sendSuccess(event, moduleBreakdown, metadata)

  } catch (error: any) {
    logger.error(`[Pipelines API] Failed to fetch module breakdown for pipeline ${pipelineId}:`, error)
    return errors.serverError(event, `Failed to fetch module breakdown: ${error.message || 'Unknown error'}`)
  }
}))
