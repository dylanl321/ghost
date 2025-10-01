/**
 * GET /api/health
 * Comprehensive health check endpoint with AWS credential validation
 */

import { defineEventHandler, getQuery } from 'h3'
import { sendSuccess, handleAsync } from '../utils/api-response'
import { getAWSConfig } from '../lib/config'
import { registerEndpoint } from '../plugins/swagger'
import { getSTSClient, getDynamoDBClient, getOrganizationsClient } from '../lib/aws-client-factory'
import { GetCallerIdentityCommand } from '@aws-sdk/client-sts'
import { DescribeTableCommand } from '@aws-sdk/client-dynamodb'
import { DescribeOrganizationCommand } from '@aws-sdk/client-organizations'
import os from 'os'
import process from 'process'
import { getAccountsTableName } from '../utils/accounts-consolidated'

// Register OpenAPI documentation
registerEndpoint('/api/health', 'GET', {
  summary: 'Comprehensive health check',
  description: 'Check API health, AWS credentials status, and system resources. Use verbose=true for detailed checks.',
  tags: ['System'],
  parameters: [
    {
      name: 'verbose',
      in: 'query',
      required: false,
      schema: { type: 'boolean', default: false },
      description: 'Include detailed AWS credential checks and system metrics'
    }
  ],
  responses: {
    200: {
      description: 'Health status',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  status: { 
                    type: 'string',
                    enum: ['healthy', 'degraded', 'unhealthy']
                  },
                  timestamp: { type: 'string', format: 'date-time' },
                  uptime: { 
                    type: 'object',
                    properties: {
                      seconds: { type: 'number' },
                      formatted: { type: 'string' }
                    }
                  },
                  system: {
                    type: 'object',
                    properties: {
                      platform: { type: 'string' },
                      nodeVersion: { type: 'string' },
                      memory: {
                        type: 'object',
                        properties: {
                          used: { type: 'string' },
                          total: { type: 'string' },
                          percentage: { type: 'number' }
                        }
                      },
                      cpu: {
                        type: 'object',
                        properties: {
                          cores: { type: 'number' },
                          loadAverage: { type: 'array', items: { type: 'number' } }
                        }
                      }
                    }
                  },
                  environments: {
                    type: 'object',
                    properties: {
                      commercial: { 
                        type: 'object',
                        properties: {
                          configured: { type: 'boolean' },
                          hasSessionToken: { type: 'boolean' },
                          region: { type: 'string' }
                        }
                      },
                      govcloud: { 
                        type: 'object',
                        properties: {
                          configured: { type: 'boolean' },
                          hasSessionToken: { type: 'boolean' },
                          region: { type: 'string' }
                        }
                      }
                    }
                  },
                  aws: {
                    type: 'object',
                    nullable: true,
                    properties: {
                      commercial: {
                        type: 'object',
                        nullable: true,
                        properties: {
                          identity: {
                            type: 'object',
                            properties: {
                              accountId: { type: 'string' },
                              arn: { type: 'string' },
                              userId: { type: 'string' },
                              status: { type: 'string', enum: ['active', 'expired', 'error'] },
                              error: { type: 'string', nullable: true }
                            }
                          },
                          services: {
                            type: 'object',
                            properties: {
                              dynamodb: { 
                                type: 'object',
                                properties: {
                                  accessible: { type: 'boolean' },
                                  tableExists: { type: 'boolean' },
                                  error: { type: 'string', nullable: true }
                                }
                              },
                              organizations: {
                                type: 'object',
                                properties: {
                                  accessible: { type: 'boolean' },
                                  organizationId: { type: 'string', nullable: true },
                                  error: { type: 'string', nullable: true }
                                }
                              }
                            }
                          }
                        }
                      },
                      govcloud: {
                        type: 'object',
                        nullable: true,
                        properties: {
                          identity: {
                            type: 'object',
                            properties: {
                              accountId: { type: 'string' },
                              arn: { type: 'string' },
                              userId: { type: 'string' },
                              status: { type: 'string', enum: ['active', 'expired', 'error'] },
                              error: { type: 'string', nullable: true }
                            }
                          },
                          services: {
                            type: 'object',
                            properties: {
                              dynamodb: { 
                                type: 'object',
                                properties: {
                                  accessible: { type: 'boolean' },
                                  tableExists: { type: 'boolean' },
                                  error: { type: 'string', nullable: true }
                                }
                              },
                              organizations: {
                                type: 'object',
                                properties: {
                                  accessible: { type: 'boolean' },
                                  organizationId: { type: 'string', nullable: true },
                                  error: { type: 'string', nullable: true }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  },
                  cache: {
                    type: 'object',
                    properties: {
                      organization: { 
                        type: 'object',
                        properties: {
                          entries: { type: 'number' },
                          hitRate: { type: 'number' }
                        }
                      },
                      account: { 
                        type: 'object',
                        properties: {
                          entries: { type: 'number' },
                          hitRate: { type: 'number' }
                        }
                      },
                      cost: { 
                        type: 'object',
                        properties: {
                          entries: { type: 'number' },
                          hitRate: { type: 'number' }
                        }
                      }
                    }
                  },
                  warnings: {
                    type: 'array',
                    items: { type: 'string' }
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
 * Check AWS credentials and service connectivity
 */
async function checkAWSEnvironment(environment: 'commercial' | 'govcloud') {
  const result = {
    identity: null as any,
    services: {
      dynamodb: { accessible: false, tableExists: false, error: null as string | null },
      organizations: { accessible: false, organizationId: null as string | null, error: null as string | null }
    }
  }

  try {
    // Check STS identity
    const stsClient = await getSTSClient(environment)
    const identityResponse = await stsClient.send(new GetCallerIdentityCommand({}))
    
    result.identity = {
      accountId: identityResponse.Account,
      arn: identityResponse.Arn,
      userId: identityResponse.UserId,
      status: 'active' as const
    }

    // Check DynamoDB access
    try {
      const dynamoClient = await getDynamoDBClient(environment)
      const tableName = getAccountsTableName()
      
      // Try to describe the accounts table
      const describeResponse = await dynamoClient.send(new DescribeTableCommand({ 
        TableName: tableName 
      }))
      
      result.services.dynamodb = {
        accessible: true,
        tableExists: !!describeResponse.Table,
        error: null
      }
    } catch (error: any) {
      result.services.dynamodb.error = error.message || 'DynamoDB check failed'
    }

    // Check Organizations access (if configured)
    try {
      const orgAccountId = environment === 'commercial' 
        ? process.env.AWS_COMMERCIAL_ORGANIZATIONS_ACCOUNT_ID
        : process.env.AWS_GOVCLOUD_ORGANIZATIONS_ACCOUNT_ID
      
      if (orgAccountId) {
        const region = environment === 'commercial' ? 'us-east-1' : 'us-gov-west-1'
        const orgClient = await getOrganizationsClient(environment, region, orgAccountId)
        const orgResponse = await orgClient.send(new DescribeOrganizationCommand({}))
        
        result.services.organizations = {
          accessible: true,
          organizationId: orgResponse.Organization?.Id || null,
          error: null
        }
      } else {
        result.services.organizations.error = 'Organizations account ID not configured'
      }
    } catch (error: any) {
      result.services.organizations.error = error.message || 'Organizations check failed'
    }

  } catch (error: any) {
    // Handle credential errors
    if (error.message?.includes('expired')) {
      result.identity = {
        accountId: null,
        arn: null,
        userId: null,
        status: 'expired' as const,
        error: 'AWS credentials expired - please refresh session tokens'
      }
    } else {
      result.identity = {
        accountId: null,
        arn: null,
        userId: null,
        status: 'error' as const,
        error: error.message || 'Failed to verify AWS credentials'
      }
    }
  }

  return result
}

/**
 * Format uptime to human-readable string
 */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  
  const parts = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`)
  
  return parts.join(' ')
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  if (bytes === 0) return '0 B'
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`
}

export default defineEventHandler(handleAsync(async (event) => {
  const query = getQuery(event)
  const verbose = query.verbose === 'true' || query.verbose === '1'
  
  const config = getAWSConfig()
  const uptime = process.uptime()
  const memUsage = process.memoryUsage()
  const totalMem = os.totalmem()
  const freeMem = os.freemem()
  const usedMem = totalMem - freeMem
  
  // Basic health data
  const healthData: any = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: {
      seconds: uptime,
      formatted: formatUptime(uptime)
    },
    system: {
      platform: os.platform(),
      nodeVersion: process.version,
      memory: {
        used: formatBytes(usedMem),
        total: formatBytes(totalMem),
        percentage: Math.round((usedMem / totalMem) * 100)
      },
      cpu: {
        cores: os.cpus().length,
        loadAverage: os.loadavg()
      }
    },
    environments: {
      commercial: {
        configured: !!config.commercial,
        hasSessionToken: !!process.env.AWS_COMMERCIAL_SESSION_TOKEN,
        region: process.env.AWS_COMMERCIAL_REGION || 'us-east-1'
      },
      govcloud: {
        configured: !!config.govcloud,
        hasSessionToken: !!process.env.AWS_GOVCLOUD_SESSION_TOKEN,
        region: process.env.AWS_GOVCLOUD_REGION || 'us-gov-west-1'
      }
    },
    warnings: [] as string[]
  }

  // Add warnings
  if (healthData.system.memory.percentage > 80) {
    healthData.warnings.push(`High memory usage: ${healthData.system.memory.percentage}%`)
    healthData.status = 'degraded'
  }
  
  if (healthData.system.cpu.loadAverage[0] > healthData.system.cpu.cores) {
    healthData.warnings.push(`High CPU load: ${healthData.system.cpu.loadAverage[0].toFixed(2)}`)
    healthData.status = 'degraded'
  }

  // Perform verbose checks if requested
  if (verbose) {
    healthData.aws = {}
    
    // Check commercial environment
    if (config.commercial) {
      console.log('Performing health check for commercial AWS environment...')
      healthData.aws.commercial = await checkAWSEnvironment('commercial')
      
      if (healthData.aws.commercial.identity?.status === 'expired') {
        healthData.warnings.push('Commercial AWS credentials expired')
        healthData.status = 'unhealthy'
      } else if (healthData.aws.commercial.identity?.status === 'error') {
        healthData.warnings.push('Commercial AWS credentials error')
        healthData.status = 'degraded'
      }
    }
    
    // Check govcloud environment
    if (config.govcloud) {
      console.log('Performing health check for GovCloud AWS environment...')
      healthData.aws.govcloud = await checkAWSEnvironment('govcloud')
      
      if (healthData.aws.govcloud.identity?.status === 'expired') {
        healthData.warnings.push('GovCloud AWS credentials expired')
        healthData.status = 'unhealthy'
      } else if (healthData.aws.govcloud.identity?.status === 'error') {
        healthData.warnings.push('GovCloud AWS credentials error')
        healthData.status = 'degraded'
      }
    }
    
    // Check cache health
    try {
      const { organizationCache, accountCache, costCache } = await import('../utils/cache-manager')
      
      healthData.cache = {
        organization: organizationCache.getStats(),
        account: accountCache.getStats(),
        cost: costCache.getStats()
      }
    } catch (error) {
      console.warn('Could not retrieve cache statistics:', error)
    }
  }
  
  // Add warnings if no environments are configured
  if (!config.commercial && !config.govcloud) {
    healthData.warnings.push('No AWS environments configured')
    healthData.status = 'unhealthy'
  }
  
  return sendSuccess(event, healthData, {
    cached: false,
    operation: 'health-check',
    verbose
  })
}))