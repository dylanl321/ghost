import { sendSuccess, errors, handleAsync } from '../../../utils/api-response'
import { registerEndpoint } from '../../../plugins/swagger'
import { logger } from '../../../utils/logger'
import { getPipelineByIdWithDetails } from '../../../utils/athena-pipeline-queries'
import { enrichPipelineWithGitLabData } from '../../../utils/gitlab-api'

// Register OpenAPI documentation
registerEndpoint('/api/pipelines/{id}/details', 'GET', {
  summary: 'Get comprehensive pipeline details with all related data',
  description: 'Returns detailed information about a pipeline including account plans, resource changes, and error details. Data is aggregated from multiple Athena tables and cached for 10 minutes.',
  tags: ['Pipelines'],
  parameters: [
    {
      name: 'id',
      in: 'path',
      required: true,
      schema: { type: 'string' },
      description: 'Pipeline ID (unique identifier for the pipeline run)'
    }
  ],
  responses: {
    200: {
      description: 'Comprehensive pipeline details',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  pipeline: {
                    type: 'object',
                    description: 'Pipeline run details'
                  },
                  accountPlans: {
                    type: 'array',
                    description: 'Per-account plan outcomes',
                    items: { type: 'object' }
                  },
                  resourceStats: {
                    type: 'object',
                    properties: {
                      totalResources: { type: 'number' },
                      byAction: { type: 'array', items: { type: 'object' } },
                      byType: { type: 'array', items: { type: 'object' } }
                    }
                  },
                  errorStats: {
                    type: 'object',
                    properties: {
                      totalErrors: { type: 'number' },
                      byCategory: { type: 'array', items: { type: 'object' } },
                      bySeverity: { type: 'array', items: { type: 'object' } }
                    }
                  }
                }
              },
              metadata: {
                type: 'object',
                properties: {
                  responseTimeMs: { type: 'number' }
                }
              }
            }
          }
        }
      }
    },
    404: {
      description: 'Pipeline not found',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: false },
              error: { type: 'string', example: 'Pipeline not found' }
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
  const shouldEnrich = query.enrich === 'true' || query.enrich === true

  if (!pipelineId) {
    return errors.badRequest(event, 'Pipeline ID is required')
  }
  if (!/^\d+$/.test(pipelineId)) {
    return errors.badRequest(event, 'Pipeline ID must contain only digits')
  }

  // Pipeline data is ALWAYS stored in GovCloud
  const environment = 'govcloud' as const

  logger.info(`[Pipelines API] Fetching comprehensive details for pipeline ${pipelineId} (enrich=${shouldEnrich})`)

  try {
    const details = await getPipelineByIdWithDetails(pipelineId, environment)

    if (!details.pipeline) {
      logger.warn(`[Pipelines API] Pipeline ${pipelineId} not found`)
      return errors.notFound(event, `Pipeline ${pipelineId} not found`)
    }

    // Optionally enrich pipeline data with GitLab API
    if (shouldEnrich && details.pipeline) {
      details.pipeline = await enrichPipelineWithGitLabData(details.pipeline)
    }

    const metadata = {
      responseTimeMs: Date.now() - startTime,
      enriched: shouldEnrich
    }

    logger.info(`[Pipelines API] Successfully fetched comprehensive details for pipeline ${pipelineId} in ${metadata.responseTimeMs}ms`)

    return sendSuccess(event, details, metadata)

  } catch (error: any) {
    logger.error(`[Pipelines API] Failed to fetch comprehensive details for pipeline ${pipelineId}:`, error)
    return errors.serverError(event, `Failed to fetch pipeline details: ${error.message || 'Unknown error'}`)
  }
}))
