---
title: Understanding GDMS Forecast Health
lastUpdated: 2025-01-19
icon: i-heroicons-chart-pie
---

> 📖 **New to cost concepts?** Start with the [Cost Concepts Overview](/support/docs?topic=cost-concepts-overview) to understand all key terminology.

# Understanding GDMS Forecast Health

## What is GDMS Forecast Health?

GDMS Forecast Health shows how account spending compares to the monthly budget allocation from GDMS.

## Key Components

### 1. GDMS Forecast Utilization
Percentage of monthly GDMS forecast spent.

**Color coding**:
- Green (0-79%): On track
- Orange (80-89%): Approaching limit
- Yellow (90-99%): Near limit
- Red (100%+): Over forecast

### 2. Monthly GDMS Forecast
Monthly budget allocation from GDMS.

### 3. AWS Projected MTD
AWS machine learning projection for end of current month based on historical patterns.

### 4. AWS Spend Projection Timeline
Visual timeline comparing actual costs vs GDMS forecast.

**Features**:
- Historical spending dots (every 3rd day)
- Today's actual spend
- Future AWS projections
- GDMS forecast exceedance marker

## Understanding the Status Messages

### Green Status (On Track)
- "On track for X% GDMS forecast utilization"
- "Tracking well below GDMS forecast - projected X% utilization"

### Yellow Status (Warning)
- "X% of GDMS forecast remaining with Y days left"

### Red Status (Over Forecast)
- "AWS projection shows exceeding GDMS forecast by $X"
- "AWS projection shows exceeding GDMS forecast by $X (Y%)"

## Key Differences: GDMS Forecast vs AWS Projection

| Aspect | GDMS Forecast | AWS Projection |
|--------|---------------|----------------|
| **Source** | General Dynamics Mission Systems | AWS Machine Learning |
| **Purpose** | Strategic yearly planning | Short-term operational guidance |
| **Update Frequency** | Quarterly or as needed | Real-time as data changes |
| **Timeframe** | 12+ months | 3-12 months |
| **Basis** | Strategic allocation | Historical usage patterns |

## Best Practices

**Monitor Regularly**
- Check weekly
- Watch for trend changes
- Act on warnings early

**Take Action**
- **Under forecast**: Consider additional allocation needs
- **Over forecast**: Review and optimize spending
- **Near limit**: Prepare for overage or request funds

## Troubleshooting

**"No GDMS forecast set for this account"**
Contact account administrator to verify forecast data has been uploaded.

**Unexpected projections**
Review recent spending patterns for one-time charges or anomalies.

## Related Topics

- [Understanding Budget Risk Scores](/support/docs?topic=budget-risk-scoring)
- [Cost Dashboard Guide](/support/docs?topic=cost-dashboard-guide)
- [Reports Guide](/support/docs?topic=reports-guide)



