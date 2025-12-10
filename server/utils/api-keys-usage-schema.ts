/**
 * API Key Usage History DynamoDB Table Schema
 * Tracks all API key usage for audit and monitoring purposes
 */

/**
 * DynamoDB table schema for API key usage history
 */
export const API_KEY_USAGE_TABLE_SCHEMA = {
  TableName: process.env.DYNAMODB_API_KEY_USAGE_TABLE || 'ghost-api-keys-usage',

  KeySchema: [
    {
      AttributeName: 'keyId',
      KeyType: 'HASH'  // Partition key
    },
    {
      AttributeName: 'timestamp',
      KeyType: 'RANGE'  // Sort key
    }
  ],

  AttributeDefinitions: [
    {
      AttributeName: 'keyId',
      AttributeType: 'S'
    },
    {
      AttributeName: 'timestamp',
      AttributeType: 'S'
    },
    {
      AttributeName: 'endpoint',
      AttributeType: 'S'
    }
  ],

  GlobalSecondaryIndexes: [
    {
      IndexName: 'EndpointIndex',
      KeySchema: [
        {
          AttributeName: 'endpoint',
          KeyType: 'HASH'
        },
        {
          AttributeName: 'timestamp',
          KeyType: 'RANGE'
        }
      ],
      Projection: {
        ProjectionType: 'ALL'
      }
    }
  ],

  BillingMode: 'PAY_PER_REQUEST',

  TimeToLiveSpecification: {
    Enabled: true,
    AttributeName: 'ttl'  // Auto-delete records older than TTL
  },

  StreamSpecification: {
    StreamEnabled: false
  },

  SSESpecification: {
    SSEEnabled: true
  },

  Tags: [
    {
      Key: 'Project',
      Value: 'GhostAWSDashboard'
    },
    {
      Key: 'Component',
      Value: 'APIKeyUsage'
    },
    {
      Key: 'Environment',
      Value: process.env.NODE_ENV || 'development'
    }
  ]
}

/**
 * Environment variables needed for API key usage storage
 */
export const API_KEY_USAGE_ENV_VARS = {
  DYNAMODB_API_KEY_USAGE_TABLE: 'ghost-api-keys-usage',
  API_KEY_USAGE_RETENTION_DAYS: '90'  // Keep usage history for 90 days
} as const
