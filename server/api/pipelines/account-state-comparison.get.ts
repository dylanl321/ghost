import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { logger } from '../../utils/logger'
import { getResourceChangesForAccount, clampIntParam, assertPipelineAccountId } from '../../utils/athena-pipeline-queries'
import { fetchStateFile, parseStateResources, compareStateToPlanned } from '../../utils/terraform-state-parser'

// Register OpenAPI documentation
registerEndpoint('/api/pipelines/account-state-comparison', 'GET', {
  summary: 'Compare Terraform state to planned changes',
  description: 'Fetches the Terraform state file from S3 and compares it against planned resource changes from pipeline telemetry. Identifies resources in state only, in plan only, or in both.',
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
      name: 'repo_name',
      in: 'query',
      required: true,
      schema: { type: 'string' },
      description: 'Repository name (used as the S3 key prefix for the state file)'
    },
    {
      name: 'days',
      in: 'query',
      required: false,
      schema: { type: 'number', default: 30 },
      description: 'Number of days to look back for planned changes (default: 30, max: 90)'
    }
  ],
  responses: {
    200: {
      description: 'State-to-plan comparison results',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                nullable: true,
                description: 'Comparison results, or null if the state file was not found',
                properties: {
                  inStateOnly: {
                    type: 'array',
                    description: 'Resources present in the state file but not in any recent plan',
                    items: {
                      type: 'object',
                      properties: {
                        type: { type: 'string' },
                        name: { type: 'string' },
                        module: { type: 'string' },
                        address: { type: 'string' },
                        provider: { type: 'string' },
                        instances_count: { type: 'number' }
                      }
                    }
                  },
                  inPlanOnly: {
                    type: 'array',
                    description: 'Resources in the plan that do not appear in the current state',
                    items: {
                      type: 'object',
                      properties: {
                        resource_address: { type: 'string' },
                        resource_type: { type: 'string' },
                        change_action: { type: 'string' },
                        timestamp: { type: 'string' }
                      }
                    }
                  },
                  matched: {
                    type: 'array',
                    description: 'Resources present in both state and plan',
                    items: {
                      type: 'object',
                      properties: {
                        address: { type: 'string' },
                        type: { type: 'string' },
                        inState: { type: 'boolean' },
                        inPlan: { type: 'boolean' }
                      }
                    }
                  },
                  stateResourceCount: { type: 'number' },
                  planResourceCount: { type: 'number' }
                }
              },
              metadata: {
                type: 'object',
                properties: {
                  responseTimeMs: { type: 'number' },
                  accountId: { type: 'string' },
                  repoName: { type: 'string' },
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
  const repoName = query.repo_name as string
  if (!accountId || !repoName) {
    throw createError({
      statusCode: 400,
      statusMessage: 'account_id and repo_name parameters are required'
    })
  }
  assertPipelineAccountId(accountId)
  // repo_name becomes the prefix of an S3 key; allow GitLab-style path
  // segments but no empty, '.' or '..' segments
  if (!/^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/.test(repoName) || repoName.split('/').some(seg => seg === '.' || seg === '..')) {
    throw createError({
      statusCode: 400,
      statusMessage: 'repo_name may only contain letters, digits, dot, dash, underscore and slash-separated path segments'
    })
  }

  // Parse optional parameters
  const days = clampIntParam(query.days, 30, 1, 90)
  // Pipeline data is ALWAYS stored in GovCloud
  const environment = 'govcloud' as const

  logger.info(`[Pipelines API] Fetching state comparison for account ${accountId}, repo "${repoName}" (${days} days)`)

  try {
    // Fetch the state file and resource changes in parallel
    const [stateFile, resourceChanges] = await Promise.all([
      fetchStateFile(repoName, accountId),
      getResourceChangesForAccount(accountId, days, environment)
    ])

    // If the state file could not be fetched, return null with an informational message
    if (stateFile === null) {
      const metadata = {
        responseTimeMs: Date.now() - startTime,
        accountId,
        repoName,
        days,
        environment
      }

      logger.info(`[Pipelines API] State file not found for account ${accountId}, repo "${repoName}"`)

      return sendSuccess(event, null, { ...metadata, message: 'State file not found or inaccessible' })
    }

    // Parse state resources and compare against planned changes
    const stateResources = parseStateResources(stateFile)
    const comparison = compareStateToPlanned(stateResources, resourceChanges)

    const metadata = {
      responseTimeMs: Date.now() - startTime,
      accountId,
      repoName,
      days,
      environment
    }

    logger.info(`[Pipelines API] Successfully compared state for account ${accountId}: ${comparison.stateResourceCount} state resources, ${comparison.planResourceCount} plan resources in ${metadata.responseTimeMs}ms`)

    return sendSuccess(event, comparison, metadata)

  } catch (error: any) {
    logger.error(`[Pipelines API] Failed to fetch state comparison for account ${accountId}, repo "${repoName}":`, error)
    return errors.serverError(event, `Failed to fetch state comparison: ${error.message || 'Unknown error'}`)
  }
}))
