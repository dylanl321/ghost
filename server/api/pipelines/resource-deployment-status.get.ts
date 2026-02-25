import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { logger } from '../../utils/logger'
import { getResourceDeploymentStatus } from '../../utils/athena-pipeline-queries'

// Register OpenAPI documentation
registerEndpoint('/api/pipelines/resource-deployment-status', 'GET', {
  summary: 'Get deployment status for a resource type',
  description: 'Returns the deployment status of a specific resource type across all accounts, including latest action, apply status, and attempt counts.',
  tags: ['Pipelines'],
  parameters: [
    {
      name: 'resource_type',
      in: 'query',
      required: true,
      schema: { type: 'string' },
      description: 'Terraform resource type to query (e.g. aws_instance, aws_s3_bucket)'
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
      description: 'Resource deployment status across accounts',
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
                    latest_action: { type: 'string' },
                    latest_applied: { type: 'boolean' },
                    latest_apply_success: { type: 'boolean' },
                    total_attempts: { type: 'number' },
                    last_seen: { type: 'string' }
                  }
                }
              },
              metadata: {
                type: 'object',
                properties: {
                  responseTimeMs: { type: 'number' },
                  resourceType: { type: 'string' },
                  days: { type: 'number' },
                  count: { type: 'number' }
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
  const resourceType = query.resource_type as string
  if (!resourceType) {
    throw createError({
      statusCode: 400,
      statusMessage: 'resource_type parameter is required'
    })
  }

  // Parse optional parameters
  const daysParam = query.days ? parseInt(query.days as string, 10) : 30
  const days = Math.min(Math.max(daysParam, 1), 90) // Clamp between 1 and 90
  // Pipeline data is ALWAYS stored in GovCloud
  const environment = 'govcloud' as const

  logger.info(`[Pipelines API] Fetching deployment status for resource type "${resourceType}" (${days} days)`)

  try {
    const results = await getResourceDeploymentStatus(resourceType, days, environment)

    const metadata = {
      responseTimeMs: Date.now() - startTime,
      resourceType,
      days,
      environment,
      count: results.length
    }

    logger.info(`[Pipelines API] Successfully fetched deployment status for "${resourceType}" across ${results.length} accounts in ${metadata.responseTimeMs}ms`)

    return sendSuccess(event, results, metadata)

  } catch (error: any) {
    logger.error(`[Pipelines API] Failed to fetch deployment status for "${resourceType}":`, error)
    return errors.serverError(event, `Failed to fetch resource deployment status: ${error.message || 'Unknown error'}`)
  }
}))
