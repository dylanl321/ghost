---
title: Understanding Cost Concepts in GHOST
lastUpdated: 2025-11-03
icon: i-heroicons-book-open
---

# Understanding Cost Concepts in GHOST

Key cost terminology used in GHOST for tracking and managing AWS spending.

## Quick Reference

| Term | Definition |
|------|------------|
| **Billable** | Official AWS invoice charges paid by IT |
| **Proforma** | Adjusted costs with savings plans distributed to accounts |
| **GDMS Forecast** | Monthly budget allocation from GDMS |
| **AWS Projection** | ML-based forecast from AWS Cost Explorer |
| **Current Spend** | Actual costs spent month-to-date |
| **Burn Rate** | Average daily spending rate |
| **Utilization** | Current spend as % of GDMS forecast |
| **Risk Score** | Weighted metric combining overage severity and impact |

---

## Data Modes: Billable vs Proforma

### Billable Costs
Official AWS invoice charges. IT pays this amount to AWS.

**When used:**
- Organization-wide cost views
- Invoice reconciliation
- IT financial reporting

**Limitation:** Savings plan discounts only appear in the master account.

### Proforma Costs
AWS Billing Conductor adjusts costs to distribute savings plan discounts back to accounts that used the resources.

**When used:**
- Individual account cost tracking
- Internal chargeback
- Understanding actual resource costs

**How it works:** Savings plans purchased at master account level are allocated to accounts based on consumption.

### Key Differences

| Aspect | Billable | Proforma |
|--------|----------|----------|
| **Matches AWS invoice** | ✅ Yes | ❌ No |
| **Shows savings discounts** | ❌ Only in master | ✅ Distributed |
| **Used for chargeback** | ❌ No | ✅ Yes (account-level totals)* |
| **Best for** | Org-wide totals | Account-level tracking |

*Proforma is used for chargeback at the **account level**. However, AWS Billing Conductor does not support cost allocation tags, so tag-level proforma breakdowns shown in Tag Analysis are estimates and should not be used for chargeback.

**Example:** Account uses $1000 of resources. Billable shows $1000. Proforma shows $800 after savings plan discount allocation.

📖 [Understanding Proforma Cost Data](/support/docs?topic=proforma-vs-billable)

---

## Budgets and Forecasts

### GDMS Forecast
Monthly budget allocation from GDMS strategic planning.

- **Source**: GDMS
- **Purpose**: Budget target
- **Updates**: Quarterly or as needed
- **Timeframe**: 12+ months

### AWS Projection
Machine learning forecast from AWS Cost Explorer.

- **Source**: AWS Cost Explorer ML
- **Purpose**: Short-term prediction
- **Updates**: Real-time
- **Timeframe**: Current month to 12 months
- **Basis**: Historical usage patterns

### How They Work Together

- **GDMS Forecast** = Budget target
- **AWS Projection** = Predicted trajectory
- **Current Spend** = Actual to date

**Example:**
```
Month: Nov 1 ────── Today ────── Month End
         $0        $2,718        $15,000 (GDMS Forecast)
                                 $16,452 (AWS Projection) ⚠️
```
AWS projects $1,452 over GDMS forecast.

📖 [GDMS Forecast Health](/support/docs?topic=gdms-forecast-health)

---

## Spending Metrics

### Current Spend
Actual amount spent from month start through yesterday. Updated daily at 2 AM EST.

### Burn Rate
Average daily spending rate.

```
Burn Rate = Current Spend ÷ Days Elapsed
```

**Example:** $2,718 spent over 3 days = $906/day

### Projected Spend
AWS Cost Explorer's forecast for month-end total.

```
Projected Spend = Current Spend + AWS Forecast (remaining days)
```

### Utilization
Percentage of GDMS forecast used or projected to be used.

```
Utilization = (Current Spend ÷ GDMS Forecast) × 100%
```

**Color coding:**
- 🟢 Green (0-79%): On track
- 🟠 Orange (80-89%): Approaching limit
- 🟡 Yellow (90-99%): Near limit
- 🔴 Red (100%+): Over forecast

---

## Analysis Metrics

### Risk Score
0-100 score combining percentage overage and dollar impact.

```
Risk Score = (Normalized % Over × 70%) + (Normalized $ Over × 30%)
```

**Why it exists:** A $100 account 100% over differs from a $1M account 10% over. Risk score accounts for both severity and financial impact.

📖 [Budget Risk Scores](/support/docs?topic=budget-risk-scoring)

### Variance
Difference between actual/projected spending and GDMS forecast.

- **Dollar Variance**: Projected Spend - GDMS Forecast
- **Percentage Variance**: ((Projected Spend - GDMS Forecast) ÷ GDMS Forecast) × 100%

---

## Timeline Concepts

### Daily Costs
Cost incurred on a specific day. AWS has 24-48 hour reporting delays.

### Cumulative Costs
Running total from start of period.

```
Day 1: $1,152 → Cumulative: $1,152
Day 2: $783  → Cumulative: $1,935
Day 3: $783  → Cumulative: $2,718
```

### Historical vs Forecast
- **Historical**: Actual costs already incurred (solid lines/dots)
- **Forecast**: Predicted future costs (dashed lines)
- **Today**: Transition point between historical and forecast

---

## Data Sources

**AWS Cost Explorer**
- Historical costs and ML projections
- Daily updates with 24-48 hour delay

**AWS Billing Conductor**
- Proforma adjustments and savings plan allocation
- Commercial AWS only

**GHOST Database**
- GDMS forecasts and account metadata
- Real-time for metadata, periodic for forecasts

---

## Common Questions

**Why do Billable and Proforma totals differ?**
Proforma redistributes savings plan discounts. Total is the same, but individual account costs differ.

**Why does AWS Projection change daily?**
ML adapts to recent spending patterns.

**What if GDMS Forecast is $0?**
Contact your account administrator. Forecasts are uploaded periodically.

**How accurate are AWS Projections?**
Stable workloads: 5-10% accuracy. Variable workloads: 20-30% variance.

**When is cost data final?**
3-5 days after month end.

---

## Related Guides

📊 [Cost Dashboard](/support/docs?topic=cost-dashboard-guide)
💊 [Proforma vs Billable](/support/docs?topic=proforma-vs-billable)
📈 [GDMS Forecast Health](/support/docs?topic=gdms-forecast-health)
🎯 [Budget Risk Scores](/support/docs?topic=budget-risk-scoring)
📄 [Cost Reports](/support/docs?topic=reports-guide)
