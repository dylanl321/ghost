/**
 * Enhanced AWS Client Factory with Cross-Account Support
 * Provides unified client creation with role assumption capabilities
 */

import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { CostExplorerClient } from '@aws-sdk/client-cost-explorer'
import { EC2Client } from '@aws-sdk/client-ec2'
import { IAMClient } from '@aws-sdk/client-iam'
import { S3Client } from '@aws-sdk/client-s3'
import { CloudWatchClient } from '@aws-sdk/client-cloudwatch'
import { OrganizationsClient } from '@aws-sdk/client-organizations'
import { SSOAdminClient } from '@aws-sdk/client-sso-admin'
import { SSOClient } from '@aws-sdk/client-sso'
import { LambdaClient } from '@aws-sdk/client-lambda'
import { CloudFormationClient } from '@aws-sdk/client-cloudformation'
import { CloudTrailClient } from '@aws-sdk/client-cloudtrail'
import { ConfigServiceClient } from '@aws-sdk/client-config-service'
import { GuardDutyClient } from '@aws-sdk/client-guardduty'
import { SecurityHubClient } from '@aws-sdk/client-securityhub'
import { RAMClient } from '@aws-sdk/client-ram'
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime'

import type { 
  AWSEnvironmentType, 
  AWSServiceType, 
  AWSCredentials
} from '../types/aws'

// Service client type mapping
const SERVICE_CLIENT_MAP = {
  'dynamodb': DynamoDBClient,
  'cost-explorer': CostExplorerClient,
  'ec2': EC2Client,
  'iam': IAMClient,
  's3': S3Client,
  'sts': STSClient,
  'cloudwatch': CloudWatchClient,
  'organizations': OrganizationsClient,
  'sso-admin': SSOAdminClient,
  'sso': SSOClient,
  'lambda': LambdaClient,
  'cloudformation': CloudFormationClient,
  'cloudtrail': CloudTrailClient,
  'config': ConfigServiceClient,
  'guardduty': GuardDutyClient,
  'securityhub': SecurityHubClient,
  'ram': RAMClient,
  'bedrock-runtime': BedrockRuntimeClient
} as const

// Cache for AWS clients
const clientCache = new Map<string, any>()

/**
 * Get base credentials for an environment
 */
function getBaseCredentials(environment: AWSEnvironmentType): AWSCredentials {
  const prefix = environment === 'commercial' ? 'AWS_COMMERCIAL' : 'AWS_GOVCLOUD'
  
  const accessKeyId = process.env[`${prefix}_ACCESS_KEY_ID`]
  const secretAccessKey = process.env[`${prefix}_SECRET_ACCESS_KEY`]
  
  if (!accessKeyId || !secretAccessKey) {
    throw new Error(`Missing AWS credentials for ${environment} environment. Please set ${prefix}_ACCESS_KEY_ID and ${prefix}_SECRET_ACCESS_KEY`)
  }
  
  return {
    accessKeyId,
    secretAccessKey,
    sessionToken: process.env[`${prefix}_SESSION_TOKEN`]
  }
}

/**
 * Check if credentials are available for an environment
 */
export function hasCredentials(environment: AWSEnvironmentType): boolean {
  const prefix = environment === 'commercial' ? 'AWS_COMMERCIAL' : 'AWS_GOVCLOUD'
  return !!(process.env[`${prefix}_ACCESS_KEY_ID`] && process.env[`${prefix}_SECRET_ACCESS_KEY`])
}

/**
 * Get default region for an environment
 */
function getDefaultRegion(environment: AWSEnvironmentType): string {
  const prefix = environment === 'commercial' ? 'AWS_COMMERCIAL' : 'AWS_GOVCLOUD'
  return process.env[`${prefix}_REGION`] || 
    (environment === 'commercial' ? 'us-east-1' : 'us-gov-west-1')
}

/**
 * Get assume role name from environment
 */
function getAssumeRoleName(): string {
  return process.env.AWS_ASSUME_ROLE_NAME || 'GDMSOrganizationsRole'
}

/**
 * Get assume role external ID if configured
 */
function getAssumeRoleExternalId(): string | undefined {
  return process.env.AWS_ASSUME_ROLE_EXTERNAL_ID
}

/**
 * Assume role into a target account
 */
async function assumeRole(
  baseCredentials: AWSCredentials,
  targetAccountId: string,
  region: string,
  environment: AWSEnvironmentType,
  sessionName?: string
): Promise<AWSCredentials> {
  // Create STS client with base credentials
  const stsClient = new STSClient({
    region,
    credentials: baseCredentials
  })
  
  // Determine role ARN based on environment
  const partition = environment === 'commercial' ? 'aws' : 'aws-us-gov'
  const roleName = getAssumeRoleName()
  const roleArn = `arn:${partition}:iam::${targetAccountId}:role/${roleName}`
  
  // Prepare assume role request
  const assumeRoleParams: any = {
    RoleArn: roleArn,
    RoleSessionName: sessionName || `gdms-${environment}-${Date.now()}`,
    DurationSeconds: parseInt(process.env.AWS_ASSUME_ROLE_DURATION || '3600')
  }
  
  // Add external ID if configured
  const externalId = getAssumeRoleExternalId()
  if (externalId) {
    assumeRoleParams.ExternalId = externalId
  }
  
  // Assume the role
  const command = new AssumeRoleCommand(assumeRoleParams)
  const response = await stsClient.send(command)
  
  if (!response.Credentials) {
    throw new Error(`Failed to assume role in account ${targetAccountId}`)
  }
  
  return {
    accessKeyId: response.Credentials.AccessKeyId!,
    secretAccessKey: response.Credentials.SecretAccessKey!,
    sessionToken: response.Credentials.SessionToken!
  }
}

/**
 * Create a cache key for client storage
 */
function getCacheKey(
  environment: AWSEnvironmentType,
  service: AWSServiceType,
  region: string,
  accountId?: string
): string {
  return accountId 
    ? `${environment}-${service}-${region}-${accountId}`
    : `${environment}-${service}-${region}`
}

/**
 * Main client factory function
 */
export async function getClient<T = any>(
  environment: AWSEnvironmentType,
  service: AWSServiceType,
  region?: string,
  accountId?: string,
  sessionName?: string
): Promise<T> {
  // Check if credentials are available for this environment
  if (!hasCredentials(environment)) {
    throw new Error(`No AWS credentials configured for ${environment} environment. Please check your environment variables.`)
  }
  
  // Use default region if not specified
  const targetRegion = region || getDefaultRegion(environment)
  
  // Check cache first
  const cacheKey = getCacheKey(environment, service, targetRegion, accountId)
  if (clientCache.has(cacheKey)) {
    return clientCache.get(cacheKey)
  }
  
  // Get appropriate credentials
  let credentials: AWSCredentials
  
  if (accountId) {
    // Assume role into target account
    const baseCredentials = getBaseCredentials(environment)
    credentials = await assumeRole(
      baseCredentials,
      accountId,
      targetRegion,
      environment,
      sessionName
    )
  } else {
    // Use base credentials
    credentials = getBaseCredentials(environment)
  }
  
  // Get the client class
  const ClientClass = SERVICE_CLIENT_MAP[service]
  if (!ClientClass) {
    throw new Error(`Unsupported service: ${service}`)
  }
  
  // Create the client
  const client = new ClientClass({
    region: targetRegion,
    credentials
  })
  
  // Cache the client
  clientCache.set(cacheKey, client)
  
  return client as T
}

/**
 * Convenience functions for specific services
 */
export async function getDynamoDBClient(
  environment: AWSEnvironmentType = 'commercial',
  region?: string,
  accountId?: string
): Promise<DynamoDBClient> {
  return getClient(environment, 'dynamodb', region, accountId)
}

export async function getCostExplorerClient(
  environment: AWSEnvironmentType = 'commercial',
  region?: string,
  accountId?: string
): Promise<CostExplorerClient> {
  return getClient(environment, 'cost-explorer', region, accountId)
}

export async function getOrganizationsClient(
  environment: AWSEnvironmentType = 'commercial',
  region?: string,
  accountId?: string
): Promise<OrganizationsClient> {
  return getClient(environment, 'organizations', region, accountId)
}

export async function getEC2Client(
  environment: AWSEnvironmentType = 'commercial',
  region?: string,
  accountId?: string
): Promise<EC2Client> {
  return getClient(environment, 'ec2', region, accountId)
}

export async function getIAMClient(
  environment: AWSEnvironmentType = 'commercial',
  region?: string,
  accountId?: string
): Promise<IAMClient> {
  return getClient(environment, 'iam', region, accountId)
}

export async function getS3Client(
  environment: AWSEnvironmentType = 'commercial',
  region?: string,
  accountId?: string
): Promise<S3Client> {
  return getClient(environment, 's3', region, accountId)
}

export async function getSTSClient(
  environment: AWSEnvironmentType = 'commercial',
  region?: string,
  accountId?: string
): Promise<STSClient> {
  return getClient(environment, 'sts', region, accountId)
}

export async function getCloudWatchClient(
  environment: AWSEnvironmentType = 'commercial',
  region?: string,
  accountId?: string
): Promise<CloudWatchClient> {
  return getClient(environment, 'cloudwatch', region, accountId)
}

export async function getBedrockRuntimeClient(
  environment: AWSEnvironmentType = 'govcloud',
  region?: string,
  accountId?: string
): Promise<BedrockRuntimeClient> {
  return getClient(environment, 'bedrock-runtime', region, accountId)
}

/**
 * Clear all cached clients
 */
export function clearClientCache(): void {
  clientCache.clear()
}

/**
 * Get current AWS account ID for an environment
 */
export async function getAccountId(
  environment: AWSEnvironmentType = 'commercial'
): Promise<string> {
  const stsClient = await getSTSClient(environment)
  const { GetCallerIdentityCommand } = await import('@aws-sdk/client-sts')
  const response = await stsClient.send(new GetCallerIdentityCommand({}))
  return response.Account!
}