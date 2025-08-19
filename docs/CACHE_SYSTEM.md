# Cache Management System Documentation

## Overview

The cache management system provides intelligent caching with automatic TTL management, tag-based invalidation, and analytics. It's designed to improve API performance and reduce database/AWS API calls.

## Basic Usage

### 1. Import the Cache System

```typescript
import { organizationCache, accountCache, costCache, CacheKeys, CacheTags } from '../../utils/cache-manager'
```

### 2. Simple Cache Operations

```typescript
// Set data in cache
await organizationCache.set('my-key', myData)

// Get data from cache
const cachedData = await organizationCache.get('my-key')

// Delete from cache
await organizationCache.delete('my-key')
```

### 3. Smart Cache with Auto-Fetch

```typescript
// This is the most common pattern - get from cache or fetch if missing
const data = await accountCache.getOrSet(
  'account-list-key',
  async () => {
    // This function only runs if cache is empty/expired
    return await fetchAccountsFromDatabase()
  }
)
```

## Cache Types Available

### Pre-configured Cache Instances

```typescript
// Organization data (5 min TTL, 500 entries max)
organizationCache

// Account data (10 min TTL, 1000 entries max) 
accountCache

// Cost data (15 min TTL, 200 entries max)
costCache
```

## Advanced Usage

### 1. Cache with Options

```typescript
await costCache.set('cost-data-key', expensiveData, {
  ttl: 1800,  // 30 minutes
  tags: ['costs', 'quarterly-data'],
  metadata: {
    generatedAt: new Date().toISOString(),
    dataSource: 'cost-explorer'
  }
})
```

### 2. Tag-Based Invalidation

```typescript
// Clear all cost-related cache entries
await costCache.invalidateByTags(['costs'])

// Clear multiple tags
await organizationCache.invalidateByTags(['accounts', 'organization'])
```

### 3. Cache Key Generation

```typescript
// Use the built-in key generators
const cacheKey = CacheKeys.organizationOverview({
  timeRange: 30,
  dataType: 'billable',
  lob: 'IT'
})

const accountKey = CacheKeys.accountList({
  lob: 'Engineering',
  includeDecommissioned: false
})
```

## Standard Cache Tags

Use these predefined tags for consistent cache management:

```typescript
CacheTags.ACCOUNTS     // Account data
CacheTags.COSTS        // Cost/billing data
CacheTags.ORGANIZATION // Organization structure
CacheTags.SERVICES     // AWS service data
CacheTags.BUDGETS      // Budget information
```

## Creating New APIs with Caching

### Simple API Example

```typescript
import { defineEventHandler } from 'h3'
import { accountCache, CacheKeys, CacheTags } from '../../utils/cache-manager'
import { sendSuccess, handleAsync } from '../../utils/api-response'

export default defineEventHandler(handleAsync(async (event) => {
  const cacheKey = CacheKeys.accountList({ includeDecommissioned: false })
  
  const accounts = await accountCache.getOrSet(
    cacheKey,
    async () => {
      // This expensive operation only runs on cache miss
      console.log('Fetching accounts from database...')
      return await getAllAccountsFromDatabase()
    },
    {
      ttl: 600,  // 10 minutes
      tags: [CacheTags.ACCOUNTS]
    }
  )
  
  return sendSuccess(event, accounts)
}))
```

### Complex API with Multiple Cache Layers

```typescript
export default defineEventHandler(handleAsync(async (event) => {
  const { lob, timeRange } = getQuery(event)
  
  // Step 1: Cache the account lookup
  const accountCacheKey = CacheKeys.accountList({ lob })
  const accounts = await accountCache.getOrSet(
    accountCacheKey,
    () => getAccountsByLOB(lob),
    { 
      ttl: 600,
      tags: [CacheTags.ACCOUNTS] 
    }
  )
  
  // Step 2: Cache the cost analysis
  const costCacheKey = CacheKeys.costAnalysis({
    startDate: '2025-01-01',
    endDate: '2025-01-31',
    accountIds: accounts.map(a => a.id)
  })
  
  const costData = await costCache.getOrSet(
    costCacheKey,
    () => fetchCostData(accounts),
    {
      ttl: 900,  // 15 minutes for cost data
      tags: [CacheTags.COSTS]
    }
  )
  
  return sendSuccess(event, {
    accounts,
    costs: costData
  })
}))
```

### API with Cache Analytics

```typescript
export default defineEventHandler(handleAsync(async (event) => {
  const startTime = Date.now()
  const cacheKey = 'my-expensive-operation'
  
  const result = await organizationCache.getOrSet(
    cacheKey,
    () => performExpensiveOperation()
  )
  
  const duration = Date.now() - startTime
  const cacheInfo = organizationCache.getEntryInfo(cacheKey)
  const cacheStats = organizationCache.getStats()
  
  return sendSuccess(event, result, {
    performance: {
      duration: `${duration}ms`,
      cacheHit: duration < 100  // Fast = cache hit
    },
    cache: {
      age: cacheInfo.age,
      hitRate: `${cacheStats.hitRate.toFixed(1)}%`,
      entries: cacheStats.entries
    }
  })
}))
```

## Cache Management APIs

### Invalidate Cache

```typescript
// POST /api/my-service/cache/invalidate
export default defineEventHandler(handleAsync(async (event) => {
  const { tags } = await readBody(event)
  
  const invalidated = await accountCache.invalidateByTags(tags)
  
  return sendSuccess(event, {
    message: `Invalidated ${invalidated} cache entries`,
    tags
  })
}))
```

### Cache Status

```typescript
// GET /api/my-service/cache/status
export default defineEventHandler(handleAsync(async (event) => {
  return sendSuccess(event, {
    organization: organizationCache.getStats(),
    accounts: accountCache.getStats(),
    costs: costCache.getStats()
  })
}))
```

## Best Practices

### 1. Choose Appropriate TTL

```typescript
// Short TTL for frequently changing data
userSessions: 300,     // 5 minutes

// Medium TTL for business data
accounts: 600,         // 10 minutes
costs: 900,           // 15 minutes

// Long TTL for rarely changing data
configurations: 3600,  // 1 hour
```

### 2. Use Meaningful Cache Keys

```typescript
// Good - specific and descriptive
const key = CacheKeys.costAnalysis({
  startDate: '2025-01-01',
  endDate: '2025-01-31',
  accountIds: ['123', '456']
})

// Bad - too generic
const key = 'cost-data'
```

### 3. Tag Your Cache Entries

```typescript
// Tag everything so you can invalidate related data
await cache.set(key, data, {
  tags: [CacheTags.COSTS, 'monthly-data', 'account-123']
})

// Later, invalidate all cost data
await cache.invalidateByTags([CacheTags.COSTS])
```

### 4. Handle Cache Failures Gracefully

```typescript
const data = await cache.getOrSet(
  key,
  async () => {
    try {
      return await expensiveOperation()
    } catch (error) {
      console.warn('Cache operation failed:', error)
      // Return fallback data or empty result
      return { error: 'Data temporarily unavailable' }
    }
  }
)
```

## Common Patterns

### Pattern 1: List with Filtering

```typescript
// Cache the full list, filter in memory
const allAccounts = await accountCache.getOrSet(
  'all-accounts',
  () => getAllAccounts()
)

// Filter without additional cache calls
const filteredAccounts = allAccounts.filter(account => 
  account.status === 'ACTIVE'
)
```

### Pattern 2: Dependent Data

```typescript
// Step 1: Get accounts (cached)
const accounts = await getAccountsFromCache()

// Step 2: Get costs for those specific accounts (cached)
const costKey = CacheKeys.costAnalysis({
  accountIds: accounts.map(a => a.id)
})

const costs = await costCache.getOrSet(costKey, () => 
  fetchCostsForAccounts(accounts.map(a => a.id))
)
```

### Pattern 3: Time-based Data

```typescript
// Include date in cache key for daily data
const today = new Date().toISOString().split('T')[0]
const cacheKey = `daily-costs-${today}`

const todaysCosts = await costCache.getOrSet(
  cacheKey,
  () => fetchDailyCosts(today),
  { ttl: 86400 } // Cache for 24 hours
)
```

## Debugging Cache Issues

### Check Cache Status

```typescript
// See what's in the cache
const stats = accountCache.getStats()
console.log('Cache hit rate:', stats.hitRate)
console.log('Total entries:', stats.entries)

// Check specific entry
const entryInfo = accountCache.getEntryInfo('my-key')
console.log('Entry age:', entryInfo.age)
console.log('TTL remaining:', entryInfo.ttl)
```

### Force Cache Refresh

```typescript
// Force fresh data
const freshData = await cache.getOrSet(
  key,
  fetchFunction,
  { forceRefresh: true }
)
```

### Clear Everything

```typescript
// Nuclear option - clear all cache
await organizationCache.clear()
await accountCache.clear()
await costCache.clear()
```

## Cache Invalidation API

You can use the built-in cache invalidation endpoint:

```bash
# Clear all caches
curl -X POST http://localhost:3000/api/organization/cache/invalidate \
  -H "Content-Type: application/json" \
  -d '{"tags": ["all"], "reason": "Manual refresh"}'

# Clear specific tags
curl -X POST http://localhost:3000/api/organization/cache/invalidate \
  -H "Content-Type: application/json" \
  -d '{"tags": ["accounts", "costs"], "reason": "Account data updated"}'
```

## Performance Tips

### 1. Batch Cache Operations

```typescript
// Good - batch related operations
const [accounts, costs, services] = await Promise.all([
  accountCache.getOrSet('accounts', fetchAccounts),
  costCache.getOrSet('costs', fetchCosts),
  costCache.getOrSet('services', fetchServices)
])

// Bad - sequential cache calls
const accounts = await accountCache.getOrSet('accounts', fetchAccounts)
const costs = await costCache.getOrSet('costs', fetchCosts)
const services = await costCache.getOrSet('services', fetchServices)
```

### 2. Use Appropriate Cache Levels

```typescript
// Level 1: In-memory cache (fastest)
const quickData = await organizationCache.getOrSet(key, fetchFunction)

// Level 2: Database cache (for persistent data)
// Consider implementing Redis cache for production
```

### 3. Monitor Cache Performance

```typescript
// Add cache metrics to your APIs
const cacheStats = {
  organization: organizationCache.getStats(),
  accounts: accountCache.getStats(),
  costs: costCache.getStats()
}

console.log('Cache Performance:', cacheStats)
```

This cache system will significantly improve your API performance while keeping the code clean and manageable!