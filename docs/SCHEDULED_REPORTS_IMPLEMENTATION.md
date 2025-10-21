# Scheduled Reports - Implementation Complete ✅

## Overview

A comprehensive scheduled reports system has been implemented for GHOST Cost Dashboard. Users can now schedule automated cost reports to be sent via email on a recurring basis. Admins have full control over all schedules, recipients, and email templates.

---

## 🎉 What's Been Built

### **1. Infrastructure (Terraform)** ✅

#### DynamoDB Tables
- `ghost-scheduled-reports` - Stores scheduled report configurations
  - GSI: `UserStatusIndex` - Query user's reports by status
  - GSI: `NextRunTimeIndex` - Scheduler queries for due reports
- `ghost-email-templates` - Admin-managed custom email templates
  - GSI: `TemplateTypeIndex` - Query templates by category
- `ghost-report-executions` - Execution history (30-day TTL)

#### AWS SES Configuration
- Email identity verification
- Configuration set for delivery tracking
- SNS topic for bounce/complaint notifications
- CloudWatch event tracking

#### IAM Permissions
- DynamoDB read/write for ECS tasks
- SES sending permissions with from-address restrictions
- SNS publish for notifications

**Location:** `terraform/scheduled-reports.tf`, `terraform/ses.tf`, `terraform/iam.tf`

---

### **2. Type Definitions** ✅

Complete TypeScript type system for:
- Scheduled reports (frequency, config, status)
- Report executions and history
- Email templates with variable substitution
- API request/response interfaces

**Location:** `shared/types/scheduled-reports.ts`, `shared/types/email-templates.ts`

---

### **3. Backend Services** ✅

#### Database Operations (`server/utils/scheduled-reports.ts`)
- Full CRUD for scheduled reports
- Scheduler queries (getUpcomingReports)
- Execution history tracking
- Next run time calculations (timezone-aware)
- Admin statistics aggregation

#### Email Service (`server/utils/email-service.ts`)
- AWS SES integration
- MIME message building with attachments
- HTML template rendering with variable substitution
- Email validation
- Default professional templates

#### Report Generator (`server/utils/report-generator.ts`)
- Reuses existing cost export system
- Fetches data from Cost Explorer APIs
- Generates reports in PDF/XLSX/CSV/JSON
- Returns Buffer for email attachment

#### Scheduler Service (`server/utils/report-scheduler.ts`)
- Executes due reports
- Email sending with error handling
- Status tracking and history recording
- Retry logic for failures

#### Scheduler Plugin (`server/plugins/scheduler.ts`)
- Croner integration
- Runs every minute
- Checks for and executes due reports
- Can be enabled/disabled via env var

---

### **4. API Endpoints** ✅

#### User Endpoints (`/api/scheduled-reports/`)
```
POST   /create              - Create new scheduled report
GET    /list                - List user's reports
GET    /:id                 - Get single report details
PATCH  /:id                 - Update report configuration
DELETE /:id                 - Delete report
POST   /:id/test            - Send test report immediately
PATCH  /:id/pause           - Pause/resume report
GET    /:id/history         - Get execution history
```

#### Admin Endpoints (`/api/admin/scheduled-reports/`)
```
GET    /all                 - View all reports (all users)
GET    /stats               - System statistics
POST   /:id/run-now         - Force execute any report
```

**Features:**
- Authentication required (OIDC)
- Authorization checks (user vs admin)
- Email validation
- Non-admins can only send to themselves
- Admins can set any recipient

---

### **5. Frontend Composables** ✅

#### `useScheduledReports()` - User Composable
```typescript
const {
  loading, error, reports, currentReport, executions,
  fetchReports, fetchReport, createReport, updateReport,
  deleteReport, sendTestReport, togglePause,
  fetchExecutionHistory, clearError
} = useScheduledReports()
```

#### `useScheduledReportsAdmin()` - Admin Composable
```typescript
const {
  loading, error, allReports, statistics,
  fetchAllReports, fetchStatistics, runReportNow
} = useScheduledReportsAdmin()
```

**Location:** `app/composables/useScheduledReports.ts`

---

### **6. Setup & Testing Scripts** ✅

#### NPM Scripts Added
```bash
npm run seed:email-templates          # Seed default templates to DynamoDB
npm run test:email <email>            # Test SES email sending
npm run test:scheduled-report <email> # Create a test report
```

#### Seed Script (`scripts/seed-email-templates.ts`)
Creates 3 default email templates:
1. **Professional Summary** - Full details with metadata box
2. **Brief Notification** - Minimal, clean design
3. **Detailed with Summary** - Rich details with quick summary section

#### Test Scripts
- `test-email.ts` - Verifies SES configuration
- `test-scheduled-report.ts` - Creates a test weekly report

**Documentation:** `scripts/README-scheduled-reports-setup.md`

---

### **7. Configuration** ✅

#### Dependencies Added to `package.json`
```json
{
  "@types/uuid": "^10.0.0"
}
```
**Note:** The project already includes `croner` for scheduling.

#### Environment Variables (`.env.example`)
```env
# DynamoDB Tables
SCHEDULED_REPORTS_TABLE=ghost-scheduled-reports
EMAIL_TEMPLATES_TABLE=ghost-email-templates
REPORT_EXECUTIONS_TABLE=ghost-report-executions

# SES Configuration
AWS_SES_FROM_EMAIL=noreply@your-domain.com
AWS_SES_FROM_NAME=GHOST Cost Dashboard
AWS_SES_REPLY_TO=support@your-domain.com
AWS_SES_CONFIGURATION_SET=ghost-scheduled-reports
AWS_SES_REGION=us-east-1

# Scheduler
REPORT_SCHEDULER_ENABLED=true
MAX_REPORTS_PER_USER=10

# Application URLs
NUXT_PUBLIC_SITE_URL=https://ghost.your-domain.com
NUXT_PUBLIC_API_URL=https://ghost.your-domain.com
```

---

## 🚀 Getting Started

### Step 1: Install Dependencies

```bash
npm install --legacy-peer-deps
```

This installs the new dependencies:
- `@types/uuid` - UUID types (already has uuid)

**Note:** The scheduler uses `croner` which is already installed in the project.

### Step 2: Configure Environment

Copy `.env.example` to `.env` and update the scheduled reports section:

```bash
# Update these values
AWS_SES_FROM_EMAIL=noreply@your-actual-domain.com
NUXT_PUBLIC_SITE_URL=https://your-actual-ghost-url.com
```

### Step 3: Deploy Infrastructure

```bash
cd terraform
terraform init
terraform plan
terraform apply
```

This creates:
- 3 DynamoDB tables
- SES email identity
- SNS topic
- IAM permissions

### Step 4: Verify SES

**If using email identity:**
1. Check email inbox for AWS SES verification
2. Click verification link

**If in SES Sandbox:**
- Can only send to verified addresses
- Request production access in AWS Console

### Step 5: Seed Email Templates

```bash
npm run seed:email-templates
```

Creates 3 default templates in DynamoDB.

### Step 6: Test Email Sending

```bash
npm run test:email your-email@example.com
```

Check inbox (and spam folder). If successful, SES is working!

### Step 7: Create Test Report

```bash
npm run test:scheduled-report your-email@example.com
```

Creates a test weekly report. Check DynamoDB to verify it was created.

### Step 8: Start Development Server

```bash
npm run dev
```

The scheduler plugin will start and check for due reports every minute.

---

## 📊 Architecture

### Data Flow

```
User Creates Report
    ↓
API Endpoint (/api/scheduled-reports/create)
    ↓
DynamoDB (ghost-scheduled-reports)
    ↓
Scheduler Plugin (runs every minute)
    ↓
Report Generator (fetches AWS data, creates PDF/XLSX)
    ↓
Email Service (SES with attachment)
    ↓
User Receives Email
    ↓
Execution History (ghost-report-executions)
```

### Scheduler Logic

1. **Cron job runs every minute** (server/plugins/scheduler.ts)
2. **Query DynamoDB** for reports due in next 60 seconds
3. **For each report:**
   - Generate report (fetch data, create export)
   - Render email template with variables
   - Send email with attachment via SES
   - Record execution in history
   - Update report status and next run time

### Next Run Time Calculation

- **Daily**: Same time next day
- **Weekly**: Next occurrence of target day
- **Monthly**: Same day next month (handles month overflow)
- **Quarterly**: First month of next quarter
- **Timezone-aware** using IANA timezone strings

---

## 🔒 Security & Permissions

### User Permissions
- ✓ Create reports for themselves
- ✓ View/edit/delete own reports
- ✓ Send test reports
- ✓ View own execution history
- ✗ Cannot set other users as recipients
- ✗ Cannot use custom email templates
- ✗ Limited to 10 active reports

### Admin Permissions
- ✓ All user permissions
- ✓ View all reports (all users)
- ✓ Set any email recipients
- ✓ Force execute any report
- ✓ View system statistics
- ✓ Create/edit custom email templates
- ✓ Unlimited reports

### Authorization Flow
```typescript
// In API endpoints
const user = event.context.user
const isAdmin = user.claims?.groups?.includes('AWS-Product-Team')

// Check ownership
if (!isAdmin && report.createdBy !== userEmail) {
  throw createError({ statusCode: 403 })
}
```

---

## 📈 Monitoring & Troubleshooting

### CloudWatch Logs

**Scheduler Activity:**
```
📅 Starting scheduled reports scheduler...
✅ Scheduled reports scheduler initialized
📊 Processed 3 report(s): 3 successful, 0 failed
```

**Report Execution:**
```
Executing scheduled report: Weekly Cost Summary (abc-123)
  → Generating report...
  → Report generated: weekly-cost-report.pdf (1.2 MB)
  → Sending email to 2 recipient(s)...
  ✓ Report sent successfully in 3421ms
```

### Common Issues

#### "Email not sending"
- **Check:** SES identity verification status
- **Check:** IAM permissions (ses:SendEmail)
- **Check:** SES sandbox mode (can only send to verified emails)
- **Fix:** Request production access in AWS Console

#### "DynamoDB Access Denied"
- **Check:** Table names match environment variables
- **Check:** ECS task role has DynamoDB permissions
- **Check:** Tables exist in correct region

#### "Scheduler not running"
- **Check:** `REPORT_SCHEDULER_ENABLED=true` in .env
- **Check:** Server logs for cron job initialization
- **Check:** Croner package installed

#### "Report generation fails"
- **Check:** Cost Explorer API permissions
- **Check:** API endpoints are accessible
- **Review:** CloudWatch logs for detailed errors

---

## 🎯 What's Next (Not Yet Implemented)

### 1. **Frontend UI Components** (HIGH PRIORITY)
Need to build:
- `/app/pages/reports/scheduled.vue` - Main reports page
- Report creation wizard (multi-step form)
- Reports list with cards
- Edit/Delete actions
- Admin panel section in `/app/pages/admin/index.vue`
- Admin statistics dashboard

### 2. **Email Template Editor** (MEDIUM PRIORITY)
- Tiptap rich text editor integration
- Template variable picker
- Live preview
- Template library management

### 3. **EventBridge Scheduler** (OPTIONAL)
Alternative to croner for production scale:
- Create EventBridge rules per report
- More scalable for 100+ reports
- Native AWS service
- Infrastructure in `terraform/eventbridge.tf` (partial)

### 4. **Advanced Features** (FUTURE)
- Report scheduling calendar view
- Email delivery statistics dashboard
- Recipient management (groups, distribution lists)
- Report templates library
- Cost anomaly alerts
- Budget threshold notifications

---

## 📝 File Structure

```
app/
├── composables/
│   └── useScheduledReports.ts          ← Frontend API hooks
server/
├── api/
│   ├── scheduled-reports/               ← User endpoints
│   │   ├── create.post.ts
│   │   ├── list.get.ts
│   │   ├── [id].get.ts
│   │   ├── [id].patch.ts
│   │   ├── [id].delete.ts
│   │   ├── [id]/
│   │   │   ├── test.post.ts
│   │   │   ├── pause.patch.ts
│   │   │   └── history.get.ts
│   └── admin/
│       └── scheduled-reports/           ← Admin endpoints
│           ├── all.get.ts
│           ├── stats.get.ts
│           └── [id]/
│               └── run-now.post.ts
├── utils/
│   ├── scheduled-reports.ts             ← DynamoDB CRUD
│   ├── email-service.ts                 ← SES integration
│   ├── report-generator.ts              ← Report creation
│   └── report-scheduler.ts              ← Execution logic
└── plugins/
    └── scheduler.ts                     ← Cron job plugin
shared/
└── types/
    ├── scheduled-reports.ts             ← Core types
    └── email-templates.ts               ← Template types
scripts/
├── seed-email-templates.ts              ← Seed default templates
├── test-email.ts                        ← Test SES sending
├── test-scheduled-report.ts             ← Create test report
└── README-scheduled-reports-setup.md    ← Setup guide
terraform/
├── scheduled-reports.tf                 ← DynamoDB tables
├── ses.tf                               ← Email service
└── iam.tf                               ← Permissions (updated)
```

---

## 🎓 Usage Examples

### Create a Report (API)

```bash
curl -X POST http://localhost:3000/api/scheduled-reports/create \
  -H "Content-Type: application/json" \
  -d '{
    "reportName": "Monthly Cost Summary",
    "description": "Org-wide monthly cost report",
    "reportConfig": {
      "accounts": [],
      "timeframe": "lastMonth",
      "dataMode": "billable",
      "format": "pdf",
      "includeServices": true,
      "includeHistorical": true,
      "includeForecast": false
    },
    "schedule": {
      "frequency": "monthly",
      "dayOfMonth": 1,
      "time": "08:00",
      "timezone": "America/New_York"
    },
    "recipients": ["user@example.com"]
  }'
```

### Using Composables (Vue)

```vue
<script setup>
const { reports, loading, createReport, fetchReports } = useScheduledReports()

onMounted(() => {
  fetchReports()
})

async function handleCreate(config) {
  const success = await createReport(config)
  if (success) {
    // Show success toast
  }
}
</script>
```

### Admin Statistics

```vue
<script setup>
const { statistics, fetchStatistics } = useScheduledReportsAdmin()

onMounted(() => {
  fetchStatistics()
})
</script>

<template>
  <div v-if="statistics">
    <p>Total Reports: {{ statistics.totalReports }}</p>
    <p>Active: {{ statistics.activeReports }}</p>
    <p>Success Rate: {{ statistics.recentExecutions.successRate }}%</p>
  </div>
</template>
```

---

## 🎉 Summary

### ✅ Fully Implemented (Backend Complete)
- Infrastructure (Terraform)
- Type definitions
- Database operations
- Email service with SES
- Report generator
- Scheduler service
- All API endpoints (user + admin)
- Frontend composables
- Setup and testing scripts
- Documentation

### ⏳ Remaining Work (Frontend UI)
- User interface pages and components
- Report creation wizard
- Admin dashboard section
- Email template editor with Tiptap

### 🚀 Ready to Use
The backend is production-ready! You can:
1. Deploy infrastructure with Terraform
2. Use API endpoints directly
3. Test with provided scripts
4. Build custom UI on top of composables

### 💡 Next Steps
1. **Deploy:** Run Terraform to create AWS resources
2. **Test:** Use npm scripts to verify everything works
3. **Build UI:** Create Vue components for user interface
4. **Iterate:** Add features based on user feedback

---

## 📞 Support

For issues or questions:
1. Check `scripts/README-scheduled-reports-setup.md` for setup guidance
2. Review CloudWatch logs for runtime errors
3. Check AWS SES quotas and sending limits
4. Verify DynamoDB table names and permissions

---

**Status:** ✅ Backend Complete | ⏳ Frontend Pending | 📅 Production Ready (with UI)

**Last Updated:** 2025-10-20
