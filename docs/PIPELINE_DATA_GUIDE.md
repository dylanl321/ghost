# Pipeline Data Guide

GHOST ingests GitLab pipeline telemetry from Terraform deployments across all AWS accounts and surfaces it through dashboards, charts, tables, and search tools. This document explains the underlying data, how it's queried, and how each visualization is built from it.

---

## Data Source: Athena Telemetry Database

All pipeline data lives in an Athena database called `telemetry_db` in the GovCloud deployment account (`461760157232`, region `us-gov-west-1`). Athena queries S3-backed tables partitioned by `year` and `month` columns. Every query includes a partition filter like:

```sql
WHERE CONCAT(year, LPAD(month, 2, '0')) >= date_format(date_add('day', -30, current_date), '%Y%m')
```

This keeps query costs low and performance reasonable (most queries return in 5-30 seconds).

### Performance & Caching

- Application-level cache: 5-minute TTL on all query results
- Athena result reuse: identical queries reuse results for up to 60 minutes
- Parallel execution: related queries run concurrently via `Promise.all()`
- Pagination: Athena has no native OFFSET, so results are fetched in full and paginated in-memory

---

## The Four Core Tables

### 1. `pipeline_runs`

Each row is a single GitLab CI job execution. This is the top-level record for a pipeline run.

| Column | Type | Description |
|---|---|---|
| `pipeline_id` | string | GitLab pipeline ID |
| `job_id` | string | GitLab job ID |
| `job_name` | string | CI job name (e.g., `plan`, `apply`) |
| `job_url` | string | Full URL to the GitLab job (used to parse repository info) |
| `job_stage` | string | CI stage name |
| `timestamp_start` | ISO string | When the job started |
| `timestamp_end` | ISO string | When the job finished |
| `duration_total_seconds` | number | Total runtime in seconds |
| `status` | string | `success`, `failure`, or `partial_failure` |
| `account_count` | number | Number of AWS accounts targeted (0 = all accounts) |
| `accounts_processed` | array | List of AWS account IDs processed |
| `commit_author` | string | Git author (format: `Name <email>`) |
| `terraform_version` | string | Terraform version used |
| `year` / `month` | string | Partition columns |

This table drives: success rate charts, timeline views, author metrics, repository breakdowns, activity heatmaps, and DORA metrics.

### 2. `account_plans`

Each row is a Terraform plan result for a specific AWS account within a pipeline run. One pipeline run produces many account plan rows (one per account).

| Column | Type | Description |
|---|---|---|
| `account_id` | string | 12-digit AWS account ID |
| `account_name` | string | Human-readable account name |
| `plan_created_at` | ISO string | When the plan was generated |
| `plan_pipeline_id` | number | Foreign key to `pipeline_runs.pipeline_id` |
| `changes_create` | number | Resources to be created |
| `changes_update` | number | Resources to be updated |
| `changes_destroy` | number | Resources to be destroyed |
| `changes_total` | number | Total planned changes |
| `plan_status` | string | `applied`, `failed`, `pending`, or `expired` |
| `applied_at` | ISO string | When the plan was applied (null if not applied) |
| `failed_at` | ISO string | When the plan failed (null if not failed) |
| `failure_reason` | string | Reason for failure (null if not failed) |
| `year` / `month` | string | Partition columns |

This table drives: account breakdowns, per-account success rates, planned-vs-applied drift analysis, and organization summary stats.

### 3. `resource_changes`

Each row is a single Terraform resource that was planned for change. This is the most granular table.

| Column | Type | Description |
|---|---|---|
| `account_id` | string | AWS account ID |
| `resource_address` | string | Full Terraform address (e.g., `module.vpc.aws_subnet.private`) |
| `resource_type` | string | AWS resource type (e.g., `aws_subnet`, `aws_iam_role`) |
| `module_name` | string | Terraform module path |
| `change_action` | string | `create`, `update`, `destroy`, or `replace` |
| `applied` | boolean | Whether the change was applied |
| `apply_success` | boolean | Whether the apply succeeded |
| `timestamp` | ISO string | When the change was recorded |
| `plan_pipeline_id` | number | Foreign key to the pipeline run |
| `plan_job_id` | string | Foreign key to the specific job |
| `year` / `month` | string | Partition columns |

This table drives: resource change charts, resource search, drift detection (unapplied resources), deployment status tracking, and state-vs-plan comparisons.

### 4. `error_details`

Each row is a specific error that occurred during a pipeline run for a given account.

| Column | Type | Description |
|---|---|---|
| `pipeline_id` | number | Foreign key to `pipeline_runs.pipeline_id` |
| `account_id` | string | AWS account ID where the error occurred |
| `timestamp` | ISO string | When the error occurred |
| `error_phase` | string | Pipeline phase (e.g., `plan`, `apply`, `init`) |
| `error_category` | string | Categorized error type (e.g., `provider_error`, `permission_denied`, `timeout`, `state_lock`) |
| `error_severity` | string | `critical`, `high`, `medium`, or `low` |
| `error_message` | string | Full error message text |
| `error_resource_type` | string | Resource type that caused the error (if applicable) |
| `year` / `month` | string | Partition columns |

This table drives: error distribution charts, recurring error detection, cross-account error comparison, and health score calculations.

---

## Secondary Data Source: Terraform State Files

State files are stored in S3 at `s3://gdmslandingzone-tf-statefiles/{repo_name}/{account_id}.tfstate` in the GovCloud master account (`374244613498`). These are standard Terraform v4 state files.

The state parser (`server/utils/terraform-state-parser.ts`) does three things:

1. Fetches the `.tfstate` file from S3 (cached for 5 minutes)
2. Parses the `resources` array into a flat list of `{ type, name, module, address, provider, instances_count }`
3. Compares state resources against planned resource changes from Athena to produce a `StateComparison`:
   - `inStateOnly` — resources in the live state but not in any recent plan (potentially unmanaged)
   - `inPlanOnly` — resources in the plan but not in the current state (pending creation or recently destroyed)
   - `matched` — resources present in both

Matching uses the last two segments of the resource address (`type.name`) to correlate state entries with plan entries.

---

## API Endpoints

All endpoints live under `/api/pipelines/` and are documented in Swagger at `/api/swagger-ui`.

### Account-Level Endpoints

| Endpoint | Purpose | Key Parameters |
|---|---|---|
| `GET /api/pipelines/account-summary` | Full pipeline summary for one account (runs, plans, resources, errors, daily metrics) | `account_id`, `days` |
| `GET /api/pipelines/account-health` | Composite deployment health score (0-100) with factor breakdown | `account_id`, `days` |
| `GET /api/pipelines/account-drift` | Planned-vs-applied summary + list of unapplied resources | `account_id`, `days` |
| `GET /api/pipelines/account-runs` | Paginated pipeline runs for an account | `account_id`, `days`, `page`, `limit` |
| `GET /api/pipelines/account-resources` | Paginated resource changes for an account | `account_id`, `days`, `page`, `limit` |
| `GET /api/pipelines/account-errors` | Paginated error details for an account | `account_id`, `days`, `page`, `limit` |
| `GET /api/pipelines/account-details` | Detailed view of a specific pipeline run for an account | `account_id`, `pipeline_id`, `job_id` |
| `GET /api/pipelines/account-timeline` | Recent pipeline runs timeline for an account | `account_id`, `days` |
| `GET /api/pipelines/account-state-comparison` | Compare Terraform state file against planned changes | `account_id`, `repo_name`, `days` |

### Organization-Level Endpoints (Admin)

| Endpoint | Purpose | Key Parameters |
|---|---|---|
| `GET /api/pipelines/global-summary` | Org-wide aggregated metrics (runs, accounts, changes, errors) | `days` |
| `GET /api/pipelines/global-timeline` | Recent pipeline runs across all accounts | `days`, `limit` |
| `GET /api/pipelines/resource-search` | Search resources by address or type across all accounts | `q`, `account_id`, `days`, `page`, `limit` |
| `GET /api/pipelines/resource-deployment-status` | Deployment status for a resource type across accounts | `resource_type`, `days` |
| `GET /api/pipelines/error-cross-account` | Check if an error pattern appears in other accounts | `error_category`, `error_message`, `days` |

### Pipeline-Specific Endpoints

| Endpoint | Purpose | Key Parameters |
|---|---|---|
| `GET /api/pipelines/[id]` | Full details for a single pipeline run (plans, resources, errors, modules) | `id` (route param) |

### Author Endpoints

| Endpoint | Purpose | Key Parameters |
|---|---|---|
| `GET /api/pipelines/authors/list` | All pipeline authors with aggregate metrics | `days` |
| `GET /api/pipelines/authors/[email]` | Runs and summary for a specific author | `email` (route param), `days` |

All endpoints accept a `days` parameter (1-90, default varies) and always query GovCloud regardless of any `environment` parameter.

---

## Dashboards & Visualizations

### Account Pipeline Dashboard (`PipelinesDashboard.vue`)

This is the per-account view, shown on account detail pages. It has a time range selector (7 / 30 / 90 days) and loads data from `/api/pipelines/account-summary`.

Layout:

1. **Deployment Health** (full width) — `AccountDeploymentHealth.vue`
2. **Success Rate Chart** (2/3 width) + **Summary Stats** (1/3 width)
3. **Resource Changes Chart** (2/3 width) + **Error Distribution** (1/3 width)
4. **Pipeline Timeline** (full width) — recent runs table
5. **Planned vs Applied Panel** (full width) — drift analysis
6. **Resource Search Panel** (full width) — search resources within this account

### Organization Pipeline Analytics (`/admin/pipelines`)

Admin-only page that shows org-wide metrics. Loads data from `/api/pipelines/global-summary` and `/api/pipelines/global-timeline`. Includes author filtering and time range selection.

Layout:

1. **Organization Trend Chart** — daily success/failure line chart across all accounts
2. **Account Performance Chart** — bar chart or table of accounts ranked by activity/success rate
3. **Repository Breakdown Table** — accordion list of repositories with success rates and account counts
4. **Activity Heat Map** — day-by-day activity bars showing run volume and success/failure split
5. **Error Distribution Chart** — pie chart of error categories across the organization

---

## Component Details

### PipelineSuccessChart

- **Data**: `dailyMetrics[]` — array of `{ date, total, successful, failed }`
- **Chart type**: ECharts stacked bar + line combo
- **Shows**: Daily pipeline runs as stacked bars (success green, failure red) with a success rate line overlay
- **Summary row**: Total runs, successful count, failed count, average daily runs

### OrganizationTrendChart

- **Data**: `dailyMetrics[]` — same shape as above but org-wide
- **Chart type**: ECharts line chart with area fill
- **Shows**: Total, successful, and failed runs as three lines over time
- **Summary row**: Total runs, success rate %, failure rate %, avg daily runs

### AccountPerformanceChart

- **Data**: `accountBreakdown[]` from global summary — `{ account_id, account_name, total_runs, success_rate, ... }`
- **Chart type**: ECharts horizontal bar chart (top 10) or paginated table (all accounts)
- **Shows**: Accounts ranked by total runs or success rate, with visual success rate bars
- **Toggle**: Switch between chart view (top 10) and table view (all, paginated)
- **Sort options**: By total runs, success rate, or account name

### ResourceChangeChart

- **Data**: `resourceBreakdown[]` — `{ resourceAddress, resourceType, action, count }`
- **Chart type**: ECharts horizontal stacked bar chart
- **Shows**: Top 10 resources by change volume, stacked by action type (create=green, update=blue, replace=yellow, destroy=red)
- **Summary row**: Total changes, created, updated, destroyed counts
- **Expandable table**: Full paginated list of all resource changes

### ErrorDistributionChart

- **Data**: `errorBreakdown[]` — `{ category, count }`
- **Chart type**: ECharts donut/pie chart
- **Shows**: Error categories as pie slices with percentage labels
- **Color mapping**: `provider_error`=red, `permission_denied`=amber, `timeout`=purple, `state_lock`=pink, `resource_error`=orange, `network_error`=indigo, `validation_error`=yellow
- **Category list**: Sorted list below the chart showing each category with count

### PipelineTimeline

- **Data**: `recentRuns[]` — array of `PipelineRun` objects
- **Display**: Paginated `UTable` with columns for status, job name, repository, pipeline ID, duration, timestamp, account count
- **Features**:
  - Status badges (green=success, red=failure, yellow=partial)
  - Clickable job URLs linking to GitLab
  - Clickable pipeline IDs linking to admin detail pages
  - Repository links to admin repository pages
  - Formatted durations and relative timestamps

### AccountDeploymentHealth

- **Data**: Fetched directly from `/api/pipelines/account-health`
- **Display**: Health score circle (0-100) with color coding + four factor cards
- **Health score calculation**:
  - Starts at 100
  - -20 if latest pipeline failed
  - Up to -30 for low plan success rate (proportional)
  - Up to -25 for recurring errors (-5 per pattern)
  - Up to -25 for unapplied resources (-1 per resource)
- **Ratings**: healthy (≥80), warning (≥50), critical (<50), unknown (no data)
- **Recurring errors section**: Paginated list of error patterns with occurrence counts, severity badges, and a "Check Other Accounts" button that calls `/api/pipelines/error-cross-account`

### PlannedVsAppliedPanel

- **Data**: Fetched from `/api/pipelines/account-drift`
- **Display**: Progress bar (applied=green, failed=red, pending=yellow) + resource type breakdown table + unapplied resources table
- **Purpose**: Shows configuration drift — resources that were planned but never applied

### ResourceSearchPanel

- **Data**: Fetched from `/api/pipelines/resource-search`
- **Display**: Search input + action/applied filters + paginated results table
- **Features**:
  - Search by resource address or type
  - Filter by action (create/update/destroy) and applied status
  - Results show account ID, resource address, type, action, applied status, timestamp
  - "Check Other Accounts" button to expand search scope beyond the current account

### RepositoryBreakdownTable

- **Data**: Derived from `timelineData[]` (pipeline runs with parsed repository info)
- **Display**: Searchable accordion list of repositories
- **Each repository shows**: Success/failure counts, pipeline success rate with progress bar, unique account count
- **Expanded view**: Quick stats grid + links to repository detail page and GitLab project
- **Repository parsing**: The `job_url` field is parsed to extract group, project name, and full path

### ActivityHeatMap

- **Data**: `heatMapData[]` — `{ date, total, successful, failed }`
- **Display**: Vertical list of recent days with horizontal success/failure bars
- **Summary**: Most active day and peak run count

---

## Data Flow Summary

```
GitLab CI Pipeline
    ↓ (telemetry emitted during plan/apply)
S3 (partitioned by year/month)
    ↓
Athena (telemetry_db)
    ↓ (SQL queries with partition filtering)
server/utils/athena-pipeline-queries.ts (30+ query functions, cached)
    ↓
server/api/pipelines/*.get.ts (17 API endpoints, OpenAPI documented)
    ↓ (JSON responses)
app/components/pipelines/*.vue (16 Vue components)
    ↓
ECharts (line, bar, pie, stacked charts)
UTable (paginated data tables)
Custom UI (health scores, progress bars, badges, accordions)
```

For Terraform state comparisons, there's a parallel path:

```
S3 (gdmslandingzone-tf-statefiles/{repo}/{account}.tfstate)
    ↓
server/utils/terraform-state-parser.ts (fetch, parse, compare)
    ↓
server/api/pipelines/account-state-comparison.get.ts
    ↓
Frontend (state-vs-plan diff view)
```

---

## Common Query Patterns

### "How many pipelines ran for account X in the last 30 days?"

```
GET /api/pipelines/account-summary?account_id=123456789012&days=30
→ response.data.summary.totalRuns
```

### "What's the org-wide success rate?"

```
GET /api/pipelines/global-summary?days=30
→ response.data.summary.pipeline_success_rate
```

### "Find all aws_iam_role changes across accounts"

```
GET /api/pipelines/resource-search?q=aws_iam_role&days=30&page=1&limit=25
→ response.data[] (paginated resource change records)
```

### "Is this error happening in other accounts too?"

```
GET /api/pipelines/error-cross-account?error_category=provider_error&error_message=AccessDenied&days=30
→ response.data[] (list of accounts with the same error pattern)
```

### "What resources are planned but never applied for account X?"

```
GET /api/pipelines/account-drift?account_id=123456789012&days=30
→ response.data.unappliedResources[] (resources with applied=false)
→ response.data.summary (planned vs applied counts by resource type)
```

### "Compare live Terraform state against recent plans"

```
GET /api/pipelines/account-state-comparison?account_id=123456789012&repo_name=aws-account-orchestrator&days=30
→ response.data.inStateOnly[] (in state but not planned recently)
→ response.data.inPlanOnly[] (planned but not in current state)
→ response.data.matched[] (in both)
```

---

## Environment Configuration

| Variable | Default | Description |
|---|---|---|
| `ATHENA_PIPELINE_DATABASE` | `telemetry_db` | Athena database name |
| `ATHENA_PIPELINE_RESULTS_BUCKET` | `gdlz-gitlab-pipeline-data` | S3 bucket for Athena query results |
| `ATHENA_PIPELINE_WORKGROUP` | `primary` | Athena workgroup |
| `AWS_GOVCLOUD_REGION` | `us-gov-west-1` | GovCloud region for all pipeline queries |

Pipeline data is always queried from GovCloud regardless of the user's selected environment. The state file bucket (`gdmslandingzone-tf-statefiles`) is accessed via the GovCloud master account (`374244613498`).
