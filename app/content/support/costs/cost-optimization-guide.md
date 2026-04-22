---
title: Understanding Instance Utilization Classifications
lastUpdated: 2026-04-02
icon: i-heroicons-chart-bar
---

# Understanding Instance Utilization Classifications

The Cost Optimization tab on each account page analyzes every EC2 instance across two independent dimensions: what AWS Compute Optimizer says about its sizing, and how much time it was actually running over the last 7 days.

These two dimensions are shown side by side and can be filtered independently.

---

## Dimension 1: Compute Optimizer

AWS Compute Optimizer analyzes each instance's usage patterns and assigns one of four classifications.

### 🟡 Over-provisioned

AWS Compute Optimizer determined the instance is bigger than it needs to be. A smaller instance type could handle the workload, saving money. The detail view shows the recommended instance type and estimated monthly savings.

**Action:** Consider downsizing to the recommended instance type.

### 🟣 Under-provisioned

AWS Compute Optimizer determined the instance needs more resources than its current type provides. It may be experiencing performance issues. The detail view shows the recommended (larger) instance type.

**Action:** Consider upgrading to the recommended instance type.

### 🟢 Optimized

AWS Compute Optimizer confirmed the instance is appropriately sized for its workload. No action needed.

### ⚪ No Data

AWS Compute Optimizer has not analyzed this instance yet. This typically means:
- The instance was recently launched (Compute Optimizer needs at least 12 hours of data)
- Compute Optimizer is not enabled for this account

---

## Dimension 2: Runtime — Last 7 Days

This dimension answers a simple question: was this instance actually running over the last 7 days?

It works by counting how many of the last 7 days had a CloudWatch CPU data point. CloudWatch only publishes a daily CPU data point when the instance was running on that day, so the count of daily data points within the 7-day window equals the number of days the instance was active.

### 🟢 Usually Running

The instance had CPU data on at least 1 day in the last 7 days.

### 🟠 Usually Stopped

The instance had CPU data on 0 days in the last 7 days — it was not observed running on any day in the past week.

### ⚪ No Data

CloudWatch returned no CPU data at all for this instance. This could mean:
- CloudWatch monitoring is not enabled
- The instance is too new to have data
- There was a permissions issue retrieving metrics

---

## Using Both Dimensions Together

The two dimensions are independent — you can filter by either or both at the same time.

Some useful combinations:

| Compute Optimizer | Runtime | What it means |
|---|---|---|
| Over-provisioned | Usually Running | Running continuously but oversized — good candidate for downsizing |
| Over-provisioned | Usually Stopped | Oversized AND rarely running — consider terminating instead of downsizing |
| Optimized | Usually Stopped | Right-sized but barely used — worth investigating why it's stopped so often |
| No Data | Usually Stopped | Rarely running and no Optimizer analysis — may be a forgotten instance |

---

## Reading the Dashboard

### Summary Cards

Two side-by-side card groups show counts for each classification. Click any card to filter the instance table to that category. Click again to clear the filter.

### Savings Banner

If any instances are over-provisioned with a savings estimate from Compute Optimizer, a green banner shows the total potential monthly and annual savings.

### Instance Table

The table shows over-provisioned and under-provisioned instances by default. Click "Show all" to include optimized and no-data instances.

Columns are sortable — click any column header to sort. The table paginates at 25 rows.

### Expanded Detail View

Click any row to expand it. The detail view shows:

- **Runtime (7 days)** — Days the instance was active in the last 7 days and its runtime classification (Usually Running / Usually Stopped)
- **Last Active** — The most recent day with meaningful CPU activity, and how many days ago that was
- **Active Days** — How many of the monitored days had CPU activity, shown as "X of Y" where Y is the number of days CloudWatch had data (not always 14 — stopped instances have fewer)
- **Launched** — When the instance was most recently started and how long it has been running since
- **Monthly Cost** — On-demand cost estimate with annual projection
- **Data Sources Used** — A checklist showing which data sources had data for this instance (CPU, Network, Disk I/O, Compute Optimizer, CloudTrail, Tags). Green check = data available, gray X = no data
- **Utilization Score** — A 0–100 bar combining all available signals into a single number. Higher = more evidence of active usage. This is informational only and does not affect either classification dimension
- **Tags** — Owner, Project, Schedule, and Patch Group if present
- **Peak CPU Over 14 Days** — A chart showing the daily maximum CPU utilization. This is informational only and not used for classification
- **Network I/O Over 14 Days** — A chart showing daily total network traffic (in + out). This is informational only and not used for classification
- **Explanation** — A plain-language summary of the Compute Optimizer finding
- **Evidence** — Specific data points supporting the classification

---

## Common Questions

**Q: Why doesn't Compute Optimizer have data for my instance?**
Compute Optimizer needs at least 12 hours of data after an instance starts. If the instance is new, wait and run a fresh analysis. If it's been running for a while, check that Compute Optimizer is enabled for the account.

**Q: An instance shows "Usually Stopped" but I know it runs regularly. Why?**
The runtime classification looks at the last 7 days only. If the instance runs on a schedule that didn't happen to produce a CloudWatch data point on any of the last 7 days, it would show as "Usually Stopped." Check the "Active Days (7d)" column in the table — it shows exactly how many days had CPU activity.

**Q: How are savings calculated?**
Savings come directly from AWS Compute Optimizer's estimate for downsizing to the recommended instance type. All estimates are based on on-demand pricing and will vary if you have Reserved Instances or Savings Plans.

**Q: How often is the data refreshed?**
Analysis results are cached for 30 minutes. CloudWatch metrics are cached for 1 hour. AWS Compute Optimizer refreshes its recommendations daily. Click "Run Analysis" to force a fresh analysis at any time.

**Q: Can I change the threshold for "Usually Running"?**
The threshold is 1 hour over 7 days. Contact your GHOST administrator if you need it adjusted.
