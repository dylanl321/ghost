/**
 * GET /api/support/ip-lookup
 * Find which AWS account and resource owns an IP address
 */

import { defineEventHandler, getQuery } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { queryResources, getAggregatorName } from '../../utils/config-service'
import { lookupAccountUnified } from '../../utils/accounts-consolidated'
import { logger } from '../../utils/logger'
import { registerEndpoint } from '../../plugins/swagger'
import type { AWSEnvironmentType } from '../../types'

export interface IPLookupResult {
  found: boolean
  ip: string
  environment: AWSEnvironmentType
  resource?: {
    resourceId: string
    resourceType: string
    resourceName?: string
    accountId: string
    region: string
    configuration?: {
      privateIpAddress?: string
      publicIpAddress?: string
      vpcId?: string
      subnetId?: string
      instanceType?: string
      state?: string
      tags?: Record<string, string>
    }
  }
  account?: {
    accountId: string
    name?: string
    email?: string
    environment?: string
    govCloudAccountId?: string
  }
}

registerEndpoint('/api/support/ip-lookup', 'GET', {
  summary: 'Look up AWS resource by IP address',
  description: 'Find which AWS account and resource (EC2 instance, ENI, etc.) owns a specific IP address',
  tags: ['Support Tools'],
  parameters: [
    {
      name: 'ip',
      in: 'query',
      required: true,
      schema: { type: 'string' },
      description: 'IP address to look up (private or public)'
    },
    {
      name: 'environment',
      in: 'query',
      required: false,
      schema: { type: 'string', enum: ['commercial', 'govcloud'] },
      description: 'AWS environment to search (defaults to govcloud)'
    }
  ],
  responses: {
    200: {
      description: 'IP lookup result',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  found: { type: 'boolean' },
                  ip: { type: 'string' },
                  environment: { type: 'string' },
                  resource: { type: 'object' },
                  account: { type: 'object' }
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

// Validate IP address format
function isValidIP(ip: string): boolean {
  // IPv4 pattern
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/
  // IPv6 pattern (simplified)
  const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/

  return ipv4Regex.test(ip) || ipv6Regex.test(ip)
}

export default defineEventHandler(handleAsync(async (event) => {
  const query = getQuery(event)
  const ip = (query.ip as string)?.trim()
  const environment = (query.environment as AWSEnvironmentType) || 'govcloud'

  // Validate IP
  if (!ip) {
    return errors.badRequest(event, 'IP address is required')
  }

  if (!isValidIP(ip)) {
    return errors.badRequest(event, `Invalid IP address format: ${ip}`)
  }

  // Validate environment
  if (environment !== 'commercial' && environment !== 'govcloud') {
    return errors.badRequest(event, 'Environment must be "commercial" or "govcloud"')
  }

  logger.info(`[IP Lookup] Searching for IP ${ip} in ${environment}`)

  // Get aggregator name for environment
  const aggregatorName = getAggregatorName(environment)

  // Build SQL query to search for IP in EC2 instances
  // Config SQL supports querying JSON fields directly
  const ec2Query = `
    SELECT
      resourceId,
      resourceType,
      accountId,
      awsRegion,
      configuration,
      tags
    WHERE
      resourceType = 'AWS::EC2::Instance'
      AND (
        configuration.privateIpAddress = '${ip}'
        OR configuration.publicIpAddress = '${ip}'
      )
  `.trim()

  // Also search Network Interfaces (ENIs) which can have multiple IPs
  const eniQuery = `
    SELECT
      resourceId,
      resourceType,
      accountId,
      awsRegion,
      configuration,
      tags
    WHERE
      resourceType = 'AWS::EC2::NetworkInterface'
      AND configuration.privateIpAddress = '${ip}'
  `.trim()

  try {
    // Search EC2 instances first
    logger.info(`[IP Lookup] Querying EC2 instances in ${aggregatorName}`)
    const ec2Results = await queryResources(aggregatorName, ec2Query, environment)

    if (ec2Results.results.length > 0) {
      const rawResult = JSON.parse(ec2Results.results[0])
      const config = typeof rawResult.configuration === 'string'
        ? JSON.parse(rawResult.configuration)
        : rawResult.configuration
      const tags = typeof rawResult.tags === 'string'
        ? JSON.parse(rawResult.tags)
        : rawResult.tags

      // Convert tags array to object if needed
      const tagsObj: Record<string, string> = {}
      if (Array.isArray(tags)) {
        tags.forEach((tag: any) => {
          if (tag.key && tag.value !== undefined) {
            tagsObj[tag.key] = tag.value
          }
        })
      } else if (tags && typeof tags === 'object') {
        Object.assign(tagsObj, tags)
      }

      // Look up account details
      const accountInfo = await lookupAccountUnified({
        accountId: rawResult.accountId
      })

      const result: IPLookupResult = {
        found: true,
        ip,
        environment,
        resource: {
          resourceId: rawResult.resourceId,
          resourceType: rawResult.resourceType,
          resourceName: tagsObj.Name || rawResult.resourceId,
          accountId: rawResult.accountId,
          region: rawResult.awsRegion,
          configuration: {
            privateIpAddress: config.privateIpAddress,
            publicIpAddress: config.publicIpAddress,
            vpcId: config.vpcId,
            subnetId: config.subnetId,
            instanceType: config.instanceType,
            state: config.state?.name || config.state,
            tags: tagsObj
          }
        },
        account: accountInfo ? {
          accountId: accountInfo.accountId || rawResult.accountId,
          name: accountInfo.name || accountInfo.projectName,
          email: accountInfo.email || accountInfo.awsAccountEmail,
          environment: accountInfo.environment,
          govCloudAccountId: accountInfo.govCloudAccountId || accountInfo.awsGovCloudAccountID
        } : undefined
      }

      logger.info(`[IP Lookup] Found EC2 instance ${result.resource?.resourceId} for IP ${ip}`)
      return sendSuccess(event, result)
    }

    // If not found in EC2, search ENIs
    logger.info(`[IP Lookup] Querying ENIs in ${aggregatorName}`)
    const eniResults = await queryResources(aggregatorName, eniQuery, environment)

    if (eniResults.results.length > 0) {
      const rawResult = JSON.parse(eniResults.results[0])
      const config = typeof rawResult.configuration === 'string'
        ? JSON.parse(rawResult.configuration)
        : rawResult.configuration
      const tags = typeof rawResult.tags === 'string'
        ? JSON.parse(rawResult.tags)
        : rawResult.tags

      const tagsObj: Record<string, string> = {}
      if (Array.isArray(tags)) {
        tags.forEach((tag: any) => {
          if (tag.key && tag.value !== undefined) {
            tagsObj[tag.key] = tag.value
          }
        })
      } else if (tags && typeof tags === 'object') {
        Object.assign(tagsObj, tags)
      }

      const accountInfo = await lookupAccountUnified({
        accountId: rawResult.accountId
      })

      const result: IPLookupResult = {
        found: true,
        ip,
        environment,
        resource: {
          resourceId: rawResult.resourceId,
          resourceType: rawResult.resourceType,
          resourceName: tagsObj.Name || rawResult.resourceId,
          accountId: rawResult.accountId,
          region: rawResult.awsRegion,
          configuration: {
            privateIpAddress: config.privateIpAddress,
            publicIpAddress: config.association?.publicIp,
            vpcId: config.vpcId,
            subnetId: config.subnetId,
            tags: tagsObj
          }
        },
        account: accountInfo ? {
          accountId: accountInfo.accountId || rawResult.accountId,
          name: accountInfo.name || accountInfo.projectName,
          email: accountInfo.email || accountInfo.awsAccountEmail,
          environment: accountInfo.environment,
          govCloudAccountId: accountInfo.govCloudAccountId || accountInfo.awsGovCloudAccountID
        } : undefined
      }

      logger.info(`[IP Lookup] Found ENI ${result.resource?.resourceId} for IP ${ip}`)
      return sendSuccess(event, result)
    }

    // Not found
    logger.info(`[IP Lookup] No resource found for IP ${ip} in ${environment}`)
    const result: IPLookupResult = {
      found: false,
      ip,
      environment
    }

    return sendSuccess(event, result)

  } catch (error: any) {
    logger.error(`[IP Lookup] Error searching for IP ${ip}:`, error)

    // Handle Config query syntax errors gracefully
    if (error.name === 'InvalidExpressionException') {
      return errors.serverError(event, 'Invalid Config query syntax', { originalError: error.message })
    }

    return errors.awsError(event, error)
  }
}))
