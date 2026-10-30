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
import { IdentitystoreClient } from '@aws-sdk/client-identitystore'
import { LambdaClient } from '@aws-sdk/client-lambda'
import { CloudFormationClient } from '@aws-sdk/client-cloudformation'
import { CloudTrailClient } from '@aws-sdk/client-cloudtrail'
import { ConfigServiceClient } from '@aws-sdk/client-config-service'
import { GuardDutyClient } from '@aws-sdk/client-guardduty'
import { SecurityHubClient } from '@aws-sdk/client-securityhub'
import { SecurityLakeClient } from '@aws-sdk/client-securitylake'
import { AthenaClient } from '@aws-sdk/client-athena'
import { RAMClient } from '@aws-sdk/client-ram'
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime'
import { BedrockClient } from '@aws-sdk/client-bedrock'
import { BedrockAgentRuntimeClient } from '@aws-sdk/client-bedrock-agent-runtime'
import { ComputeOptimizerClient } from '@aws-sdk/client-compute-optimizer'
import { PricingClient } from '@aws-sdk/client-pricing'
import { SESClient } from '@aws-sdk/client-ses'
import { SNSClient } from '@aws-sdk/client-sns'
import { EventBridgeClient } from '@aws-sdk/client-eventbridge'
import { SSMClient } from '@aws-sdk/client-ssm'
import { Inspector2Client } from '@aws-sdk/client-inspector2'
import { CloudWatchLogsClient } from '@aws-sdk/client-cloudwatch-logs'
import { ResourceGroupsTaggingAPIClient } from '@aws-sdk/client-resource-groups-tagging-api'
import { BillingClient } from '@aws-sdk/client-billing'
import { logger } from '../utils/logger'
import { assumeRoleCircuitBreaker } from '../utils/credential-circuit-breaker'
import { awsApiCallCounterMiddleware } from '../utils/aws-call-metrics'

import type {
  AWSEnvironmentType,
  AWSServiceType,
  AWSCredentials
} from '../types/aws'

/**
 * Get config value from environment variables only
 * DO NOT use site-config here to avoid circular dependencies
 * (site-config -> dynamodb -> aws-client-factory -> site-config = infinite loop)
 */
function getConfigValue<T>(key: string, envVarFallback?: string, defaultValue?: T): T {
  // Use environment variable
  if (envVarFallback && process.env[envVarFallback]) {
    return process.env[envVarFallback] as T
  }

  // Final fallback to default
  return defaultValue as T
}

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
  'identitystore': IdentitystoreClient,
  'lambda': LambdaClient,
  'cloudformation': CloudFormationClient,
  'cloudtrail': CloudTrailClient,
  'config': ConfigServiceClient,
  'guardduty': GuardDutyClient,
  'securityhub': SecurityHubClient,
  'securitylake': SecurityLakeClient,
  'athena': AthenaClient,
  'ram': RAMClient,
  'bedrock': BedrockClient,
  'bedrock-runtime': BedrockRuntimeClient,
  'bedrock-agent-runtime': BedrockAgentRuntimeClient,
  'compute-optimizer': ComputeOptimizerClient,
  'pricing': PricingClient,
  'ses': SESClient,
  'sns': SNSClient,
  'eventbridge': EventBridgeClient,
  'ssm': SSMClient,
  'inspector2': Inspector2Client,
  'cloudwatch-logs': CloudWatchLogsClient,
  'resource-groups-tagging': ResourceGroupsTaggingAPIClient,
  'billing': BillingClient
} as const

// Cache for AWS clients with expiration tracking
interface CachedClient {
  client: any
  expiration?: Date
}
const clientCache = new Map<string, CachedClient>()

// Region patterns for each partition
const REGION_PATTERNS = {
  commercial: /^(us|eu|ap|sa|ca|me|af|il)-(east|west|south|north|central|northeast|southeast)-\d+$/,
  govcloud: /^us-gov-(east|west)-\d+$/
} as const

/**
 * Validate that a region is appropriate for the given partition
 */
function validateRegionForPartition(
  region: string,
  environment: AWSEnvironmentType
): void {
  const pattern = REGION_PATTERNS[environment]

  // Debug logging for invalid environment
  if (!pattern) {
    logger.error(`[AWS Client Factory] Invalid environment value: "${environment}" (type: ${typeof environment})`)
    logger.error(`[AWS Client Factory] Available environments:`, Object.keys(REGION_PATTERNS))
    throw new Error(`Invalid AWS environment: ${environment}. Must be 'commercial' or 'govcloud'`)
  }

  const otherEnvironment = environment === 'commercial' ? 'govcloud' : 'commercial'
  const otherPattern = REGION_PATTERNS[otherEnvironment]

  if (!pattern.test(region)) {
    if (otherPattern.test(region)) {
      throw new Error(
        `CRITICAL: Region "${region}" belongs to ${otherEnvironment} partition but you're using ${environment} credentials. ` +
        `This WILL cause authentication errors that appear as invalid/expired credentials. ` +
        `Use a ${environment} region instead (e.g., ${environment === 'commercial' ? 'us-east-1' : 'us-gov-west-1'}).`
      )
    } else {
      logger.warn(
        `[AWS Client Factory] Warning: Region "${region}" may not be valid for ${environment} environment. ` +
        `Expected pattern: ${pattern.source}`
      )
    }
  }
}

/**
 * Get partition from region name
 */
function getPartitionFromRegion(region: string): AWSEnvironmentType | null {
  if (REGION_PATTERNS.commercial.test(region)) {
    return 'commercial'
  }
  if (REGION_PATTERNS.govcloud.test(region)) {
    return 'govcloud'
  }
  return null
}

/**
 * Get base credentials for an environment
 */
function getBaseCredentials(environment: AWSEnvironmentType): AWSCredentials {
  let accessKeyId: string | undefined
  let secretAccessKey: string | undefined
  let sessionToken: string | undefined

  if (environment === 'commercial') {
    // Support both naming conventions for commercial credentials
    accessKeyId = process.env.COMMERCIAL_AWS_ACCESS_KEY_ID || process.env.AWS_COMMERCIAL_ACCESS_KEY_ID
    secretAccessKey = process.env.COMMERCIAL_AWS_SECRET_ACCESS_KEY || process.env.AWS_COMMERCIAL_SECRET_ACCESS_KEY
    sessionToken = process.env.COMMERCIAL_AWS_SESSION_TOKEN || process.env.AWS_COMMERCIAL_SESSION_TOKEN
  } else {
    accessKeyId = process.env.AWS_GOVCLOUD_ACCESS_KEY_ID
    secretAccessKey = process.env.AWS_GOVCLOUD_SECRET_ACCESS_KEY
    sessionToken = process.env.AWS_GOVCLOUD_SESSION_TOKEN
  }

  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      `Missing AWS credentials for ${environment} environment. ` +
      (environment === 'commercial'
        ? 'Please set COMMERCIAL_AWS_ACCESS_KEY_ID and COMMERCIAL_AWS_SECRET_ACCESS_KEY'
        : 'Please set AWS_GOVCLOUD_ACCESS_KEY_ID and AWS_GOVCLOUD_SECRET_ACCESS_KEY')
    )
  }

  return { accessKeyId, secretAccessKey, sessionToken }
}

/**
 * Check if credentials are available for an environment
 */
export function hasCredentials(environment: AWSEnvironmentType): boolean {
  if (environment === 'commercial') {
    return !!(
      (process.env.COMMERCIAL_AWS_ACCESS_KEY_ID || process.env.AWS_COMMERCIAL_ACCESS_KEY_ID) &&
      (process.env.COMMERCIAL_AWS_SECRET_ACCESS_KEY || process.env.AWS_COMMERCIAL_SECRET_ACCESS_KEY)
    )
  }
  return !!(process.env.AWS_GOVCLOUD_ACCESS_KEY_ID && process.env.AWS_GOVCLOUD_SECRET_ACCESS_KEY)
}


/**
 * Get default region for an environment
 * Reads from site config with env var fallback
 */
async function getDefaultRegion(environment: AWSEnvironmentType): Promise<string> {
  const configKey = environment === 'commercial' ? 'aws.commercial.region' : 'aws.govcloud.region'
  const envVar = environment === 'commercial' ? 'COMMERCIAL_REGION' : 'AWS_GOVCLOUD_REGION'
  const fallbackDefault = environment === 'commercial' ? 'us-east-1' : 'us-gov-west-1'

  const defaultRegion = getConfigValue<string>(configKey, envVar, fallbackDefault)

  // Validate the default region
  try {
    validateRegionForPartition(defaultRegion, environment)
  } catch (error) {
    logger.error(`[AWS Client Factory] Invalid default region configuration: ${(error instanceof Error ? error.message : String(error))}`)
    // Fall back to safe defaults
    return fallbackDefault
  }

  return defaultRegion
}

/**
 * Get assume role name from site config with env fallback
 */
async function getAssumeRoleName(): Promise<string> {
  return getConfigValue<string>('aws.roleAssumption.roleName', 'AWS_ASSUME_ROLE_NAME', 'GDMSOrganizationsRole')
}

function normalizeRolePath(path: string | undefined): string {
  return path?.replace(/^\/+|\/+$/g, '') || ''
}

/**
 * Organization master roles can live under a path while member-account roles
 * remain at the IAM root. GovCloud uses /GD/ for the organizations master.
 */
export function buildAssumeRoleArn(
  environment: AWSEnvironmentType,
  targetAccountId: string,
  roleName: string,
): string {
  const partition = environment === 'commercial' ? 'aws' : 'aws-us-gov'
  const organizationsAccountId = environment === 'commercial'
    ? process.env.AWS_COMMERCIAL_ORGANIZATIONS_ACCOUNT_ID
    : process.env.AWS_GOVCLOUD_ORGANIZATIONS_ACCOUNT_ID
  const configuredPath = environment === 'commercial'
    ? process.env.AWS_COMMERCIAL_ORGANIZATIONS_ROLE_PATH
    : process.env.AWS_GOVCLOUD_ORGANIZATIONS_ROLE_PATH
  const defaultPath = environment === 'govcloud' ? 'GD' : ''
  const rolePath = targetAccountId === organizationsAccountId
    ? normalizeRolePath(configuredPath ?? defaultPath)
    : ''
  const qualifiedRoleName = rolePath ? `${rolePath}/${roleName}` : roleName

  return `arn:${partition}:iam::${targetAccountId}:role/${qualifiedRoleName}`
}

/**
 * Get assume role duration from env, default 3600 seconds.
 * GDMSOrganizationsRole keeps IAM's default one-hour MaxSessionDuration, and
 * STS rejects any longer request, so a larger default would fail every
 * AssumeRole wherever AWS_ASSUME_ROLE_DURATION is not set.
 */
async function getAssumeRoleDuration(): Promise<number> {
  const duration = getConfigValue<number>('aws.roleAssumption.duration', 'AWS_ASSUME_ROLE_DURATION', 3600)
  return typeof duration === 'string' ? parseInt(duration) : duration
}

/**
 * Get assume role external ID if configured
 */
function getAssumeRoleExternalId(): string | undefined {
  return process.env.AWS_ASSUME_ROLE_EXTERNAL_ID
}

// STS clients are reused per partition/region rather than built per AssumeRole.
const stsClients = new Map<string, STSClient>()

function getBaseStsClient(environment: AWSEnvironmentType, region: string): STSClient {
  const key = `${environment}-${region}`
  let client = stsClients.get(key)
  if (!client) {
    client = new STSClient({
      region,
      credentials: getBaseCredentials(environment),
      requestHandler: getRequestHandlerTimeouts('sts')
    })
    stsClients.set(key, client)
  }
  return client
}

/**
 * Assume role into a target account
 */
async function assumeRole(
  targetAccountId: string,
  region: string,
  environment: AWSEnvironmentType,
  sessionName?: string
): Promise<AWSCredentials> {
  // Routine lifecycle logging is debug-level to avoid dominating CloudWatch;
  // failures still surface as errors to the caller (getClient).
  logger.debug('[AWS Client Factory] assumeRole called', {
    component: 'aws-client-factory',
    operation: 'assumeRole',
    environment,
    region,
    targetAccountId
  })

  const stsClient = getBaseStsClient(environment, region)

  const roleName = await getAssumeRoleName()
  const roleArn = buildAssumeRoleArn(environment, targetAccountId, roleName)

  logger.debug('[AWS Client Factory] Assuming role', {
    component: 'aws-client-factory',
    operation: 'assumeRole',
    environment,
    roleArn
  })

  // Prepare assume role request
  const duration = await getAssumeRoleDuration()
  const assumeRoleParams: any = {
    RoleArn: roleArn,
    RoleSessionName: sessionName || `gdms-${environment}-${Date.now()}`,
    DurationSeconds: duration
  }

  // Add external ID if configured
  const externalId = getAssumeRoleExternalId()
  if (externalId) {
    assumeRoleParams.ExternalId = externalId
  }

  // Assume the role
  const command = new AssumeRoleCommand(assumeRoleParams)
  const response = await stsClient.send(command)
  logger.debug('[AWS Client Factory] AssumeRole succeeded', {
    component: 'aws-client-factory',
    operation: 'assumeRole',
    environment,
    targetAccountId
  })
  
  if (!response.Credentials) {
    throw new Error(`Failed to assume role in account ${targetAccountId}`)
  }
  
  return {
    accessKeyId: response.Credentials.AccessKeyId!,
    secretAccessKey: response.Credentials.SecretAccessKey!,
    sessionToken: response.Credentials.SessionToken!,
    expiration: response.Credentials.Expiration
  }
}

// Assumed-role credentials are valid for every service and region in the
// account, so they are cached per partition + account (+ session name, which
// shows up in CloudTrail) instead of once per service client. Concurrent
// callers for a cold account share one in-flight STS call.
const CREDENTIAL_REFRESH_BUFFER_MS = 5 * 60 * 1000
const assumedCredentialCache = new Map<string, AWSCredentials>()
const inflightAssumeRole = new Map<string, Promise<AWSCredentials>>()

type AssumeRoleFn = (
  targetAccountId: string,
  region: string,
  environment: AWSEnvironmentType,
  sessionName?: string
) => Promise<AWSCredentials>

let assumeRoleImpl: AssumeRoleFn = assumeRole

/** Test hook: replace the STS call. Pass nothing to restore the real one. */
export function __setAssumeRoleForTests(fn?: AssumeRoleFn): void {
  assumeRoleImpl = fn ?? assumeRole
  assumedCredentialCache.clear()
  inflightAssumeRole.clear()
}

function credentialsAreFresh(credentials: AWSCredentials): boolean {
  return !credentials.expiration ||
    credentials.expiration.getTime() > Date.now() + CREDENTIAL_REFRESH_BUFFER_MS
}

/**
 * Get credentials for GDMSOrganizationsRole (or AWS_ASSUME_ROLE_NAME) in a
 * member account. Applies the per-account circuit breaker.
 */
export async function getAssumedRoleCredentials(
  environment: AWSEnvironmentType,
  accountId: string,
  options: { region?: string, sessionName?: string } = {}
): Promise<AWSCredentials> {
  const key = `${environment}:${accountId}:${options.sessionName ?? ''}`

  const cached = assumedCredentialCache.get(key)
  if (cached && credentialsAreFresh(cached)) {
    return cached
  }

  const inflight = inflightAssumeRole.get(key)
  if (inflight) {
    return inflight
  }

  // Circuit breaker: skip STS call if account is known-unreachable
  if (!assumeRoleCircuitBreaker.canAttempt(accountId)) {
    throw new Error(
      `Circuit breaker OPEN for account ${accountId} in ${environment} environment. ` +
      `Assume-role has failed repeatedly. Will retry after cooldown period.`
    )
  }

  // No await before the in-flight entry is registered, or concurrent callers
  // would each slip past the check above.
  const promise = (async () => {
    const region = options.region || await getDefaultRegion(environment)
    return assumeRoleImpl(accountId, region, environment, options.sessionName)
  })()
    .then((credentials) => {
      assumeRoleCircuitBreaker.recordSuccess(accountId)
      assumedCredentialCache.set(key, credentials)
      return credentials
    })
    .catch((error) => {
      assumeRoleCircuitBreaker.recordFailure(accountId, error as Error)
      throw error
    })
    .finally(() => {
      inflightAssumeRole.delete(key)
    })

  inflightAssumeRole.set(key, promise)
  return promise
}

// Outbound HTTP timeouts. The SDK default waits forever on a stalled socket,
// so one hung AWS endpoint could pin a request or a cron job indefinitely.
// requestTimeout is socket inactivity, not total duration, so long paginated
// or streaming calls are unaffected as long as bytes keep arriving. Timeouts
// are retried by the SDK like any other transient error.
const DEFAULT_CONNECTION_TIMEOUT_MS = 5_000
const DEFAULT_REQUEST_TIMEOUT_MS = 120_000
// Bedrock can think for minutes before the first byte of a large completion.
const LONG_REQUEST_TIMEOUT_MS = 300_000
const LONG_REQUEST_SERVICES = new Set<AWSServiceType>(['bedrock-runtime', 'bedrock-agent-runtime'])

function readPositiveIntEnv(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? '', 10)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

export function getRequestHandlerTimeouts(service: AWSServiceType): { connectionTimeout: number, requestTimeout: number } {
  const requestTimeout = LONG_REQUEST_SERVICES.has(service)
    ? readPositiveIntEnv('AWS_SDK_LONG_REQUEST_TIMEOUT_MS', LONG_REQUEST_TIMEOUT_MS)
    : readPositiveIntEnv('AWS_SDK_REQUEST_TIMEOUT_MS', DEFAULT_REQUEST_TIMEOUT_MS)
  return {
    connectionTimeout: readPositiveIntEnv('AWS_SDK_CONNECTION_TIMEOUT_MS', DEFAULT_CONNECTION_TIMEOUT_MS),
    requestTimeout
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
  const targetRegion = region || await getDefaultRegion(environment)

  // Critical validation: Ensure region matches the partition
  validateRegionForPartition(targetRegion, environment)

  // Check cache first
  const cacheKey = getCacheKey(environment, service, targetRegion, accountId)
  const cachedEntry = clientCache.get(cacheKey)

  // Return cached client if it exists and credentials haven't expired
  if (cachedEntry) {
    // Check if credentials have expired (with 5 minute buffer)
    if (!cachedEntry.expiration || cachedEntry.expiration > new Date(Date.now() + 5 * 60 * 1000)) {
      return cachedEntry.client
    } else {
      // Remove expired client from cache
      clientCache.delete(cacheKey)
      logger.debug(`[AWS Client Factory] Removed expired client: ${service}/${environment}/${targetRegion}`)
    }
  }

  // Log NEW client creation only (not cache hits)
  const nodeEnv = process.env.NODE_ENV?.toLowerCase()
  if (process.env.AWS_DEBUG === 'true' || nodeEnv === 'development' || nodeEnv === 'dev') {
    logger.debug(`[AWS Client Factory] Creating ${service} client for ${environment}/${targetRegion}${accountId ? ` (account: ${accountId})` : ''}`)
  }
  
  // Get appropriate credentials
  let credentials: AWSCredentials | undefined
  let credentialExpiration: Date | undefined

  if (accountId) {
    try {
      credentials = await getAssumedRoleCredentials(environment, accountId, {
        region: targetRegion,
        sessionName
      })
      credentialExpiration = credentials.expiration
    } catch (error) {
      if ((error as Error).message?.startsWith('Circuit breaker OPEN')) {
        throw error
      }
      const enhancedError = new Error(
        `Failed to get AWS credentials for ${environment} environment. ` +
        `Region: ${targetRegion}, Service: ${service}. ` +
        `Original error: ${(error as Error).message}. ` +
        `HINT: Check if you're using ${environment} credentials with a ${environment} region.`
      )
      enhancedError.cause = error
      throw enhancedError
    }
  } else {
    credentials = getBaseCredentials(environment)
  }
  
  // Get the client class
  const ClientClass = SERVICE_CLIENT_MAP[service]
  if (!ClientClass) {
    throw new Error(`Unsupported service: ${service}`)
  }

  // Create the client with FIPS endpoints for GovCloud
  const clientConfig: any = {
    region: targetRegion,
    credentials,
    requestHandler: getRequestHandlerTimeouts(service)
  }

  // Cost Explorer has no GovCloud FIPS endpoint; using one fails DNS resolution.
  if (environment === 'govcloud' && service !== 'cost-explorer') {
    clientConfig.useFipsEndpoint = true
  }

  // DynamoDB: use adaptive retry strategy to handle ProvisionedThroughputExceededException
  // and ThrottlingException at the SDK level before application-level fallback kicks in.
  if (service === 'dynamodb') {
    clientConfig.maxAttempts = 10
    clientConfig.retryMode = 'adaptive'
  }

  // Config Service: use adaptive retry to reduce ThrottlingException / Rate exceeded
  // propagation. Application-level withThrottleRetry in config-service.ts adds a
  // second layer with jittered backoff before surfacing throttle errors to callers.
  if (service === 'config') {
    clientConfig.maxAttempts = 4
    clientConfig.retryMode = 'adaptive'
  }

  const client = new ClientClass(clientConfig)

  // Cost Explorer bills per request; count calls so the spend is visible.
  if (service === 'cost-explorer') {
    (client as CostExplorerClient).middlewareStack.add(awsApiCallCounterMiddleware('cost-explorer') as any, {
      step: 'initialize',
      name: 'ghostCostExplorerCallCounter'
    })
  }
  
  // Cache the client with expiration tracking
  clientCache.set(cacheKey, {
    client,
    expiration: credentialExpiration
  })

  return client as T
}

/**
 * Clear expired clients from cache
 */
export function clearExpiredClients(): number {
  let cleared = 0
  const now = new Date()
  
  for (const [key, entry] of clientCache.entries()) {
    if (entry.expiration && entry.expiration <= now) {
      clientCache.delete(key)
      cleared++
    }
  }
  
  if (cleared > 0) {
    logger.info(`[AWS Client Factory] Cleared ${cleared} expired clients from cache`)
  }
  
  return cleared
}

/**
 * Clear all cached clients
 */
export function clearAllClients(): void {
  const size = clientCache.size
  clientCache.clear()
  assumedCredentialCache.clear()
  logger.info(`[AWS Client Factory] Cleared all ${size} clients from cache`)
}

// Set up periodic cleanup of expired clients (every 5 minutes)
if (typeof setInterval !== 'undefined') {
  const intervalId = setInterval(() => {
    clearExpiredClients()
  }, 5 * 60 * 1000)
  
  // Prevent the interval from keeping the process alive
  if (intervalId.unref) {
    intervalId.unref()
  }
}

/**
 * Convenience functions for specific services
 */
export async function getDynamoDBClient(
  environment: AWSEnvironmentType = 'govcloud',
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
  environment: AWSEnvironmentType = 'govcloud',
  region?: string,
  accountId?: string
): Promise<EC2Client> {
  return getClient(environment, 'ec2', region, accountId)
}

export async function getIAMClient(
  environment: AWSEnvironmentType = 'govcloud',
  region?: string,
  accountId?: string
): Promise<IAMClient> {
  return getClient(environment, 'iam', region, accountId)
}

export async function getS3Client(
  environment: AWSEnvironmentType = 'govcloud',
  region?: string,
  accountId?: string
): Promise<S3Client> {
  return getClient(environment, 's3', region, accountId)
}

export async function getSTSClient(
  environment: AWSEnvironmentType = 'govcloud',
  region?: string,
  accountId?: string
): Promise<STSClient> {
  return getClient(environment, 'sts', region, accountId)
}

export async function getCloudWatchClient(
  environment: AWSEnvironmentType = 'govcloud',
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

export async function getBedrockClient(
  environment: AWSEnvironmentType = 'govcloud',
  region?: string,
  accountId?: string
): Promise<BedrockClient> {
  return getClient(environment, 'bedrock', region, accountId)
}

export async function getConfigServiceClient(
  environment: AWSEnvironmentType = 'govcloud',
  region?: string,
  accountId?: string
): Promise<ConfigServiceClient> {
  return getClient(environment, 'config', region, accountId)
}

export async function getComputeOptimizerClient(
  environment: AWSEnvironmentType = 'govcloud',
  region?: string,
  accountId?: string
): Promise<ComputeOptimizerClient> {
  return getClient(environment, 'compute-optimizer', region, accountId)
}

export async function getSecurityLakeClient(
  environment: AWSEnvironmentType = 'govcloud',
  region?: string,
  accountId?: string
): Promise<SecurityLakeClient> {
  return getClient(environment, 'securitylake', region, accountId)
}

export async function getAthenaClient(
  environment: AWSEnvironmentType = 'govcloud',
  region?: string,
  accountId?: string
): Promise<AthenaClient> {
  return getClient(environment, 'athena', region, accountId)
}

export async function getPricingClient(
  environment: AWSEnvironmentType = 'commercial',
  region?: string,
  accountId?: string
): Promise<PricingClient> {
  // Pricing API is only available in us-east-1
  return getClient(environment, 'pricing', 'us-east-1', accountId)
}

/**
 * Clear all cached clients
 */
export function clearClientCache(): void {
  if (process.env.AWS_DEBUG === 'true') {
    logger.info(`[AWS Client Factory] Clearing ${clientCache.size} cached clients`)
  }
  clientCache.clear()
  assumedCredentialCache.clear()
}

/**
 * Validate AWS configuration on startup
 */
export function validateAWSConfiguration(): void {
  const errors: string[] = []
  const warnings: string[] = []
  
  // Check commercial configuration
  if (hasCredentials('commercial')) {
    const commercialRegion = process.env.AWS_COMMERCIAL_REGION
    if (commercialRegion) {
      const partition = getPartitionFromRegion(commercialRegion)
      if (partition !== 'commercial' && partition !== null) {
        errors.push(
          `AWS_COMMERCIAL_REGION is set to "${commercialRegion}" which is a ${partition} region. ` +
          `This WILL cause authentication errors that appear as invalid/expired credentials.`
        )
      } else if (partition === null) {
        warnings.push(
          `AWS_COMMERCIAL_REGION is set to "${commercialRegion}" which may not be a valid AWS region.`
        )
      }
    }
  }
  
  // Check GovCloud configuration
  if (hasCredentials('govcloud')) {
    const govcloudRegion = process.env.AWS_GOVCLOUD_REGION
    if (govcloudRegion) {
      const partition = getPartitionFromRegion(govcloudRegion)
      if (partition !== 'govcloud' && partition !== null) {
        errors.push(
          `AWS_GOVCLOUD_REGION is set to "${govcloudRegion}" which is a ${partition} region. ` +
          `This WILL cause authentication errors that appear as invalid/expired credentials.`
        )
      } else if (partition === null) {
        warnings.push(
          `AWS_GOVCLOUD_REGION is set to "${govcloudRegion}" which may not be a valid AWS GovCloud region.`
        )
      }
    }
  }
  
  // Check for cross-partition misconfigurations
  const commercialKey = process.env.AWS_COMMERCIAL_ACCESS_KEY_ID
  const govcloudKey = process.env.AWS_GOVCLOUD_ACCESS_KEY_ID
  
  if (commercialKey && govcloudKey && commercialKey === govcloudKey) {
    errors.push(
      `AWS_COMMERCIAL_ACCESS_KEY_ID and AWS_GOVCLOUD_ACCESS_KEY_ID are the same. ` +
      `These should be different credentials for different AWS partitions.`
    )
  }
  
  // Output results
  if (errors.length > 0) {
    logger.error('[AWS Client Factory] ❌ CRITICAL configuration errors detected:')
    errors.forEach(error => logger.error(`  ⚠️  ${error}`))
    logger.error('These WILL cause authentication failures. Please fix immediately.')
  }
  
  if (warnings.length > 0) {
    logger.warn('[AWS Client Factory] ⚠️  Configuration warnings:')
    warnings.forEach(warning => logger.warn(`  - ${warning}`))
  }
  
  if (errors.length === 0 && warnings.length === 0 && process.env.AWS_DEBUG === 'true') {
    logger.debug('[AWS Client Factory] ✅ AWS configuration validated successfully')
  }
}

/**
 * Get current AWS account ID for an environment
 */
export async function getAccountId(
  environment: AWSEnvironmentType = 'govcloud'
): Promise<string> {
  const stsClient = await getSTSClient(environment)
  const { GetCallerIdentityCommand } = await import('@aws-sdk/client-sts')
  const response = await stsClient.send(new GetCallerIdentityCommand({}))
  return response.Account!
}

/**
 * Get SES client
 * Note: SES is in Account A (org account) with production email validation
 */
export async function getSESClient(
  environment: AWSEnvironmentType = 'govcloud',
  region?: string,
  accountId?: string
): Promise<SESClient> {
  return getClient(environment, 'ses', region, accountId)
}

export async function getSSMClient(
  environment: AWSEnvironmentType = 'govcloud',
  region?: string,
  accountId?: string
): Promise<SSMClient> {
  return getClient(environment, 'ssm', region, accountId)
}

export async function getInspector2Client(
  environment: AWSEnvironmentType = 'govcloud',
  region?: string,
  accountId?: string
): Promise<Inspector2Client> {
  return getClient(environment, 'inspector2', region, accountId)
}

export async function getCloudWatchLogsClient(
  environment: AWSEnvironmentType = 'govcloud',
  region?: string,
  accountId?: string
): Promise<CloudWatchLogsClient> {
  return getClient(environment, 'cloudwatch-logs', region, accountId)
}

export async function getResourceGroupsTaggingClient(
  environment: AWSEnvironmentType = 'commercial',
  region?: string,
  accountId?: string
): Promise<ResourceGroupsTaggingAPIClient> {
  return getClient(environment, 'resource-groups-tagging', region, accountId)
}

export async function getBillingClient(
  environment: AWSEnvironmentType = 'commercial',
  region?: string,
  accountId?: string
): Promise<BillingClient> {
  return getClient(environment, 'billing', region, accountId)
}

// Export validation functions for testing
export { validateRegionForPartition, getPartitionFromRegion }
