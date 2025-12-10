---
title: Using the Cost Dashboard
lastUpdated: 2025-01-15
icon: i-heroicons-chart-bar
---

> 📖 **New to cost concepts?** Start with the [Cost Concepts Overview](/support/docs?topic=cost-concepts-overview) to understand all key terminology.

# Using the Cost Dashboard

## Overview

Cost Dashboard (`/account/costs`) provides AWS cost analytics, forecasting, and GDMS forecast tracking.

## Accessing the Dashboard

1. Click **Accounts** in the sidebar
2. Select **Cost Dashboard**
3. Or navigate directly to `/account/costs`

## Dashboard Layout

### Top Metrics Card
Displays key cost information:
- **Current Month Spend**: Month-to-date costs
- **Forecasted Total**: Projected month-end cost
- **vs Last Month**: Percentage change comparison
- **GDMS Forecast Status**: Visual indicator of GDMS forecast utilization

### Cost Trend Chart
Interactive chart showing:
- Historical daily costs (blue line)
- AWS ML projection (dashed line)
- GDMS forecasted costs (solid line)
- Hover over data points for exact values
- Click and drag to zoom into specific date ranges

### Account Breakdown
Lists all accounts with their costs:
- **Account Name** and ID
- **Month-to-Date Cost**
- **Environment** (Production, Development, etc.)
- **Sort** by clicking column headers
- **Filter** using the search box

## Using the Settings Menu

Click the **gear icon** (⚙️) in the top-right to access Cost Settings.

### Filter Transactions
Hide specific cost types:
- ✅ **Hide Savings Plans** - Exclude savings plan charges
- ✅ **Hide Enterprise Support** - Remove support fees
- ✅ **Hide Reserved Instances** - Filter out RI charges
- ✅ **Hide Dev Accounts** - Focus on production costs

### Minimum Cost Threshold
Set a minimum amount to hide low-cost accounts:
- Enter dollar amount (e.g., `100`)
- Accounts below threshold won't appear in lists
- Useful for focusing on major cost drivers

### Currency Display Format
Choose how costs are displayed:
- **Abbreviated**: $1.2M, $500K (easier to scan)
- **Full**: $1,200,000.00 (precise amounts)

## Understanding the Data

### Data Refresh Schedule
- Cost data updates **daily at 2 AM EST**
- AWS has 24-48 hour reporting delay
- Current day costs are estimates
- Month-end finalization takes 3-5 days

### Forecasting
Forecasts are calculated using:
- Historical trends (last 90 days)
- Seasonal patterns
- Linear regression models
- Manual forecast uploads (admin)

## Tips for Cost Analysis

### Find Cost Spikes
1. Look for sudden vertical jumps in the chart
2. Check "Top Accounts" for unusual increases
3. Compare to previous month's pattern
4. Click the spike to see what changed

### Compare Time Periods
1. Note the current month total
2. Check "vs Last Month" percentage
3. Look for seasonal patterns
4. Use date range selector for custom comparisons

## Pro Tips

💡 **Bookmark filtered views** - Save URLs with your most-used filters

💡 **Use threshold filters** - Hide noise by setting minimum $1,000

💡 **Check daily** - Catch cost spikes early before they grow

💡 **Compare weekdays vs weekends** - Identify 24/7 resources to optimize

💡 **Review tags** - Ensure all resources are properly tagged for accurate reporting

