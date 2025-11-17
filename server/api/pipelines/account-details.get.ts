import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { logger } from '../../utils/logger'
import { getPipelineRunDetails } from '../../utils/athena-pipeline-queries'

// Register OpenAPI documentation
registerEndpoint('/api/pipelines/account-details', 'GET', {
  summary: 'Get detailed information for a specific pipeline run',
  description: 'Returns comprehensive details for a pipeline run including resource changes and errors for a specific account.',
  tags: ['Pipelines'],
  parameters: [
    {
      name: 'pipeline_id',
      in: 'query',
      required: true,
      schema: { type: 'string' },
      description: 'GitLab Pipeline ID'
    },
    {
      name: 'job_id',
      in: 'query',
      required: true,
      schema: { type: 'string' },
      description: 'GitLab Job ID'
    },
    {
      name: 'account_id',
      in: 'query',
      required: true,
      schema: { type: 'string' },
      description: 'AWS Account ID'
    },
    {
      name: 'environment',
      in: 'query',
      required: false,
      schema: { type: 'string', enum: ['commercial', 'govcloud'], default: 'commercial' },
      description: 'AWS environment'
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
                  run: {
                    type: 'object',
                    description: 'Pipeline run metadata',
                    nullable: true
                  },
                  resourceChanges: {
                    type: 'array',
                    description: 'Resource changes in this run',
                    items: {
                      type: 'object',
                      properties: {
                        resource_address: { type: 'string' },
                        resource_type: { type: 'string' },
                        module_name: { type: 'string' },
                        change_action: { type: 'string' },
                        applied: { type: 'boolean' },
                        apply_success: { type: 'boolean' }
                      }
                    }
                  },
                  errors: {
                    type: 'array',
                    description: 'Errors that occurred in this run',
                    items: {
                      type: 'object',
                      properties: {
                        error_phase: { type: 'string' },
                        error_category: { type: 'string' },
                        error_severity: { type: 'string' },
                        error_message: { type: 'string' }
                      }
                    }
                  }
                }
              },
              metadata: {
                type: 'object',
                properties: {
                  responseTimeMs: { type: 'number' },
                  pipelineId: { type: 'string' },
                  jobId: { type: 'string' },
                  accountId: { type: 'string' }
                }
              }
            }
          }
        }
      }
    },
    400: { $ref: '#/components/schemas/Error' },
    404: { $ref: '#/components/schemas/Error' },
    500: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  const startTime = Date.now()
  const query = getQuery(event)

  // Validate required parameters
  const pipelineId = query.pipeline_id as string
  const jobId = query.job_id as string
  const accountId = query.account_id as string

  if (!pipelineId || !jobId || !accountId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'pipeline_id, job_id, and account_id parameters are required'
    })
  }

  const environment = (query.environment as 'commercial' | 'govcloud') || 'commercial'

  logger.info(`[Pipelines API] Fetching details for pipeline ${pipelineId}, job ${jobId}, account ${accountId}`)

  try {
    const details = await getPipelineRunDetails(pipelineId, jobId, accountId, environment)

    if (!details.run) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Pipeline run not found'
      })
    }

    const metadata = {
      responseTimeMs: Date.now() - startTime,
      pipelineId,
      jobId,
      accountId,
      environment
    }

    logger.info(`[Pipelines API] Successfully fetched details for pipeline ${pipelineId} in ${metadata.responseTimeMs}ms`)

    return sendSuccess(event, details, metadata)

  } catch (error: any) {
    // Check if this is a 404 error we threw
    if (error.statusCode === 404) {
      throw error
    }

    logger.error(`[Pipelines API] Failed to fetch details for pipeline ${pipelineId}:`, error)
    return errors.serverError(event, `Failed to fetch pipeline details: ${error.message || 'Unknown error'}`)
  }
}))
