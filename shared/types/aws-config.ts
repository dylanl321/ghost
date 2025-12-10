/**
 * AWS Config Type Definitions
 *
 * Types for AWS Config service integration - resource inventory,
 * compliance tracking, and configuration history.
 */

// ============================================================================
// AWS Config Resource Types
// ============================================================================

/**
 * Common AWS resource types tracked by Config
 * This is a subset - Config supports 100+ resource types
 */
export const AWS_CONFIG_RESOURCE_TYPES = [
  // Compute
  'AWS::EC2::Instance',
  'AWS::EC2::Volume',
  'AWS::EC2::SecurityGroup',
  'AWS::EC2::NetworkInterface',
  'AWS::EC2::EIP',
  'AWS::Lambda::Function',
  'AWS::ECS::Cluster',
  'AWS::ECS::Service',
  'AWS::ECS::TaskDefinition',
  'AWS::AutoScaling::AutoScalingGroup',

  // Storage
  'AWS::S3::Bucket',
  'AWS::EBS::Volume',
  'AWS::EFS::FileSystem',

  // Database
  'AWS::RDS::DBInstance',
  'AWS::RDS::DBCluster',
  'AWS::RDS::DBSnapshot',
  'AWS::DynamoDB::Table',
  'AWS::ElastiCache::CacheCluster',

  // Networking
  'AWS::EC2::VPC',
  'AWS::EC2::Subnet',
  'AWS::EC2::RouteTable',
  'AWS::EC2::InternetGateway',
  'AWS::EC2::NatGateway',
  'AWS::EC2::VPCPeeringConnection',
  'AWS::ElasticLoadBalancingV2::LoadBalancer',
  'AWS::ElasticLoadBalancingV2::TargetGroup',
  'AWS::CloudFront::Distribution',
  'AWS::Route53::HostedZone',

  // Security & Identity
  'AWS::IAM::User',
  'AWS::IAM::Role',
  'AWS::IAM::Policy',
  'AWS::IAM::Group',
  'AWS::KMS::Key',
  'AWS::SecretsManager::Secret',
  'AWS::ACM::Certificate',
  'AWS::WAFv2::WebACL',

  // Management & Governance
  'AWS::CloudWatch::Alarm',
  'AWS::CloudTrail::Trail',
  'AWS::SNS::Topic',
  'AWS::SQS::Queue',
  'AWS::Config::ConfigRule',
  'AWS::Config::ConfigurationRecorder',

  // Analytics
  'AWS::Kinesis::Stream',
  'AWS::Redshift::Cluster',
  'AWS::Athena::WorkGroup',
] as const

export type AWSConfigResourceType = typeof AWS_CONFIG_RESOURCE_TYPES[number] | string

// ============================================================================
// Compliance Status Types
// ============================================================================

/**
 * Config rule compliance status
 */
export type ConfigComplianceStatus =
  | 'COMPLIANT'
  | 'NON_COMPLIANT'
  | 'NOT_APPLICABLE'
  | 'INSUFFICIENT_DATA'

/**
 * Compliance evaluation result
 */
export interface ComplianceEvaluation {
  complianceResourceType: string
  complianceResourceId: string
  complianceType: ConfigComplianceStatus
  annotation?: string  // Reason for compliance status
  orderingTimestamp: Date
  configRuleInvokedTime: Date
}

// ============================================================================
// Configuration Item Types
// ============================================================================

/**
 * AWS Config configuration item (resource snapshot)
 */
export interface ConfigurationItem {
  version: string
  accountId: string
  configurationItemCaptureTime: string
  configurationItemStatus: 'OK' | 'ResourceDiscovered' | 'ResourceNotRecorded' | 'ResourceDeleted' | 'ResourceDeletedNotRecorded'
  configurationStateId: string
  arn: string
  resourceType: AWSConfigResourceType
  resourceId: string
  resourceName?: string
  awsRegion: string
  availabilityZone?: string
  resourceCreationTime?: string
  tags?: Record<string, string>
  relatedEvents?: string[]
  relationships?: Array<{
    resourceType: string
    resourceId: string
    resourceName?: string
    relationshipName: string
  }>
  configuration?: string  // JSON string of resource configuration
  supplementaryConfiguration?: Record<string, string>
}

// ============================================================================
// Config Rule Types
// ============================================================================

/**
 * AWS Config rule definition
 */
export interface ConfigRule {
  configRuleName: string
  configRuleArn: string
  configRuleId: string
  description?: string
  scope?: {
    complianceResourceTypes?: string[]
    tagKey?: string
    tagValue?: string
  }
  source: {
    owner: 'AWS' | 'CUSTOM_LAMBDA' | 'CUSTOM_POLICY'
    sourceIdentifier: string
    sourceDetails?: Array<{
      eventSource: string
      messageType: string
      maximumExecutionFrequency?: string
    }>
  }
  inputParameters?: string  // JSON string
  maximumExecutionFrequency?:
    | 'One_Hour'
    | 'Three_Hours'
    | 'Six_Hours'
    | 'Twelve_Hours'
    | 'TwentyFour_Hours'
  configRuleState?: 'ACTIVE' | 'DELETING' | 'DELETING_RESULTS' | 'EVALUATING'
  createdBy?: string
}

// ============================================================================
// Aggregated Compliance Types
// ============================================================================

/**
 * Compliance summary by resource type
 */
export interface ComplianceSummaryByResourceType {
  resourceType: string
  compliantResourceCount: number
  nonCompliantResourceCount: number
  totalResourceCount: number
  compliancePercentage: number
}

/**
 * Compliance summary by config rule
 */
export interface ComplianceSummaryByConfigRule {
  configRuleName: string
  compliantResourceCount: number
  nonCompliantResourceCount: number
  totalResourceCount: number
  compliancePercentage: number
}

// ============================================================================
// Query Types
// ============================================================================

/**
 * Config aggregator query filters
 */
export interface ConfigAggregatorFilters {
  accountIds?: string[]
  regions?: string[]
  resourceTypes?: AWSConfigResourceType[]
  complianceType?: ConfigComplianceStatus
  configRuleNames?: string[]
}

/**
 * Resource inventory query result
 */
export interface ResourceInventoryResult {
  resources: Array<{
    accountId: string
    region: string
    resourceType: AWSConfigResourceType
    resourceId: string
    resourceName?: string
    tags?: Record<string, string>
    configurationItemCaptureTime: string
    complianceStatus?: ConfigComplianceStatus
    complianceRules?: string[]
  }>
  totalCount: number
  nextToken?: string
}

/**
 * Compliance details query result
 */
export interface ComplianceDetailsResult {
  evaluations: Array<{
    accountId: string
    region: string
    configRuleName: string
    resourceType: string
    resourceId: string
    complianceType: ConfigComplianceStatus
    annotation?: string
    orderingTimestamp: string
  }>
  totalCount: number
  nextToken?: string
}

// ============================================================================
// Advanced Query Types (Config SQL)
// ============================================================================

/**
 * Config advanced query (SQL-like syntax)
 */
export interface ConfigAdvancedQuery {
  /**
   * SQL-like query string
   * Example: "SELECT resourceId, resourceType WHERE resourceType = 'AWS::EC2::Instance'"
   */
  expression: string

  /**
   * Maximum number of results (1-500)
   */
  limit?: number

  /**
   * Pagination token
   */
  nextToken?: string
}

/**
 * Advanced query result
 */
export interface ConfigAdvancedQueryResult {
  queryInfo: {
    selectFields?: string[]
  }
  results: Array<Record<string, any>>
  nextToken?: string
}

// ============================================================================
// Conformance Pack Types
// ============================================================================

/**
 * Config conformance pack (compliance framework)
 */
export interface ConformancePack {
  conformancePackName: string
  conformancePackArn: string
  conformancePackId: string
  deliveryS3Bucket?: string
  deliveryS3KeyPrefix?: string
  conformancePackInputParameters?: Array<{
    parameterName: string
    parameterValue: string
  }>
  lastUpdateRequestedTime?: string
  createdBy?: string
}

/**
 * Conformance pack compliance summary
 */
export interface ConformancePackComplianceSummary {
  conformancePackName: string
  conformancePackComplianceStatus: 'COMPLIANT' | 'NON_COMPLIANT' | 'INSUFFICIENT_DATA'
  compliantRuleCount: number
  nonCompliantRuleCount: number
  totalRuleCount: number
}

// ============================================================================
// Common Config Rule Identifiers (AWS Managed)
// ============================================================================

/**
 * Common AWS managed Config rules
 */
export const COMMON_CONFIG_RULES = {
  // Security
  ROOT_ACCOUNT_MFA_ENABLED: 'root-account-mfa-enabled',
  IAM_USER_MFA_ENABLED: 'iam-user-mfa-enabled',
  IAM_PASSWORD_POLICY: 'iam-password-policy',
  ACCESS_KEYS_ROTATED: 'access-keys-rotated',
  IAM_USER_UNUSED_CREDENTIALS_CHECK: 'iam-user-unused-credentials-check',

  // Encryption
  S3_BUCKET_SERVER_SIDE_ENCRYPTION_ENABLED: 's3-bucket-server-side-encryption-enabled',
  EBS_ENCRYPTED_VOLUMES: 'ec2-ebs-encryption-by-default',
  RDS_STORAGE_ENCRYPTED: 'rds-storage-encrypted',
  ENCRYPTED_VOLUMES: 'encrypted-volumes',

  // Network Security
  VPC_SG_OPEN_ONLY_TO_AUTHORIZED_PORTS: 'vpc-sg-open-only-to-authorized-ports',
  RESTRICTED_SSH: 'restricted-ssh',
  RESTRICTED_COMMON_PORTS: 'restricted-common-ports',
  VPC_FLOW_LOGS_ENABLED: 'vpc-flow-logs-enabled',

  // Logging & Monitoring
  CLOUDTRAIL_ENABLED: 'cloud-trail-enabled',
  CLOUDTRAIL_ENCRYPTION_ENABLED: 'cloud-trail-encryption-enabled',
  CLOUDWATCH_ALARM_ACTION_CHECK: 'cloudwatch-alarm-action-check',
  S3_BUCKET_LOGGING_ENABLED: 's3-bucket-logging-enabled',

  // Resource Management
  EC2_INSTANCE_MANAGED_BY_SSM: 'ec2-instance-managed-by-systems-manager',
  EC2_INSTANCE_NO_PUBLIC_IP: 'ec2-instance-no-public-ip',
  RDS_MULTI_AZ_SUPPORT: 'rds-multi-az-support',
  RDS_SNAPSHOTS_PUBLIC_PROHIBITED: 'rds-snapshots-public-prohibited',

  // Backup & DR
  BACKUP_RECOVERY_POINT_MANUAL_DELETION_DISABLED: 'backup-recovery-point-manual-deletion-disabled',
  BACKUP_PLAN_MIN_FREQUENCY_AND_MIN_RETENTION_CHECK: 'backup-plan-min-frequency-and-min-retention-check',
  DB_LAST_BACKUP_RECOVERY_POINT_CREATED: 'db-last-backup-recovery-point-created',
} as const
