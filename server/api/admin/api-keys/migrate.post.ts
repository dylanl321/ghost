/**
 * POST /api/admin/api-keys/migrate
 * Create the API keys DynamoDB table if it doesn't exist
 */

import { defineEventHandler, readBody } from 'h3'
import { createError } from 'h3'
import { CreateTableCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb'
import { getDynamoDBClient } from '../../../lib/aws-client-factory'
import { API_KEYS_TABLE_SCHEMA } from '../../../utils/api-keys-schema'
import { getAuthContext, requireScope } from '../../../middleware/entra-auth'
import type { EntraAPIResponse } from '../../../types/entra'

interface MigrationResponse {
  tableExists: boolean
  created: boolean
  tableName: string
  status: string
}

export default defineEventHandler(async (event): Promise<EntraAPIResponse<MigrationResponse>> => {
  try {
    // Require admin scope for table operations
    requireScope(event, 'admin')
    
    const tableName = API_KEYS_TABLE_SCHEMA.TableName
    const environment = (process.env.API_KEYS_STORAGE_ENV as 'commercial' | 'govcloud') || 'commercial'
    
    console.log(`Checking if API keys table ${tableName} exists in ${environment}`)
    
    const client = await getDynamoDBClient(environment)
    
    // Check if table already exists
    try {
      const describeCommand = new DescribeTableCommand({ TableName: tableName })
      const existingTable = await client.send(describeCommand)
      
      return {
        success: true,
        data: {
          tableExists: true,
          created: false,
          tableName,
          status: existingTable.Table?.TableStatus || 'UNKNOWN'
        }
      }
    } catch (error: any) {
      // Table doesn't exist if we get ResourceNotFoundException
      if (error.name !== 'ResourceNotFoundException') {
        throw error
      }
    }
    
    console.log(`Creating API keys table ${tableName}`)
    
    // Create the table
    const createCommand = new CreateTableCommand(API_KEYS_TABLE_SCHEMA)
    const result = await client.send(createCommand)
    
    console.log(`API keys table created successfully: ${result.TableDescription?.TableArn}`)
    
    return {
      success: true,
      data: {
        tableExists: false,
        created: true,
        tableName,
        status: result.TableDescription?.TableStatus || 'CREATING'
      }
    }
  } catch (error: any) {
    console.error('Error creating API keys table:', error)
    
    // Re-throw H3 errors
    if (error.statusCode) {
      throw error
    }
    
    // Handle AWS errors
    throw createError({
      statusCode: 500,
      statusMessage: error.message || 'Failed to create API keys table'
    })
  }
})