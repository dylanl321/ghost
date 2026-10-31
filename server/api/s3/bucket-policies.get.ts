/**
 * GET /api/s3/bucket-policies
 *
 * Analyze S3 bucket policies for security risks and cross-account access
 */

import { defineEventHandler, getQuery } from 'h3'
import { S3Client, GetBucketPolicyCommand } from '@aws-sdk/client-s3'
import { sendSuccess, errors, handleAsync, validateEnvironment } from '../../utils/api-response'
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
                      lowRisks: { type: 'integer' },
                      bucketsNotRead: { type: 'integer', description: 'Buckets whose policy could not be read (see each analysis.error)' }
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
 * Fetch a bucket policy. A missing policy is null; any other failure
 * (access denied, wrong region, no such bucket) is returned as an error so
 * the bucket is not reported as having no risky policy.
 */
async function fetchBucketPolicy(
  s3Client: S3Client,
  bucketName: string
): Promise<{ policy: BucketPolicy | null; error?: string }> {
  try {
    const response = await s3Client.send(new GetBucketPolicyCommand({ Bucket: bucketName }))
    return { policy: response.Policy ? JSON.parse(response.Policy) : null }
  } catch (error: any) {
    if (error.name === 'NoSuchBucketPolicy') {
      return { policy: null }
    }
    logger.warn(`[S3 Policy] Failed to fetch policy for ${bucketName}:`, error.message)
    const hint = error.name === 'PermanentRedirect' || error.$metadata?.httpStatusCode === 301
      ? ' (bucket is in another region; pass its region)'
      : ''
    return { policy: null, error: `${error.name || 'Error'}: ${error.message}${hint}` }
  }
}

// S3 bucket naming rules (3-63 chars, lowercase letters, digits, dots, hyphens)
const BUCKET_NAME_PATTERN = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/

export default defineEventHandler(handleAsync(async (event) => {
  const query = getQuery(event)

  const environment = (query.environment as AWSEnvironmentType) || 'govcloud'
  const accountId = query.accountId as string
  const bucketNamesParam = query.bucketNames as string
  const region = (query.region as string) || (environment === 'govcloud' ? 'us-gov-west-1' : 'us-east-1')

  if (!validateEnvironment(environment)) {
    return errors.validationError(event, ['environment must be commercial or govcloud'])
  }
  if (!accountId || !/^\d{12}$/.test(accountId)) {
    return errors.validationError(event, ['accountId must be a 12-digit AWS account ID'])
  }
  if (!/^[a-z]{2}(-gov)?-[a-z]+-\d$/.test(region)) {
    return errors.validationError(event, ['region is not a valid AWS region'])
  }

  if (!bucketNamesParam) {
    return errors.validationError(event, ['bucketNames is required'])
  }

  const bucketNames = [...new Set(bucketNamesParam.split(',').map(name => name.trim()).filter(Boolean))]

  if (bucketNames.length === 0) {
    return errors.validationError(event, ['At least one bucket name is required'])
  }

  if (bucketNames.length > 100) {
    return errors.validationError(event, ['Maximum 100 buckets per request'])
  }

  const invalidNames = bucketNames.filter(name => !BUCKET_NAME_PATTERN.test(name))
  if (invalidNames.length > 0) {
    return errors.validationError(event, [`Invalid bucket names: ${invalidNames.join(', ')}`])
  }

  logger.info(`[S3 Policy] Analyzing ${bucketNames.length} buckets in account ${accountId}`)

  const s3Client = await getClient<S3Client>(environment, 's3', region, accountId)

  const analyses: BucketPolicyAnalysis[] = await Promise.all(bucketNames.map(async (bucketName) => {
    const { policy, error } = await fetchBucketPolicy(s3Client, bucketName)
    const analysis = analyzeBucketPolicy(bucketName, policy, accountId)
    return error ? { ...analysis, error } : analysis
  }))

  const summary = {
    ...generatePolicySummary(analyses.filter(a => !a.error)),
    totalBuckets: analyses.length,
    bucketsNotRead: analyses.filter(a => a.error).length
  }

  logger.info(`[S3 Policy] Analysis complete: ${summary.publicBuckets} public, ${summary.crossAccountBuckets} cross-account, ${summary.bucketsNotRead} not read`)

  return sendSuccess(event, {
    analyses,
    summary
  }, { message: 'Bucket policies analyzed successfully' })
}))
