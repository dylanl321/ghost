# Data Flow Analysis

## Scenario 1: Validation Script (validate-aws-costs.ts) - WORKS ✓

### Code Path:
```typescript
const awsProformaData = await getProformaCosts({
  startDate: '2025-10-01',
  endDate: '2025-11-01',
  granularity: 'MONTHLY',
  metrics: ['UnblendedCost'],
  groupBy: [{ type: 'DIMENSION', key: 'LINKED_ACCOUNT' }]
}, '253821132832', '205950196477')
```

### AWS API Calls Made by getProformaCosts():

#### Call 1: Billable (master account, WITH groupBy)
- `GetCostAndUsage` on master account (205950196477)
- groupBy: LINKED_ACCOUNT
- Returns: resultsByTime with Groups (105 accounts)

#### Call 2: Billable Total (WITHOUT groupBy)
- `GetCostAndUsage` on master account (205950196477)
- NO groupBy
- Returns: resultsByTime with per-period Total
- **Injects Total into billable resultsByTime[0]**

#### Call 3: Proforma (proforma account, WITH groupBy)
- `GetCostAndUsage` on proforma account (253821132832) via role assumption
- groupBy: LINKED_ACCOUNT
- Returns: resultsByTime with Groups (105 accounts)

#### Call 4: Proforma Total (WITHOUT groupBy)
- `GetCostAndUsage` on proforma account (253821132832) via role assumption
- NO groupBy
- Returns: resultsByTime with per-period Total ($1,021,955.92)
- **Injects Total into proforma resultsByTime[0]**

### Result:
- proformaData.proforma.total = $1,021,955.92 ✓
- proformaData.proforma.costs.resultsByTime[0].Total.UnblendedCost.Amount = $1,021,955.92 ✓

---

## Scenario 2: Diagnostic Endpoint - WORKS ✓

Same as Scenario 1 (directly calls getProformaCosts)

---

## Scenario 3: Test-Direct Endpoint - WORKS ✓

### Code Path:
```typescript
const proformaData = await getProformaCosts({...})  // Same 4 AWS calls as above
const proformaEnhanced = await enhanceCostData(
  proformaData.proforma.costs,
  false,
  'LINKED_ACCOUNT'
)
```

### enhanceCostData() Processing:
1. Reads `proformaData.proforma.costs.resultsByTime[0].Total.UnblendedCost.Amount` = $1,021,955.92
2. Calculates: `totalCost = costData.resultsByTime.reduce(...)` using per-period Totals
3. Returns: `summary.totalCost` = $1,021,955.92 ✓

---

## Scenario 4: Summary API Endpoint - FAILS ✗

### Code Path:
```typescript
const finalResult = await costCache.getOrSet(cacheKey, async () => {
  const proformaData = await getProformaCosts({
    startDate: '2025-10-01',
    endDate: '2025-11-01',
    granularity: 'MONTHLY',
    metrics: ['UnblendedCost', 'UsageQuantity'],  // TWO METRICS!
    groupBy: [{ type: 'DIMENSION', key: 'LINKED_ACCOUNT' }]
  }, '253821132832', '205950196477')

  const proformaEnhanced = await enhanceCostData(
    proformaData.proforma.costs,
    false,  // includeDecommissioned
    'LINKED_ACCOUNT'  // groupByDimension
  )

  return {
    billable: billableEnhanced,
    proforma: proformaEnhanced,
    comparison: proformaData.comparison,
    validation: proformaData.validation,
    masterAccount: {...}
  }
})
```

### Question: Do the SAME 4 AWS calls happen?

Let me check if requesting TWO metrics affects the injection logic...

### Key Difference:
- Validation/Test: `metrics: ['UnblendedCost']` (1 metric)
- Summary API: `metrics: ['UnblendedCost', 'UsageQuantity']` (2 metrics)

Does the injection loop handle multiple metrics correctly?
