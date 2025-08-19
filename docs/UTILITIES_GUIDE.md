# Utilities Guide

## Overview

The `server/utils/` directory contains reusable utility functions that simplify common operations across the application. These utilities handle AWS integrations, database operations, caching, response formatting, and data processing.

## Directory Structure

```
server/utils/
├── account-filters.ts           # Account filtering and search
├── account-lookup-optimized.ts  # High-performance account lookups
├── accounts-consolidated.ts     # Unified account management
├── api-response.ts             # Standardized API responses
├── cache-manager.ts            # Intelligent caching system
├── cost-explorer.ts            # AWS Cost Explorer integration
├── dynamodb.ts                 # DynamoDB operations
└── [other utilities]
```

## Core Utilities

### 1. API Response Utilities (`api-response.ts`)

Standardized response formatting and error handling for all APIs.

#### Basic Usage

```typescript
import { sendSuccess, sendError, errors, handleAsync } from '../../utils/api-response'

// Success responses
return sendSuccess(event, data)
return sendSuccess(event, data, metadata)

// Error responses
return errors.badRequest(event, 'Invalid parameter')
return errors.notFound(event, 'Account not found')
return errors.serverError(event, 'Database connection failed')
```

#### Available Functions

```typescript
// Success responses
sendSuccess(event, data, metadata?)          // 200 OK
sendPaginated(event, paginationData)         // 200 OK with pagination

// Error responses
errors.badRequest(event, message)            // 400 Bad Request
errors.unauthorized(event, message)          // 401 Unauthorized
errors.forbidden(event, message)             // 403 Forbidden
errors.notFound(event, message)              // 404 Not Found
errors.serverError(event, message)           // 500 Internal Server Error
errors.serviceUnavailable(event, message)    // 503 Service Unavailable

// Wrapper for async handlers
handleAsync(asyncFunction)                   // Automatic error handling
```

#### Examples

```typescript
// Simple success
export default defineEventHandler(handleAsync(async (event) => {
  const accounts = await getAllAccounts()
  return sendSuccess(event, accounts)
}))

// Success with metadata
return sendSuccess(event, accounts, {
  total: accounts.length,
  cached: true,
  timestamp: new Date().toISOString()
})

// Paginated response
return sendPaginated(event, {
  items: accounts,
  total: 500,
  page: 2,
  pageSize: 50,
  hasNext: true
})

// Error handling
if (!accountId) {
  return errors.badRequest(event, 'accountId parameter is required')
}

try {
  const account = await getAccount(accountId)
  if (!account) {
    return errors.notFound(event, `Account ${accountId} not found`)
  }
  return sendSuccess(event, account)
} catch (error) {
  return errors.serverError(event, 'Failed to retrieve account')
}
```

### 2. DynamoDB Operations (`dynamodb.ts`)

Simplified DynamoDB operations with automatic error handling and type safety.

#### Available Functions

```typescript
// Basic operations
getItem(tableName, key, projectionExpression?)
putItem(tableName, item)
updateItem(tableName, key, updateExpression, names?, values?)
deleteItem(tableName, key)

// Query operations
queryItems(tableName, keyCondition, options?)
queryItemsWithIndex(tableName, indexName, keyCondition, options?)

// Scan operations
scanItems(tableName, options?)
scanItemsWithIndex(tableName, indexName, options?)

// Batch operations
batchGetItems(tableName, keys, projectionExpression?)
batchWriteItems(tableName, items, operation?)
```

#### Usage Examples

```typescript
import { getItem, putItem, queryItems, scanItems } from '../../utils/dynamodb'

// Get single item
const account = await getItem('accounts-table', { accountId: '123456789012' })

// Get item with specific fields
const account = await getItem(
  'accounts-table', 
  { accountId: '123456789012' },
  'accountId, #name, linesOfBusiness'  // Projection expression
)

// Create/update item
await putItem('accounts-table', {
  accountId: '123456789012',
  name: 'Production Account',
  status: 'ACTIVE',
  createdAt: new Date().toISOString()
})

// Update specific fields
await updateItem(
  'accounts-table',
  { accountId: '123456789012' },
  'SET #status = :status, updatedAt = :timestamp',
  { '#status': 'status' },                    // Expression attribute names
  { ':status': 'SUSPENDED', ':timestamp': new Date().toISOString() }  // Values
)

// Query with conditions
const activeAccounts = await queryItems(
  'accounts-table',
  'status = :status',
  {
    expressionAttributeValues: { ':status': 'ACTIVE' },
    limit: 100
  }
)

// Scan with filters
const itAccounts = await scanItems('accounts-table', {
  filterExpression: 'linesOfBusiness = :lob',
  expressionAttributeValues: { ':lob': 'IT' },
  projectionExpression: 'accountId, #name, departmentNumber',
  expressionAttributeNames: { '#name': 'name' }
})
```

#### Advanced Query Options

```typescript
// Query with pagination
const result = await queryItems('accounts-table', 'status = :status', {
  expressionAttributeValues: { ':status': 'ACTIVE' },
  limit: 50,
  exclusiveStartKey: lastEvaluatedKey,  // From previous query
  scanIndexForward: false               // Descending order
})

// Query with secondary index
const accountsByDept = await queryItemsWithIndex(
  'accounts-table',
  'department-index',                   // GSI name
  'departmentNumber = :dept',
  {
    expressionAttributeValues: { ':dept': 'DE158' }
  }
)
```

### 3. Account Management (`accounts-consolidated.ts`)

Unified account management combining Organizations API and DynamoDB metadata.

#### Available Functions

```typescript
// Account retrieval
getAllAccountsUnified(includeDecommissioned = false)
getAccountFromOrganizations(accountId, environment)
enrichAccountWithMetadata(account, metadata)

// Account filtering and search
searchAccounts(criteria)
getAccountsByLOB(linesOfBusiness)
getAccountsByDepartment(departmentNumber)
```

#### Usage Examples

```typescript
import { 
  getAllAccountsUnified, 
  getAccountFromOrganizations 
} from '../../utils/accounts-consolidated'

// Get all accounts with metadata
const accounts = await getAllAccountsUnified(false)  // Exclude decommissioned

// Get specific account from Organizations
const account = await getAccountFromOrganizations('123456789012', 'commercial')

// Example response structure
console.log(account)
// {
//   id: '123456789012',
//   name: 'Production Environment',
//   status: 'ACTIVE',
//   email: 'admin@company.com',
//   linesOfBusiness: 'IT',
//   departmentNumber: 'DE158',
//   estimatedMonthlyCharge: 5000,
//   govCloudAccountId: '987654321098'
// }

// Filter accounts by criteria
const itAccounts = accounts.filter(account => 
  account.linesOfBusiness === 'IT' && 
  account.status === 'ACTIVE'
)
```

### 4. Cost Explorer Integration (`cost-explorer.ts`)

AWS Cost Explorer operations with intelligent error handling and data enhancement.

#### Core Functions

```typescript
// Basic cost retrieval
getCostAndUsage(params, environment, targetAccountId?)
getCostForecast(startDate, endDate, metric, granularity?, filter?, environment?)

// Specialized cost queries
getCostsByService(startDate, endDate, granularity?, environment?)
getCostsByAccount(startDate, endDate, granularity?, environment?)
getCostsByRegion(startDate, endDate, granularity?, environment?)

// Analysis functions
getTopSpendingServices(startDate, endDate, limit?, environment?)
getMonthOverMonthChange(environment?)
detectCostAnomalies(resultsByTime, thresholdPercent?)
enhanceCostData(costData, includeDecommissioned?)
```

#### Usage Examples

```typescript
import { 
  getCostAndUsage, 
  getCostsByService, 
  getTopSpendingServices,
  enhanceCostData 
} from '../../utils/cost-explorer'

// Get cost and usage data
const costData = await getCostAndUsage({
  startDate: '2025-01-01',
  endDate: '2025-01-31',
  granularity: 'DAILY',
  metrics: ['BlendedCost', 'UnblendedCost'],
  groupBy: [{ type: 'DIMENSION', key: 'SERVICE' }]
}, 'commercial')

// Get costs by service
const serviceCosts = await getCostsByService(
  '2025-01-01',
  '2025-01-31',
  'MONTHLY',
  'commercial'
)

// Get top spending services
const topServices = await getTopSpendingServices(
  '2025-01-01',
  '2025-01-31',
  10,  // Top 10
  'commercial'
)

// Enhanced cost data with account information
const enhancedData = await enhanceCostData(costData, false)
console.log(enhancedData.summary)
// {
//   totalCost: 125000.50,
//   totalAccounts: 45,
//   averageCostPerAccount: 2777.79,
//   periodsAnalyzed: 31
// }
```

#### Advanced Cost Analysis

```typescript
// Detect cost anomalies
import { detectCostAnomalies, calculateCostTrends } from '../../utils/cost-explorer'

const anomalies = detectCostAnomalies(costData.resultsByTime, 25) // 25% threshold
console.log(anomalies)
// [
//   {
//     date: '2025-01-15',
//     cost: 15000,
//     expectedCost: 8000,
//     deviation: 7000,
//     deviationPercent: 87.5
//   }
// ]

// Calculate trends
const trends = calculateCostTrends(costData.resultsByTime)
console.log(trends)
// {
//   trend: 'increasing',
//   totalChange: 5000,
//   totalChangePercent: 25,
//   averageChange: 8.5,
//   isIncreasing: true
// }
```

### 5. Cache Manager (`cache-manager.ts`)

Intelligent caching with TTL management, tag-based invalidation, and analytics.

#### Available Cache Instances

```typescript
import { 
  organizationCache,  // 5 min TTL, 500 entries
  accountCache,       // 10 min TTL, 1000 entries
  costCache,          // 15 min TTL, 200 entries
  CacheKeys,          // Key generators
  CacheTags           // Standard tags
} from '../../utils/cache-manager'
```

#### Usage Examples

```typescript
// Simple cache operations
await accountCache.set('key', data)
const cached = await accountCache.get('key')
await accountCache.delete('key')

// Smart caching with auto-fetch
const accounts = await accountCache.getOrSet(
  'all-accounts',
  async () => {
    console.log('Cache miss - fetching from database')
    return await getAllAccountsUnified(false)
  },
  {
    ttl: 600,  // 10 minutes
    tags: [CacheTags.ACCOUNTS]
  }
)

// Generate cache keys
const cacheKey = CacheKeys.organizationOverview({
  timeRange: 30,
  dataType: 'billable',
  lob: 'IT'
})

// Tag-based invalidation
await accountCache.invalidateByTags([CacheTags.ACCOUNTS])
```

### 6. Account Filtering (`account-filters.ts`)

Advanced account filtering, searching, and criteria parsing.

#### Available Functions

```typescript
parseAndValidateAccountFilters(filters)
getAccountIdsFromCriteria(criteria, environment?)
filterAccountsByMultipleCriteria(accounts, criteria)
searchAccountsByText(accounts, searchTerm)
```

#### Usage Examples

```typescript
import { 
  parseAndValidateAccountFilters,
  filterAccountsByMultipleCriteria,
  searchAccountsByText 
} from '../../utils/account-filters'

// Parse filter criteria
const filters = parseAndValidateAccountFilters({
  lob: 'IT',
  status: 'ACTIVE',
  department: 'DE158',
  minCost: 1000,
  hasGovCloud: true
})

// Apply multiple filters
const accounts = await getAllAccountsUnified(false)
const filtered = filterAccountsByMultipleCriteria(accounts, filters)

// Text search across account fields
const searchResults = searchAccountsByText(accounts, 'production')
// Searches in: name, accountId, email, projectName
```

### 7. Optimized Account Lookup (`account-lookup-optimized.ts`)

High-performance account lookup with caching and fallback strategies.

#### Available Functions

```typescript
lookupAccount(identifier, options?)
bulkLookupAccounts(identifiers, options?)
enrichAccountWithGovernanceData(account)
```

#### Usage Examples

```typescript
import { lookupAccount, bulkLookupAccounts } from '../../utils/account-lookup-optimized'

// Single account lookup
const account = await lookupAccount('123456789012', {
  source: 'auto',           // 'auto', 'organizations', 'dynamodb'
  environment: 'commercial',
  includeMetadata: true,
  requireActive: false
})

// Bulk lookup for performance
const accounts = await bulkLookupAccounts([
  '123456789012',
  '987654321098',
  '555666777888'
], {
  includeMetadata: true,
  maxConcurrency: 5
})

// Result includes governance data
console.log(account)
// {
//   accountId: '123456789012',
//   name: 'Production Environment',
//   governance: {
//     organizationalUnit: '/Root/Production/',
//     policies: [/*...*/],
//     tags: {/*...*/}
//   }
// }
```

## Creating Custom Utilities

### Best Practices

1. **Single Responsibility**: Each utility should have a focused purpose
2. **Error Handling**: Include comprehensive error handling
3. **TypeScript**: Use proper types and interfaces
4. **Documentation**: Add JSDoc comments
5. **Testing**: Consider testability in design

### Template for New Utility

```typescript
/**
 * [Utility Name] - Brief description
 * 
 * Detailed explanation of what this utility does and when to use it.
 */

// Import required dependencies
import { /* dependencies */ } from '../lib/aws-client-factory'

// Define interfaces
interface UtilityOptions {
  param1: string
  param2?: number
  environment?: 'commercial' | 'govcloud'
}

interface UtilityResult {
  success: boolean
  data?: any
  error?: string
}

/**
 * Main utility function
 * @param input - Input parameter description
 * @param options - Configuration options
 * @returns Promise<UtilityResult>
 */
export async function mainUtilityFunction(
  input: string, 
  options: UtilityOptions = {}
): Promise<UtilityResult> {
  try {
    // Validate inputs
    if (!input) {
      throw new Error('Input parameter is required')
    }

    // Set defaults
    const { 
      param1, 
      param2 = 100, 
      environment = 'commercial' 
    } = options

    // Perform operation
    const result = await performOperation(input, param1, param2, environment)

    return {
      success: true,
      data: result
    }

  } catch (error: any) {
    console.error(`Utility operation failed:`, error)
    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * Helper function
 * @param params - Parameters
 * @returns Processed result
 */
async function performOperation(
  input: string, 
  param1: string, 
  param2: number, 
  environment: string
) {
  // Implementation details
  return processedResult
}

// Export additional helper functions if needed
export { performOperation }
```

## Common Usage Patterns

### Pattern 1: API Endpoint with Multiple Utilities

```typescript
import { defineEventHandler, getQuery } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { accountCache, CacheKeys, CacheTags } from '../../utils/cache-manager'
import { getAllAccountsUnified } from '../../utils/accounts-consolidated'
import { getCostsByAccount } from '../../utils/cost-explorer'
import { filterAccountsByMultipleCriteria } from '../../utils/account-filters'

export default defineEventHandler(handleAsync(async (event) => {
  const query = getQuery(event)
  
  // Use caching utility
  const cacheKey = CacheKeys.accountList({ lob: query.lob })
  const accounts = await accountCache.getOrSet(
    cacheKey,
    () => getAllAccountsUnified(false),  // Account utility
    { ttl: 600, tags: [CacheTags.ACCOUNTS] }
  )
  
  // Use filtering utility
  const filtered = filterAccountsByMultipleCriteria(accounts, {
    lob: query.lob,
    status: query.status
  })
  
  // Use cost utility for enrichment
  if (query.includeCosts === 'true') {
    const enriched = await Promise.all(
      filtered.map(async (account) => ({
        ...account,
        monthlyCost: await getCostsByAccount(
          '2025-01-01', '2025-01-31', 'MONTHLY', 'commercial'
        )
      }))
    )
    
    // Use response utility
    return sendSuccess(event, enriched)
  }
  
  return sendSuccess(event, filtered)
}))
```

### Pattern 2: Data Processing Pipeline

```typescript
import { getAllAccountsUnified } from '../../utils/accounts-consolidated'
import { getCostsByService } from '../../utils/cost-explorer'
import { organizationCache } from '../../utils/cache-manager'

async function generateOrganizationReport() {
  try {
    // Step 1: Get accounts
    const accounts = await getAllAccountsUnified(false)
    
    // Step 2: Get cost data
    const costs = await getCostsByService('2025-01-01', '2025-01-31')
    
    // Step 3: Process and combine data
    const report = {
      accounts: {
        total: accounts.length,
        byLOB: groupAccountsByLOB(accounts)
      },
      costs: {
        total: calculateTotalCosts(costs),
        byService: processServiceCosts(costs)
      },
      generatedAt: new Date().toISOString()
    }
    
    // Step 4: Cache result
    await organizationCache.set('monthly-report', report, {
      ttl: 86400,  // 24 hours
      tags: ['reports', 'monthly']
    })
    
    return report
    
  } catch (error) {
    console.error('Report generation failed:', error)
    throw error
  }
}
```

### Pattern 3: Error Recovery with Fallbacks

```typescript
import { getItem } from '../../utils/dynamodb'
import { getAccountFromOrganizations } from '../../utils/accounts-consolidated'
import { lookupAccount } from '../../utils/account-lookup-optimized'

async function getAccountWithFallback(accountId: string) {
  try {
    // Primary: Optimized lookup (includes caching)
    const account = await lookupAccount(accountId, {
      includeMetadata: true,
      requireActive: false
    })
    
    if (account) return account

  } catch (error) {
    console.warn('Optimized lookup failed, trying direct methods:', error)
  }
  
  try {
    // Fallback 1: Direct Organizations API
    const orgAccount = await getAccountFromOrganizations(accountId, 'commercial')
    if (orgAccount) return orgAccount

  } catch (error) {
    console.warn('Organizations lookup failed, trying DynamoDB:', error)
  }
  
  try {
    // Fallback 2: Direct DynamoDB lookup
    const dbAccount = await getItem('accounts-table', { accountId })
    if (dbAccount) return dbAccount

  } catch (error) {
    console.error('All lookup methods failed:', error)
  }
  
  return null
}
```

## Performance Tips

### 1. Use Appropriate Utilities

```typescript
// Good - Use cached, optimized lookup
const account = await lookupAccount(accountId)

// Less efficient - Direct API calls
const account = await getAccountFromOrganizations(accountId)
```

### 2. Batch Operations

```typescript
// Good - Batch lookup
const accounts = await bulkLookupAccounts(accountIds)

// Inefficient - Individual lookups
const accounts = await Promise.all(
  accountIds.map(id => lookupAccount(id))
)
```

### 3. Cache Strategically

```typescript
// Cache expensive operations
const expensiveData = await costCache.getOrSet(
  cacheKey,
  () => performExpensiveAnalysis(),
  { ttl: 900 }  // 15 minutes
)

// Don't cache fast operations
const quickData = await getItem('table', { id: 'quick-lookup' })
```

### 4. Use Projections

```typescript
// Good - Only get needed fields
const account = await getItem('table', key, 'accountId, #name, status')

// Inefficient - Get all fields
const account = await getItem('table', key)
```

## Troubleshooting

### Common Issues

1. **Import Errors**: Check file paths and exports
2. **Type Errors**: Ensure proper TypeScript interfaces
3. **Cache Misses**: Verify cache keys and TTL settings
4. **AWS Errors**: Check credentials and permissions
5. **Performance**: Use appropriate batch operations

### Debug Techniques

```typescript
// Add logging to utilities
console.log('Cache key:', cacheKey)
console.log('Query params:', queryParams)
console.log('Result count:', results.length)

// Time operations
const start = Date.now()
const result = await expensiveOperation()
console.log(`Operation took: ${Date.now() - start}ms`)

// Check cache statistics
const stats = accountCache.getStats()
console.log('Cache hit rate:', stats.hitRate)
```

These utilities provide a solid foundation for building efficient, maintainable APIs with proper error handling, caching, and AWS integration!