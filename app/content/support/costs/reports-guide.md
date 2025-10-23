---
title: Creating and Scheduling Cost Reports
lastUpdated: 2025-10-21
icon: i-heroicons-document-text
---

# Creating and Scheduling Cost Reports

## Overview

Generate cost reports in multiple formats and schedule them for automatic delivery via email. Reports capture your current view settings at the time of creation.

**Important**: Reports contain only the data visible in your configured view (selected accounts, timeframe, data mode, and filters).

---

## Accessing Report Features

### From Cost Dashboard
1. Navigate to **Accounts** → **Cost Dashboard**
2. Configure your view (accounts, timeframe, data mode)
3. Click report buttons in the header:
   - **Schedule** - Set up recurring automated reports
   - **Generate Report** - Create a one-time shareable report

### From Your Profile
- Navigate to **Profile** → **Scheduled Reports** tab
- View, manage, and create all scheduled reports

---

## One-Time Reports (Shareable Links)

Generate a report of your current view and receive a shareable download link.

### Creating a Shareable Report

1. Configure your cost view (accounts, timeframe, data mode)
2. Click **Generate Report** button
3. Enter a report name
4. Click **Generate Link**
5. Copy and share the link

**Link Properties:**
- Valid for 90 days
- No authentication required to download
- Stored in S3

---

## Scheduled Reports

Set up recurring reports that are generated and emailed automatically.

### Quick Schedule

1. Configure your cost view
2. Click **Schedule** button
3. Enter report name
4. Choose frequency (Daily, Weekly, Monthly, Quarterly)
5. Select delivery time and timezone
6. Click **Create Report**

The report captures your current view configuration (accounts, timeframe, data mode).

### Advanced Scheduling

Access advanced options:

1. Click **Advanced Options** in the schedule modal, or
2. Go to **Profile** → **Scheduled Reports** → **Create New Report**

**Step 1: Basic Info**
- **Report Name**: Descriptive name
- **Description**: Optional notes

**Step 2: Report Configuration**

**Accounts**
- Leave empty for organization-wide report
- Or select specific accounts
- Multiple selections allowed

**Timeframe Options**
- This Month
- Last Month
- Last 3 Months
- Last 6 Months
- Last 12 Months
- Year to Date
- Last Year

**Data Mode**
- **Billable**: Raw AWS costs (organization-wide only)
- **Proforma**: Costs with savings plans distributed

**Report Format**
- **PDF**: Visual report with charts and tables
- **Excel (XLSX)**: Multi-sheet workbook with raw data
- **CSV**: Comma-separated values
- **JSON**: Structured data format

**Include in Report**
- **Service breakdown**: Costs by AWS service
- **Historical trends**: Previous period comparisons
- **Cost forecast**: Projected costs for next period

**Step 3: Schedule**

**Frequency Options**

**Daily**
- Runs every day at specified time

**Weekly**
- Choose day of week (Monday - Sunday)

**Monthly**
- Choose day of month (1-31)
- Note: AWS cost data typically finalizes 24-48 hours after month end

**Quarterly**
- Choose which month of quarter (1st, 2nd, or 3rd)

**Time & Timezone**
- Select delivery time
- Select timezone from dropdown
- Supported US timezones and UTC

**Next Run Preview**: Displays next scheduled execution time

**Step 4: Email Configuration**

**Recipients**
- **Users**: Reports sent to your email only
- **Admins**: Can add multiple recipients (comma-separated)

**Email Subject**
- Default: `AWS Cost Report for {{reportPeriod}}`
- Customize with template variables

**Email Body** (Advanced)
- Check "Customize email body" to edit
- Use HTML or plain text
- Insert template variables for dynamic content

**Template Variables**

All variables use `{{variable}}` syntax:

**Basic Info:**
- `{{reportName}}` - Report name
- `{{timeframe}}` - Period covered
- `{{dataMode}}` - Billable or Proforma
- `{{accountCount}}` - Number of accounts included
- `{{format}}` - Report format
- `{{userName}}` - Recipient name

**Current Date** (when report runs):
- `{{currentDate}}`, `{{currentMonth}}`, `{{currentYear}}`, `{{currentDay}}`

**Report Period:**
- `{{startDate}}`, `{{startMonth}}`, `{{startYear}}`, `{{startDay}}`
- `{{endDate}}`, `{{endMonth}}`, `{{endYear}}`, `{{endDay}}`
- `{{dateRange}}` - Full date range
- `{{reportPeriod}}` - Period description
- `{{quarter}}` - Quarter notation

**Example Custom Subject:**
```
{{startMonth}} AWS Costs - {{accountCount}} Accounts
```

**Example Custom Body:**
```html
<p>Hello {{userName}},</p>

<p>Your AWS cost report for <strong>{{reportPeriod}}</strong> is attached.</p>

<p>Report includes {{accountCount}} accounts in {{format}} format.</p>
```

---

## Managing Scheduled Reports

### View All Reports

**Location**: Profile → Scheduled Reports tab

**Filter by Status:**
- **All** - All reports
- **Active** - Currently running reports
- **Paused** - Disabled reports

### Report Card Information

Each scheduled report displays:
- Report name and description
- Schedule frequency and time
- Next run time
- Status (Active/Paused)
- Configuration summary

### Report Actions

**Edit**
- Modify report settings
- Change schedule or recipients
- Update email template

**Pause/Resume**
- Disable temporarily without deleting
- Resume to reactivate
- Next run time recalculates automatically

**Test**
- Generate and send report immediately
- Uses current date and data
- Sends to configured recipients
- Does not affect schedule

**Delete**
- Permanently remove scheduled report
- Confirmation required
- Execution history remains available

**View History**
- View all past executions
- Success/failure status
- Delivery timestamps
- Error messages

### Report Limits

**Users**: Up to 10 scheduled reports
**Admins**: Unlimited

---

## Report Format Details

### PDF Format

**Contains:**
- Title page with metadata
- Cost summary with key metrics
- Service breakdown table (if enabled)
- Historical trend charts (if enabled)
- Cost forecast (if enabled)

**File Size**: Typically 200-500 KB

### Excel (XLSX) Format

**Contains multiple sheets:**
- Summary - Key metrics and totals
- Account Details - Per-account breakdown
- Service Breakdown - Costs by service (if enabled)
- Historical Data - Time series data (if enabled)
- Forecast - Projected costs (if enabled)
- Metadata - Report configuration

**Features:**
- Auto-sized columns
- Frozen header rows
- Formatted currency values

**File Size**: Typically 50-200 KB

### CSV Format

**Contains:**
- Single flat file with all data
- Headers in first row
- Comma-separated values
- UTF-8 encoding

**Note**: Multiple data types create a ZIP file with multiple CSVs

**File Size**: Typically 10-50 KB

### JSON Format

**Contains:**
- Structured data in JSON format
- All metrics and metadata
- Nested objects for complex data

**File Size**: Typically 20-100 KB

---

## Configuration Notes

### Scheduling

- Schedule monthly reports for day 2-3 to allow AWS cost data to finalize
- Test reports before scheduling using the "Test" button
- Default email template is pre-configured

### Report Configuration

- Include historical trends for previous period comparisons
- Use Proforma data mode for internal chargeback with savings plans distributed
- Include service breakdown to view per-service costs
- Forecasts apply to future periods only

### Email Templates

- Keep subject lines concise
- Use template variables for dynamic content
- Test custom templates before scheduling
- Simple HTML renders more reliably across email clients

### Organization

- Use descriptive report names
- Add descriptions for future reference
- Pause reports instead of deleting to preserve configuration
- Review and clean up unused reports periodically

---

## Troubleshooting

### Report Not Arriving

1. Check spam folder
2. Verify recipient email address in report settings
3. Check execution history for errors
4. Contact support if executions show success but email not received

### Report Contains Unexpected Data

- Verify timeframe selection (e.g., "Last Month" on Oct 3rd covers September)
- Confirm account selection (empty = all accounts)
- Check data mode (Billable vs Proforma)
- Note: Recent costs may have AWS reporting delays

### Can't Create More Reports

- User limit: 10 reports maximum
- Delete unused reports or contact admin

### Template Variables Not Working

- Use exact syntax: `{{variable}}` without spaces
- Verify correct spelling (case-sensitive)
- Use Test button to verify rendering

---

## Additional Information

- View execution history to see detailed run information
- Use Test button for immediate feedback
- Advanced mode shows next 3 scheduled run times
- Contact support for assistance

