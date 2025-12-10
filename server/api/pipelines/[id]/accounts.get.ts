import { sendSuccess, errors, handleAsync } from '../../../utils/api-response'
import { registerEndpoint } from '../../../plugins/swagger'
import { logger } from '../../../utils/logger'
import { getAccountPlansForPipeline } from '../../../utils/athena-pipeline-queries'

// Register OpenAPI documentation
registerEndpoint('/api/pipelines/{id}/accounts', 'GET', {
  summary: 'Get account plans for a specific pipeline',
  description: 'Returns per-account plan outcomes including changes and application status for a pipeline run. Data is cached for 10 minutes.',
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
      description: 'Account plans for pipeline',
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
                    account_name: { type: 'string' },
                    plan_created_at: { type: 'string' },
                    plan_pipeline_id: { type: 'string' },
                    changes_create: { type: 'number' },
                    changes_update: { type: 'number' },
                    changes_destroy: { type: 'number' },
                    changes_total: { type: 'number' },
                    plan_status: { type: 'string' },
                    applied_at: { type: 'string' }
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

  logger.info(`[Pipelines API] Fetching account plans for pipeline ${pipelineId}`)

  try {
    const accountPlans = await getAccountPlansForPipeline(pipelineId, environment)

    const metadata = {
      responseTimeMs: Date.now() - startTime,
      count: accountPlans.length
    }

    logger.info(`[Pipelines API] Found ${accountPlans.length} account plans for pipeline ${pipelineId}`)

    return sendSuccess(event, accountPlans, metadata)

  } catch (error: any) {
    logger.error(`[Pipelines API] Failed to fetch account plans for pipeline ${pipelineId}:`, error)
    return errors.serverError(event, `Failed to fetch account plans: ${error.message || 'Unknown error'}`)
  }
}))
