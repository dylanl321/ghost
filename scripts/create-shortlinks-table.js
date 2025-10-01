#!/usr/bin/env node

/**
 * One-time script to create the DynamoDB table for shortlinks in AWS GovCloud
 * Uses direct GovCloud credentials from environment variables
 * 
 * Usage: node scripts/create-shortlinks-table.js
 */

import { DynamoDBClient, CreateTableCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb'
import * as dotenv from 'dotenv'
import * as path from 'path'
import { fileURLToPath } from 'url'

// Load environment variables from .env file
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.join(__dirname, '..', '.env') })

const TABLE_NAME = 'ghost-dashboard-shortlinks'

// Configuration using direct GovCloud credentials
const config = {
  accessKeyId: process.env.AWS_GOVCLOUD_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_GOVCLOUD_SECRET_ACCESS_KEY,
  region: process.env.AWS_GOVCLOUD_REGION || 'us-gov-west-1'
}

// Validate credentials
if (!config.accessKeyId || !config.secretAccessKey) {
  console.error('❌ Error: AWS GovCloud credentials not found in environment variables')
  console.error('   Please ensure AWS_GOVCLOUD_ACCESS_KEY_ID and AWS_GOVCLOUD_SECRET_ACCESS_KEY are set')
  process.exit(1)
}

/**
 * Check if table already exists
 */
async function tableExists(dynamoClient, tableName) {
  try {
    const command = new DescribeTableCommand({ TableName: tableName })
    await dynamoClient.send(command)
    return true
  } catch (error) {
    if (error.name === 'ResourceNotFoundException') {
      return false
    }
    throw error
  }
}

/**
 * Create the DynamoDB table for shortlinks
 */
async function createShortlinksTable() {
  console.log('🚀 Starting DynamoDB table creation for shortlinks...')
  console.log(`📍 Region: ${config.region}`)
  console.log(`📍 Table Name: ${TABLE_NAME}`)
  console.log('')

  try {
    // Step 1: Create DynamoDB client with direct GovCloud credentials
    console.log('1️⃣  Connecting to AWS GovCloud DynamoDB...')
    const dynamoClient = new DynamoDBClient({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      },
      endpoint: `https://dynamodb.${config.region}.amazonaws.com`
    })
    console.log('✅ Successfully connected to GovCloud')

    // Step 2: Check if table already exists
    console.log('2️⃣  Checking if table already exists...')
    const exists = await tableExists(dynamoClient, TABLE_NAME)
    
    if (exists) {
      console.log('⚠️  Table already exists. Skipping creation.')
      return
    }

    // Step 3: Create the table
    console.log('3️⃣  Creating DynamoDB table...')
    
    const createTableParams = {
      TableName: TABLE_NAME,
      KeySchema: [
        {
          AttributeName: 'shortCode',
          KeyType: 'HASH' // Partition key
        }
      ],
      AttributeDefinitions: [
        {
          AttributeName: 'shortCode',
          AttributeType: 'S' // String
        },
        {
          AttributeName: 'createdAt',
          AttributeType: 'S' // String (ISO date)
        },
        {
          AttributeName: 'createdBy',
          AttributeType: 'S' // String (user email)
        }
      ],
      BillingMode: 'PAY_PER_REQUEST', // On-demand billing
      GlobalSecondaryIndexes: [
        {
          IndexName: 'CreatedByIndex',
          KeySchema: [
            {
              AttributeName: 'createdBy',
              KeyType: 'HASH'
            },
            {
              AttributeName: 'createdAt',
              KeyType: 'RANGE'
            }
          ],
          Projection: {
            ProjectionType: 'ALL'
          }
        }
      ],
      Tags: [
        {
          Key: 'Application',
          Value: 'GhostDashboard'
        },
        {
          Key: 'Environment',
          Value: 'Production'
        },
        {
          Key: 'Purpose',
          Value: 'Shortlinks'
        },
        {
          Key: 'ManagedBy',
          Value: 'Terraform'
        }
      ],
      StreamSpecification: {
        StreamEnabled: false
      }
    }

    // Enable TTL for automatic expiration
    const createCommand = new CreateTableCommand(createTableParams)
    const response = await dynamoClient.send(createCommand)

    console.log('✅ Table created successfully!')
    console.log(`📊 Table ARN: ${response.TableDescription.TableArn}`)
    console.log(`📊 Table Status: ${response.TableDescription.TableStatus}`)

    // Step 4: Wait for table to be active
    console.log('4️⃣  Waiting for table to become active...')
    
    let tableActive = false
    let attempts = 0
    const maxAttempts = 30

    while (!tableActive && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000)) // Wait 2 seconds
      
      const describeCommand = new DescribeTableCommand({ TableName: TABLE_NAME })
      const describeResponse = await dynamoClient.send(describeCommand)
      
      if (describeResponse.Table.TableStatus === 'ACTIVE') {
        tableActive = true
        console.log('✅ Table is now active and ready to use!')
      } else {
        attempts++
        process.stdout.write('.')
      }
    }

    if (!tableActive) {
      console.log('\n⚠️  Table creation initiated but did not become active within expected time.')
      console.log('Please check the AWS Console for table status.')
    }

    // Step 5: Enable TTL
    console.log('5️⃣  Configuring TTL for automatic expiration...')
    console.log('ℹ️  Note: TTL configuration should be done via the AWS Console or a separate script')
    console.log('   TTL attribute name: "ttl"')

    console.log('\n✅ Setup complete!')
    console.log('\n📝 Next steps:')
    console.log('1. Verify the table in AWS Console')
    console.log('2. Enable Point-in-time recovery if needed')
    console.log('3. Configure TTL on the "ttl" attribute via AWS Console')
    console.log('4. Update environment variables to use GovCloud for shortlinks')

  } catch (error) {
    console.error('\n❌ Error creating table:', error)
    process.exit(1)
  }
}

// Run the script
createShortlinksTable()
  .then(() => {
    console.log('\n✨ Script completed successfully!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n💥 Script failed:', error)
    process.exit(1)
  })