---
title: Understanding Budget Risk Scores
lastUpdated: 2025-10-21
icon: i-heroicons-exclamation-triangle
---

# Understanding Budget Risk Scores

## Why Risk Scores?

Budget Risk Scores solve the problem of comparing accounts with vastly different budget sizes. Consider:

- **Account A**: Budget $100, Actual $200 → 100% over, $100 impact
- **Account B**: Budget $1,000,000, Actual $1,100,000 → 10% over, $100,000 impact

Account A has severe percentage overage but low financial impact. Account B has lower percentage but huge financial impact. Neither metric alone tells the full story.

## How It's Calculated

Risk Score combines both severity (percentage) and impact (dollars) into a single 0-100 score:

### Step 1: Normalize Both Metrics

Scale percentage and dollar overages to 0-100 range relative to the highest values across all accounts:

- **Normalized Percentage** = (Account's % Over / Maximum % Over) × 100
- **Normalized Dollar Amount** = (Account's $ Over / Maximum $ Over) × 100

### Step 2: Apply Weighted Combination

```
Risk Score = (Normalized Percentage × 70%) + (Normalized Dollar Amount × 30%)
```

The 70/30 weighting prioritizes severity while still accounting for financial impact.

## Example Calculation

Given:
- Budget: $1,000,000
- Actual: $2,000,000
- $ Over: $1,000,000 (100% of max overage in organization)
- % Over: 100% (100% of max % overage in organization)

Calculation:
- Normalized Percentage = (100 / 100) × 100 = 100
- Normalized Dollar = (1,000,000 / 1,000,000) × 100 = 100
- **Risk Score** = (100 × 0.7) + (100 × 0.3) = **100**

