# Cost API Endpoints

This directory contains AWS Cost Explorer API endpoints with proforma data analysis and advanced analytics capabilities.

## Endpoints

### 1. GET /api/costs/summary
General cost summary with optional proforma analysis integrated.

**Parameters:**
- `startDate` (required): Start date in YYYY-MM-DD format
- `endDate` (required): End date in YYYY-MM-DD format
- `granularity` (optional): 'DAILY' or 'MONTHLY' (default: 'MONTHLY')
- `groupBy` (optional): 'SERVICE', 'LINKED_ACCOUNT', or 'REGION' (default: 'SERVICE')
- `environment` (optional): 'commercial' or 'govcloud' (default: 'commercial')
- `proforma` (optional): boolean to enable proforma analysis (default: false)
- `proformaAccountId` (optional): Account ID for proforma analysis (default: '253821132832')
- `masterAccountId` (optional): Master account ID (default: '205950196477')

**Examples:**
```bash
# Standard cost summary (historical data)
GET /api/costs/summary?startDate=2025-07-01&endDate=2025-07-31&granularity=MONTHLY&groupBy=SERVICE

# Proforma cost analysis (historical data) - includes proformaBreakdown field
GET /api/costs/summary?startDate=2025-07-01&endDate=2025-07-31&granularity=MONTHLY&groupBy=SERVICE&proforma=true
```

### 2. GET /api/costs/analysis
Advanced cost analysis with budget comparison, anomalies, trends, and proforma breakdown.

**Parameters:**
- `startDate` (required): Start date in YYYY-MM-DD format
- `endDate` (required): End date in YYYY-MM-DD format
- `granularity` (optional): 'DAILY' or 'MONTHLY' (default: 'MONTHLY')
- `groupBy` (optional): 'SERVICE', 'LINKED_ACCOUNT', or 'REGION' (default: 'LINKED_ACCOUNT')
- `environment` (optional): 'commercial' or 'govcloud' (default: 'commercial')
- `proforma` (optional): boolean to enable proforma analysis (default: false)
- `includeBudget` (optional): boolean to include budget analysis (default: true)
- `anomalyThreshold` (optional): Percentage threshold for anomaly detection (default: 25)

**Examples:**
```bash
# Comprehensive cost analysis with budget comparison
GET /api/costs/analysis?startDate=2025-07-01&endDate=2025-07-31&granularity=DAILY&groupBy=LINKED_ACCOUNT&includeBudget=true

# Full analysis with proforma breakdown
GET /api/costs/analysis?startDate=2025-07-01&endDate=2025-07-31&granularity=DAILY&groupBy=LINKED_ACCOUNT&proforma=true&includeBudget=true&anomalyThreshold=20
```

### 3. GET /api/costs/forecast
Cost forecasting with optional proforma analysis.

**Parameters:**
- `startDate` (required): Forecast start date in YYYY-MM-DD format
- `endDate` (required): Forecast end date in YYYY-MM-DD format
- `metric` (optional): Cost metric (default: 'UNBLENDED_COST')
- `granularity` (optional): 'DAILY' or 'MONTHLY' (default: 'DAILY')
- `environment` (optional): 'commercial' or 'govcloud' (default: 'commercial')
- `proforma` (optional): boolean to enable proforma forecast (default: false)
- `proformaAccountId` (optional): Account ID for proforma analysis (default: '253821132832')

**Example:**
```bash
# Forecast for September 2025 (must be future dates)
GET /api/costs/forecast?startDate=2025-09-01&endDate=2025-09-30&metric=UNBLENDED_COST&granularity=MONTHLY&proforma=true
```

### 4. GET /api/costs/test
Test endpoint with documentation and example URLs.

## Advanced Analysis Features

### Budget vs Actual Analysis
The `/api/costs/analysis` endpoint compares actual costs against budgeted costs from account metadata:

- **Data Source**: Uses `estimatedMonthlyCharge` field from account details API
- **Account Grouping**: Groups costs by `LINKED_ACCOUNT` and matches with account metadata
- **Variance Calculation**: Calculates actual vs budget variance and percentage
- **Status Classification**: 
  - `over`: >10% over budget
  - `under`: >10% under budget  
  - `on_target`: Within ±10% of budget

### Anomaly Detection
Detects unusual cost patterns using statistical analysis:

- **Algorithm**: Moving average baseline with configurable threshold
- **Threshold**: Configurable percentage deviation (default: 25%)
- **Data Requirements**: Minimum 3 data points for meaningful detection
- **Output**: Date, actual cost, expected cost, and deviation percentage

### Cost Trends Analysis
Analyzes cost patterns and trends:

- **Trend Direction**: Increasing, decreasing, or stable
- **Period Changes**: Period-over-period percentage changes
- **Total Change**: Overall change from start to end of period
- **Average Change**: Average percentage change across periods

### Proforma vs Billable Analysis
When `proforma=true`, provides detailed breakdown:

- **Master Account Cost**: Calculated as total minus proforma account
- **Proforma Account Cost**: Costs from assumed role account (253821132832)
- **Proforma Percentage**: Percentage of total costs attributed to proforma account
- **Breakdown**: Detailed cost structure for both accounts

### Daily Averages and Patterns
For daily granularity data:

- **Average Daily Cost**: Total cost divided by number of days
- **Cumulative Costs**: Running total across the period
- **Daily Patterns**: Day-by-day cost progression

## Proforma Data Analysis

### How it Works

1. **Master Account Access**: Uses commercial AWS credentials to access the master account (default: 205950196477)
2. **Role Assumption**: Assumes a role into the proforma account (default: 253821132832) using commercial credentials
3. **Cost Calculation**: 
   - Gets total costs from master account
   - Gets costs from proforma account via assumed role
   - Calculates master-only costs: `Master Total - Proforma Total`

### Response Structure

**Standard Response:**
```json
{
  "success": true,
  "data": {
    "resultsByTime": [...],
    "total": {...}
  }
}
```

**Proforma Response:**
```json
{
  "success": true,
  "data": {
    "masterAccount": {
      "accountId": "205950196477",
      "costs": {
        "resultsByTime": [...],
        "total": {...}
      }
    },
    "proformaAccount": {
      "accountId": "253821132832", 
      "costs": {
        "resultsByTime": [...],
        "total": {...}
      }
    },
    "totals": {
      "master": 1000.00,
      "proforma": 750.00,
      "masterOnly": 250.00,
      "grandTotal": 1000.00
    }
  }
}
```

## Configuration

### Environment Variables

Required for proforma functionality:
- `AWS_COMMERCIAL_ACCESS_KEY_ID`: Commercial AWS access key
- `AWS_COMMERCIAL_SECRET_ACCESS_KEY`: Commercial AWS secret key
- `AWS_COMMERCIAL_REGION` (optional): AWS region (default: us-east-1)

Optional role assumption configuration:
- `AWS_ASSUME_ROLE_NAME`: Role name to assume (default: GDMSOrganizationsRole)
- `AWS_ASSUME_ROLE_EXTERNAL_ID`: External ID for role assumption
- `AWS_ASSUME_ROLE_DURATION`: Session duration in seconds (default: 3600)

### Account IDs

- **Master Account**: 205950196477 (contains master billing data)
- **Proforma Account**: 253821132832 (account to assume role into)

## Usage Notes

1. **Environment Restriction**: Proforma analysis only works with commercial environment
2. **Date Requirements**: 
   - Historical cost data: Use past dates (e.g., 2025-07-01 to 2025-07-31)
   - Forecast data: Must use future dates (e.g., 2025-09-01 to 2025-09-30)
   - Current date: 2025-08-13
3. **Role Assumption**: Requires appropriate IAM role setup in the proforma account
4. **Cost Calculation**: Master account costs are calculated by subtracting proforma costs from total costs
5. **Permissions**: Ensure the commercial credentials have permissions to:
   - Access Cost Explorer in master account
   - Assume role in proforma account
   - Access Cost Explorer in proforma account via assumed role

## Error Handling

Common errors:
- `400 Bad Request`: Invalid date format or missing required parameters
- `403 Forbidden`: Insufficient permissions for role assumption or Cost Explorer access
- `500 Internal Server Error`: AWS API errors or credential issues

For proforma-specific errors, ensure:
1. Commercial credentials are properly configured
2. Role exists in target account with proper trust relationship
3. Cost Explorer permissions are available in both accounts