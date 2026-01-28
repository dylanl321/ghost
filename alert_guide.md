# Budget Alert System - DynamoDB Configuration Admin Guide

This document provides all the information needed to build an admin dashboard for managing the Budget Alert System configuration stored in DynamoDB.

## Table Overview

**Table Name**: `budget-alert-config-{environment}` (e.g., `budget-alert-config-dev`, `budget-alert-config-prod`)

### Key Schema

| Key Type           | Attribute Name   | Description                                                               |
| ------------------ | ---------------- | ------------------------------------------------------------------------- |
| Partition Key (PK) | `config_scope`   | `GLOBAL` for global settings, or AWS account ID for per-account overrides |
| Sort Key (SK)      | `config_section` | Hierarchical identifier in format `{section}#{key}`                       |

### Global Secondary Index (GSI)

**Name**: `section-type-index`

- **Partition Key**: `section_type`
- **Sort Key**: `updated_at`
- **Use Case**: Query all items of a specific type (e.g., get all alert configs, all recipient configs)

---

## Configuration Sections

### 1. Settings (`settings#main`)

Core system settings for email delivery, timezone, and business hours.

**Key**: `config_scope=GLOBAL`, `config_section=settings#main`

| Field                  | Type   | Required | Default                 | Description                                                                      |
| ---------------------- | ------ | -------- | ----------------------- | -------------------------------------------------------------------------------- |
| `email_domain`         | String | Yes      | -                       | Domain appended to role names for email resolution (e.g., `gd-ms.com`)           |
| `from_email`           | String | Yes      | -                       | Sender email address for alerts (e.g., `aws-budget-alerts@gd-ms.com`)            |
| `from_name`            | String | No       | `Budget Alert System`   | Display name for sender                                                          |
| `timezone`             | String | No       | `America/New_York`      | Timezone for business hours and timestamps                                       |
| `cooldown_hours`       | Number | No       | `24`                    | Minimum hours between duplicate alerts (legacy, use per-level intervals instead) |
| `min_budget`           | Number | No       | `1000`                  | Minimum budget to trigger alerts ($)                                             |
| `business_hours_start` | Number | No       | `8`                     | Business hours start (24-hour format, 0-23)                                      |
| `business_hours_end`   | Number | No       | `18`                    | Business hours end (24-hour format, 0-23)                                        |
| `ghost_url_template`   | String | No       | -                       | URL template for deep-linking to account details. Use `{account_id}` placeholder |
| `accounts_table`       | String | No       | `gdms_aws_accounts-dev` | DynamoDB table name for account metadata                                         |

**Example Item**:

```json
{
  "config_scope": "GLOBAL",
  "config_section": "settings#main",
  "section_type": "settings",
  "email_domain": "gd-ms.com",
  "from_email": "aws-budget-alerts@gd-ms.com",
  "from_name": "Budget Alert System",
  "timezone": "America/New_York",
  "cooldown_hours": 24,
  "min_budget": 1000,
  "business_hours_start": 8,
  "business_hours_end": 18,
  "ghost_url_template": "http://ghost-aws.gd-ms.com/account/{account_id}",
  "accounts_table": "gdms_aws_accounts-dev",
  "version": 1,
  "updated_at": "2025-01-16T12:00:00Z",
  "updated_by": "admin@example.com"
}
```

**Use Cases**:

- Change business hours during daylight saving time transitions
- Update sender email address
- Modify minimum budget threshold to reduce noise

---

### 2. Alert Levels (`alerts#{LEVEL}`)

Configuration for each alert severity level. Create one item per level.

**Levels**: `INFO`, `WARNING`, `CRITICAL`, `ESCALATION`

**Key**: `config_scope=GLOBAL`, `config_section=alerts#{LEVEL}`

| Field           | Type         | Required | Default | Description                                                                                         |
| --------------- | ------------ | -------- | ------- | --------------------------------------------------------------------------------------------------- |
| `level`         | String       | Yes      | -       | Alert level name (INFO, WARNING, CRITICAL, ESCALATION)                                              |
| `threshold`     | Number       | Yes      | -       | Burn rate percentage to trigger this level (e.g., 115 = 15% over pace)                              |
| `color`         | String       | Yes      | -       | Hex color for email styling (e.g., `#17a2b8`)                                                       |
| `min_dollars`   | Number       | No       | `0`     | Minimum $ over budget to trigger (prevents alerts for tiny amounts)                                 |
| `max_per_month` | Number       | No       | `1`     | Maximum alerts of this level per account per month                                                  |
| `intervals`     | List[Number] | No       | `[0]`   | Days between consecutive alerts. intervals[0] = days to 2nd alert, intervals[1] = days to 3rd, etc. |

**Threshold Guidelines**:

- Thresholds must be in ascending order: INFO < WARNING < CRITICAL < ESCALATION
- Formula: `threshold = burn_rate_percentage` where 100% = exactly on pace

**Example Items**:

```json
// INFO level
{
  "config_scope": "GLOBAL",
  "config_section": "alerts#INFO",
  "section_type": "alerts",
  "level": "INFO",
  "threshold": 115,
  "color": "#17a2b8",
  "min_dollars": 100,
  "max_per_month": 2,
  "intervals": [7]
}

// WARNING level
{
  "config_scope": "GLOBAL",
  "config_section": "alerts#WARNING",
  "section_type": "alerts",
  "level": "WARNING",
  "threshold": 130,
  "color": "#ffc107",
  "min_dollars": 500,
  "max_per_month": 3,
  "intervals": [3, 7]
}

// CRITICAL level
{
  "config_scope": "GLOBAL",
  "config_section": "alerts#CRITICAL",
  "section_type": "alerts",
  "level": "CRITICAL",
  "threshold": 150,
  "color": "#fd7e14",
  "min_dollars": 2000,
  "max_per_month": 3,
  "intervals": [2, 5]
}

// ESCALATION level
{
  "config_scope": "GLOBAL",
  "config_section": "alerts#ESCALATION",
  "section_type": "alerts",
  "level": "ESCALATION",
  "threshold": 175,
  "color": "#dc3545",
  "min_dollars": 5000,
  "max_per_month": 4,
  "intervals": [1, 2, 4]
}
```

**Use Cases**:

- Adjust thresholds for stricter or looser alerting
- Increase `min_dollars` to reduce noise from small overages
- Modify `max_per_month` to control alert frequency
- Update colors for accessibility or branding

---

### 3. Recipients by Type (`recipients_by_type#...`)

Email recipients organized by alert type and severity level. Different alert types have different recipient structures.

**Alert Types**:

- `FORECAST` - Projected overspend based on ML forecast (has severity levels)
- `ACTUAL` - Budget already exceeded (has severity levels)
- `MONTHLY` - Monthly summary reports (flat, no severity levels)
- `ANOMALY` - Cost anomaly alerts (flat, no severity levels)

**Severity Levels** (for FORECAST and ACTUAL): `INFO`, `WARNING`, `CRITICAL`, `ESCALATION`

#### 3.1 FORECAST/ACTUAL Recipients (with severity levels)

**Key**: `config_scope=GLOBAL`, `config_section=recipients_by_type#{TYPE}#{LEVEL}`

Examples:

- `recipients_by_type#FORECAST#INFO`
- `recipients_by_type#ACTUAL#ESCALATION`

| Field            | Type         | Required | Description                                         |
| ---------------- | ------------ | -------- | --------------------------------------------------- |
| `alert_type`     | String       | Yes      | Alert type (FORECAST or ACTUAL)                     |
| `level`          | String       | Yes      | Severity level name                                 |
| `to`             | List[String] | Yes      | Primary recipients (role names or emails)           |
| `cc`             | List[String] | No       | CC recipients (role names or emails)                |
| `override`       | Boolean      | No       | If true, completely replace with custom recipients  |
| `conditional_to` | List[Object] | No       | Recipients included only when conditions are met    |
| `conditional_cc` | List[Object] | No       | CC recipients included only when conditions are met |

**conditional_to/conditional_cc** Object:
| Field | Type | Description |
|-------|------|-------------|
| `role` | String | Role name to include |
| `min_overage_dollars` | Number | Minimum overage amount to include this recipient |

#### 3.2 MONTHLY/ANOMALY Recipients (flat, no levels)

**Key**: `config_scope=GLOBAL`, `config_section=recipients_by_type#{TYPE}`

Examples:

- `recipients_by_type#MONTHLY`
- `recipients_by_type#ANOMALY`

| Field        | Type         | Required | Description                     |
| ------------ | ------------ | -------- | ------------------------------- |
| `alert_type` | String       | Yes      | Alert type (MONTHLY or ANOMALY) |
| `to`         | List[String] | Yes      | Primary recipients              |
| `cc`         | List[String] | No       | CC recipients                   |

**Role Names** (resolved from account metadata):

- `account_admin` - Primary account administrator
- `delegate_admin` - Delegate administrator
- `dpme` - DPME
- `program_manager` - Program Manager
- `program_cam` - Program CAM
- `it_ppm` - IT PPM
- `lob_manager` - LOB Manager
- `additional_contacts` - Additional contacts list

**Example Items**:

```json
// FORECAST INFO - minimal distribution
{
  "config_scope": "GLOBAL",
  "config_section": "recipients_by_type#FORECAST#INFO",
  "section_type": "recipients_by_type",
  "alert_type": "FORECAST",
  "level": "INFO",
  "to": ["account_admin"],
  "cc": ["additional_contacts", "product_team"]
}

// FORECAST WARNING - add DPME
{
  "config_scope": "GLOBAL",
  "config_section": "recipients_by_type#FORECAST#WARNING",
  "section_type": "recipients_by_type",
  "alert_type": "FORECAST",
  "level": "WARNING",
  "to": ["dpme", "account_admin"],
  "cc": ["additional_contacts", "product_team"]
}

// ACTUAL ESCALATION - with conditional LOB manager
{
  "config_scope": "GLOBAL",
  "config_section": "recipients_by_type#ACTUAL#ESCALATION",
  "section_type": "recipients_by_type",
  "alert_type": "ACTUAL",
  "level": "ESCALATION",
  "to": ["dpme", "account_admin", "program_manager"],
  "cc": ["program_cam", "it_ppm", "additional_contacts", "product_team"],
  "conditional_to": [
    {"role": "lob_manager", "min_overage_dollars": 2000}
  ]
}

// MONTHLY - flat structure (no severity levels)
{
  "config_scope": "GLOBAL",
  "config_section": "recipients_by_type#MONTHLY",
  "section_type": "recipients_by_type",
  "alert_type": "MONTHLY",
  "to": ["dpme", "account_admin", "program_manager"],
  "cc": ["additional_contacts", "product_team"]
}

// ANOMALY - flat structure (no severity levels)
{
  "config_scope": "GLOBAL",
  "config_section": "recipients_by_type#ANOMALY",
  "section_type": "recipients_by_type",
  "alert_type": "ANOMALY",
  "to": ["dpme", "account_admin", "program_manager"],
  "cc": ["additional_contacts", "product_team"]
}
```

**Use Cases**:

- Different recipients for FORECAST vs ACTUAL alerts
- Add LOB manager only when overage exceeds threshold (conditional_to)
- Simple flat recipient lists for MONTHLY and ANOMALY alerts
- Adjust escalation chain per alert type

---

### 4. Static Recipients (`static_recipients#main`)

Direct email mappings for role names that don't come from account metadata.

**Key**: `config_scope=GLOBAL`, `config_section=static_recipients#main`

| Field      | Type   | Description                                   |
| ---------- | ------ | --------------------------------------------- |
| `mappings` | Object | Key-value pairs of role name to email address |

**Example Item**:

```json
{
  "config_scope": "GLOBAL",
  "config_section": "static_recipients#main",
  "section_type": "static_recipients",
  "mappings": {
    "finance": "finance-team@example.com",
    "product_team": "product-team@example.com",
    "security": "security-alerts@example.com"
  }
}
```

**Use Cases**:

- Define distribution lists that don't vary by account
- Add team email addresses for cross-cutting concerns

---

### 5. LOB-Specific Recipients (`lob_recipients#{LOB_NAME}`)

Custom recipients for specific Lines of Business. Supports two modes:

1. **Flat structure**: Same recipients for all alert types (applies to FORECAST, ACTUAL, MONTHLY, ANOMALY)
2. **Type-specific structure**: Different recipients per alert type using `by_type`

**Key**: `config_scope=GLOBAL`, `config_section=lob_recipients#{LOB_NAME}`

| Field      | Type         | Required | Description                                         |
| ---------- | ------------ | -------- | --------------------------------------------------- |
| `lob_name` | String       | Yes      | Line of Business name (must match account metadata) |
| `to`       | List[String] | No       | Additional TO recipients (flat mode)                |
| `cc`       | List[String] | No       | Additional CC recipients (flat mode)                |
| `override` | Boolean      | No       | If true, completely replace default recipients      |
| `by_type`  | Object       | No       | Type-specific recipients (see structure below)      |

**by_type** Structure:

```
{
  "FORECAST": {
    "{LEVEL}": {"to": [...], "cc": [...]}
  },
  "ACTUAL": {
    "{LEVEL}": {"to": [...], "cc": [...]}
  },
  "MONTHLY": {"to": [...], "cc": [...]},
  "ANOMALY": {"to": [...], "cc": [...]}
}
```

**Example Items**:

```json
// Engineering LOB - flat structure (applies to ALL alert types)
{
  "config_scope": "GLOBAL",
  "config_section": "lob_recipients#Engineering",
  "section_type": "lob_recipients",
  "lob_name": "Engineering",
  "to": ["eng-manager@example.com"],
  "cc": ["eng-team@example.com"],
  "override": false
}

// Finance LOB - type-specific structure
{
  "config_scope": "GLOBAL",
  "config_section": "lob_recipients#Finance",
  "section_type": "lob_recipients",
  "lob_name": "Finance",
  "override": false,
  "by_type": {
    "FORECAST": {
      "CRITICAL": {
        "to": ["finance-critical@example.com"],
        "cc": ["cfo@example.com"]
      },
      "ESCALATION": {
        "to": ["finance-escalation@example.com", "cfo@example.com"],
        "cc": []
      }
    },
    "ACTUAL": {
      "ESCALATION": {
        "to": ["finance-urgent@example.com", "cfo@example.com"],
        "cc": ["finance-analysts@example.com"]
      }
    },
    "ANOMALY": {
      "to": ["finance-ops@example.com"],
      "cc": []
    }
  }
}
```

**Use Cases**:

- Add LOB-specific managers to all alerts for their accounts (flat mode)
- Route certain alert types to specialized teams (by_type mode)
- Different escalation paths for FORECAST vs ACTUAL alerts

---

### 6. Account-Specific Recipients

Custom recipients for specific AWS accounts. Stored with account ID as partition key. Supports two modes:

1. **Flat structure**: Same recipients for all alert types
2. **Type-specific structure**: Different recipients per alert type using `by_type`

**Key**: `config_scope={ACCOUNT_ID}`, `config_section=custom_recipients#main`

| Field      | Type         | Required | Description                                              |
| ---------- | ------------ | -------- | -------------------------------------------------------- |
| `to`       | List[String] | No       | TO recipients for this account (flat mode)               |
| `cc`       | List[String] | No       | CC recipients for this account (flat mode)               |
| `override` | Boolean      | No       | If true, completely replace default and LOB recipients   |
| `by_type`  | Object       | No       | Type-specific recipients (same structure as LOB by_type) |

**by_type** Structure:

```
{
  "FORECAST": {
    "{LEVEL}": {"to": [...], "cc": [...]}
  },
  "ACTUAL": {
    "{LEVEL}": {"to": [...], "cc": [...]}
  },
  "MONTHLY": {"to": [...], "cc": [...]},
  "ANOMALY": {"to": [...], "cc": [...]}
}
```

**Example Items**:

```json
// Flat structure - applies to ALL alert types
{
  "config_scope": "123456789012",
  "config_section": "custom_recipients#main",
  "section_type": "custom_recipients",
  "to": ["special-project-lead@example.com", "vendor-contact@partner.com"],
  "cc": ["finance-team@example.com"],
  "override": true
}

// Type-specific structure - different recipients per alert type
{
  "config_scope": "987654321098",
  "config_section": "custom_recipients#main",
  "section_type": "custom_recipients",
  "override": true,
  "by_type": {
    "FORECAST": {
      "INFO": {
        "to": ["forecast-info@example.com"],
        "cc": []
      },
      "ESCALATION": {
        "to": ["forecast-urgent@example.com", "exec@example.com"],
        "cc": ["finance@example.com"]
      }
    },
    "ACTUAL": {
      "ESCALATION": {
        "to": ["actual-escalation@example.com", "exec@example.com"],
        "cc": ["finance@example.com", "ops@example.com"]
      }
    },
    "MONTHLY": {
      "to": ["monthly-report@example.com"],
      "cc": []
    }
  }
}
```

**Use Cases**:

- Route specific high-visibility accounts to executives
- Include external vendor contacts for partnership accounts
- Completely customize recipients for special projects
- Different escalation paths for FORECAST vs ACTUAL alerts per account

---

### 7. Threshold Scaling (`threshold_scaling#main`)

Budget-based logarithmic scaling for alert thresholds. Larger budgets get tighter thresholds.

**Key**: `config_scope=GLOBAL`, `config_section=threshold_scaling#main`

| Field              | Type    | Required | Default | Description                                   |
| ------------------ | ------- | -------- | ------- | --------------------------------------------- |
| `enabled`          | Boolean | No       | `true`  | Enable/disable threshold scaling              |
| `reference_budget` | Number  | No       | `1000`  | Budget where no scaling applied ($)           |
| `scaling_factor`   | Number  | No       | `6`     | How aggressively thresholds tighten per log10 |
| `min_threshold`    | Number  | No       | `101`   | Floor - never alert below this percentage     |

**Formula**: `adjusted_threshold = base_threshold - (log10(budget/reference_budget) × scaling_factor)`

**Example**:

- Budget $1,000: No adjustment (at reference)
- Budget $10,000: Threshold reduced by 6% (log10(10) × 6)
- Budget $100,000: Threshold reduced by 12% (log10(100) × 6)

**Example Item**:

```json
{
  "config_scope": "GLOBAL",
  "config_section": "threshold_scaling#main",
  "section_type": "threshold_scaling",
  "enabled": true,
  "reference_budget": 1000,
  "scaling_factor": 6,
  "min_threshold": 101
}
```

**Use Cases**:

- Disable scaling for uniform thresholds across all budgets
- Adjust scaling_factor for more/less aggressive tightening
- Raise min_threshold to prevent overly sensitive alerts

---

### 8. Pace Alerting (`pace_alerting#main`)

Configuration for ACTUAL alerts (when budget is exceeded). Uses severity scoring based on overspend amount and time remaining in month.

**Key**: `config_scope=GLOBAL`, `config_section=pace_alerting#main`

| Field                 | Type         | Description                                        |
| --------------------- | ------------ | -------------------------------------------------- |
| `severity_thresholds` | Object       | Score ranges for each alert level                  |
| `minimum_overspend`   | Object       | Minimum overspend to trigger any alert             |
| `milestones`          | List[Object] | Predictive milestone alerts before budget exceeded |

**Severity Score Formula**: `severity_score = overspend_pct × (1 + √(days_remaining_ratio))`

**severity_thresholds** Object:
| Level | Default Score | Meaning |
|-------|--------------|---------|
| `INFO` | `0` | severity_score < 8 |
| `WARNING` | `8` | 8 ≤ severity_score < 20 |
| `CRITICAL` | `20` | 20 ≤ severity_score < 40 |
| `ESCALATION` | `40` | severity_score ≥ 40 |

**minimum_overspend** Object:
| Field | Default | Description |
|-------|---------|-------------|
| `dollars` | `5.0` | Minimum $ over budget |
| `percent_of_budget` | `1.0` | Or minimum % of budget |

**milestones** Array (predictive alerts):
| Field | Description |
|-------|-------------|
| `threshold` | Budget % consumed (e.g., 70, 95) |
| `pace_ratio` | Minimum pace ratio to trigger (e.g., 1.10 = 10% ahead) |
| `level` | Alert level to send |

**Example Item**:

```json
{
  "config_scope": "GLOBAL",
  "config_section": "pace_alerting#main",
  "section_type": "pace_alerting",
  "severity_thresholds": {
    "INFO": 0,
    "WARNING": 8,
    "CRITICAL": 20,
    "ESCALATION": 40
  },
  "minimum_overspend": {
    "dollars": 5.0,
    "percent_of_budget": 1.0
  },
  "milestones": [
    { "threshold": 70, "pace_ratio": 1.1, "level": "INFO" },
    { "threshold": 95, "pace_ratio": 1.05, "level": "WARNING" }
  ]
}
```

**Use Cases**:

- Adjust severity thresholds for more/less aggressive escalation
- Increase minimum_overspend to reduce noise from small variances
- Add/remove milestones for predictive alerting

---

### 9. ML Config (`ml_config#main`)

Machine learning forecast configuration.

**Key**: `config_scope=GLOBAL`, `config_section=ml_config#main`

| Field           | Type    | Required | Default | Description                   |
| --------------- | ------- | -------- | ------- | ----------------------------- |
| `forecast_days` | Number  | No       | `30`    | Days to forecast ahead        |
| `enabled`       | Boolean | No       | `true`  | Enable/disable ML forecasting |

**Example Item**:

```json
{
  "config_scope": "GLOBAL",
  "config_section": "ml_config#main",
  "section_type": "ml_config",
  "forecast_days": 30,
  "enabled": true
}
```

**Use Cases**:

- Disable ML forecasting temporarily during system issues
- Adjust forecast horizon for longer-term predictions

---

### 10. Dry Run Config (`dry_run#main`)

Testing mode configuration. When enabled, all emails redirect to test addresses.

**Key**: `config_scope=GLOBAL`, `config_section=dry_run#main`

| Field                      | Type         | Required    | Default | Description                                 |
| -------------------------- | ------------ | ----------- | ------- | ------------------------------------------- |
| `enabled`                  | Boolean      | No          | `false` | Enable dry-run mode                         |
| `email`                    | List[String] | Conditional | -       | Required when enabled. Test email addresses |
| `include_debug_info`       | Boolean      | No          | `true`  | Include debug information in test emails    |
| `include_recipient_debug`  | Boolean      | No          | `true`  | Show recipient resolution details           |
| `include_evaluation_debug` | Boolean      | No          | `true`  | Show alert evaluation details               |
| `include_config_debug`     | Boolean      | No          | `true`  | Show configuration details                  |

**Example Item**:

```json
{
  "config_scope": "GLOBAL",
  "config_section": "dry_run#main",
  "section_type": "dry_run",
  "enabled": true,
  "email": ["test@example.com", "qa-team@example.com"],
  "include_debug_info": true,
  "include_recipient_debug": true,
  "include_evaluation_debug": true,
  "include_config_debug": true
}
```

**Use Cases**:

- Test configuration changes before going live
- Debug alert routing issues
- QA new email templates

---

### 11. Theme Colors (`theme#colors`)

Email template color scheme.

**Key**: `config_scope=GLOBAL`, `config_section=theme#colors`

| Field    | Type   | Description                                  |
| -------- | ------ | -------------------------------------------- |
| `colors` | Object | Key-value pairs of color names to hex values |

**Available Color Keys**:

```
# Backgrounds
body_background       - Page/body background
container_background  - Main content container
card_background       - Cards and sections

# Borders
border                - Standard borders
border_accent         - Emphasized borders

# Text
text_primary          - Main headings and values
text_body             - Body text
text_secondary        - Labels and secondary text
text_muted            - Footnote text

# Charts
chart_background      - Chart canvas background
chart_grid            - Grid lines
chart_bar_positive    - Green bars (under budget)
chart_bar_warning     - Yellow bars (warning)
chart_bar_negative    - Red bars (over budget)
chart_bar_neutral     - Neutral bars
chart_text_on_bar     - Text inside colored bars

# Timeline
timeline_elapsed          - Days elapsed
timeline_elapsed_weekend  - Weekend days elapsed
timeline_remaining        - Days remaining
timeline_remaining_weekend - Weekend days remaining

# Health Status
health_green          - Under budget
health_yellow         - Near budget
health_red            - Over budget
```

**Example Item**:

```json
{
  "config_scope": "GLOBAL",
  "config_section": "theme#colors",
  "section_type": "theme",
  "colors": {
    "body_background": "#f8fafc",
    "container_background": "#ffffff",
    "card_background": "#f1f5f9",
    "border": "#e2e8f0",
    "text_primary": "#1e293b",
    "text_body": "#334155",
    "health_green": "#4ade80",
    "health_yellow": "#fbbf24",
    "health_red": "#ef4444"
  }
}
```

**Use Cases**:

- Customize for corporate branding
- Improve accessibility (higher contrast)
- Switch between light/dark themes

---

### 12. Anomaly Detection (`anomaly_detection#main`)

AWS Cost Anomaly Detection integration settings.

**Key**: `config_scope=GLOBAL`, `config_section=anomaly_detection#main`

| Field                       | Type    | Required | Default | Description                              |
| --------------------------- | ------- | -------- | ------- | ---------------------------------------- |
| `enabled`                   | Boolean | No       | `true`  | Enable anomaly detection                 |
| `min_impact_dollars`        | Number  | No       | `100`   | Minimum $ impact to report anomalies     |
| `lookback_days`             | Number  | No       | `30`    | Days to look back for anomalies (max 90) |
| `include_in_monthly_report` | Boolean | No       | `true`  | Include anomalies in monthly reports     |

**Example Item**:

```json
{
  "config_scope": "GLOBAL",
  "config_section": "anomaly_detection#main",
  "section_type": "anomaly_detection",
  "enabled": true,
  "min_impact_dollars": 100,
  "lookback_days": 30,
  "include_in_monthly_report": true
}
```

---

### 13. Standalone Anomaly Alerts (`standalone_anomaly_alerts#main`)

Separate email alerts for cost anomalies (independent from budget alerts).

**Key**: `config_scope=GLOBAL`, `config_section=standalone_anomaly_alerts#main`

| Field                | Type         | Required | Default  | Description                              |
| -------------------- | ------------ | -------- | -------- | ---------------------------------------- |
| `enabled`            | Boolean      | No       | `false`  | Enable standalone anomaly alerts         |
| `min_impact_dollars` | Number       | No       | `500`    | Minimum $ impact to trigger alert        |
| `min_anomaly_score`  | Number       | No       | `70`     | Minimum AWS anomaly score (0-100)        |
| `max_per_month`      | Number       | No       | `3`      | Max anomaly alerts per account per month |
| `intervals`          | List[Number] | No       | `[3, 7]` | Days between consecutive alerts          |
| `recipients`         | Object       | No       | -        | Custom recipients for anomaly alerts     |

**Example Item**:

```json
{
  "config_scope": "GLOBAL",
  "config_section": "standalone_anomaly_alerts#main",
  "section_type": "standalone_anomaly_alerts",
  "enabled": false,
  "min_impact_dollars": 500,
  "min_anomaly_score": 70,
  "max_per_month": 3,
  "intervals": [3, 7],
  "recipients": {
    "to": ["account_admin", "delegate_admin"],
    "cc": ["additional_contacts"]
  }
}
```

---

## Common Metadata Fields

All items should include these metadata fields:

| Field          | Type   | Description                                                     |
| -------------- | ------ | --------------------------------------------------------------- |
| `version`      | Number | Schema version (start at 1, increment on breaking changes)      |
| `updated_at`   | String | ISO 8601 timestamp of last update                               |
| `updated_by`   | String | Email or identifier of person/system making the change          |
| `section_type` | String | Type for GSI queries (e.g., `settings`, `alerts`, `recipients`) |

---

## Dashboard UI Recommendations

### List Views

1. **Settings Dashboard**: Single-page view of core settings with inline editing
2. **Alert Levels**: Table view of all 4 levels with columns for threshold, color, limits
3. **Recipients**: Matrix view showing recipients by level (TO/CC)
4. **Custom Recipients**: Two tabs - LOB-specific and Account-specific

### Validation Rules

1. Alert thresholds must be in ascending order
2. Business hours: start < end, both 0-23
3. Dry-run requires at least one email when enabled
4. All hex colors must be valid (#RRGGBB or #RGB)

### Audit Trail

Track `updated_at` and `updated_by` for all changes. Consider adding a change history/audit log for compliance.

### Search/Filter

Use the `section-type-index` GSI to efficiently query:

- All alert configurations: `section_type = 'alerts'`
- All recipient configurations: `section_type = 'recipients_by_type'`
- All custom recipients: `section_type IN ('custom_recipients', 'lob_recipients')`

---

## API Examples

### Query All Global Config

```python
response = table.query(
    KeyConditionExpression='config_scope = :scope',
    ExpressionAttributeValues={':scope': 'GLOBAL'}
)
```

### Query by Section Type (using GSI)

```python
# Get all alert level configurations
response = table.query(
    IndexName='section-type-index',
    KeyConditionExpression='section_type = :type',
    ExpressionAttributeValues={':type': 'alerts'}
)

# Get all recipients_by_type configurations
response = table.query(
    IndexName='section-type-index',
    KeyConditionExpression='section_type = :type',
    ExpressionAttributeValues={':type': 'recipients_by_type'}
)
```

### Get Account-Specific Config

```python
response = table.query(
    KeyConditionExpression='config_scope = :scope',
    ExpressionAttributeValues={':scope': '123456789012'}
)
```

### Update Single Item

```python
table.put_item(Item={
    'config_scope': 'GLOBAL',
    'config_section': 'settings#main',
    'section_type': 'settings',
    'email_domain': 'new-domain.com',
    # ... other fields
    'version': 1,
    'updated_at': '2025-01-16T12:00:00Z',
    'updated_by': 'admin@example.com'
})
```

---

## Migration from YAML

Use the provided seeding script to migrate from YAML to DynamoDB:

```bash
# Preview items without writing
python scripts/seed_config_dynamodb.py --dry-run

# Seed to DynamoDB
python scripts/seed_config_dynamodb.py --table-name budget-alert-config-dev
```

---

## Environment Variable Override

Note: Environment variables with `BUDGET_ALERT_` prefix still override DynamoDB values. This allows infrastructure-level overrides without changing the database (e.g., forcing dry-run mode in production deployments).
