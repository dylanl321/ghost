/**
 * POST /api/support/ai-query-generator
 * AI-powered query generation from natural language
 *
 * Generates Config Aggregator SQL, CloudWatch filter patterns, or CloudTrail queries
 */

import { defineEventHandler, readBody } from 'h3'
import { invokeBedrock, parseModelJson } from '../../utils/bedrock-client'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { logger } from '../../utils/logger'
import { registerEndpoint } from '../../plugins/swagger'

export type QueryType = 'config' | 'cloudwatch' | 'cloudtrail'

export interface AIQueryRequest {
  naturalLanguageQuery: string
  queryType: QueryType
  context?: {
    environment?: 'commercial' | 'govcloud'
    accountId?: string
    region?: string
    resourceType?: string
  }
}

export interface AIQueryResponse {
  generatedQuery: string
  queryType: QueryType
  explanation: string
  suggestedRefinements: string[]
  exampleResults?: string
}

registerEndpoint('/api/support/ai-query-generator', 'POST', {
  summary: 'Generate AWS query from natural language',
  description: 'Use AI to generate Config SQL, CloudWatch filters, or CloudTrail queries from natural language descriptions',
  tags: ['Support Tools', 'AI'],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['naturalLanguageQuery', 'queryType'],
          properties: {
            naturalLanguageQuery: {
              type: 'string',
              description: 'Natural language description of what you want to find',
              maxLength: 1000
            },
            queryType: {
              type: 'string',
              enum: ['config', 'cloudwatch', 'cloudtrail'],
              description: 'Type of query to generate'
            },
            context: {
              type: 'object',
              properties: {
                environment: { type: 'string', enum: ['commercial', 'govcloud'] },
                accountId: { type: 'string' },
                region: { type: 'string' },
                resourceType: { type: 'string' }
              }
            }
          }
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Generated query',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  generatedQuery: { type: 'string' },
                  queryType: { type: 'string' },
                  explanation: { type: 'string' },
                  suggestedRefinements: { type: 'array', items: { type: 'string' } }
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

// System prompts for each query type
const SYSTEM_PROMPTS: Record<QueryType, string> = {
  config: `You are an AWS Config Aggregator SQL query expert. Generate valid Config SQL queries based on user descriptions.

AWS Config SQL rules:
- Uses SELECT...WHERE syntax (no FROM clause)
- Valid columns: resourceId, resourceType, accountId, awsRegion, configuration, tags, supplementaryConfiguration
- The configuration field is JSON - access nested fields with dot notation: configuration.privateIpAddress
- Tags can be accessed with tags.key and tags.value for filtering
- Resource types use AWS format: AWS::EC2::Instance, AWS::S3::Bucket, AWS::IAM::Role, etc.
- Supports basic operators: =, !=, >, <, >=, <=, LIKE, IN, AND, OR, NOT

Common resource types:
- AWS::EC2::Instance - EC2 instances (config has: instanceType, privateIpAddress, publicIpAddress, state, vpcId, subnetId)
- AWS::EC2::SecurityGroup - Security groups (config has: groupId, groupName, vpcId, ipPermissions)
- AWS::S3::Bucket - S3 buckets (config has: name, arn, publicAccessBlockConfiguration)
- AWS::IAM::Role - IAM roles (config has: roleName, arn, assumeRolePolicyDocument)
- AWS::EC2::NetworkInterface - ENIs (config has: networkInterfaceId, privateIpAddress)
- AWS::Lambda::Function - Lambda functions (config has: functionName, runtime, memorySize)

Example queries:
1. Find EC2 instances by IP:
   SELECT resourceId, accountId, awsRegion, configuration WHERE resourceType = 'AWS::EC2::Instance' AND configuration.privateIpAddress = '10.0.0.1'

2. Find unencrypted S3 buckets:
   SELECT resourceId, accountId, configuration WHERE resourceType = 'AWS::S3::Bucket' AND configuration.serverSideEncryptionConfiguration IS NULL

3. Find instances by tag:
   SELECT resourceId, configuration, tags WHERE resourceType = 'AWS::EC2::Instance' AND tags.key = 'Environment' AND tags.value = 'production'`,

  cloudwatch: `You are a CloudWatch Logs filter pattern expert. Generate valid filter patterns based on user descriptions.

CloudWatch Logs filter pattern rules:
- Simple text: Just the word/phrase to search (case-sensitive)
- Multiple terms: Use space to match both terms (AND): ERROR exception
- OR matching: Use ? for optional terms or separate queries
- JSON patterns: Use { $.field = "value" } syntax for JSON logs
- Metric extraction: [timestamp, requestId, level, ...]

Common patterns:
- Error logs: ERROR
- Exceptions: exception OR Exception
- Specific user: "user@example.com"
- HTTP errors: "HTTP" "5" (matches HTTP 500, 502, etc.)
- JSON log level: { $.level = "ERROR" }
- JSON with multiple conditions: { $.level = "ERROR" && $.statusCode >= 500 }
- Lambda timeouts: "Task timed out"
- AWS SDK errors: "ServiceException" OR "AccessDenied"

Tips:
- Use quotes for exact phrases: "access denied"
- Filter patterns are case-sensitive
- For JSON logs, ensure the field path matches the log structure
- Combine patterns for more specific searches`,

  cloudtrail: `You are a CloudTrail query expert. Generate lookup filters or Athena queries for CloudTrail analysis.

CloudTrail lookup supports these attribute filters:
- EventName: The AWS API action (e.g., RunInstances, CreateBucket, AssumeRole)
- EventSource: The AWS service (e.g., ec2.amazonaws.com, s3.amazonaws.com)
- ResourceName: The affected resource name
- ResourceType: The AWS resource type
- Username: The IAM user or role name
- ReadOnly: true/false for read vs write events
- AccessKeyId: The access key used

For complex queries, use CloudTrail Lake or Athena SQL:
- SELECT eventTime, eventName, userIdentity.userName, requestParameters
- FROM cloudtrail_logs
- WHERE eventName = 'RunInstances' AND eventTime > date_sub(current_date, 7)

Common use cases:
1. Who launched instances: eventName = 'RunInstances'
2. Security group changes: eventName LIKE '%SecurityGroup%'
3. IAM changes: eventSource = 'iam.amazonaws.com'
4. S3 access: eventSource = 's3.amazonaws.com'
5. Console logins: eventName = 'ConsoleLogin'`
}

// Generate the query using AI
async function generateQuery(request: AIQueryRequest): Promise<AIQueryResponse> {
  const { naturalLanguageQuery, queryType, context } = request

  const systemPrompt = SYSTEM_PROMPTS[queryType]

  // Build context string
  let contextInfo = ''
  if (context) {
    const parts: string[] = []
    if (context.environment) parts.push(`Environment: ${context.environment}`)
    if (context.accountId) parts.push(`Account ID: ${context.accountId}`)
    if (context.region) parts.push(`Region: ${context.region}`)
    if (context.resourceType) parts.push(`Resource Type: ${context.resourceType}`)
    if (parts.length > 0) {
      contextInfo = `\n\nContext:\n${parts.join('\n')}`
    }
  }

  const prompt = `Generate a ${queryType === 'config' ? 'Config Aggregator SQL' : queryType === 'cloudwatch' ? 'CloudWatch Logs filter pattern' : 'CloudTrail lookup/query'} for the following request:

"${naturalLanguageQuery}"${contextInfo}

Respond with a JSON object in this exact format:
{
  "generatedQuery": "the actual query/pattern",
  "explanation": "brief explanation of what the query does",
  "suggestedRefinements": ["refinement 1", "refinement 2", "refinement 3"],
  "exampleResults": "description of what results to expect"
}

IMPORTANT: Return ONLY the JSON object, no additional text or markdown.`

  const response = await invokeBedrock({
    prompt,
    systemPrompt,
    model: 'claude-sonnet',
    maxTokens: 1024,
    temperature: 0.3
  })

  if (!response.success || !response.content) {
    throw new Error(response.error?.message || 'Failed to generate query')
  }

  // Parse the JSON response
  try {
    const parsed = parseModelJson(response.content)

    return {
      generatedQuery: parsed.generatedQuery || '',
      queryType,
      explanation: parsed.explanation || 'Query generated based on your description.',
      suggestedRefinements: parsed.suggestedRefinements || [],
      exampleResults: parsed.exampleResults
    }
  } catch (parseError) {
    logger.error('[AI Query Generator] Failed to parse AI response:', response.content)

    // Try to extract the query even if JSON parsing fails
    const queryMatch = response.content.match(/"generatedQuery":\s*"([^"]+)"/)
    if (queryMatch) {
      return {
        generatedQuery: queryMatch[1],
        queryType,
        explanation: 'Query extracted from AI response.',
        suggestedRefinements: []
      }
    }

    throw new Error('Failed to parse AI response into valid query')
  }
}

export default defineEventHandler(handleAsync(async (event) => {
  const body = await readBody(event) as AIQueryRequest

  // Validate required fields
  if (!body.naturalLanguageQuery || typeof body.naturalLanguageQuery !== 'string') {
    return errors.badRequest(event, 'naturalLanguageQuery is required and must be a string')
  }

  if (body.naturalLanguageQuery.length > 1000) {
    return errors.badRequest(event, 'naturalLanguageQuery exceeds maximum length of 1000 characters')
  }

  if (!body.queryType || !['config', 'cloudwatch', 'cloudtrail'].includes(body.queryType)) {
    return errors.badRequest(event, 'queryType must be one of: config, cloudwatch, cloudtrail')
  }

  logger.info(`[AI Query Generator] Generating ${body.queryType} query: "${body.naturalLanguageQuery.substring(0, 100)}..."`)

  try {
    const result = await generateQuery(body)

    logger.info(`[AI Query Generator] Generated query: ${result.generatedQuery.substring(0, 100)}...`)

    return sendSuccess(event, result)
  } catch (error: any) {
    logger.error('[AI Query Generator] Error:', error)

    if (error.message?.includes('Failed to parse')) {
      return errors.serverError(event, 'AI generated an invalid response. Please try rephrasing your query.')
    }

    return errors.serverError(event, error.message || 'Failed to generate query')
  }
}))
