---
title: Understanding Instance Utilization Classifications
lastUpdated: 2026-04-02
icon: i-heroicons-chart-bar
---

# Understanding Instance Utilization Classifications

The Cost Optimization tab on each account page analyzes every EC2 instance and classifies it based on how actively it's being used. This helps you identify instances that can be terminated, downsized, or upsized to save money or improve performance.

## How It Works

The system looks at six data sources over the last 14 days:

- **CPU usage** — the highest (peak) CPU each day
- **Network traffic** — total bytes in and out each day
- **Disk I/O** — read and write operations per day
- **AWS Compute Optimizer** — AWS's own analysis of whether the instance is the right size
- **CloudTrail API activity** — whether the instance is making AWS API calls (like reading from S3 or polling queues)
- **Tags** — Schedule, Patch Group, and ownership tags on the instance

Each instance receives one of six color-coded classifications.

---

## Classifications

### 🔴 Unused

The instance is not doing meaningful work and is a candidate for termination.

**Stopped instances:** The instance is off, has no Schedule tag (nothing will turn it back on), no Patch Group tag, and no historical evidence that it was actively used before being stopped.

**Running instances:** The instance is on, but over the last 14 days:
- Peak CPU never exceeded 5% on any day
- Network traffic was below 5 MB per day
- No meaningful AWS API calls were detected

These thresholds come from AWS Compute Optimizer's official idle criteria. If all three conditions are met, the instance is considered idle.

**Potential savings shown:** The full monthly on-demand cost of the instance.

---

### 🟠 Patching Only

The instance is stopped and has a **Patch Group** tag but no **Schedule** tag. This means it only gets turned on during patching windows and has no scheduled workload. It exists solely to receive patches.

**Potential savings shown:** The full monthly on-demand cost.

---

### 🟡 Over-provisioned (Underutilized)

The instance is being used, but it's bigger than it needs to be. There are two ways an instance ends up here:

**Running and over-sized:** AWS Compute Optimizer analyzed the instance's usage patterns and determined a smaller instance type would handle the workload. The detail view shows the recommended instance type and estimated savings.

**Stopped with prior usage:** The instance is stopped with no Schedule or Patch Group tag, but historical data shows it was actively used before being stopped (CPU activity, API calls, or a Compute Optimizer finding). This prevents recently-stopped active instances from being immediately labeled as "Unused." Review whether it should be restarted or terminated.

**Potential savings shown:** Compute Optimizer's savings estimate if available, otherwise 50% of the monthly cost.

---

### 🟣 Under-provisioned

The instance needs MORE resources. AWS Compute Optimizer determined the current instance type is too small for the workload — it may be experiencing performance issues. The detail view shows the recommended (larger) instance type.

This is a performance concern, not a cost-saving opportunity.

---

### 🟢 Right-Sized

The instance appears appropriately sized for its workload. An instance is classified as right-sized when any of the following are true:

- It is stopped but has a **Schedule** tag (it's intentionally off as part of its normal cycle)
- AWS Compute Optimizer confirmed it as **Optimized**
- Peak CPU is above 5% and Compute Optimizer has no concerns
- CPU and network are low, but the instance is actively making AWS API calls (it may be running a lightweight workload like polling queues or reading from S3)
- No CPU data is available, but network traffic exceeds 50 MB/day (clearly active)

No action needed.

---

### ⚪ No Data

Not enough monitoring data to classify the instance. This typically means:

- CloudWatch metrics are not enabled or not reporting
- The instance was launched very recently (less than 24 hours ago)
- Network data exists but is low, and CPU data is missing

These instances are not flagged for action, but may warrant investigation to ensure monitoring is properly configured.

---

## Reading the Dashboard

### Summary Cards

The colored cards at the top show the count of instances in each classification. Click a card to filter the table to only that category. Click it again to clear the filter.

### Savings Banner

If any instances have estimated savings, a green banner shows the total potential monthly and annual savings across all flagged instances.

### Instance Table

The table shows all flagged instances by default (Unused, Patching Only, Over-provisioned, Under-provisioned). Click "Show all" to include Right-sized and No Data instances.

Columns are sortable — click any column header to sort. The table paginates at 25 rows.

### Expanded Detail View

Click any row to expand it. The detail view shows:

- **Last Active** — The most recent day with meaningful activity, and how many days ago that was
- **Active Days** — How many of the monitored days had activity (e.g., "10 of 14")
- **Launched** — When the instance was first started and its age
- **Monthly Cost** — On-demand cost estimate with annual projection
- **Data Sources Used** — A checklist showing which of the six data sources had data for this instance. Green check = data available, gray X = no data. This helps you understand how confident the classification is.
- **Utilization Score** — A 0–100 bar combining all available signals. Higher = more evidence of active usage. This is informational only and does not affect the classification.
- **Tags** — Owner, Project, Schedule, and Patch Group if present
- **Peak CPU Chart** — Daily peak CPU over the lookback period
- **Network I/O Chart** — Daily network traffic over the lookback period
- **Explanation** — A plain-language summary of why the instance received its classification
- **Evidence** — Specific data points supporting the classification

---

## Utilization Score

Every instance gets a score from 0 to 100 based on how much evidence supports that it's actively used. The score combines:

- AWS Compute Optimizer finding
- CloudTrail API activity
- Network traffic volume
- Peak CPU level
- CPU usage variability (bursty workloads score higher)
- Disk I/O activity
- A grace period bonus for instances less than 7 days old

The score is for your reference only — it does not determine the classification. An instance can be "Right-sized" with a low score (limited data) or a high score (strong evidence from multiple sources).

---

## Common Questions

**Q: An instance shows "No Data" but I know it's running. What's wrong?**
CloudWatch metrics may not be enabled, or the analysis hasn't been run recently. Try clicking "Run Analysis" to trigger a fresh analysis. If the problem persists, check that CloudWatch basic monitoring is enabled on the instance.

**Q: Why is a stopped instance "Over-provisioned" instead of "Unused"?**
The system found historical evidence that the instance was actively used before being stopped — CPU activity, API calls, or a Compute Optimizer finding. This prevents recently-stopped active instances from being prematurely flagged for termination. Review whether it should be restarted or terminated.

**Q: An instance has very low CPU but is "Right-sized." Why?**
The instance is making meaningful AWS API calls (visible in the CloudTrail data source). It may be running a lightweight workload like polling SQS queues, reading from S3, or calling DynamoDB. Low CPU doesn't always mean idle.

**Q: How are savings calculated?**
- Unused and Patching Only: full monthly on-demand cost
- Over-provisioned: AWS Compute Optimizer's savings estimate if available, otherwise 50% of monthly cost
- Under-provisioned and Right-sized: no savings (not applicable)

All cost estimates are based on on-demand pricing. Actual savings will vary depending on Reserved Instances or Savings Plans.

**Q: How often is the data refreshed?**
Analysis results are cached for 30 minutes. CloudWatch metrics are cached for 1 hour. AWS Compute Optimizer refreshes its recommendations daily. Click "Run Analysis" to force a fresh analysis at any time.

**Q: What does the "Filling in missing metrics" message mean?**
After the initial analysis, the system detected that some instances were missing CloudWatch data (possibly due to API throttling on large accounts). It's automatically retrying those instances to fill in the gaps.

**Q: Can I change the thresholds for what counts as "idle"?**
The thresholds are aligned with AWS Compute Optimizer's official idle criteria (peak CPU < 5%, network < 5 MB/day). Contact your GHOST administrator if you need them adjusted.
