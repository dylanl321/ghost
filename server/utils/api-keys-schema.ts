/**
 * API Keys DynamoDB Table Schema
 * Defines the table structure for API key storage
 */

/**
 * DynamoDB table schema for API keys
 */
export const API_KEYS_TABLE_SCHEMA = {
  TableName: process.env.DYNAMODB_API_KEYS_TABLE || 'ghost-api-keys',
  
  KeySchema: [
    {
      AttributeName: 'id',
      KeyType: 'HASH'  // Partition key
    }
  ],
  
  AttributeDefinitions: [
    {
      AttributeName: 'id',
      AttributeType: 'S'
    },
    {
      AttributeName: 'createdBy',
      AttributeType: 'S'
    },
    {
      AttributeName: 'isActive',
      AttributeType: 'S'  // Using string for GSI
    }
  ],
  
  GlobalSecondaryIndexes: [
    {
      IndexName: 'CreatedByIndex',
      KeySchema: [
        {
          AttributeName: 'createdBy',
          KeyType: 'HASH'
        }
      ],
      Projection: {
        ProjectionType: 'ALL'
      },
      BillingMode: 'PAY_PER_REQUEST'
    },
    {
      IndexName: 'ActiveKeysIndex',
      KeySchema: [
        {
          AttributeName: 'isActive',
          KeyType: 'HASH'
        }
      ],
      Projection: {
        ProjectionType: 'ALL'
      },
      BillingMode: 'PAY_PER_REQUEST'
    }
  ],
  
  BillingMode: 'PAY_PER_REQUEST',
  
  StreamSpecification: {
    StreamEnabled: false
  },
  
  SSESpecification: {
    SSEEnabled: true
  },
  
  PointInTimeRecoverySpecification: {
    PointInTimeRecoveryEnabled: true
  },
  
  Tags: [
    {
      Key: 'Project',
      Value: 'GhostAWSDashboard'
    },
    {
      Key: 'Component',
      Value: 'APIKeys'
    },
    {
      Key: 'Environment',
      Value: process.env.NODE_ENV || 'development'
    }
  ]
}

/**
 * CloudFormation template for API keys table
 */
export const API_KEYS_CLOUDFORMATION_TEMPLATE = {
  AWSTemplateFormatVersion: '2010-09-09',
  Description: 'DynamoDB table for Ghost Dashboard API keys',
  
  Parameters: {
    Environment: {
      Type: 'String',
      Default: 'dev',
      AllowedValues: ['dev', 'staging', 'prod'],
      Description: 'Environment name'
    }
  },
  
  Resources: {
    ApiKeysTable: {
      Type: 'AWS::DynamoDB::Table',
      Properties: API_KEYS_TABLE_SCHEMA,
      DeletionPolicy: 'Retain'
    }
  },
  
  Outputs: {
    ApiKeysTableName: {
      Description: 'Name of the API keys DynamoDB table',
      Value: { Ref: 'ApiKeysTable' },
      Export: {
        Name: { 'Fn::Sub': '${AWS::StackName}-ApiKeysTable' }
      }
    },
    ApiKeysTableArn: {
      Description: 'ARN of the API keys DynamoDB table',
      Value: { 'Fn::GetAtt': ['ApiKeysTable', 'Arn'] },
      Export: {
        Name: { 'Fn::Sub': '${AWS::StackName}-ApiKeysTableArn' }
      }
    }
  }
}

/**
 * Required IAM permissions for API key operations
 */
export const API_KEYS_IAM_PERMISSIONS = {
  Version: '2012-10-17',
  Statement: [
    {
      Effect: 'Allow',
      Action: [
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:DeleteItem',
        'dynamodb:Scan',
        'dynamodb:Query'
      ],
      Resource: [
        `arn:aws:dynamodb:*:*:table/${process.env.DYNAMODB_API_KEYS_TABLE || 'ghost-api-keys'}`,
        `arn:aws:dynamodb:*:*:table/${process.env.DYNAMODB_API_KEYS_TABLE || 'ghost-api-keys'}/index/*`
      ]
    }
  ]
}

/**
 * Environment variables needed for API key storage
 * Note: This is a simple constant definition. For validation with metadata,
 * use the API_KEYS_ENV_VARS from entra/validation.ts
 */
export const API_KEYS_ENV_VARS_SIMPLE = {
  DYNAMODB_API_KEYS_TABLE: 'ghost-api-keys',
  API_KEYS_STORAGE_ENV: 'commercial'  // or 'govcloud'
} as const