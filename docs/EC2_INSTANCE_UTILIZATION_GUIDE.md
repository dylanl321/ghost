# EC2 Instance Utilization Analysis

This guide explains how the Instance Utilization panel on the Account page classifies your EC2 instances and what each classification means.

## Overview

The system analyzes every EC2 instance in an account by combining three data sources:

- **Instance state and tags** — Is the instance running or stopped? Does it have a schedule, patch group, or owner?
- **CloudWatch metrics** — Peak (maximum) CPU usage per day and daily network traffic over the last 14 days (running instances only).
- **AWS Compute Optimizer** — AWS's own right-sizing recommendations based on observed usage patterns.

Each instance is assigned one of five classifications. Results are cached for 30 minutes.

The idle criteria for running instances are aligned with [AWS Compute Optimizer's idle resource recommendations](https://docs.aws.amazon.com/compute-optimizer/latest/ug/view-idle-recommendations.html).

---

## Classifications

### 🔴 Unused

The instance shows no meaningful activity. There are two ways an instance can be classified as unused:

**Stopped instances:**
A stopped instance is unused if it has **no Schedule tag** and **no Patch Group tag**. The reasoning is simple — nothing exists that would automatically restart it, so it's sitting idle and likely forgotten.

**Running instances (aligned with AWS Compute Optimizer idle criteria):**
A running instance is unused if **both** of the following are true over the 14-day lookback period:
- Peak (maximum) CPU utilization is below **5%** on every day
- Network traffic (in + out) is below **5 MB per day**

Both conditions must be met. A running instance with 3% peak CPU but 20 MB/day of network traffic would not be flagged as unused — it's clearly doing *something* on the network. The use of peak (maximum) CPU rather than average means that even brief spikes of activity above 5% will prevent an instance from being classified as idle.

**Potential savings:** The full monthly on-demand cost of the instance is counted as potential savings.

---

### 🟠 Patching Only

The instance is stopped, has a **Patch Group** tag, but has **no Schedule** tag.

This means the instance is only started during patching windows (managed by AWS Systems Manager or similar automation) and has no scheduled workload runtime. It exists solely to receive patches, which raises the question of whether it needs to exist at all.

**Potential savings:** The full monthly on-demand cost of the instance is counted as potential savings.

---

### 🟡 Underutilized

The instance is running but not using its resources efficiently. An instance is classified as underutilized when:

- AWS Compute Optimizer has flagged it as **OVER_PROVISIONED** — meaning a smaller instance type could handle the workload

This classification is driven entirely by Compute Optimizer's machine learning analysis, which considers CPU, memory, network, and disk patterns over time. When Compute Optimizer provides a recommendation, the panel will show the suggested instance type (e.g., "a `t3.medium` would handle the current workload") and the estimated monthly savings from downsizing.

**Potential savings:** If Compute Optimizer provides a savings estimate, that value is used. Otherwise, 50% of the instance's monthly on-demand cost is used as a conservative estimate.

---

### 🟢 Right-Sized

The instance appears to be appropriately sized for its workload. An instance is classified as right-sized if **any** of the following are true:

- It is stopped but has a **Schedule** tag (it's intentionally off as part of its normal schedule)
- AWS Compute Optimizer has flagged it as **OPTIMIZED**
- Peak CPU utilization is **5% or above** (not idle) and Compute Optimizer has no concerns

No action is needed for these instances.

---

### ⚪ No Data (Insufficient Data)

No monitoring data is available for this instance. This typically means:

- CloudWatch metrics are not enabled or not reporting
- Compute Optimizer has not yet analyzed the instance (it can take up to 12 hours after an instance starts)
- The instance was recently launched and doesn't have enough history

These instances are not flagged and no savings are estimated, but they may warrant investigation to ensure monitoring is properly configured.

---

## How the Decision Tree Works

The classifier evaluates instances in a specific order. The first matching rule wins.

```
Instance
│
├─ Is it STOPPED?
│  │
│  ├─ Has a Schedule tag?
│  │  └─ ✅ Right-Sized (intentionally stopped per schedule)
│  │
│  ├─ Has a Patch Group tag but NO Schedule tag?
│  │  └─ 🟠 Patching Only
│  │
│  └─ No Schedule AND no Patch Group?
│     └─ 🔴 Unused
│
└─ Is it RUNNING?
   │
   ├─ No CloudWatch metrics AND no Compute Optimizer data?
   │  └─ ⚪ No Data
   │
   ├─ Has CloudWatch metrics?
   │  │
   │  └─ Peak CPU < 5% AND network < 5 MB/day?
   │     └─ 🔴 Unused (idle per AWS Compute Optimizer criteria)
   │
   ├─ Compute Optimizer recommendation?
   │  │
   │  ├─ OVER_PROVISIONED?
   │  │  └─ 🟡 Underutilized (with recommended instance type + savings)
   │  │
   │  └─ OPTIMIZED?
   │     └─ ✅ Right-Sized
   │
   └─ Has metrics, not idle, no Compute Optimizer concern?
      └─ ✅ Right-Sized
```

> When both CloudWatch metrics and Compute Optimizer data are available, both are evaluated. The idle check (peak CPU + network) runs first. If the instance is not idle, Compute Optimizer's finding determines whether it's underutilized (OVER_PROVISIONED) or right-sized (OPTIMIZED or no finding).

---

## Understanding the UI

### Summary Bar

The colored pills at the top show the count of instances in each classification. Click a pill to filter the list to only that category. Click it again to clear the filter.

| Pill Color | Classification | Flagged? |
|------------|---------------|----------|
| Red | Unused | Yes |
| Orange | Patching Only | Yes |
| Yellow | Underutilized | Yes |
| Green | Right-Sized | No |
| Gray | No Data | No |

By default, only **flagged** instances (unused, patching only, underutilized) are shown. Click "Show all X instances" at the bottom to see right-sized and no-data instances too.

### Potential Savings Banner

If any instances have estimated savings, a green banner shows the total potential monthly and annual savings across all flagged instances.

### Instance Rows

Each row shows:

| Element | Description |
|---------|-------------|
| Classification badge | Color-coded label (Unused, Patch Only, Underutilized, Right-sized, No Data) |
| Instance name | The `Name` tag, or the instance ID if no name is set |
| Instance type | e.g., `t3.large`, `m5.xlarge` |
| Owner | From the `Owner` tag, if present |
| Peak CPU sparkline | A mini chart showing daily peak CPU over the lookback period. Color reflects severity: red (< 5%), yellow (5-15%), green (> 15%) |
| Active days | How many of the monitored days had peak CPU above 1%, shown as `X/Yd active` |
| Monthly cost | Estimated on-demand cost based on instance type and region |

### Expanded Detail View

Click any row to expand it. The detail view includes:

- **Last Active** — The most recent day where daily peak CPU exceeded 1%, and how many days ago that was
- **Active Days** — Count and percentage of monitored days with peak CPU above 1%
- **Launched** — When the instance was first started, and its age
- **Monthly Cost** — On-demand estimate with annual projection
- **Tags** — Owner, Project, Schedule, and Patch Group if present
- **Peak CPU Chart** — A larger chart showing daily peak CPU with labeled axes and tooltips
- **Network I/O Chart** — A chart showing daily network traffic (in + out) with auto-scaled units (KB or MB). Color reflects traffic level: red (below 5 MB/day idle threshold), blue (moderate), green (high). Only appears when network data is available.
- **Explanation** — A plain-language summary of why the instance received its classification
- **Evidence** — A bullet list of the specific data points that support the classification

---

## Key Thresholds Reference

| Metric | Threshold | Used For |
|--------|-----------|----------|
| Peak CPU (daily max) | < 5% | Unused/idle (running instances, per AWS Compute Optimizer) |
| Network I/O (in + out) | < 5 MB/day | Unused/idle (running instances, combined with peak CPU check) |
| Daily peak CPU > 1% | — | Counts as an "active day" for the activity summary |
| Lookback period | 14 days (default) | How far back CloudWatch metrics are analyzed |

---

## Frequently Asked Questions

**Q: My instance is stopped but shows as "Right-Sized" — why?**
It has a Schedule tag, which means automation is managing its start/stop cycle. The system treats this as intentional behavior.

**Q: An instance shows "No Data" but it's been running for weeks. What's wrong?**
CloudWatch basic monitoring may not be enabled, or the instance might not have the CloudWatch agent installed. Check that the instance is publishing `CPUUtilization` metrics to CloudWatch.

**Q: Why is my instance "Unused" even though it runs a nightly batch job?**
The idle check uses *peak* (maximum) CPU per day, not average. If your batch job pushes CPU above 5% on the days it runs, those days will show peak CPU above the threshold. However, if the job is extremely lightweight (never exceeding 5% CPU even at peak) and generates less than 5 MB/day of network traffic, the instance will still be flagged as idle. Check the peak CPU chart in the expanded view — you should see spikes on the days the job runs.

**Q: How is "underutilized" different from "unused"?**
Unused means the instance is idle — peak CPU never exceeded 5% and network traffic was minimal. This aligns with AWS Compute Optimizer's idle criteria. Underutilized means the instance IS being used, but Compute Optimizer's analysis determined a smaller instance type could handle the workload. Unused = "consider deleting." Underutilized = "consider downsizing."

**Q: How are savings calculated for underutilized instances?**
If AWS Compute Optimizer provides a specific savings estimate (based on recommending a smaller instance type), that number is used. If Compute Optimizer data isn't available, the system estimates savings as 50% of the current monthly on-demand cost — a conservative placeholder.

**Q: Does this analysis account for Reserved Instances or Savings Plans?**
No. All cost estimates are based on on-demand pricing. Actual savings will vary depending on your pricing commitments.

**Q: How often is the data refreshed?**
Results are cached for 30 minutes. CloudWatch metrics are cached for 1 hour. Compute Optimizer refreshes its recommendations daily on the AWS side.

**Q: Why did the idle thresholds change from average CPU to peak CPU?**
The previous version used average CPU < 1% and total network < 1 MB. This was replaced to align with AWS Compute Optimizer's official idle criteria, which uses peak (maximum) CPU < 5% and network < 5 MB/day. Peak CPU is a stronger signal of true idleness — an instance that never spikes above 5% even at its busiest moment is genuinely idle. Average CPU can hide periodic bursts of activity.
