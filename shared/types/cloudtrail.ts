/**
 * AWS CloudTrail Type Definitions
 *
 * Types for AWS CloudTrail integration - API activity logging,
 * audit trail, and event history.
 */

// ============================================================================
// Event Types
// ============================================================================

/**
 * CloudTrail event types
 */
export type CloudTrailEventType =
  | 'AwsApiCall'            // API call made by user/service
  | 'AwsServiceEvent'       // Event initiated by AWS service
  | 'AwsConsoleSignIn'      // Console sign-in event
  | 'AwsConsoleAction'      // Action performed in console

/**
 * Complete CloudTrail event structure
 */
export interface CloudTrailEvent {
  // Event identification
  eventVersion: string
  eventId: string
  eventName: string
  eventType: CloudTrailEventType
  eventTime: string  // ISO 8601
  eventSource: string  // Service (e.g., 's3.amazonaws.com', 'iam.amazonaws.com')

  // Account and region
  awsRegion: string
  recipientAccountId?: string  // Account that received the event

  // User identity
  userIdentity: UserIdentity

  // Request details
  requestID?: string
  requestParameters?: Record<string, any>  // API request parameters
  responseElements?: Record<string, any>   // API response elements

  // Additional event data
  additionalEventData?: Record<string, any>
  serviceEventDetails?: Record<string, any>

  // Resources
  resources?: Array<{
    resourceType: string
    resourceName?: string
    ARN?: string
    accountId?: string
  }>

  // Network
  sourceIPAddress?: string
  userAgent?: string

  // Error information
  errorCode?: string
  errorMessage?: string

  // Event attributes
  readOnly?: boolean  // True for read operations, false for write
  managementEvent?: boolean  // True for management plane events
  eventCategory?: 'Management' | 'Data' | 'Insight'

  // Session context (for assumed roles)
  sessionCredentialFromConsole?: string

  // CloudTrail metadata
  sharedEventID?: string  // Links events across accounts
  vpcEndpointId?: string
  edgeDeviceDetails?: {
    deviceId?: string
    deviceName?: string
  }

  // API version
  apiVersion?: string

  // TLS details
  tlsDetails?: {
    tlsVersion?: string
    cipherSuite?: string
    clientProvidedHostHeader?: string
  }

  // Additional metadata
  insightDetails?: {
    state?: string
    eventSource?: string
    eventName?: string
    insightType?: string
    insightContext?: Record<string, any>
  }
}

// ============================================================================
// User Identity Types
// ============================================================================

/**
 * User identity information
 */
export interface UserIdentity {
  /**
   * Type of identity
   */
  type: 'Root' | 'IAMUser' | 'AssumedRole' | 'FederatedUser' | 'AWSAccount' | 'AWSService' | 'SAMLUser' | 'WebIdentityUser' | 'Directory' | 'Unknown'

  /**
   * Principal ID (unique identifier)
   */
  principalId?: string

  /**
   * ARN of the user/role
   */
  arn?: string

  /**
   * Account ID
   */
  accountId?: string

  /**
   * Access key ID (for IAM user/role)
   */
  accessKeyId?: string

  /**
   * User name (for IAM user)
   */
  userName?: string

  /**
   * Session context (for assumed roles/federated users)
   */
  sessionContext?: {
    sessionIssuer?: {
      type?: string
      principalId?: string
      arn?: string
      accountId?: string
      userName?: string
    }
    webIdFederationData?: {
      federatedProvider?: string
      attributes?: Record<string, string>
    }
    attributes?: {
      creationDate?: string
      mfaAuthenticated?: string  // 'true' | 'false'
    }
    sourceIdentity?: string
  }

  /**
   * Invoked by (for service-to-service calls)
   */
  invokedBy?: string

  /**
   * Identity provider (for federated/SAML users)
   */
  identityProvider?: string
}

// ============================================================================
// Lookup Attributes
// ============================================================================

/**
 * Attribute keys for CloudTrail event lookup
 */
export type LookupAttributeKey =
  | 'EventId'
  | 'EventName'
  | 'ReadOnly'
  | 'Username'
  | 'ResourceType'
  | 'ResourceName'
  | 'EventSource'
  | 'AccessKeyId'

/**
 * Lookup attribute for filtering events
 */
export interface LookupAttribute {
  attributeKey: LookupAttributeKey
  attributeValue: string
}

// ============================================================================
// Event Selectors (Trail Configuration)
// ============================================================================

/**
 * Data event selector
 */
export interface DataResource {
  /**
   * Resource type (e.g., 'AWS::S3::Object', 'AWS::Lambda::Function')
   */
  type: string

  /**
   * Resource values (ARNs or patterns)
   * Examples:
   * - 'arn:aws:s3:::my-bucket/*' (all objects in bucket)
   * - 'arn:aws:s3:::*\/*' (all S3 objects)
   * - 'arn:aws:lambda:*:*:function/*' (all Lambda functions)
   */
  values: string[]
}

/**
 * Event selector for trail
 */
export interface EventSelector {
  /**
   * Read/write type
   */
  readWriteType?: 'ReadOnly' | 'WriteOnly' | 'All'

  /**
   * Include management events
   */
  includeManagementEvents?: boolean

  /**
   * Data resources to log
   */
  dataResources?: DataResource[]

  /**
   * Exclude AWS KMS events (reduces volume)
   */
  excludeManagementEventSources?: string[]  // e.g., ['kms.amazonaws.com', 'rdsdata.amazonaws.com']
}

// ============================================================================
// Insight Selectors
// ============================================================================

/**
 * CloudTrail Insights (anomaly detection)
 */
export type InsightType = 'ApiCallRateInsight' | 'ApiErrorRateInsight'

/**
 * Insight selector
 */
export interface InsightSelector {
  insightType: InsightType
}

/**
 * Insight event
 */
export interface InsightEvent {
  insightType: InsightType
  insightContext: {
    /**
     * Statistics for baseline (normal) behavior
     */
    baseline: {
      averageValue: number
    }

    /**
     * Statistics for insight (anomalous) behavior
     */
    insight: {
      averageValue: number
    }

    /**
     * Duration of anomaly
     */
    insightDuration?: number
  }
  eventSource: string
  eventName: string
  insightStartTime: string
  insightEndTime?: string
}

// ============================================================================
// Common Event Names by Service
// ============================================================================

/**
 * Common CloudTrail event names organized by service
 */
export const COMMON_EVENT_NAMES = {
  // IAM
  IAM: {
    CREATE_USER: 'CreateUser',
    DELETE_USER: 'DeleteUser',
    CREATE_ACCESS_KEY: 'CreateAccessKey',
    DELETE_ACCESS_KEY: 'DeleteAccessKey',
    ATTACH_USER_POLICY: 'AttachUserPolicy',
    DETACH_USER_POLICY: 'DetachUserPolicy',
    CREATE_ROLE: 'CreateRole',
    DELETE_ROLE: 'DeleteRole',
    ASSUME_ROLE: 'AssumeRole',
    UPDATE_ASSUME_ROLE_POLICY: 'UpdateAssumeRolePolicy',
    PUT_ROLE_POLICY: 'PutRolePolicy',
    DELETE_ROLE_POLICY: 'DeleteRolePolicy',
  },

  // S3
  S3: {
    CREATE_BUCKET: 'CreateBucket',
    DELETE_BUCKET: 'DeleteBucket',
    PUT_BUCKET_POLICY: 'PutBucketPolicy',
    DELETE_BUCKET_POLICY: 'DeleteBucketPolicy',
    PUT_BUCKET_ENCRYPTION: 'PutBucketEncryption',
    DELETE_BUCKET_ENCRYPTION: 'DeleteBucketEncryption',
    PUT_BUCKET_VERSIONING: 'PutBucketVersioning',
    PUT_BUCKET_LOGGING: 'PutBucketLogging',
    PUT_PUBLIC_ACCESS_BLOCK: 'PutPublicAccessBlock',
    DELETE_PUBLIC_ACCESS_BLOCK: 'DeletePublicAccessBlock',
    GET_OBJECT: 'GetObject',
    PUT_OBJECT: 'PutObject',
    DELETE_OBJECT: 'DeleteObject',
  },

  // EC2
  EC2: {
    RUN_INSTANCES: 'RunInstances',
    TERMINATE_INSTANCES: 'TerminateInstances',
    START_INSTANCES: 'StartInstances',
    STOP_INSTANCES: 'StopInstances',
    CREATE_SECURITY_GROUP: 'CreateSecurityGroup',
    DELETE_SECURITY_GROUP: 'DeleteSecurityGroup',
    AUTHORIZE_SECURITY_GROUP_INGRESS: 'AuthorizeSecurityGroupIngress',
    REVOKE_SECURITY_GROUP_INGRESS: 'RevokeSecurityGroupIngress',
    CREATE_VPC: 'CreateVpc',
    DELETE_VPC: 'DeleteVpc',
    CREATE_SUBNET: 'CreateSubnet',
    DELETE_SUBNET: 'DeleteSubnet',
  },

  // RDS
  RDS: {
    CREATE_DB_INSTANCE: 'CreateDBInstance',
    DELETE_DB_INSTANCE: 'DeleteDBInstance',
    MODIFY_DB_INSTANCE: 'ModifyDBInstance',
    CREATE_DB_SNAPSHOT: 'CreateDBSnapshot',
    DELETE_DB_SNAPSHOT: 'DeleteDBSnapshot',
    RESTORE_DB_INSTANCE_FROM_SNAPSHOT: 'RestoreDBInstanceFromDBSnapshot',
  },

  // Lambda
  LAMBDA: {
    CREATE_FUNCTION: 'CreateFunction20150331',
    DELETE_FUNCTION: 'DeleteFunction20150331',
    UPDATE_FUNCTION_CODE: 'UpdateFunctionCode20150331v2',
    UPDATE_FUNCTION_CONFIGURATION: 'UpdateFunctionConfiguration20150331v2',
    INVOKE: 'Invoke20150331',
    ADD_PERMISSION: 'AddPermission20150331',
    REMOVE_PERMISSION: 'RemovePermission20150331',
  },

  // KMS
  KMS: {
    CREATE_KEY: 'CreateKey',
    SCHEDULE_KEY_DELETION: 'ScheduleKeyDeletion',
    DISABLE_KEY: 'DisableKey',
    ENABLE_KEY: 'EnableKey',
    ENCRYPT: 'Encrypt',
    DECRYPT: 'Decrypt',
    CREATE_GRANT: 'CreateGrant',
    REVOKE_GRANT: 'RevokeGrant',
    PUT_KEY_POLICY: 'PutKeyPolicy',
  },

  // CloudTrail
  CLOUDTRAIL: {
    CREATE_TRAIL: 'CreateTrail',
    DELETE_TRAIL: 'DeleteTrail',
    START_LOGGING: 'StartLogging',
    STOP_LOGGING: 'StopLogging',
    UPDATE_TRAIL: 'UpdateTrail',
    PUT_EVENT_SELECTORS: 'PutEventSelectors',
  },

  // Config
  CONFIG: {
    PUT_CONFIGURATION_RECORDER: 'PutConfigurationRecorder',
    DELETE_CONFIGURATION_RECORDER: 'DeleteConfigurationRecorder',
    START_CONFIGURATION_RECORDER: 'StartConfigurationRecorder',
    STOP_CONFIGURATION_RECORDER: 'StopConfigurationRecorder',
    PUT_DELIVERY_CHANNEL: 'PutDeliveryChannel',
    DELETE_DELIVERY_CHANNEL: 'DeleteDeliveryChannel',
  },

  // GuardDuty
  GUARDDUTY: {
    CREATE_DETECTOR: 'CreateDetector',
    DELETE_DETECTOR: 'DeleteDetector',
    UPDATE_DETECTOR: 'UpdateDetector',
    ARCHIVE_FINDINGS: 'ArchiveFindings',
    UNARCHIVE_FINDINGS: 'UnarchiveFindings',
  },

  // Console Sign-In
  CONSOLE: {
    CONSOLE_LOGIN: 'ConsoleLogin',
    SWITCH_ROLE: 'SwitchRole',
    CHECK_MFA: 'CheckMfa',
  },

  // STS (Security Token Service)
  STS: {
    ASSUME_ROLE: 'AssumeRole',
    ASSUME_ROLE_WITH_SAML: 'AssumeRoleWithSAML',
    ASSUME_ROLE_WITH_WEB_IDENTITY: 'AssumeRoleWithWebIdentity',
    GET_SESSION_TOKEN: 'GetSessionToken',
    GET_FEDERATION_TOKEN: 'GetFederationToken',
  },
} as const

// ============================================================================
// Event Source Mappings
// ============================================================================

/**
 * Common AWS service event sources
 */
export const EVENT_SOURCES = {
  IAM: 'iam.amazonaws.com',
  S3: 's3.amazonaws.com',
  EC2: 'ec2.amazonaws.com',
  RDS: 'rds.amazonaws.com',
  LAMBDA: 'lambda.amazonaws.com',
  KMS: 'kms.amazonaws.com',
  CLOUDTRAIL: 'cloudtrail.amazonaws.com',
  CONFIG: 'config.amazonaws.com',
  GUARDDUTY: 'guardduty.amazonaws.com',
  CLOUDWATCH: 'monitoring.amazonaws.com',
  LOGS: 'logs.amazonaws.com',
  SNS: 'sns.amazonaws.com',
  SQS: 'sqs.amazonaws.com',
  STS: 'sts.amazonaws.com',
  DYNAMODB: 'dynamodb.amazonaws.com',
  ECS: 'ecs.amazonaws.com',
  EKS: 'eks.amazonaws.com',
  ELASTICLOADBALANCING: 'elasticloadbalancing.amazonaws.com',
  AUTOSCALING: 'autoscaling.amazonaws.com',
  SIGNIN: 'signin.amazonaws.com',
} as const

// ============================================================================
// Resource Types
// ============================================================================

/**
 * Common CloudTrail resource types
 */
export const RESOURCE_TYPES = {
  S3_OBJECT: 'AWS::S3::Object',
  S3_BUCKET: 'AWS::S3::Bucket',
  LAMBDA_FUNCTION: 'AWS::Lambda::Function',
  DYNAMODB_TABLE: 'AWS::DynamoDB::Table',
  DYNAMODB_STREAM: 'AWS::DynamoDB::Stream',
  RDS_DB_INSTANCE: 'AWS::RDS::DBInstance',
  EC2_INSTANCE: 'AWS::EC2::Instance',
  IAM_ROLE: 'AWS::IAM::Role',
  IAM_USER: 'AWS::IAM::User',
  KMS_KEY: 'AWS::KMS::Key',
  SNS_TOPIC: 'AWS::SNS::Topic',
  SQS_QUEUE: 'AWS::SQS::Queue',
  SECRETS_MANAGER_SECRET: 'AWS::SecretsManager::Secret',
} as const

// ============================================================================
// Query Helpers
// ============================================================================

/**
 * CloudTrail lookup events request
 */
export interface LookupEventsRequest {
  lookupAttributes?: LookupAttribute[]
  startTime?: Date
  endTime?: Date
  maxResults?: number  // 1-50
  nextToken?: string
  eventCategory?: 'insight' | 'management' | 'data'
}

/**
 * CloudTrail lookup events response
 */
export interface LookupEventsResponse {
  events: CloudTrailEvent[]
  nextToken?: string
}

// ============================================================================
// Event Statistics
// ============================================================================

/**
 * CloudTrail event statistics
 */
export interface EventStatistics {
  totalEvents: number
  eventsByType: Record<CloudTrailEventType, number>
  eventsByService: Record<string, number>
  eventsByName: Record<string, number>
  eventsByUser: Record<string, number>
  topUsers: Array<{
    userName: string
    userType: string
    eventCount: number
  }>
  topServices: Array<{
    service: string
    eventCount: number
  }>
  topEventNames: Array<{
    eventName: string
    eventCount: number
  }>
  writeEvents: number
  readEvents: number
  errorEvents: number
  errorsByCode: Record<string, number>
  eventsByRegion: Record<string, number>
  eventsByHour: Array<{
    timestamp: string
    count: number
  }>
  suspiciousActivities?: Array<{
    type: 'UnusualAPICall' | 'HighErrorRate' | 'UnusualAccessPattern' | 'RootAccountActivity'
    description: string
    count: number
    examples: string[]
  }>
}

// ============================================================================
// Trail Configuration
// ============================================================================

/**
 * CloudTrail trail
 */
export interface Trail {
  name: string
  s3BucketName: string
  s3KeyPrefix?: string
  snsTopicName?: string
  snsTopicARN?: string
  includeGlobalServiceEvents?: boolean
  isMultiRegionTrail?: boolean
  homeRegion?: string
  trailARN?: string
  logFileValidationEnabled?: boolean
  cloudWatchLogsLogGroupArn?: string
  cloudWatchLogsRoleArn?: string
  kmsKeyId?: string
  hasCustomEventSelectors?: boolean
  hasInsightSelectors?: boolean
  isOrganizationTrail?: boolean
}

/**
 * Trail status
 */
export interface TrailStatus {
  isLogging: boolean
  latestDeliveryError?: string
  latestNotificationError?: string
  latestDeliveryTime?: Date
  latestNotificationTime?: Date
  startLoggingTime?: Date
  stopLoggingTime?: Date
  latestCloudWatchLogsDeliveryError?: string
  latestCloudWatchLogsDeliveryTime?: Date
  latestDigestDeliveryTime?: Date
  latestDigestDeliveryError?: string
  latestDeliveryAttemptTime?: string
  latestNotificationAttemptTime?: string
  latestNotificationAttemptSucceeded?: string
  latestDeliveryAttemptSucceeded?: string
  timeLoggingStarted?: string
  timeLoggingStopped?: string
}
