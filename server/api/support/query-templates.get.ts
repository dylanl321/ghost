/**
 * GET /api/support/query-templates
 * Pre-built query templates for common support scenarios
 */

import { defineEventHandler, getQuery } from 'h3'
import { sendSuccess, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'

interface QueryTemplate {
  id: string
  category: 'security' | 'cost' | 'compliance' | 'performance' | 'inventory'
  name: string
  description: string
  prompt: string
  queryType: 'config' | 'cloudwatch' | 'cloudtrail'
  generatedQuery: string
  variables?: Array<{
    name: string
    description: string
    type: 'string' | 'number' | 'boolean'
    required: boolean
    default?: string
  }>
  tags: string[]
}

const LARGE_INSTANCE_TYPES = ['m5', 'm6i', 'm7i', 'c5', 'c6i', 'c7i', 'r5', 'r6i', 'r7i']
  .flatMap(family => ['4xlarge', '8xlarge', '12xlarge', '16xlarge', '24xlarge'].map(size => `'${family}.${size}'`))
  .join(', ')

// Pre-built query templates
const QUERY_TEMPLATES: QueryTemplate[] = [
  // Security templates
  {
    id: 'security-open-sg',
    category: 'security',
    name: 'Open Security Groups',
    description: 'Find security groups with 0.0.0.0/0 ingress rules (publicly accessible)',
    prompt: 'Find security groups with 0.0.0.0/0 ingress',
    queryType: 'config',
    generatedQuery: `SELECT
  resourceId,
  resourceName,
  accountId,
  awsRegion,
  configuration
WHERE
  resourceType = 'AWS::EC2::SecurityGroup'
  AND configuration.ipPermissions.ipv4Ranges.cidrIp = '0.0.0.0/0'`,
    tags: ['security', 'network', 'compliance']
  },
  {
    id: 'security-public-s3',
    category: 'security',
    name: 'Public S3 Buckets',
    description: 'Find S3 buckets that may be publicly accessible',
    prompt: 'Find S3 buckets without public access block',
    queryType: 'config',
    generatedQuery: `SELECT
  resourceId,
  resourceName,
  accountId,
  awsRegion,
  configuration
WHERE
  resourceType = 'AWS::S3::Bucket'
  AND configuration.publicAccessBlockConfiguration IS NULL`,
    tags: ['security', 's3', 'data-protection']
  },
  {
    id: 'security-unencrypted-ebs',
    category: 'security',
    name: 'Unencrypted EBS Volumes',
    description: 'Find EBS volumes without encryption enabled',
    prompt: 'Find EBS volumes without encryption',
    queryType: 'config',
    generatedQuery: `SELECT
  resourceId,
  accountId,
  awsRegion,
  configuration
WHERE
  resourceType = 'AWS::EC2::Volume'
  AND configuration.encrypted = false`,
    tags: ['security', 'encryption', 'compliance']
  },
  {
    id: 'security-iam-inactive',
    category: 'security',
    name: 'IAM Users',
    description: 'List IAM users to review for unused access (Config does not record last sign-in)',
    prompt: 'List IAM users',
    queryType: 'config',
    generatedQuery: `SELECT
  resourceId,
  resourceName,
  accountId,
  configuration
WHERE
  resourceType = 'AWS::IAM::User'`,
    tags: ['security', 'iam', 'access-management']
  },

  // Cost templates
  {
    id: 'cost-idle-instances',
    category: 'cost',
    name: 'Stopped Instances',
    description: 'Find EC2 instances in stopped state (may be wasting money on EBS)',
    prompt: 'Find stopped EC2 instances',
    queryType: 'config',
    generatedQuery: `SELECT
  resourceId,
  resourceName,
  accountId,
  awsRegion,
  configuration.instanceType,
  configuration.state
WHERE
  resourceType = 'AWS::EC2::Instance'
  AND configuration.state.name = 'stopped'`,
    tags: ['cost', 'optimization', 'ec2']
  },
  {
    id: 'cost-old-snapshots',
    category: 'cost',
    name: 'Old EBS Snapshots',
    description: 'Find EBS snapshots that may no longer be needed',
    prompt: 'Find EBS snapshots',
    queryType: 'config',
    generatedQuery: `SELECT
  resourceId,
  accountId,
  awsRegion,
  configuration.volumeSize,
  resourceCreationTime
WHERE
  resourceType = 'AWS::EC2::Snapshot'`,
    tags: ['cost', 'storage', 'cleanup']
  },
  {
    id: 'cost-unattached-ebs',
    category: 'cost',
    name: 'Unattached EBS Volumes',
    description: 'Find EBS volumes not attached to any instance',
    prompt: 'Find unattached EBS volumes',
    queryType: 'config',
    generatedQuery: `SELECT
  resourceId,
  accountId,
  awsRegion,
  configuration.volumeType,
  configuration.size
WHERE
  resourceType = 'AWS::EC2::Volume'
  AND configuration.state.value = 'available'`,
    tags: ['cost', 'storage', 'cleanup']
  },

  // Compliance templates
  {
    id: 'compliance-no-tags',
    category: 'compliance',
    name: 'Instance Tags',
    description: 'List EC2 instances with their tags to review for missing required tags',
    prompt: 'List EC2 instances with their tags',
    queryType: 'config',
    generatedQuery: `SELECT
  resourceId,
  resourceName,
  accountId,
  awsRegion,
  tags
WHERE
  resourceType = 'AWS::EC2::Instance'`,
    tags: ['compliance', 'tagging', 'governance']
  },
  {
    id: 'compliance-default-vpc',
    category: 'compliance',
    name: 'Instance VPCs',
    description: 'List EC2 instances with their VPC to spot default-VPC usage',
    prompt: 'List EC2 instances with their VPC',
    queryType: 'config',
    generatedQuery: `SELECT
  resourceId,
  resourceName,
  accountId,
  awsRegion,
  configuration.vpcId
WHERE
  resourceType = 'AWS::EC2::Instance'`,
    tags: ['compliance', 'network', 'best-practices']
  },

  // Performance templates
  {
    id: 'perf-large-instances',
    category: 'performance',
    name: 'Large Instance Types',
    description: 'Find instances in common 4xlarge and larger sizes that may be oversized',
    prompt: 'Find large EC2 instances (4xlarge or bigger)',
    queryType: 'config',
    // AWS Config only allows a trailing wildcard, so the old LIKE '%4xlarge%'
    // was rejected outright. List the common large sizes explicitly.
    generatedQuery: `SELECT
  resourceId,
  resourceName,
  accountId,
  awsRegion,
  configuration.instanceType
WHERE
  resourceType = 'AWS::EC2::Instance'
  AND configuration.instanceType IN (${LARGE_INSTANCE_TYPES})`,
    tags: ['performance', 'rightsizing', 'cost']
  },

  // CloudWatch templates
  {
    id: 'logs-errors',
    category: 'performance',
    name: 'Application Errors',
    description: 'Find error messages in logs',
    prompt: 'Search for error messages',
    queryType: 'cloudwatch',
    generatedQuery: 'ERROR',
    tags: ['logs', 'troubleshooting', 'errors']
  },
  {
    id: 'logs-lambda-timeout',
    category: 'performance',
    name: 'Lambda Timeouts',
    description: 'Find Lambda function timeout events',
    prompt: 'Find Lambda timeouts',
    queryType: 'cloudwatch',
    generatedQuery: '"Task timed out"',
    tags: ['logs', 'lambda', 'performance']
  },
  {
    id: 'logs-access-denied',
    category: 'security',
    name: 'Access Denied Events',
    description: 'Find AWS SDK access denied errors',
    prompt: 'Find access denied errors in logs',
    queryType: 'cloudwatch',
    generatedQuery: '"AccessDenied" OR "Access Denied" OR "UnauthorizedAccess"',
    tags: ['logs', 'security', 'troubleshooting']
  },

  // CloudTrail templates
  {
    id: 'trail-console-login',
    category: 'security',
    name: 'Console Logins',
    description: 'Track AWS Console login events',
    prompt: 'Find console login events',
    queryType: 'cloudtrail',
    generatedQuery: 'eventName = ConsoleLogin',
    tags: ['audit', 'security', 'access']
  },
  {
    id: 'trail-iam-changes',
    category: 'security',
    name: 'IAM Changes',
    description: 'Track IAM policy and role modifications',
    prompt: 'Find IAM changes',
    queryType: 'cloudtrail',
    generatedQuery: 'eventSource = iam.amazonaws.com',
    tags: ['audit', 'security', 'iam']
  },
  {
    id: 'trail-sg-changes',
    category: 'security',
    name: 'Security Group Changes',
    description: 'Track security group modifications',
    prompt: 'Find security group changes',
    queryType: 'cloudtrail',
    generatedQuery: "eventName LIKE '%SecurityGroup%'",
    tags: ['audit', 'security', 'network']
  },

  // Inventory templates
  {
    id: 'inventory-ec2',
    category: 'inventory',
    name: 'All EC2 Instances',
    description: 'List all EC2 instances across accounts',
    prompt: 'List all EC2 instances',
    queryType: 'config',
    generatedQuery: `SELECT
  resourceId,
  resourceName,
  accountId,
  awsRegion,
  configuration.instanceType,
  configuration.state.name,
  tags
WHERE
  resourceType = 'AWS::EC2::Instance'`,
    tags: ['inventory', 'ec2', 'compute']
  },
  {
    id: 'inventory-rds',
    category: 'inventory',
    name: 'All RDS Instances',
    description: 'List all RDS database instances',
    prompt: 'List all RDS instances',
    queryType: 'config',
    generatedQuery: `SELECT
  resourceId,
  resourceName,
  accountId,
  awsRegion,
  configuration.dBInstanceClass,
  configuration.engine
WHERE
  resourceType = 'AWS::RDS::DBInstance'`,
    tags: ['inventory', 'rds', 'database']
  },
  {
    id: 'inventory-lambda',
    category: 'inventory',
    name: 'All Lambda Functions',
    description: 'List all Lambda functions',
    prompt: 'List all Lambda functions',
    queryType: 'config',
    generatedQuery: `SELECT
  resourceId,
  resourceName,
  accountId,
  awsRegion,
  configuration.runtime,
  configuration.memorySize
WHERE
  resourceType = 'AWS::Lambda::Function'`,
    tags: ['inventory', 'lambda', 'serverless']
  }
]

registerEndpoint('/api/support/query-templates', 'GET', {
  summary: 'Get pre-built query templates',
  description: 'Retrieve pre-built query templates organized by category for common support scenarios',
  tags: ['Support Tools'],
  parameters: [
    {
      name: 'category',
      in: 'query',
      required: false,
      schema: { type: 'string', enum: ['security', 'cost', 'compliance', 'performance', 'inventory'] },
      description: 'Filter by category'
    },
    {
      name: 'queryType',
      in: 'query',
      required: false,
      schema: { type: 'string', enum: ['config', 'cloudwatch', 'cloudtrail'] },
      description: 'Filter by query type'
    },
    {
      name: 'search',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Search templates by name, description, or tags'
    }
  ],
  responses: {
    200: {
      description: 'Query templates',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  templates: { type: 'array' },
                  categories: { type: 'array' },
                  total: { type: 'number' }
                }
              }
            }
          }
        }
      }
    }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  const queryParams = getQuery(event)
  const category = queryParams.category as string | undefined
  const queryType = queryParams.queryType as string | undefined
  const search = queryParams.search as string | undefined

  let templates = [...QUERY_TEMPLATES]

  // Filter by category
  if (category) {
    templates = templates.filter(t => t.category === category)
  }

  // Filter by query type
  if (queryType) {
    templates = templates.filter(t => t.queryType === queryType)
  }

  // Search filter
  if (search) {
    const searchLower = search.toLowerCase()
    templates = templates.filter(t =>
      t.name.toLowerCase().includes(searchLower) ||
      t.description.toLowerCase().includes(searchLower) ||
      t.tags.some(tag => tag.includes(searchLower))
    )
  }

  // Get unique categories
  const categories = [...new Set(QUERY_TEMPLATES.map(t => t.category))]

  return sendSuccess(event, {
    templates,
    categories,
    total: templates.length
  })
}))
