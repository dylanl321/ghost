/**
 * One-off script to create DynamoDB and SES resources for Scheduled Reports
 * This script creates the infrastructure defined in terraform/scheduled-reports.tf and terraform/ses.tf
 * Uses the AWS client factory for consistent credential management
 *
 * Usage: npx tsx scripts/setup-scheduled-reports-infra.ts [--environment govcloud|commercial] [--domain your-domain.com] [--env dev|prod]
 */

import { CreateTableCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb'
import {
  VerifyEmailIdentityCommand,
  GetIdentityVerificationAttributesCommand,
  CreateConfigurationSetCommand,
  DescribeConfigurationSetCommand
} from '@aws-sdk/client-ses'
import { CreateTopicCommand } from '@aws-sdk/client-sns'
import { PutRuleCommand, DescribeRuleCommand } from '@aws-sdk/client-eventbridge'
import { getClient } from '../server/lib/aws-client-factory'
import type { AWSEnvironmentType } from '../server/types/aws'

// Parse command line arguments
const args = process.argv.slice(2)
const environmentArg = args.find(arg => arg.startsWith('--environment='))?.split('=')[1] || 'govcloud'
const domainArg = args.find(arg => arg.startsWith('--domain='))?.split('=')[1] || 'example.com'
const envArg = args.find(arg => arg.startsWith('--env='))?.split('=')[1] || 'dev'

const ENVIRONMENT: AWSEnvironmentType = environmentArg === 'commercial' ? 'commercial' : 'govcloud'
const DOMAIN_NAME = domainArg
const ENV_SUFFIX = envArg === 'prod' ? '-prod' : ''

// AWS Configuration
const AWS_REGION = ENVIRONMENT === 'govcloud' ? 'us-gov-west-1' : 'us-east-1'

console.log(`\n🚀 Setting up Scheduled Reports Infrastructure`)
console.log(`   Environment: ${ENVIRONMENT}`)
console.log(`   Region: ${AWS_REGION}`)
console.log(`   Domain: ${DOMAIN_NAME}\n`)

/**
 * Create DynamoDB table if it doesn't exist
 */
async function createDynamoDBTable(
  tableName: string,
  config: {
    hashKey: string
    rangeKey?: string
    attributes: Array<{ name: string; type: 'S' | 'N' | 'B' }>
    globalSecondaryIndexes?: Array<{
      name: string
      hashKey: string
      rangeKey?: string
      projectionType: 'ALL' | 'KEYS_ONLY' | 'INCLUDE'
    }>
    ttlAttribute?: string
  }
) {
  try {
    const dynamodbClient = await getClient(ENVIRONMENT, 'dynamodb', AWS_REGION)

    // Check if table already exists
    try {
      await dynamodbClient.send(new DescribeTableCommand({ TableName: tableName }))
      console.log(`✓ Table ${tableName} already exists`)
      return
    } catch (error: any) {
      if (error.name !== 'ResourceNotFoundException') {
        throw error
      }
    }

    console.log(`  Creating table: ${tableName}...`)

    const command = new CreateTableCommand({
      TableName: tableName,
      BillingMode: 'PAY_PER_REQUEST',
      KeySchema: [
        { AttributeName: config.hashKey, KeyType: 'HASH' },
        ...(config.rangeKey ? [{ AttributeName: config.rangeKey, KeyType: 'RANGE' }] : [])
      ],
      AttributeDefinitions: config.attributes.map(attr => ({
        AttributeName: attr.name,
        AttributeType: attr.type
      })),
      GlobalSecondaryIndexes: config.globalSecondaryIndexes?.map(gsi => ({
        IndexName: gsi.name,
        KeySchema: [
          { AttributeName: gsi.hashKey, KeyType: 'HASH' },
          ...(gsi.rangeKey ? [{ AttributeName: gsi.rangeKey, KeyType: 'RANGE' }] : [])
        ],
        Projection: { ProjectionType: gsi.projectionType }
      })),
      Tags: [
        { Key: 'Name', Value: `GHOST ${tableName}` },
        { Key: 'Environment', Value: ENVIRONMENT },
        { Key: 'ManagedBy', Value: 'Script' },
        { Key: 'Service', Value: 'GHOST' }
      ]
    })

    await dynamodbClient.send(command)

    // Enable TTL if specified
    if (config.ttlAttribute) {
      console.log(`  ⚠️  Remember to enable TTL on attribute: ${config.ttlAttribute}`)
    }

    console.log(`✓ Table ${tableName} created successfully`)
  } catch (error: any) {
    console.error(`✗ Error creating table ${tableName}:`, error.message)
    throw error
  }
}

/**
 * Create SES email identity
 */
async function createSESEmailIdentity(email: string) {
  try {
    const sesClient = await getClient(ENVIRONMENT, 'ses', AWS_REGION)

    // Check if identity already exists
    try {
      const response = await sesClient.send(new GetIdentityVerificationAttributesCommand({
        Identities: [email]
      }))

      if (response.VerificationAttributes?.[email]) {
        console.log(`✓ SES email identity ${email} already exists`)
        const status = response.VerificationAttributes[email].VerificationStatus
        console.log(`  Verification status: ${status}`)
        return
      }
    } catch (error: any) {
      // Identity doesn't exist, continue to create it
    }

    console.log(`  Creating SES email identity: ${email}...`)

    await sesClient.send(new VerifyEmailIdentityCommand({
      EmailAddress: email
    }))

    console.log(`✓ SES email identity ${email} created successfully`)
    console.log(`  ⚠️  You must verify this email address via the verification email sent to ${email}`)
  } catch (error: any) {
    console.error(`✗ Error creating SES email identity ${email}:`, error.message)
    throw error
  }
}

/**
 * Create SES configuration set
 */
async function createSESConfigurationSet(name: string) {
  try {
    const sesClient = await getClient(ENVIRONMENT, 'ses', AWS_REGION)

    // Check if configuration set already exists
    try {
      await sesClient.send(new DescribeConfigurationSetCommand({
        ConfigurationSetName: name
      }))
      console.log(`✓ SES configuration set ${name} already exists`)
      return
    } catch (error: any) {
      if (error.name !== 'ConfigurationSetDoesNotExistException') {
        throw error
      }
    }

    console.log(`  Creating SES configuration set: ${name}...`)

    await sesClient.send(new CreateConfigurationSetCommand({
      ConfigurationSet: {
        Name: name
      }
    }))

    console.log(`✓ SES configuration set ${name} created successfully`)
    console.log(`  ⚠️  Note: TLS policy must be configured separately via AWS Console or additional API call`)
  } catch (error: any) {
    console.error(`✗ Error creating SES configuration set ${name}:`, error.message)
    throw error
  }
}

/**
 * Create SNS topic
 */
async function createSNSTopic(name: string) {
  try {
    const snsClient = await getClient(ENVIRONMENT, 'sns', AWS_REGION)

    console.log(`  Creating SNS topic: ${name}...`)

    const response = await snsClient.send(new CreateTopicCommand({
      Name: name,
      Tags: [
        { Key: 'Name', Value: `GHOST ${name}` },
        { Key: 'Environment', Value: ENVIRONMENT },
        { Key: 'ManagedBy', Value: 'Script' },
        { Key: 'Service', Value: 'GHOST' }
      ]
    }))

    console.log(`✓ SNS topic ${name} created successfully`)
    console.log(`  Topic ARN: ${response.TopicArn}`)
    return response.TopicArn
  } catch (error: any) {
    if (error.name === 'TopicAlreadyExists') {
      console.log(`✓ SNS topic ${name} already exists`)
      return null
    }
    console.error(`✗ Error creating SNS topic ${name}:`, error.message)
    throw error
  }
}

/**
 * Create EventBridge rule
 */
async function createEventBridgeRule(name: string, description: string, eventPattern: any) {
  try {
    const eventBridgeClient = await getClient(ENVIRONMENT, 'eventbridge', AWS_REGION)

    // Check if rule already exists
    try {
      await eventBridgeClient.send(new DescribeRuleCommand({ Name: name }))
      console.log(`✓ EventBridge rule ${name} already exists`)
      return
    } catch (error: any) {
      if (error.name !== 'ResourceNotFoundException') {
        throw error
      }
    }

    console.log(`  Creating EventBridge rule: ${name}...`)

    await eventBridgeClient.send(new PutRuleCommand({
      Name: name,
      Description: description,
      EventPattern: JSON.stringify(eventPattern),
      State: 'ENABLED',
      Tags: [
        { Key: 'Name', Value: `GHOST ${name}` },
        { Key: 'Environment', Value: ENVIRONMENT },
        { Key: 'ManagedBy', Value: 'Script' }
      ]
    }))

    console.log(`✓ EventBridge rule ${name} created successfully`)
  } catch (error: any) {
    console.error(`✗ Error creating EventBridge rule ${name}:`, error.message)
    throw error
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('📦 Creating DynamoDB Tables...\n')

    // 1. Create scheduled reports table
    await createDynamoDBTable('ghost-scheduled-reports', {
      hashKey: 'reportId',
      rangeKey: 'createdAt',
      attributes: [
        { name: 'reportId', type: 'S' },
        { name: 'createdAt', type: 'S' },
        { name: 'userIdStatus', type: 'S' },
        { name: 'nextRunTime', type: 'S' }
      ],
      globalSecondaryIndexes: [
        {
          name: 'UserStatusIndex',
          hashKey: 'userIdStatus',
          rangeKey: 'nextRunTime',
          projectionType: 'ALL'
        },
        {
          name: 'NextRunTimeIndex',
          hashKey: 'nextRunTime',
          projectionType: 'ALL'
        }
      ],
      ttlAttribute: 'expiresAt'
    })

    // 2. Create email templates table
    await createDynamoDBTable('ghost-email-templates', {
      hashKey: 'templateId',
      rangeKey: 'createdAt',
      attributes: [
        { name: 'templateId', type: 'S' },
        { name: 'createdAt', type: 'S' },
        { name: 'templateType', type: 'S' }
      ],
      globalSecondaryIndexes: [
        {
          name: 'TemplateTypeIndex',
          hashKey: 'templateType',
          rangeKey: 'createdAt',
          projectionType: 'ALL'
        }
      ]
    })

    // 3. Create report executions table
    await createDynamoDBTable('ghost-report-executions', {
      hashKey: 'reportId',
      rangeKey: 'executionTime',
      attributes: [
        { name: 'reportId', type: 'S' },
        { name: 'executionTime', type: 'S' }
      ],
      ttlAttribute: 'expiresAt'
    })

    console.log('\n📧 Creating SES Resources...\n')

    // 4. Create SES email identity
    const fromEmail = `noreply@${DOMAIN_NAME}`
    await createSESEmailIdentity(fromEmail)

    // 5. Create SES configuration set (matches terraform/ses.tf naming: ghost-scheduled-reports-${env})
    await createSESConfigurationSet(`ghost-scheduled-reports${ENV_SUFFIX}`)

    console.log('\n📢 Creating SNS Resources...\n')

    // 6. Create SNS topic for SES notifications
    const topicArn = await createSNSTopic('ghost-ses-notifications')

    console.log('\n🔔 Creating EventBridge Rules...\n')

    // 7. Create EventBridge rule for SES delivery tracking
    await createEventBridgeRule(
      'ghost-ses-delivery-tracking',
      'Track SES email delivery events',
      {
        source: ['aws.ses'],
        'detail-type': ['SES Email Sending Event']
      }
    )

    console.log('\n✅ Infrastructure setup complete!\n')
    console.log('📋 Summary:')
    console.log('   ✓ 3 DynamoDB tables created')
    console.log('   ✓ SES email identity created')
    console.log('   ✓ SES configuration set created')
    console.log('   ✓ SNS topic created')
    console.log('   ✓ EventBridge rule created')
    console.log('\n⚠️  Important Next Steps:')
    console.log('   1. Verify the SES email identity via the verification email')
    console.log('   2. Enable TTL on DynamoDB tables (expiresAt attribute)')
    console.log('   3. Configure SNS subscriptions for SES bounce/complaint notifications')
    console.log('   4. Update .env file with table names:')
    console.log('      SCHEDULED_REPORTS_TABLE=ghost-scheduled-reports')
    console.log('      EMAIL_TEMPLATES_TABLE=ghost-email-templates')
    console.log('      REPORT_EXECUTIONS_TABLE=ghost-report-executions')
    console.log(`      SES_FROM_EMAIL=noreply@${DOMAIN_NAME}`)
    console.log(`      SES_CONFIGURATION_SET=ghost-scheduled-reports${ENV_SUFFIX}`)
    if (topicArn) {
      console.log(`      SES_NOTIFICATIONS_TOPIC_ARN=${topicArn}`)
    }
    console.log('')

  } catch (error: any) {
    console.error('\n❌ Setup failed:', error.message)
    process.exit(1)
  }
}

// Run the script
main()
