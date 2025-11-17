import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { logger } from '../../utils/logger'
import { getPipelineById } from '../../utils/athena-pipeline-queries'
import { enrichPipelineWithGitLabData } from '../../utils/gitlab-api'

// Register OpenAPI documentation
registerEndpoint('/api/pipelines/{id}', 'GET', {
  summary: 'Get a specific pipeline run by ID',
  description: 'Returns detailed information about a single pipeline run. Data is queried from Athena and cached for 10 minutes.',
  tags: ['Pipelines'],
  parameters: [
    {
      name: 'id',
      in: 'path',
      required: true,
      schema: { type: 'string' },
      description: 'Pipeline ID (unique identifier for the pipeline run)'
    },
    {
      name: 'enrich',
      in: 'query',
      required: false,
      schema: { type: 'boolean', default: false },
      description: 'Enrich with GitLab API data (commit, MR info)'
    }
  ],
  responses: {
    200: {
      description: 'Pipeline run details',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  pipeline_id: { type: 'string' },
                  job_id: { type: 'string' },
                  job_name: { type: 'string' },
                  job_url: { type: 'string', description: 'GitLab job URL' },
                  job_stage: { type: 'string' },
                  timestamp_start: { type: 'string' },
                  timestamp_end: { type: 'string' },
                  duration_total_seconds: { type: 'number' },
                  status: { type: 'string' },
                  account_count: { type: 'number' },
                  accounts_processed: { type: 'array', items: { type: 'string' } },
                  commit_author: { type: 'string' },
                  terraform_version: { type: 'string' }
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

  // Pipeline data is ALWAYS stored in GovCloud
  const environment = 'govcloud' as const

  logger.info(`[Pipelines API] Fetching pipeline ${pipelineId} (${environment}, enrich=${shouldEnrich})`)

  try {
    let pipeline = await getPipelineById(pipelineId, environment)

    if (!pipeline) {
      logger.warn(`[Pipelines API] Pipeline ${pipelineId} not found`)
      return errors.notFound(event, `Pipeline ${pipelineId} not found`)
    }

    // Optionally enrich with GitLab API data
    if (shouldEnrich) {
      pipeline = await enrichPipelineWithGitLabData(pipeline)
    }

    const metadata = {
      responseTimeMs: Date.now() - startTime,
      enriched: shouldEnrich
    }

    logger.info(`[Pipelines API] Successfully fetched pipeline ${pipelineId} in ${metadata.responseTimeMs}ms`)

    return sendSuccess(event, pipeline, metadata)

  } catch (error: any) {
    logger.error(`[Pipelines API] Failed to fetch pipeline ${pipelineId}:`, error)
    return errors.serverError(event, `Failed to fetch pipeline: ${error.message || 'Unknown error'}`)
  }
}))
