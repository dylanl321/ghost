import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { organizationCache, CacheTags } from '../../utils/cache-manager'
import getMasterAccountCredentials from '~~/server/utils/credentials/awsAccountCredentials';
import { ConfigServiceClient, SelectAggregateResourceConfigCommand } from "@aws-sdk/client-config-service"
import { logger } from '../../utils/logger'
import { getAggregatorName, isAggregatorAvailable } from '../../utils/config-service'
import type { AWSEnvironmentType } from '../../types'

// Environment configuration helper
function getEnvironmentConfig(environment: AWSEnvironmentType) {
  return {
    region: environment === 'govcloud'
      ? (process.env.AWS_GOVCLOUD_REGION || 'us-gov-west-1')
      : (process.env.AWS_COMMERCIAL_REGION || 'us-east-1'),
    aggregatorName: getAggregatorName(environment)
  }
}

// Register OpenAPI documentation
registerEndpoint('/api/config/summary-simplified', 'GET', {
  summary: 'Get simplified resource summary',
  description:
    'Get resource counts for the whole organization, or for a single account. Leave account_id blank for organization resource counts.',
  tags: ['Resources'],
  parameters: [
    {
      name: 'environment',
      in: 'query',
      required: false,
      schema: { type: 'string', enum: ['commercial', 'govcloud'], default: 'commercial' },
      description: 'AWS environment (commercial or govcloud)',
    },
    {
      name: 'account_id',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'AWS Account ID (optional - omit for organization-wide counts)',
    },
  ],
  responses: {
    200: {
      description: 'Simplified resource summary',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  ec2: {
                    type: 'object',
                    properties: {
                      total: { type: 'number' },
                      stopped: { type: 'number' },
                      windows: { type: 'number' },
                    },
                  },
                  volumes: {
                    type: 'object',
                    properties: {
                      total: { type: 'number' },
                      gp2: { type: 'number' },
                      gp3: { type: 'number' },
                      io1: { type: 'number' },
                    },
                  },
                  ecsContainers: {
                    type: 'object',
                    properties: {
                      total: { type: 'number' },
                    },
                  },
                  eksClusters: {
                    type: 'object',
                    properties: {
                      total: { type: 'number' },
                    },
                  },
                  buckets: {
                    type: 'object',
                    properties: {
                      total: { type: 'number' },
                      versioned: { type: 'number' },
                    },
                  },
                  lambda: {
                    type: 'object',
                    properties: {
                      total: { type: 'number' },
                    },
                  },
                  rds: {
                    type: 'object',
                    properties: {
                      total: { type: 'number' },
                    },
                  },
                  metadata: {
                    type: 'object',
                    properties: {
                      accountId: { type: 'string' },
                      timestamp: { type: 'string', format: 'date-time' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    404: { $ref: '#/components/schemas/Error' },
    500: { $ref: '#/components/schemas/Error' },
  },
})

async function getResourceCounts(accountId: string, environment: AWSEnvironmentType) {
  const envConfig = getEnvironmentConfig(environment)
  const creds = getMasterAccountCredentials(environment)
  const configClient = new ConfigServiceClient({ credentials: creds, region: envConfig.region })

  const queryGroups: Record<
    string,
    Record<string, string>
  > = {
    "AWS::EC2::Instance": {
      total: "SELECT COUNT(*) WHERE resourceType = 'AWS::EC2::Instance'",
      stopped:
        "SELECT COUNT(*) WHERE resourceType = 'AWS::EC2::Instance' AND configuration.state.name = 'stopped'",
      windows:
        "SELECT COUNT(*) WHERE resourceType = 'AWS::EC2::Instance' AND configuration.platform = 'windows'",
    },
    "AWS::EC2::Volume": {
      total: "SELECT COUNT(*) WHERE resourceType = 'AWS::EC2::Volume'",
      gp3: "SELECT COUNT(*) WHERE resourceType = 'AWS::EC2::Volume' AND configuration.volumeType = 'gp3'",
      gp2: "SELECT COUNT(*) WHERE resourceType = 'AWS::EC2::Volume' AND configuration.volumeType = 'gp2'",
      io1: "SELECT COUNT(*) WHERE resourceType = 'AWS::EC2::Volume' AND configuration.volumeType = 'io1'",
    },
    "AWS::ECS::Cluster": {
      total: "SELECT COUNT(*) WHERE resourceType = 'AWS::ECS::Cluster'",
    },
    "AWS::EKS::Cluster": {
      total: "SELECT COUNT(*) WHERE resourceType = 'AWS::EKS::Cluster'",
    },
    "AWS::S3::Bucket": {
      total: "SELECT COUNT(*) WHERE resourceType = 'AWS::S3::Bucket'",
      versioned:
        "SELECT COUNT(*) WHERE resourceType = 'AWS::S3::Bucket' AND configuration.versioningConfiguration.status = 'Enabled'",
    },
    "AWS::Lambda::Function": {
      total: "SELECT COUNT(*) WHERE resourceType = 'AWS::Lambda::Function'",
    },
    "AWS::RDS::DBInstance": {
      total: "SELECT COUNT(*) WHERE resourceType = 'AWS::RDS::DBInstance'",
    },
  }

  const resourceCounts: Record<string, Record<string, number>> = {}

  for (const [resourceType, queries] of Object.entries(queryGroups)) {
    resourceCounts[resourceType] = {}
    for (const [queryName, baseQuery] of Object.entries(queries)) {
      // Throttle requests
      const waitTime = 0.2
      await new Promise(resolve => setTimeout(resolve, waitTime));

      let query = baseQuery
      if (accountId) {
        query += ` AND accountId = '${accountId}'`
      }

      try {
        const command = new SelectAggregateResourceConfigCommand({
          ConfigurationAggregatorName: envConfig.aggregatorName,
          Expression: query,
        })
        const response = await configClient.send(command)

        if (response.Results && response.Results.length > 0) {
          const parsed = JSON.parse(response.Results[0])
          let value = 0
          if (queryName.includes("size")) {
            value =
              parsed.SUM ||
              parsed[
                "SUM(CAST(JSON_EXTRACT(configuration, '$.size') AS INTEGER))"
              ] ||
              0
          } else {
            value = parsed.COUNT || parsed["COUNT(*)"] || 0
          }
          resourceCounts[resourceType][queryName] = value
        } else {
          resourceCounts[resourceType][queryName] = 0
        }
      } catch (err) {
        logger.error(
          `[ResourceCounts] Failed query for ${resourceType}.${queryName}:`,
          err
        )
        resourceCounts[resourceType][queryName] = 0
      }
    }
  }

  // Transform result to structured output
  return {
    ec2: {
      total: resourceCounts["AWS::EC2::Instance"]?.total || 0,
      stopped: resourceCounts["AWS::EC2::Instance"]?.stopped || 0,
      windows: resourceCounts["AWS::EC2::Instance"]?.windows || 0,
    },
    volumes: {
      total: resourceCounts["AWS::EC2::Volume"]?.total || 0,
      gp2: resourceCounts["AWS::EC2::Volume"]?.gp2 || 0,
      gp3: resourceCounts["AWS::EC2::Volume"]?.gp3 || 0,
      io1: resourceCounts["AWS::EC2::Volume"]?.io1 || 0,
    },
    ecsContainers: {
      total: resourceCounts["AWS::ECS::Cluster"]?.total || 0,
    },
    eksClusters: {
      total: resourceCounts["AWS::EKS::Cluster"]?.total || 0,
    },
    buckets: {
      total: resourceCounts["AWS::S3::Bucket"]?.total || 0,
      versioned: resourceCounts["AWS::S3::Bucket"]?.versioned || 0,
    },
    lambda: {
      total: resourceCounts["AWS::Lambda::Function"]?.total || 0,
    },
    rds: {
      total: resourceCounts["AWS::RDS::DBInstance"]?.total || 0,
    },
    metadata: {
      accountId: accountId || "all",
      timestamp: new Date().toISOString(),
    },
  }
}

export default defineEventHandler(handleAsync(async (event) => {
  const startTime = Date.now()

  const query = getQuery(event)

  // Support both old and new parameter names for backward compatibility
  const accountId = (query.account_id as string) || (query.govcloud_account_id as string) || ""
  const environment = (query.environment as AWSEnvironmentType) || 'commercial'

  // Validate environment parameter
  if (environment !== 'commercial' && environment !== 'govcloud') {
    return errors.badRequest(event, 'Invalid environment. Must be "commercial" or "govcloud"')
  }

  // Check if aggregator is available before querying
  if (!await isAggregatorAvailable(environment)) {
    const aggregatorName = getAggregatorName(environment)
    logger.warn(`[ResourceCounts] Aggregator '${aggregatorName}' not available in ${environment} - skipping`)
    return sendSuccess(event, {
      ec2: { total: 0, stopped: 0, windows: 0 },
      volumes: { total: 0, gp2: 0, gp3: 0, io1: 0 },
      ecsContainers: { total: 0 },
      eksClusters: { total: 0 },
      buckets: { total: 0, versioned: 0 },
      lambda: { total: 0 },
      rds: { total: 0 },
      metadata: { accountId: accountId || 'all', timestamp: new Date().toISOString() },
      warning: `Config aggregator not available in ${environment} environment`
    })
  }

  // Generate cache key with environment
  const cacheKey = `config:summary-simplified:${environment}:${accountId || "all"}`

  const info = await organizationCache.getOrSet(
    cacheKey,
    async () => {
      logger.info(`Cache miss: Fetching ${environment} organization overview...`)
      return await getResourceCounts(accountId, environment)
    },
    {
      ttl: 3600, // 1 hour
      tags: [CacheTags.SERVICES]
    }
  )
  
  if (!info) {
    return errors.serverError(event, 'Unable to fetch simplified organization overview')
  }
  
  const metadata = { responseTimeMs: Date.now() - startTime }
  
  return sendSuccess(event, info, metadata)
}))