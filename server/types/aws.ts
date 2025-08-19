/**
 * AWS-specific type definitions
 */

export type AWSEnvironmentType = 'commercial' | 'govcloud'

export type AWSServiceType = 
  | 'dynamodb'
  | 'cost-explorer'
  | 'ec2'
  | 'iam'
  | 's3'
  | 'sts'
  | 'cloudwatch'
  | 'organizations'
  | 'sso-admin'
  | 'sso'
  | 'lambda'
  | 'cloudformation'
  | 'cloudtrail'
  | 'config'
  | 'guardduty'
  | 'securityhub'
  | 'ram'
  | 'bedrock-runtime'

export interface AWSClientOptions {
  environment: AWSEnvironmentType
  service: AWSServiceType
  region?: string
  accountId?: string
  roleSessionName?: string
}

export interface AssumeRoleConfig {
  roleArn: string
  roleSessionName: string
  region: string
  externalId?: string
  durationSeconds?: number
}

export interface AccountInfo {
  // Primary identifier (Commercial account ID from Organizations)
  accountId: string
  
  // From Organizations (Commercial)
  accountName?: string
  accountEmail?: string
  accountStatus?: string
  organizationArn?: string
  joinedMethod?: string
  joinedTimestamp?: string
  parentId?: string
  organizationalUnit?: string
  
  // From DynamoDB metadata (GovCloud)
  govCloudAccountId?: string  // Only present if account has GovCloud pairing
  requestID?: string
  projectCode?: string
  costCenter?: string
  technicalContact?: string
  businessContact?: string
  environment?: string  // dev, test, prod, etc.
  accountType?: 'commercial-only' | 'govcloud-paired'
  createdDate?: string
  modifiedDate?: string
  tags?: Record<string, string>
  
  // Computed fields
  hasGovCloud?: boolean  // true if govCloudAccountId is present
}

export interface AccountLookupCriteria {
  accountId?: string           // Commercial account ID (primary)
  govCloudAccountId?: string   // GovCloud account ID
  requestID?: string          // Request/ticket ID
  accountEmail?: string       // Account email address
  accountName?: string        // Account name (partial match)
  projectCode?: string        // Project code
}

export interface AWSCredentials {
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
}

export interface AWSConfigEnvironment {
  type: AWSEnvironmentType
  region: string
  credentials: AWSCredentials
  assumeRoleName?: string
  assumeRoleExternalId?: string
  organizationsAccountId?: string
}

export interface AWSGlobalConfig {
  commercial?: AWSConfigEnvironment
  govcloud?: AWSConfigEnvironment
  accountsTableName: string
  assumeRoleSessionDuration: number
}