# Proforma vs Billable Cost Data

## Overview

This document explains the difference between proforma and billable cost data, how they are captured, and why both perspectives are important for accurate cost analysis and departmental budgeting.

## Key Concepts

### AWS Billing Reality
- **AWS charges the organization ONE total amount per day**
- **This total spend is a fixed number - it doesn't change based on how we view it**
- **The difference is HOW that total gets allocated to individual accounts**

### Account-Level Cost Allocation Methods

#### 1. Billable (Raw AWS Costs)
- **Source**: Master billing account (205950196477)
- **What it shows**: Raw account costs as AWS directly bills them
- **Characteristics**:
  - Some accounts get charged for Reserved Instances and Savings Plans
  - Other accounts get charged at On-Demand rates
  - Reflects AWS's direct billing methodology
  - **Not accurate for departmental budgeting** because savings are concentrated in certain accounts

#### 2. Proforma (Billing Conductor Managed)
- **Source**: Proforma account (253821132832) managed by AWS Billing Conductor
- **What it shows**: Costs after enterprise savings are redistributed across accounts
- **Characteristics**:
  - Savings Plans and Reserved Instance benefits are allocated to accounts based on actual usage
  - Provides "true cost per account" for budgeting purposes
  - Shows what each account would cost if it operated independently
  - **Accurate for departmental budgeting** and cost allocation

## Data Sources

### Master Account (205950196477)
```
Example Daily Breakdown:
Account A: $1,000 (includes $500 in RI savings)
Account B: $2,000 (On-Demand rates)
Account C: $1,500 (On-Demand rates)
Total: $4,500
```

### Proforma Account (253821132832)
```
Same Day After Billing Conductor Redistribution:
Account A: $1,200 (usage-based allocation of savings)
Account B: $1,800 (receives portion of savings based on usage)
Account C: $1,500 (receives portion of savings based on usage)
Total: $4,500 (SAME TOTAL)
```

## Implementation in APIs

### Organization Overview Time Series
```json
{
  "date": "2025-08-15",
  "cost": 4500.00
}
```
**Note**: Daily totals are identical regardless of allocation method. No artificial splitting into "billable" and "proforma" portions.

### Account-Level Costs (Billable)
```json
{
  "topAccounts": [
    {
      "accountId": "123456789012",
      "name": "Account A",
      "cost": 1000.00,
      "dataSource": "billable"
    }
  ]
}
```

### Account-Level Costs (Proforma)
```json
{
  "topAccounts": [
    {
      "accountId": "123456789012", 
      "name": "Account A",
      "cost": 1200.00,
      "dataSource": "proforma"
    }
  ]
}
```

### Combined View (Both)
```json
{
  "topAccounts": [
    {
      "accountId": "123456789012",
      "name": "Account A", 
      "billableCost": 1000.00,
      "proformaCost": 1200.00,
      "cost": 1000.00,
      "savings": -200.00,
      "savingsPercentage": -20.0
    }
  ]
}
```

## API Query Parameters

### `dataType=billable`
- **Time Series**: Organization daily totals (same as any other dataType)
- **Account Costs**: Raw AWS billing allocation
- **Use Case**: Understanding AWS's direct billing methodology

### `dataType=proforma`
- **Time Series**: Organization daily totals (same as any other dataType) 
- **Account Costs**: Billing Conductor redistributed costs
- **Use Case**: Departmental budgeting and accurate cost allocation

### `dataType=both`
- **Time Series**: Organization daily totals (same as any other dataType)
- **Account Costs**: Shows both perspectives with savings calculations
- **Use Case**: Understanding the difference between raw billing and fair allocation

## Why This Matters

### For Finance Teams
- **Proforma data** provides accurate per-department costs for budgeting
- **Billable data** shows how AWS actually bills the organization
- **Combined view** shows the impact of enterprise savings programs

### For Account Owners
- **Proforma costs** represent their "true" infrastructure costs
- **Billable costs** may include RI/SP charges that don't reflect their usage
- Understanding both helps with optimization decisions

## Common Misconceptions (What I Was Doing Wrong)

### ❌ Incorrect Understanding
- Thinking proforma and billable were different types of costs
- Artificially splitting daily totals into percentages (80%/20%)
- Treating them as additive components of a total

### ✅ Correct Understanding  
- Both represent the SAME total cost, allocated differently
- Daily organization totals are identical regardless of allocation method
- The difference is only in HOW costs are attributed to individual accounts
- Billing Conductor redistributes existing savings, doesn't create new costs

## Technical Implementation

### Cost Explorer Queries
```typescript
// For billable data (default master account)
const billableCosts = await getCostAndUsage(params, 'commercial')

// For proforma data (Billing Conductor account)  
const proformaCosts = await getCostAndUsage(params, 'commercial', '253821132832')
```

### Cache Keys
```typescript
// Each allocation method gets separate cache
const cacheKey = CacheKeys.costAnalysis({
  startDate: '2025-08-15',
  endDate: '2025-08-16', 
  dataType: 'proforma', // or 'billable'
  accountIds: [...]
})
```

## Validation

To verify correct implementation:

1. **Daily totals should be identical** across dataType values
2. **Account costs should differ** between billable and proforma
3. **Sum of all account costs should equal daily total** (within rounding)
4. **No artificial percentage splits** in time series data
5. **Proforma data should NEVER come from master account**

## Business Value

This correct implementation enables:
- Accurate departmental budgeting using proforma data
- Understanding of AWS billing methodology using billable data  
- Visibility into enterprise savings program effectiveness
- Proper cost allocation for internal chargeback systems