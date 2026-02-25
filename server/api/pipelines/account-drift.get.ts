import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { logger } from '../../utils/logger'
import { getPlannedVsAppliedSummary, getUnappliedResources } from '../../utils/athena-pipeline-queries'

// Register OpenAPI documentation
registerEndpoint('/api/pipelines/account-drift', 'GET', {
  summary: 'Get drift analysis for an account',
  description: 'Returns planned-vs-applied summary and unapplied resources for an account, indicating potential configuration drift.',
  tags: ['Pipelines'],
  parameters: [
    {
      name: 'account_id',
      in: 'query',
      required: true,
      schema: { type: 'string' },
      description: 'AWS Account ID (12-digit number)'
    },
    {
      name: 'days',
      in: 'query',
      required: false,
      schema: { type: 'number', default: 30 },
      description: 'Number of days to look back (default: 30, max: 90)'
    }
  ],
  responses: {
    200: {
      description: 'Account drift analysis data',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  summary: {
                    type: 'object',
                    description: 'Planned vs applied summary counts by resource type',
                    properties: {
                      totalPlanned: { type: 'number' },
                      totalApplied: { type: 'number' },
                      totalFailed: { type: 'number' },
                      totalPending: { type: 'number' },
                      byResourceType: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            resource_type: { type: 'string' },
                            planned: { type: 'number' },
                            applied: { type: 'number' },
                            failed: { type: 'number' },
                            pending: { type: 'number' }
                          }
                        }
                      }
                    }
                  },
                  unappliedResources: {
                    type: 'array',
                    description: 'Resources that were planned but not applied',
                    items: {
                      type: 'object',
                      properties: {
                        resource_address: { type: 'string' },
                        resource_type: { type: 'string' },
                        module_name: { type: 'string' },
                        change_action: { type: 'string' },
                        plan_pipeline_id: { type: 'string' },
                        latest_timestamp: { type: 'string' },
                        occurrence_count: { type: 'number' }
                      }
                    }
                  }
                }
              },
              metadata: {
                type: 'object',
                properties: {
                  responseTimeMs: { type: 'number' },
                  accountId: { type: 'string' },
                  days: { type: 'number' }
                }
              }
            }
          }
        }
      }
    },
    400: { $ref: '#/components/schemas/Error' },
    500: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  const startTime = Date.now()
  const query = getQuery(event)

  // Validate required parameters
  const accountId = query.account_id as string
  if (!accountId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'account_id parameter is required'
    })
  }

  // Parse optional parameters
  const daysParam = query.days ? parseInt(query.days as string, 10) : 30
  const days = Math.min(Math.max(daysParam, 1), 90) // Clamp between 1 and 90
  // Pipeline data is ALWAYS stored in GovCloud
  const environment = 'govcloud' as const

  logger.info(`[Pipelines API] Fetching drift analysis for account ${accountId} (${days} days)`)

  try {
    // Fetch summary and unapplied resources in parallel
    const [summary, unappliedResources] = await Promise.all([
      getPlannedVsAppliedSummary(accountId, days, environment),
      getUnappliedResources(accountId, days, environment)
    ])

    const metadata = {
      responseTimeMs: Date.now() - startTime,
      accountId,
      days,
      environment
    }

    logger.info(`[Pipelines API] Successfully fetched drift analysis for account ${accountId} in ${metadata.responseTimeMs}ms`)

    return sendSuccess(event, { summary, unappliedResources }, metadata)

  } catch (error: any) {
    logger.error(`[Pipelines API] Failed to fetch drift analysis for account ${accountId}:`, error)
    return errors.serverError(event, `Failed to fetch account drift data: ${error.message || 'Unknown error'}`)
  }
}))
