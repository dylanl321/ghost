# API Development Guide

## Overview

This guide provides step-by-step instructions for creating new APIs in the AWS Dashboard application. Follow these patterns to ensure consistency, proper error handling, caching, and documentation.

## Quick Start Checklist

- [ ] Create API file in correct location
- [ ] Import required utilities
- [ ] Add OpenAPI documentation
- [ ] Implement request validation
- [ ] Add caching (if appropriate)
- [ ] Use proper error handling
- [ ] Return standardized responses
- [ ] Test the API
- [ ] Update documentation

## Step-by-Step Guide

### Step 1: Choose API Location and Name

APIs are located in the `server/api/` directory using file-based routing:

```
server/api/
├── accounts/
│   ├── list.get.ts          → GET /api/accounts/list
│   ├── [id].get.ts          → GET /api/accounts/:id
│   └── update.post.ts       → POST /api/accounts/update
├── costs/
│   ├── analysis.get.ts      → GET /api/costs/analysis
│   └── forecast.get.ts      → GET /api/costs/forecast
└── organization/
    ├── overview.get.ts      → GET /api/organization/overview
    └── cache/
        └── invalidate.post.ts → POST /api/organization/cache/invalidate
```

**Naming conventions:**
- Use descriptive, lowercase names
- HTTP method is the file extension (`.get.ts`, `.post.ts`, `.put.ts`, `.delete.ts`)
- Dynamic routes use brackets: `[id].get.ts`, `[accountId]/costs.get.ts`

### Step 2: Create Basic API Structure

```typescript
/**
 * GET/POST /api/your-endpoint
 * 
 * Brief description of what this API does
 */

import { defineEventHandler, getQuery, readBody } from 'h3'
import { sendSuccess, sendError, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'

// OpenAPI Documentation (Step 3)
registerEndpoint('/api/your-endpoint', 'GET', {
  // Documentation goes here
})

export default defineEventHandler(handleAsync(async (event) => {
  // Your API logic here
}))
```

### Step 3: Add OpenAPI Documentation

Always document your API for automatic Swagger generation:

```typescript
registerEndpoint('/api/accounts/search', 'GET', {
  summary: 'Search AWS accounts',
  description: 'Search and filter AWS accounts by various criteria including LOB, status, and department',
  tags: ['Accounts'],
  parameters: [
    {
      name: 'query',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Search term for account name or ID'
    },
    {
      name: 'lob',
      in: 'query',
      required: false,
      schema: { 
        type: 'string',
        enum: ['IT', 'Cyber', 'SC&I', 'MSS', 'SIS', 'LAS']
      },
      description: 'Filter by Line of Business'
    },
    {
      name: 'status',
      in: 'query',
      required: false,
      schema: { 
        type: 'string',
        enum: ['ACTIVE', 'SUSPENDED', 'CLOSED']
      },
      description: 'Filter by account status'
    }
  ],
  responses: {
    200: {
      description: 'List of matching accounts',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    accountId: { type: 'string' },
                    name: { type: 'string' },
                    status: { type: 'string' },
                    linesOfBusiness: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      }
    },
    400: { $ref: '#/components/schemas/Error' },
    500: { $ref: '#/components/schemas/Error' }
  }
})
```

### Step 4: Implement Request Validation

```typescript
export default defineEventHandler(handleAsync(async (event) => {
  // GET request parameters
  const query = getQuery(event)
  const { lob, status, limit = 50 } = query
  
  // POST request body
  const body = await readBody(event)
  
  // Validate required parameters
  if (!body.accountId) {
    return errors.badRequest(event, 'accountId is required')
  }
  
  // Validate parameter values
  const validLOBs = ['IT', 'Cyber', 'SC&I', 'MSS', 'SIS', 'LAS']
  if (lob && !validLOBs.includes(lob as string)) {
    return errors.badRequest(event, `Invalid LOB. Must be one of: ${validLOBs.join(', ')}`)
  }
  
  // Validate and convert types
  const limitNum = parseInt(limit as string)
  if (isNaN(limitNum) || limitNum < 1 || limitNum > 1000) {
    return errors.badRequest(event, 'limit must be between 1 and 1000')
  }
  
  // Continue with API logic...
}))
```

### Step 5: Add Caching (When Appropriate)

Use caching for expensive operations or frequently accessed data:

```typescript
import { accountCache, CacheKeys, CacheTags } from '../../utils/cache-manager'

export default defineEventHandler(handleAsync(async (event) => {
  const query = getQuery(event)
  
  // Generate cache key based on parameters
  const cacheKey = CacheKeys.accountList({
    lob: query.lob as string,
    status: query.status as string,
    includeDecommissioned: query.includeDecommissioned === 'true'
  })
  
  const accounts = await accountCache.getOrSet(
    cacheKey,
    async () => {
      console.log('Cache miss - fetching from database')
      
      // Your expensive operation here
      const result = await getAllAccountsUnified(false)
      
      // Filter based on query parameters
      return result.filter(account => {
        if (query.lob && account.linesOfBusiness !== query.lob) return false
        if (query.status && account.status !== query.status) return false
        return true
      })
    },
    {
      ttl: 600, // 10 minutes
      tags: [CacheTags.ACCOUNTS],
      metadata: {
        generatedAt: new Date().toISOString(),
        filters: { lob: query.lob, status: query.status }
      }
    }
  )
  
  return sendSuccess(event, accounts)
}))
```

### Step 6: Use Proper Error Handling

```typescript
export default defineEventHandler(handleAsync(async (event) => {
  try {
    const { accountId } = getQuery(event)
    
    if (!accountId) {
      return errors.badRequest(event, 'accountId parameter is required')
    }
    
    // Try to find the account
    const account = await findAccountById(accountId as string)
    
    if (!account) {
      return errors.notFound(event, `Account ${accountId} not found`)
    }
    
    // Check permissions (if needed)
    if (account.status === 'RESTRICTED') {
      return errors.forbidden(event, 'Access to this account is restricted')
    }
    
    return sendSuccess(event, account)
    
  } catch (error: any) {
    console.error('Account lookup failed:', error)
    
    // Handle specific error types
    if (error.code === 'ENOTFOUND') {
      return errors.serviceUnavailable(event, 'Account service is temporarily unavailable')
    }
    
    if (error.statusCode === 403) {
      return errors.forbidden(event, 'Insufficient permissions')
    }
    
    // Generic error fallback
    return errors.serverError(event, 'Failed to retrieve account information')
  }
}))
```

### Step 7: Return Standardized Responses

Always use the standardized response utilities:

```typescript
import { sendSuccess, sendPaginated } from '../../utils/api-response'

// Simple success response
return sendSuccess(event, data)

// Success with metadata
return sendSuccess(event, data, {
  processing: {
    duration: '150ms',
    cached: true
  },
  timestamp: new Date().toISOString()
})

// Paginated response
return sendPaginated(event, {
  items: accounts,
  total: totalCount,
  page: currentPage,
  pageSize: limit,
  hasNext: currentPage * limit < totalCount
})

// Error responses
return errors.badRequest(event, 'Invalid parameter')
return errors.notFound(event, 'Account not found')
return errors.serverError(event, 'Database connection failed')
```

## Complete Example APIs

### Example 1: Simple GET API

```typescript
/**
 * GET /api/accounts/status/[accountId]
 * 
 * Get the current status of a specific AWS account
 */

import { defineEventHandler, getRouterParam } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../../utils/api-response'
import { registerEndpoint } from '../../../plugins/swagger'
import { getAccountFromOrganizations } from '../../../utils/accounts-consolidated'

registerEndpoint('/api/accounts/status/[accountId]', 'GET', {
  summary: 'Get account status',
  description: 'Retrieve the current status and basic information for a specific AWS account',
  tags: ['Accounts'],
  parameters: [
    {
      name: 'accountId',
      in: 'path',
      required: true,
      schema: { type: 'string' },
      description: 'AWS Account ID'
    }
  ],
  responses: {
    200: {
      description: 'Account status information',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  accountId: { type: 'string' },
                  name: { type: 'string' },
                  status: { type: 'string' },
                  email: { type: 'string' },
                  joinedMethod: { type: 'string' },
                  joinedTimestamp: { type: 'string', format: 'date-time' }
                }
              }
            }
          }
        }
      }
    },
    400: { $ref: '#/components/schemas/Error' },
    404: { $ref: '#/components/schemas/Error' },
    500: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  const accountId = getRouterParam(event, 'accountId')
  
  if (!accountId || !/^\d{12}$/.test(accountId)) {
    return errors.badRequest(event, 'Valid 12-digit AWS Account ID is required')
  }
  
  try {
    const account = await getAccountFromOrganizations(accountId, 'commercial')
    
    if (!account) {
      return errors.notFound(event, `Account ${accountId} not found`)
    }
    
    return sendSuccess(event, {
      accountId: account.id,
      name: account.name,
      status: account.status,
      email: account.email,
      joinedMethod: account.joinedMethod,
      joinedTimestamp: account.joinedTimestamp
    })
    
  } catch (error: any) {
    console.error(`Failed to get account ${accountId}:`, error)
    return errors.serverError(event, 'Failed to retrieve account status')
  }
}))
```

### Example 2: POST API with Validation

```typescript
/**
 * POST /api/accounts/update-metadata
 * 
 * Update account metadata in DynamoDB
 */

import { defineEventHandler, readBody } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { updateItem } from '../../utils/dynamodb'

registerEndpoint('/api/accounts/update-metadata', 'POST', {
  summary: 'Update account metadata',
  description: 'Update additional metadata for an AWS account in DynamoDB',
  tags: ['Accounts'],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['accountId', 'updates'],
          properties: {
            accountId: { 
              type: 'string',
              pattern: '^\\d{12}$',
              description: '12-digit AWS Account ID'
            },
            updates: {
              type: 'object',
              properties: {
                projectName: { type: 'string' },
                linesOfBusiness: { 
                  type: 'string',
                  enum: ['IT', 'Cyber', 'SC&I', 'MSS', 'SIS', 'LAS']
                },
                departmentNumber: { type: 'string' },
                estimatedMonthlyCharge: { type: 'number', minimum: 0 }
              }
            }
          }
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Account metadata updated successfully',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  accountId: { type: 'string' },
                  updatedFields: { type: 'array', items: { type: 'string' } },
                  timestamp: { type: 'string', format: 'date-time' }
                }
              }
            }
          }
        }
      }
    },
    400: { $ref: '#/components/schemas/Error' },
    500: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  const body = await readBody(event)
  const { accountId, updates } = body
  
  // Validate required fields
  if (!accountId) {
    return errors.badRequest(event, 'accountId is required')
  }
  
  if (!updates || Object.keys(updates).length === 0) {
    return errors.badRequest(event, 'updates object with at least one field is required')
  }
  
  // Validate account ID format
  if (!/^\d{12}$/.test(accountId)) {
    return errors.badRequest(event, 'accountId must be a 12-digit AWS Account ID')
  }
  
  // Validate LOB if provided
  const validLOBs = ['IT', 'Cyber', 'SC&I', 'MSS', 'SIS', 'LAS']
  if (updates.linesOfBusiness && !validLOBs.includes(updates.linesOfBusiness)) {
    return errors.badRequest(event, `Invalid linesOfBusiness. Must be one of: ${validLOBs.join(', ')}`)
  }
  
  // Validate estimated charge if provided
  if (updates.estimatedMonthlyCharge && (isNaN(updates.estimatedMonthlyCharge) || updates.estimatedMonthlyCharge < 0)) {
    return errors.badRequest(event, 'estimatedMonthlyCharge must be a non-negative number')
  }
  
  try {
    const tableName = process.env.AWS_ACCOUNTS_TABLE_NAME || 'gdms_aws_accounts-master'
    
    // Prepare update expression
    const updateExpression: string[] = []
    const expressionAttributeNames: Record<string, string> = {}
    const expressionAttributeValues: Record<string, any> = {}
    
    const updatedFields: string[] = []
    
    Object.entries(updates).forEach(([key, value], index) => {
      const attrName = `#attr${index}`
      const attrValue = `:val${index}`
      
      updateExpression.push(`${attrName} = ${attrValue}`)
      expressionAttributeNames[attrName] = key
      expressionAttributeValues[attrValue] = value
      updatedFields.push(key)
    })
    
    // Add timestamp
    updateExpression.push('#updatedAt = :updatedAt')
    expressionAttributeNames['#updatedAt'] = 'updatedAt'
    expressionAttributeValues[':updatedAt'] = new Date().toISOString()
    
    await updateItem(
      tableName,
      { accountId }, // Key
      `SET ${updateExpression.join(', ')}`,
      expressionAttributeNames,
      expressionAttributeValues
    )
    
    return sendSuccess(event, {
      accountId,
      updatedFields,
      timestamp: new Date().toISOString()
    })
    
  } catch (error: any) {
    console.error(`Failed to update account ${accountId}:`, error)
    return errors.serverError(event, 'Failed to update account metadata')
  }
}))
```

### Example 3: Complex API with Caching

```typescript
/**
 * GET /api/departments/overview
 * 
 * Get overview of accounts and costs by department
 */

import { defineEventHandler, getQuery } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { organizationCache, CacheKeys, CacheTags } from '../../utils/cache-manager'
import { getAllAccountsUnified } from '../../utils/accounts-consolidated'

registerEndpoint('/api/departments/overview', 'GET', {
  summary: 'Department overview analysis',
  description: 'Comprehensive analysis of accounts and costs grouped by department',
  tags: ['Departments', 'Analytics'],
  parameters: [
    {
      name: 'includeInactive',
      in: 'query',
      required: false,
      schema: { type: 'boolean', default: false },
      description: 'Include inactive accounts in analysis'
    }
  ],
  responses: {
    200: {
      description: 'Department overview data',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  departments: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        departmentNumber: { type: 'string' },
                        accountCount: { type: 'integer' },
                        activeAccountCount: { type: 'integer' },
                        estimatedMonthlyCost: { type: 'number' },
                        linesOfBusiness: { type: 'array', items: { type: 'string' } }
                      }
                    }
                  },
                  summary: {
                    type: 'object',
                    properties: {
                      totalDepartments: { type: 'integer' },
                      totalAccounts: { type: 'integer' },
                      totalEstimatedCost: { type: 'number' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    400: { $ref: '#/components/schemas/Error' },
    500: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  const query = getQuery(event)
  const includeInactive = query.includeInactive === 'true'
  
  const cacheKey = CacheKeys.organizationOverview({
    timeRange: 0, // Not time-based
    dataType: 'department-overview',
    lob: includeInactive ? 'include-inactive' : 'active-only'
  })
  
  const departmentOverview = await organizationCache.getOrSet(
    cacheKey,
    async () => {
      console.log('Generating department overview...')
      
      // Get all accounts
      const accounts = await getAllAccountsUnified(!includeInactive)
      
      // Group by department
      const departmentMap = new Map<string, any>()
      
      accounts.forEach(account => {
        const deptNum = account.departmentNumber || 'Unknown'
        
        if (!departmentMap.has(deptNum)) {
          departmentMap.set(deptNum, {
            departmentNumber: deptNum,
            accountCount: 0,
            activeAccountCount: 0,
            estimatedMonthlyCost: 0,
            linesOfBusiness: new Set<string>()
          })
        }
        
        const dept = departmentMap.get(deptNum)!
        dept.accountCount++
        
        if (account.status === 'ACTIVE') {
          dept.activeAccountCount++
        }
        
        if (account.estimatedMonthlyCharge) {
          dept.estimatedMonthlyCost += account.estimatedMonthlyCharge
        }
        
        if (account.linesOfBusiness) {
          dept.linesOfBusiness.add(account.linesOfBusiness)
        }
      })
      
      // Convert to array and clean up
      const departments = Array.from(departmentMap.values()).map(dept => ({
        ...dept,
        linesOfBusiness: Array.from(dept.linesOfBusiness).sort(),
        estimatedMonthlyCost: Math.round(dept.estimatedMonthlyCost * 100) / 100
      }))
      
      // Sort by account count (descending)
      departments.sort((a, b) => b.accountCount - a.accountCount)
      
      return {
        departments,
        summary: {
          totalDepartments: departments.length,
          totalAccounts: accounts.length,
          totalEstimatedCost: Math.round(
            departments.reduce((sum, d) => sum + d.estimatedMonthlyCost, 0) * 100
          ) / 100
        }
      }
    },
    {
      ttl: 1800, // 30 minutes
      tags: [CacheTags.ACCOUNTS, CacheTags.ORGANIZATION],
      metadata: {
        includeInactive,
        generatedAt: new Date().toISOString()
      }
    }
  )
  
  return sendSuccess(event, departmentOverview)
}))
```

## Testing Your API

### 1. Manual Testing

```bash
# Test GET request
curl "http://localhost:3000/api/accounts/status/123456789012"

# Test POST request
curl -X POST "http://localhost:3000/api/accounts/update-metadata" \
  -H "Content-Type: application/json" \
  -d '{
    "accountId": "123456789012",
    "updates": {
      "projectName": "New Project",
      "linesOfBusiness": "IT"
    }
  }'

# Test with parameters
curl "http://localhost:3000/api/departments/overview?includeInactive=true"
```

### 2. Check OpenAPI Documentation

Visit `http://localhost:3000/api/docs` to see your API documentation and test it interactively.

### 3. Validate Response Format

```bash
# Check response structure
curl "http://localhost:3000/api/your-endpoint" | jq '.'

# Validate specific fields
curl "http://localhost:3000/api/your-endpoint" | jq '.success, .data'
```

## Common Patterns and Utilities

### Available Utility Functions

```typescript
// Response utilities
import { sendSuccess, sendPaginated, errors } from '../../utils/api-response'

// AWS utilities
import { getAllAccountsUnified } from '../../utils/accounts-consolidated'
import { getCostAndUsage, getCostsByService } from '../../utils/cost-explorer'
import { getClient, getDynamoDBClient } from '../../lib/aws-client-factory'

// Database utilities
import { getItem, putItem, updateItem, scanItems } from '../../utils/dynamodb'

// Cache utilities
import { organizationCache, accountCache, costCache, CacheKeys, CacheTags } from '../../utils/cache-manager'
```

### Error Handling Patterns

```typescript
// Standard error responses
return errors.badRequest(event, 'Message')        // 400
return errors.unauthorized(event, 'Message')      // 401
return errors.forbidden(event, 'Message')         // 403
return errors.notFound(event, 'Message')          // 404
return errors.serverError(event, 'Message')       // 500
return errors.serviceUnavailable(event, 'Message') // 503
```

### Validation Patterns

```typescript
// Required parameter validation
if (!paramName) {
  return errors.badRequest(event, 'paramName is required')
}

// Format validation
if (!/^\d{12}$/.test(accountId)) {
  return errors.badRequest(event, 'Invalid AWS Account ID format')
}

// Enum validation
const validValues = ['option1', 'option2', 'option3']
if (paramValue && !validValues.includes(paramValue)) {
  return errors.badRequest(event, `Invalid value. Must be one of: ${validValues.join(', ')}`)
}
```

## Best Practices

1. **Always use `handleAsync`** for proper error handling
2. **Document everything** with OpenAPI schemas
3. **Validate inputs** thoroughly
4. **Use caching** for expensive operations
5. **Return consistent** response formats
6. **Handle errors** gracefully with meaningful messages
7. **Log important events** for debugging
8. **Use TypeScript types** from `server/types/index.ts`
9. **Follow naming conventions** for consistency
10. **Test your APIs** before submitting

This guide should help you create robust, well-documented APIs that follow the established patterns in the codebase!