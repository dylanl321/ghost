# Changelog

All notable changes to GHOST are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.15.0] - 2026-03-23
<!-- highlights: Tag Analysis, Estimated Proforma Costs, Admin Redesign -->

### New Features
- Tag Analysis tab on the Cost Dashboard lets you break down an account's spend by any tag key, with coverage stats, cost distribution bars, and CSV export
- Drill into any tag value to see a service-level and resource-level cost breakdown plus a per-value trend chart
- Tag costs now show estimated proforma amounts by default, with clear labeling and links to documentation explaining the extrapolation
- Dashboard scope controls let you switch between "My Accounts" and "All Accounts" views with persistent preferences
- My Accounts section on the home page highlights your accounts with recent activity and cost summaries
- Security findings analysis added to the dashboard for at-a-glance security posture

### Improvements
- Admin section reorganized into 7 domain-based categories for easier navigation
- Tag settings moved from an inline card to a slideover panel for a cleaner layout
- Account detail pages now share a consistent visual style with the main dashboard
- Tag Analysis documentation updated with a new section explaining how proforma cost estimation works and a FAQ entry

### Bug Fixes
- Fixed miscellaneous UI issues across the dashboard

---

## [1.14.0] - 2026-03-17
<!-- highlights: Pipeline Caching, Resource Display Fix -->

### Improvements
- Pipeline pages now load instantly when navigating back — data is cached for 5 minutes instead of re-fetched every time
- Dashboard pipeline card and admin pipeline page share cached data, eliminating duplicate requests
- Resource change charts and tables now group by resource type instead of showing raw Terraform addresses with unreadable SHA digests
- Resource addresses with long hashes are now shortened for readability, with full details available on hover
- All pipeline data fetching uses improved error handling for more consistent behavior

### Bug Fixes
- Fixed author filter on the admin pipeline page triggering unnecessary data re-fetches — filtering is now handled instantly on the client side

---

## [1.13.0] - 2026-03-16
<!-- highlights: Security Health Dashboard, Athena Security Hub Integration, Dashboard Enhancements -->

### New Features
- Security Health Dashboard with four tabs: Overview, Analysis, Accounts, and Findings for organization-wide security visibility
- Findings Trend chart shows weekly severity breakdown over 90 days with stacked, line, and total view modes
- Findings by Region chart highlights which AWS regions have the most active security findings
- Finding Age Distribution shows how long findings have been open with automated insight callouts
- Severity by Product stacked bar chart reveals which security products generate which severity levels
- Compliance Overview gauge with pass/fail counts for quick compliance posture assessment
- Account risk distribution cards show at-a-glance counts by risk level (Critical through Minimal)
- Security data now queries the pre-processed `security_hub` Athena database for faster, more accurate results

### Improvements
- Security Athena queries migrated from Security Lake OCSF tables to flat `security_hub` tables with correct status values and faster performance
- Security dashboard metric cards remain pinned above all tabs for persistent context
- Eight Athena queries now run in parallel (up from four) for richer analysis data without added latency
- Dashboard page restructured with customizable widget sections and admin controls

### Bug Fixes
- Fixed Athena timestamp parsing errors by using `from_iso8601_timestamp()` instead of `CAST()` for ISO 8601 strings with timezone suffixes
- Fixed Security Lake queries filtering on non-existent `NOTIFIED` status value — now correctly uses `workflow_status` column

---

## [1.12.0] - 2026-03-13
<!-- highlights: Cost Tag Management, Account Risk Scoring, Cost Data Reliability -->

### New Features
- New Cost Tags page lets you browse and break down spending by AWS resource tags across accounts
- Tag configuration manager allows you to select which tags to track and view tag coverage
- Account settings panel provides quick access to tag and cost configuration per account
- Accounts now show a risk score based on budget overage to help prioritize attention

### Improvements
- Cost totals are now matched by date rather than position, preventing mismatches when data spans multiple pages
- Percentage change calculations handle edge cases more gracefully (e.g., new costs with no prior baseline)
- Updated application icon
- Side navigation now includes a link to the Cost Tags page

### Bug Fixes
- Fixed cost totals occasionally showing incorrect values when paginated API responses had misaligned periods
- Fixed pro forma cost injection failing silently when period counts differed between grouped and total queries

---

## [1.11.0] - 2026-03-12
<!-- highlights: Cost Dashboard Overhaul, Pipeline Health Monitoring, Chart Bug Fixes -->

### New Features
- Pipeline dashboard now includes account deployment health monitoring with success/failure tracking
- New resource search lets you find and filter resources across pipeline deployments
- Planned vs Applied comparison panel shows infrastructure state differences at a glance
- Added service cost variance chart to identify unexpected spending changes by service

### Improvements
- Cost dashboard charts have been rebuilt for faster loading and easier long-term maintenance
- LOB spending trends and year-over-year charts now display a full 2 years of historical data
- Cost summary cards show richer detail with improved formatting
- Cumulative burn-up chart provides clearer progress tracking against budgets
- Cost data is now cached to reduce redundant API calls when navigating between tabs
- Smoother authentication redirects when sessions expire

### Bug Fixes
- Fixed LOB charts showing $0 for recent months due to a timezone mismatch in date handling
- Fixed chart labels incorrectly including the current incomplete month
- Fixed cost charts displaying blank data when viewing pro forma costs
- Fixed cost trend scope buttons not switching date ranges correctly
- Fixed feedback submission failing silently on certain error conditions

---

## [1.10.0] - 2026-02-02
<!-- highlights: IT PEP Data, Budget Alert History, Chart Improvements -->

### New Features
- Account details now include IT PEP data from the centralized PEP database with environment info, contract details, budget breakdowns, and management contacts
- New Budget Alert History section on account pages shows all past budget alerts with the ability to preview sent emails
- Admin budget alerts dashboard displays organization-wide alert statistics and critical account tracking

### Improvements
- Cost trend charts now display both billable and pro forma costs side-by-side for better comparison
- GDMS forecast health card shows daily burn rate and AWS projected month-to-date spending
- Budget alert overview shows alert level breakdown (INFO, WARNING, CRITICAL, ESCALATION) with delivery success rates
- Monthly budget data from PEP now appears with a visual breakdown by month

### Bug Fixes
- Fixed chart rendering issues when switching between date ranges
- Resolved budget utilization calculations to properly account for pro forma adjustments

---

## [1.9.0] - 2026-02-02
<!-- highlights: Changelog Page, Version Tracking -->

### New Features
- Added versioning system with changelog page accessible from the footer
- You can now see the current GHOST version and review all past updates at `/changelog`

### Improvements
- Version number in footer now links directly to the changelog

---

## [1.8.0] - 2026-01-27
<!-- highlights: Support Tools, CloudWatch Logs, IP Lookup -->

### New Features
- New Support Tools page for troubleshooting and diagnostics
- CloudWatch log viewer lets you search and filter logs across your accounts
- IP lookup tool to quickly identify which account owns a specific IP address
- Instance health checker provides at-a-glance status of your EC2 instances

### Improvements
- Better error messages when AWS resources can't be accessed
- Faster loading of account details pages

---

## [1.7.0] - 2026-01-20
<!-- highlights: Entra User Export, Activity Metrics -->

### New Features
- Export Entra (Azure AD) user data alongside AWS account information in reports
- New dataset report type for user access auditing
- Admin panel now shows user activity metrics and login patterns

### Improvements
- Report generation is now faster and more reliable
- Better handling of large data exports

### Bug Fixes
- Fixed an issue where some reports would fail to generate for accounts with special characters in their names

---

## [1.6.0] - 2026-01-13
<!-- highlights: Chat Sharing, Conversation Export -->

### New Features
- Share AI chat conversations with your team using shareable links
- Export chat conversations as markdown files for documentation
- Chat history sidebar lets you quickly switch between past conversations

### Improvements
- AI assistant now provides more detailed and accurate responses about your AWS costs
- Chat interface is more responsive on mobile devices
- Conversations are automatically saved and can be resumed later

### Bug Fixes
- Fixed chat messages occasionally appearing out of order

---

## [1.5.0] - 2026-01-06
<!-- highlights: Budget Alerts, Email Notifications -->

### New Features
- Budget alerts dashboard shows all accounts approaching or exceeding their budgets
- Configure email notifications when budgets reach warning thresholds
- View Lambda execution logs for budget alert processing in admin panel

### Improvements
- Budget health indicators now use color coding for quick status identification
- Account cards show budget utilization percentage at a glance

### Bug Fixes
- Fixed budget calculations not accounting for credits and refunds

---

## [1.4.0] - 2025-12-23
<!-- highlights: Universal Search, Command Palette, Favorites -->

### New Features
- Universal search (Cmd+K / Ctrl+K) lets you quickly find accounts, users, and pages
- Command palette provides fast access to common actions
- Favorite accounts for quick access to your most-used accounts
- Recent accounts history remembers where you've been

### Improvements
- Navigation sidebar can now be collapsed for more screen space
- Faster page transitions throughout the application
- Better keyboard navigation support

---

## [1.3.0] - 2025-12-16
<!-- highlights: AI Chat Assistant -->

### New Features
- AI-powered chat assistant helps answer questions about your AWS environment
- Ask natural language questions like "Which accounts spent the most last month?"
- Get recommendations for cost optimization directly in chat

### Improvements
- Dashboard loads faster with optimized data fetching
- Charts render more smoothly with large datasets

### Bug Fixes
- Fixed timezone issues affecting cost date ranges for some users

---

## [1.2.0] - 2025-12-09
<!-- highlights: Admin Panel, User Management -->

### New Features
- Admin settings panel for site-wide configuration
- User management interface shows all users and their group memberships
- Content management for help articles and documentation
- Monitoring dashboard for system health and performance

### Improvements
- Better role-based access control throughout the application
- Admin pages now have their own dedicated layout

### Bug Fixes
- Fixed an issue where non-admin users could see admin menu items

---

## [1.1.0] - 2025-12-02
<!-- highlights: Cost Dashboard, Trend Charts, Forecasting -->

### New Features
- Interactive cost trend charts show spending patterns over time
- Forecast view predicts future costs based on historical data
- Cost breakdown by AWS service helps identify where money is going
- Summary cards provide quick overview of total spend, changes, and top accounts

### Improvements
- Cost data tables now support sorting and filtering
- Export cost data to CSV for further analysis
- Date range selector lets you view costs for any time period

### Bug Fixes
- Fixed cost calculations being off by one day in some timezones

---

## [1.0.0] - 2025-11-25
<!-- highlights: Account Explorer, User Enclaves, Help Center -->

### New Features
- View and manage all your AWS accounts from a single dashboard
- Account Explorer lets you browse accounts by organization unit, line of business, or environment
- Detailed account pages show instances, users, and configuration
- User enclaves display which AWS environments you have access to
- Support documentation with searchable help articles
- Guided tours help new users learn the interface

### Improvements
- Dark mode support with automatic system preference detection
- Responsive design works on desktop, tablet, and mobile
- Fast, modern interface built for daily use

### Other Updates
- Initial public release of GHOST dashboard
- Secure authentication via Entra ID (Azure AD)
- Support for both AWS Commercial and GovCloud environments

---

## [0.9.0] - 2025-11-18 (Beta)
<!-- highlights: Beta Release -->

### New Features
- Beta release for internal testing
- Core account browsing and search functionality
- Basic cost overview by account
- User authentication with Entra ID

### Known Issues
- Some pages may load slowly with large account counts
- Cost data refresh can take several minutes
