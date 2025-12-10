/**
 * GET /api/s3/bucket-policies
 *
 * Analyze S3 bucket policies for security risks and cross-account access
 */

import { defineEventHandler, getQuery } from 'h3'
import { S3Client, GetBucketPolicyCommand } from '@aws-sdk/client-s3'
import { sendSuccess, sendApiError, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { getClient } from '../../lib/aws-client-factory'
import {
  analyzeBucketPolicy,
  generatePolicySummary,
  type BucketPolicy,
  type BucketPolicyAnalysis
} from '../../utils/s3-policy-analyzer'
import type { AWSEnvironmentType } from '../../types'
import { logger } from '../../utils/logger'

// Register OpenAPI documentation
registerEndpoint('/api/s3/bucket-policies', 'GET', {
  summary: 'Analyze S3 bucket policies',
  description: 'Fetch and analyze S3 bucket policies to identify security risks, public access, and cross-account permissions',
  tags: ['S3'],
  parameters: [
    { $ref: '#/components/parameters/Environment' },
    {
      name: 'accountId',
      in: 'query',
      required: true,
      schema: { type: 'string' },
      description: 'AWS Account ID that owns the buckets'
    },
    {
      name: 'bucketNames',
      in: 'query',
      required: true,
      schema: { type: 'string' },
      description: 'Comma-separated list of S3 bucket names'
    },
    {
      name: 'region',
      in: 'query',
      required: false,
      schema: { type: 'string', default: 'us-gov-west-1' },
      description: 'AWS region (buckets are global but policies are retrieved from a region)'
    }
  ],
  responses: {
    200: {
      description: 'Successfully analyzed bucket policies',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  analyses: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        bucketName: { type: 'string' },
                        hasPolicy: { type: 'boolean' },
                        isPublic: { type: 'boolean' },
                        allowsCrossAccount: { type: 'boolean' },
                        crossAccountPrincipals: {
                          type: 'array',
                          items: { type: 'string' }
                        },
                        publicAccess: {
                          type: 'object',
                          properties: {
                            allowsPublicRead: { type: 'boolean' },
                            allowsPublicWrite: { type: 'boolean' },
                            allowsPublicList: { type: 'boolean' }
                          }
                        },
                        risks: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
                              finding: { type: 'string' }
                            }
                          }
                        }
                      }
                    }
                  },
                  summary: {
                    type: 'object',
                    properties: {
                      totalBuckets: { type: 'integer' },
                      bucketsWithPolicies: { type: 'integer' },
                      publicBuckets: { type: 'integer' },
                      crossAccountBuckets: { type: 'integer' },
                      criticalRisks: { type: 'integer' },
                      highRisks: { type: 'integer' },
                      mediumRisks: { type: 'integer' },
                      lowRisks: { type: 'integer' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
})

/**
 * Fetch bucket policy from S3
 */
async function fetchBucketPolicy(
  s3Client: S3Client,
  bucketName: string
): Promise<BucketPolicy | null> {
  try {
    const command = new GetBucketPolicyCommand({ Bucket: bucketName })
    const response = await s3Client.send(command)

    if (response.Policy) {
      return JSON.parse(response.Policy)
    }

    return null
  } catch (error: any) {
    // No policy or access denied
    if (error.name === 'NoSuchBucketPolicy') {
      return null
    }
    logger.warn(`[S3 Policy] Failed to fetch policy for ${bucketName}:`, error.message)
    return null
  }
}

export default defineEventHandler(handleAsync(async (event) => {
  const query = getQuery(event)

  const environment = (query.environment as AWSEnvironmentType) || 'govcloud'
  const accountId = query.accountId as string
  const bucketNamesParam = query.bucketNames as string
  const region = (query.region as string) || (environment === 'govcloud' ? 'us-gov-west-1' : 'us-east-1')

  // Validation
  if (!accountId) {
    return errors.validationError(event, ['accountId is required'])
  }

  if (!bucketNamesParam) {
    return errors.validationError(event, ['bucketNames is required'])
  }

  const bucketNames = bucketNamesParam.split(',').map(name => name.trim()).filter(Boolean)

  if (bucketNames.length === 0) {
    return errors.validationError(event, ['At least one bucket name is required'])
  }

  if (bucketNames.length > 100) {
    return errors.validationError(event, ['Maximum 100 buckets per request'])
  }

  logger.info(`[S3 Policy] Analyzing ${bucketNames.length} buckets in account ${accountId}`)

  // Create S3 client
  const s3Client = await getClient<S3Client>(environment, 's3', region, accountId)

  // Fetch policies for all buckets
  const policyPromises = bucketNames.map(async (bucketName) => {
    const policy = await fetchBucketPolicy(s3Client, bucketName)
    return { name: bucketName, policy, accountId }
  })

  const buckets = await Promise.all(policyPromises)

  // Analyze policies
  const analyses: BucketPolicyAnalysis[] = []
  for (const bucket of buckets) {
    const analysis = analyzeBucketPolicy(bucket.name, bucket.policy, bucket.accountId)
    analyses.push(analysis)
  }

  // Generate summary
  const summary = generatePolicySummary(analyses)

  logger.info(`[S3 Policy] Analysis complete: ${summary.publicBuckets} public, ${summary.crossAccountBuckets} cross-account`)

  return sendSuccess(event, {
    analyses,
    summary
  }, { message: 'Bucket policies analyzed successfully' })
}))
