# EC2 Instance Utilization Analysis

This guide documents how the Cost Optimization panel classifies EC2 instances and what each classification means. It is intended for developers maintaining or extending this system.

The panel lives in the **Cost Optimization** tab on the Account page (`app/pages/account/[id]/index.vue`, template `#cost-optimization`). The component is `InstanceUtilizationDashboard.vue`.

## Data Sources

The classifier combines six data sources. Each is shown in the "Data Sources Used" checklist when you expand an instance row.

| Source | What it provides | Where it's fetched |
|--------|------------------|--------------------|
| CloudWatch CPU | Daily peak (maximum) `CPUUtilization` over 14 days. This is the value used for idle classification and scoring. Daily average is also fetched but only shown in evidence text — no decisions depend on it. | `server/utils/cloudwatch-metrics.ts` → `GetMetricData` with `Period: 86400`, `Stat: Maximum` |
| CloudWatch Network | Daily `NetworkIn` + `NetworkOut` sums, combined into a per-day total | Same file, same `GetMetricData` call |
| CloudWatch Disk I/O | Daily `DiskReadOps` + `DiskWriteOps` sums | Same file |
| Compute Optimizer | `OVER_PROVISIONED`, `UNDER_PROVISIONED`, or `OPTIMIZED` finding with recommended instance type and savings | `server/utils/compute-optimizer.ts` → `GetEC2InstanceRecommendations` |
| CloudTrail API Activity | Count of meaningful AWS API calls made by the instance's IAM role (excludes SSM agent noise) | Fetched during analysis job |
| Instance Tags | `Schedule`, `Patch Group`, `Owner`, `Project`, `GDMS_Managed` | AWS Config via `BatchGetAggregateResourceConfig` in `server/api/instances/utilization.get.ts` |

Results are cached for 30 minutes (`CACHE_TTL = 1800` in the API). CloudWatch metrics are cached for 1 hour (`CACHE_TTL = 3600` in `cloudwatch-metrics.ts`). Empty/failed CloudWatch results are NOT cached so retries happen on the next request.

---

## Classifications

There are six possible classifications. The classifier evaluates them in a specific order — the first matching rule wins. This means the `classifyInstance()` function in `server/utils/instance-utilization-classifier.ts` checks conditions sequentially from top to bottom, and as soon as one condition matches, it assigns that classification and `return`s immediately. Later rules are never evaluated. For example, a stopped instance with no Schedule and no Patch Group but with historical CloudWatch activity will match the "Underutilized (stopped with prior usage)" rule and return before ever reaching the plain "Unused" rule below it. The order of the `if` statements in the code IS the priority order.

### 🔴 Unused

The instance shows no meaningful activity and is a candidate for termination.

**Stopped instances (no historical activity):**
A stopped instance is classified as unused when ALL of the following are true:
- No `Schedule` tag
- No `Patch Group` tag
- No historical evidence of usage (no CloudWatch metrics showing activity, no meaningful CloudTrail API calls, no Compute Optimizer finding)

This is the strictest "unused" path. If the instance has ANY historical evidence of real usage, it falls to "Underutilized" instead (see below).

Code reference: `classifyInstance()` → stopped branch → `if (!hasSchedule && !hasPatchGroup)` → inner check for `hasHistoricalMetrics || hasHistoricalActivity || hasHistoricalOptimizer`.

**Running instances (idle per AWS Compute Optimizer criteria):**
A running instance is classified as unused when ALL of the following are true:
- Peak (maximum) CPU utilization is below **5%** on every day of the 14-day lookback
- Network traffic (in + out) is below **5 MB per day**
- No meaningful CloudTrail API calls detected

The CPU and network thresholds are aligned with [AWS Compute Optimizer's idle resource recommendations](https://docs.aws.amazon.com/compute-optimizer/latest/ug/view-idle-recommendations.html).

The CloudTrail check is a safety net: if an instance has low CPU and low network but IS making AWS API calls (e.g., polling SQS, reading S3, calling DynamoDB), it gets reclassified as "Right-sized" instead. Code reference: the `if (hasApiActivity)` guard inside the idle check block.

**Potential savings:** Full monthly on-demand cost.

---

### 🟠 Patching Only

The instance is stopped, has a `Patch Group` tag, but has NO `Schedule` tag.

This means the instance is only started during patching windows (managed by AWS Systems Manager) and has no scheduled workload runtime. It exists solely to receive patches.

Code reference: `classifyInstance()` → stopped branch → `if (hasPatchGroup && !hasSchedule)`.

**Potential savings:** Full monthly on-demand cost.

---

### 🟡 Underutilized (Over-provisioned)

The instance is being used but is wastefully sized, or is stopped with evidence of prior usage. There are two paths into this classification:

**Path 1 — Compute Optimizer OVER_PROVISIONED (running instances):**
AWS Compute Optimizer's ML analysis determined a smaller instance type could handle the workload. The panel shows the recommended instance type and estimated savings.

Code reference: `classifyInstance()` → running branch → `if (optimizerRec!.finding === 'OVER_PROVISIONED')`.

**Path 2 — Stopped with historical activity (no schedule/patch group):**
The instance is stopped with no Schedule or Patch Group tag, BUT has historical evidence of real usage — CloudWatch metrics showing CPU activity, meaningful CloudTrail API calls, or a Compute Optimizer finding. This catches instances that were actively used before being stopped. The explanation prompts the user to decide whether to terminate or restart.

Code reference: `classifyInstance()` → stopped branch → `if (!hasSchedule && !hasPatchGroup && (hasHistoricalMetrics || hasHistoricalActivity || hasHistoricalOptimizer))`. This check runs BEFORE the plain "unused" check, so historical evidence always takes priority.

**Potential savings:** Compute Optimizer's savings estimate if available, otherwise 50% of monthly on-demand cost.

---

### 🟣 Under-provisioned

The instance needs MORE resources than its current type provides. This is a distinct actionable insight — the instance is actively used but may be experiencing performance issues.

Triggered when Compute Optimizer returns `UNDER_PROVISIONED`. The panel shows the recommended (larger) instance type and the finding reason codes (e.g., CPU over-utilized, memory pressure).

Code reference: `classifyInstance()` → running branch → `if (optimizerRec!.finding === 'UNDER_PROVISIONED')`.

**Potential savings:** None (this is a performance concern, not a cost concern). Counted in the "flagged for review" total.

---

### 🟢 Right-Sized

The instance appears appropriately sized. There are multiple paths into this classification:

1. **Stopped with Schedule tag** — The instance is intentionally off as part of its normal schedule. Code: stopped branch → `if (hasSchedule)`.

2. **Compute Optimizer OPTIMIZED** — AWS confirmed the instance is well-sized. Code: running branch → `if (optimizerRec!.finding === 'OPTIMIZED')`.

3. **CPU above idle threshold** — Peak CPU ≥ 5% (not idle) and Compute Optimizer has no concerns. Code: running branch → fallback `if (hasCpuMetrics)`.

4. **Idle metrics but active API calls** — Peak CPU < 5% and network < 5 MB/day, but the instance has meaningful CloudTrail API calls. The safety net reclassifies it from "unused" to "right-sized." Code: inside the idle check → `if (hasApiActivity)`.

5. **Network-only with substantial traffic** — No CPU data available, but network traffic exceeds **50 MB/day** (`networkOnlyRightSizedThreshold`). This indicates active usage even without CPU metrics. Code: running branch → fallback `if (hasNetworkMetrics)` → `if (netPerDay > thresholds.networkOnlyRightSizedThreshold)`.

**Potential savings:** None.

---

### ⚪ No Data (Insufficient Data)

Not enough monitoring data to classify the instance. There are three paths:

1. **No metrics and no Compute Optimizer** — The instance is running but CloudWatch returned no CPU data, no network data, and Compute Optimizer has no analysis. If the instance was launched within the last 24 hours (`newInstanceGraceHours`), the explanation says it's too new. Otherwise it suggests checking CloudWatch configuration. Code: running branch → `if (!hasMetrics && !hasOptimizer)`.

2. **Network-only with low traffic** — Network data exists but CPU data is missing, and network traffic is below 50 MB/day. Not enough signal to confidently classify. Code: running branch → fallback `if (hasNetworkMetrics)` → else branch (low network).

3. **Fallback** — Any running instance that doesn't match any of the above rules.

**Potential savings:** None estimated.

---

## Decision Tree

The classifier evaluates rules in this order. First match wins.

```
Instance
│
├─ STOPPED?
│  │
│  ├─ Has Schedule tag?
│  │  └─ ✅ Right-Sized
│  │
│  ├─ No Schedule AND no Patch Group?
│  │  │
│  │  ├─ Has historical evidence (CPU metrics, API calls, or Optimizer finding)?
│  │  │  └─ 🟡 Underutilized (stopped with prior usage)
│  │  │
│  │  └─ No historical evidence?
│  │     └─ 🔴 Unused
│  │
│  └─ Has Patch Group but no Schedule?
│     └─ 🟠 Patching Only
│
└─ RUNNING?
   │
   ├─ No CloudWatch metrics AND no Compute Optimizer?
   │  └─ ⚪ No Data
   │
   ├─ Has metrics → Peak CPU < 5% AND network < 5 MB/day?
   │  │
   │  ├─ Has meaningful CloudTrail API calls?
   │  │  └─ ✅ Right-Sized (API activity safety net)
   │  │
   │  └─ No API activity?
   │     └─ 🔴 Unused (idle)
   │
   ├─ Compute Optimizer = OVER_PROVISIONED?
   │  └─ 🟡 Underutilized
   │
   ├─ Compute Optimizer = UNDER_PROVISIONED?
   │  └─ 🟣 Under-provisioned
   │
   ├─ Compute Optimizer = OPTIMIZED?
   │  └─ ✅ Right-Sized
   │
   ├─ Has CPU data, not idle?
   │  └─ ✅ Right-Sized
   │
   ├─ Network only, > 50 MB/day?
   │  └─ ✅ Right-Sized
   │
   └─ Network only, ≤ 50 MB/day?
      └─ ⚪ No Data
```

---

## Utilization Score (0–100)

Every instance receives a numeric score combining all available signals. The score is computed by `computeUtilizationScore()` at the bottom of `instance-utilization-classifier.ts`. It is displayed as a progress bar in the expanded detail view.

The score is NOT used for classification — it's a supplementary signal for human review. An instance can be "right-sized" with a score of 30 (limited data) or 95 (strong evidence from all sources).

### Weight breakdown

All weights are configurable via `DEFAULT_CONFIG.score` in the classifier file.

| Signal | Max Points | Tiers |
|--------|-----------|-------|
| Compute Optimizer (OPTIMIZED or UNDER_PROVISIONED) | 25 | Binary: 25 if present |
| Compute Optimizer (OVER_PROVISIONED) | 20 | Binary: 20 if present |
| CloudTrail API activity | 15 | ≥100 calls → 15, ≥10 → 10, ≥1 → 5 |
| Network traffic | 20 | ≥5 GB/day → 20, ≥500 MB → 15, ≥50 MB → 10, ≥5 MB → 5 |
| Peak CPU | 15 | ≥50% → 15, ≥20% → 10, ≥5% → 5 |
| CPU volatility (coefficient of variation) | 10 | CV ≥1.0 → 10, CV ≥0.5 → 5 |
| Disk I/O (any ops/day > 0) | 5 | Binary: 5 if active |
| New instance grace (< 7 days old) | 10 | Binary: 10 if new |

Total possible: 100 (capped). A score of 0 means no data at all. A score above 50 generally indicates strong evidence of active usage.

---

## Configuration Reference

All thresholds are defined in `DEFAULT_CONFIG` (`UtilizationConfig` interface) in `server/utils/instance-utilization-classifier.ts`. To change behavior, modify these values.

| Parameter | Default | Purpose |
|-----------|---------|---------|
| `idlePeakCpuPercent` | 5 | Peak CPU below this = idle (per AWS Compute Optimizer) |
| `idleNetworkBytesPerDay` | 5,000,000 (5 MB) | Network/day below this = idle (per AWS Compute Optimizer) |
| `stoppedDaysThreshold` | 14 | Days stopped before flagging in explanation text |
| `activeDayCpuThreshold` | 1 | Daily max CPU% above this = "active day" |
| `activeDayNetworkThreshold` | 1,000,000 (1 MB) | Network bytes/day above this = "active day" (fallback when CPU missing) |
| `networkOnlyRightSizedThreshold` | 50,000,000 (50 MB) | Network/day above this = right-sized even without CPU data |
| `newInstanceGraceHours` | 24 | Instances younger than this get a softer "too new" explanation |
| `score.*` | (see table above) | All scoring weights are individually tunable |

---

## Active Days Calculation

The "Active Days" metric shown in the UI counts how many of the monitored days had meaningful activity. The logic is in `classifyInstance()` near the top.

- **Primary (CPU available):** A day is "active" if the daily max CPU exceeds `activeDayCpuThreshold` (default 1%). Uses `maxCpuDailyValues`.
- **Fallback (no CPU, network available):** A day is "active" if daily network traffic exceeds `activeDayNetworkThreshold` (default 1 MB). Uses `networkDailyValues`.
- **Total days monitored** = `Math.max(maxCpuDailyValues.length, cpuValues.length, networkDailyValues.length)` — whichever source has the most data points.

---

## CloudWatch Metrics Fetching

Metrics are fetched in `server/utils/cloudwatch-metrics.ts` via `batchGetInstanceMetrics()`.

Key implementation details:
- Uses `GetMetricData` with 4 metric queries per instance: CPU Average, CPU Maximum, NetworkIn Sum, NetworkOut Sum (all at `Period: 86400` / 1 day).
- Batch size: 100 instances per `GetMetricData` call (400 queries, conservative limit vs API max of 500).
- **Pagination:** Follows `NextToken` to collect all metric results. `GetMetricData` can paginate responses — without following `NextToken`, some metrics (typically CPU) can be silently dropped while others (network) come through in the first page.
- **Retry:** Exponential backoff on throttling errors (3 retries at 500ms, 1s, 2s).
- **Per-batch error handling:** A failed batch logs the error and continues to the next batch. Other instances' metrics are not lost.
- **Stagger:** 50ms delay between batches to reduce throttling risk.
- **Cache:** Results cached for 1 hour. Empty/failed results are NOT cached so the next request retries.

Instance limit: The API fetches up to 5,000 instances from AWS Config (`limit: 5000` in `utilization.get.ts`). The Config service paginates internally at 100 items per `ListAggregateDiscoveredResources` call.

---

## UI Components

The dashboard is rendered by `app/components/accounts/InstanceUtilizationDashboard.vue`. Key UI elements:

- **Summary stat cards** — One per classification, color-coded with left border. Clickable to filter the table.
- **Donut chart** — Classification breakdown (PieChart via ECharts).
- **Savings banner** — Green gradient card showing total monthly/annual potential savings.
- **Sortable data table** — Columns: Classification, Instance Name, Instance ID, Type, Active Days, Peak CPU, Trend (sparkline), Monthly Cost. Sortable by clicking column headers. Paginated at 25 rows.
- **Expanded detail view** — Click any row to expand. Shows: key activity metrics (Last Active, Active Days, Launched, Monthly Cost), Data Sources Used checklist (6 sources with green/gray check icons), Utilization Score bar, tags, Peak CPU chart, Network I/O chart, explanation text, and evidence bullets.
- **Run Analysis button** — Triggers an async analysis job with a progress bar.
- **Stale data warning** — If the stored result has fewer instances than expected (from resource counts), an alert appears and a fresh analysis starts automatically.

---

## File Map

| File | Purpose |
|------|---------|
| `app/pages/account/[id]/index.vue` | Account page — renders `InstanceUtilizationDashboard` in the Cost Optimization tab |
| `app/components/accounts/InstanceUtilizationDashboard.vue` | Main dashboard UI component |
| `server/api/instances/utilization.get.ts` | API endpoint — orchestrates Config, CloudWatch, Compute Optimizer, and pricing calls |
| `server/utils/instance-utilization-classifier.ts` | Classification logic, scoring, thresholds config |
| `server/utils/cloudwatch-metrics.ts` | CloudWatch `GetMetricData` batching with retry and pagination |
| `server/utils/compute-optimizer.ts` | Compute Optimizer recommendations fetching |
| `server/utils/instance-enrichment.ts` | `EnrichedInstanceData` type definition |
| `server/lib/aws-client-factory.ts` | Cross-account assume-role client creation |

---

## FAQ

**Q: An instance is "No Data" but I can see CPU metrics in the CloudWatch console. Why?**
Most likely cause: the `GetMetricData` response was paginated and the previous code version didn't follow `NextToken`. This was fixed — the current code paginates all results. If you still see this, check the server logs for CloudWatch errors on that account. Also verify the cache isn't serving stale data (metrics cache TTL is 1 hour).

**Q: An instance has low CPU and low network but is classified "Right-sized" instead of "Unused." Why?**
The CloudTrail API activity safety net. If the instance is making meaningful AWS API calls (e.g., polling SQS, reading from S3), it's reclassified as right-sized even though CPU/network are below idle thresholds. Check the "CloudTrail" data source in the expanded detail view.

**Q: A stopped instance shows "Underutilized" instead of "Unused." Why?**
The classifier found historical evidence of real usage — CloudWatch metrics, CloudTrail API calls, or a Compute Optimizer finding from when the instance was running. This prevents prematurely flagging recently-stopped active instances as unused.

**Q: How do I change the idle thresholds?**
Edit `DEFAULT_CONFIG` in `server/utils/instance-utilization-classifier.ts`. The key fields are `idlePeakCpuPercent` (default 5) and `idleNetworkBytesPerDay` (default 5,000,000). These are aligned with AWS Compute Optimizer — changing them means diverging from AWS's definition.

**Q: How do I add a new data source to the scoring?**
1. Add the data to `InstanceMetrics` or create a new interface in `cloudwatch-metrics.ts`.
2. Pass it through `InstanceClassification` in the classifier.
3. Add scoring logic in `computeUtilizationScore()`.
4. Add a new tier config in `UtilizationConfig.score`.
5. Add the data source to the "Data Sources Used" checklist in `InstanceUtilizationDashboard.vue`.

**Q: What is the Utilization Score used for?**
Display only. It's shown as a 0–100 progress bar in the expanded detail view. It is NOT used for classification decisions — those are rule-based. The score gives humans a quick sense of how much evidence supports the classification.
