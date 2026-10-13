# Changelog

All notable changes to GHOST are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.2.0] - 2026-09-16
<!-- highlights: Crew Identity Verification -->

### Improvements
- Added protected operator identity checks for Crew collaboration. The full shared-investigation rollout remains pending.

## [2.1.0] - 2026-08-17
<!-- highlights: MCP Cost Comparison, Operational Health -->

### New Features
- MCP clients can compare reconciled AWS cost periods and review bounded AWS cost anomalies
- You can now mark, archive, mute, or unmute personal notifications and cancel your queued or running exports
- Pipeline searches now include deployment health and drift modes, and EC2 instance health combines patch, security, vulnerability, alarm, and inventory evidence

### Improvements
- Cost anomaly searches scan until matching account results are collected and clearly report whether more AWS records remain
- The cost variance prompt now uses the canonical comparison workflow

## [2.0.0] - 2026-08-17
<!-- highlights: Safer MCP Access, Reliable AWS Results -->

### Improvements
- MCP access results now include direct and group-based IAM Identity Center assignments
- Commercial and GovCloud cost tools now use the correct account IDs, payer accounts, date rules, and pagination
- MCP permissions, resource access, diagnostics, rate limits, and retry protection now enforce stricter privacy and reliability boundaries
- Account, user, instance, alert, compliance, report, and chat searches now return consistent bounded and paginated results

### Breaking Changes
- Removed retired compatibility tool names and synchronous report execution from MCP; use the canonical account, forecast, documentation, audit, pipeline, and report workflows instead

### Bug Fixes
- Fixed incomplete user-access results, GovCloud cost filters, ignored tool filters, and duplicate write execution under concurrent retries
- Fixed evidence bundles reporting lookback periods that were not applied to their underlying data

## [1.20.0] - 2026-08-14
<!-- highlights: GHOST MCP, Codex Integration, Flexible AWS Tools -->

### New Features
- Added the GHOST MCP offering, giving Codex secure access to GHOST account details, costs, AWS inventory, security posture, official documentation, pipeline activity, reports, and personal workspace data
- Added guided MCP connection and authorization experiences so users can connect Codex, review available capabilities, and troubleshoot authentication from within GHOST
- Added simplified searches for EC2 instances, organization CloudTrail activity, and deployment pipelines using account names, aliases, request IDs, or either Commercial or GovCloud account ID
- Users with an assigned workload account can now request confirmed, short-lived IAM Identity Center credentials when an advanced direct AWS query is needed

### Improvements
- MCP tools now accept friendlier account references, single values or lists, common AWS resource names, flexible casing, and clearer corrected examples when a request is invalid
- Tool responses now identify the resolved account scope, applied filters, result limitations, and safe next steps instead of repeatedly trying unrelated data sources
- CloudTrail searches now use the organization trail stored in CloudWatch Logs and remain scoped to the requested accounts
- Account, resource, security, cost, and pipeline tools share consistent resolution behavior while preserving compatibility with existing MCP tool calls
- MCP usage diagnostics provide clearer visibility into client adoption, tool reliability, data sources, and errors without exposing credentials or sensitive failure details

### Bug Fixes
- Fixed account-scoped inventory searches returning unrelated organization resources when an account could not be resolved
- Fixed AWS Config name and instance lookups that could fail because of unsupported wildcard matching
- Fixed MCP OAuth refresh handling so supported Codex clients can retain authorization more reliably across sessions and service restarts
- Prevented advanced credential guidance and issuance for organization, master, monitoring, deployment, payer, and other central accounts

---

## [1.19.0] - 2026-08-11
<!-- highlights: Organization AI Usage, Usage Collection -->

### New Features
- Added an organization AI Usage workspace for reviewing adoption, invocations, tokens, models, projects, and spend across Commercial AWS, GovCloud, individual enclaves, and custom account selections
- Added detailed Amazon Bedrock Runtime and Bedrock Mantle reporting alongside cost-based adoption tracking for other AWS AI services
- Administrators can now monitor collection health, review categorized collection errors, and start incremental or full historical collections from the AI & Agents area

### Improvements
- AI usage actuals and current estimates are clearly separated, with Commercial pro forma and billable cost views available alongside GovCloud billable costs
- Side navigation is now organized into Workspace, Accounts, FinOps, Insights, Manage, and Admin sections while keeping every destination one click away
- Collection errors and account-access details are now restricted to administrators; general users see only aggregate coverage status
- AI usage breakdowns distinguish cost-only services from services with invocation telemetry, preventing unavailable usage from appearing as zero
- AI usage snapshots refresh hourly and retain daily adoption history for long-term comparisons

### Bug Fixes
- AI Usage now opens cleanly before its storage infrastructure has been initialized
- AI usage permissions now deploy without exceeding the ECS task role inline-policy size limit

---

## [1.18.0] - 2026-07-28
<!-- highlights: Dataset Reports, Durable AI Chat, Finance & Cost Reporting -->

### New Features
- Dataset Reports now provide a complete workflow for previewing, exporting, sharing, saving, scheduling, and reviewing AWS Config, Security Hub, CloudTrail, and Entra user data
- Dataset exports support PDF, Excel, CSV, and JSON with customizable columns, reusable query presets, AI summaries, and secure share links
- AI chat work now continues reliably in the background, so long-running conversations and analyses can finish even when you navigate away or the application restarts
- Finance reporting now includes departmental Budget vs. Actual views and improved AI-assisted variance analysis
- Account user-access lists can now be copied or exported to CSV and Excel for audits and access reviews
- Infrastructure monitoring now includes container health and application metrics for improved operational visibility

### Improvements
- Historical cost charts now use live billable or pro forma data for the selected accounts instead of sample values
- Selected and decommissioned accounts retain their names and metadata when opened through direct links or filtered dashboard views
- Dataset schedules, execution history, downloads, test delivery, and shared links now use consistent report metadata and file formats
- AWS Config compliance and common security presets now return evaluated resource data, including public exposure, encryption, internet access, and MFA checks
- CloudTrail reports now honor exact time ranges and clearly surface query failures instead of presenting failed requests as empty results
- Entra activity filters now distinguish active and inactive users correctly, including the 90-day inactive-user preset
- Cost and finance views include more consistent account identifiers, names, department data, forecasts, and variance context
- AWS Organizations, Athena, DynamoDB, credential loading, and scheduled-report processing now use stronger retry and recovery behavior under throttling or temporary service failures
- Container images and deployment pipelines have been streamlined with health-check preservation, dependency hardening, lifecycle cleanup, and immutable image references

### Bug Fixes
- Fixed dataset schedules disappearing after creation or running through the cost-report generator
- Fixed generated PDF reports containing HTML instead of valid PDF data
- Fixed dataset preview tables showing blank dynamic columns, timestamps, and detail views
- Fixed report history downloads using IDs that did not match stored executions
- Fixed test report delivery calling outdated storage and email workflows
- Fixed users being able to run, pause, inspect, or download reports owned by other users
- Fixed report updates accepting ownership, identifier, and administrative fields that should not be editable
- Fixed Excel and JSON reports being stored or downloaded with CSV file metadata
- Fixed shared report links incorrectly requiring an authenticated session
- Fixed cost trend charts losing explicitly selected accounts when general sidebar filters were enabled
- Fixed several account matching, forecast, DynamoDB configuration, CloudTrail query, and authentication redirect reliability issues

---

## [1.17.0] - 2026-03-30
<!-- highlights: Achievement Badges, Gamification, User Milestones -->

### New Features
- Achievement badge system with 55+ badges that reward you for exploring the platform — from visiting accounts to using keyboard shortcuts to discovering hidden easter eggs
- Achievements tab on the Profile page shows all badges organized by category: Discovery, Hidden, and Meta, with a progress bar tracking your overall completion
- Progress indicators on count-based badges show how close you are to earning them (e.g., "3/10 accounts visited")
- Achievements card on the home dashboard highlights your recently earned badges and the ones you're closest to completing
- Hidden badges appear as "???" until you earn them — keep exploring to discover what triggers them
- Login streak tracking rewards daily usage with "Daily Driver" (5 days) and "Iron Streak" (7 days) badges
- Visit milestone badges at 50, 100, and 500 platform visits celebrate your loyalty
- Badge notifications appear instantly via toast and persist in the notification bell for later review
- Hover over any badge to see exactly what you need to do to earn it

### Improvements
- Event tracking added across the platform to support badge evaluation — cost page, chat, exports, org chart, datasets, support docs, and more
- Achievement progress syncs to the server every 30 seconds and survives page refreshes via local caching

---

## [1.16.0] - 2026-03-27
<!-- highlights: Real-Time Notifications, SSE Push, Budget Alerts -->

### New Features
- Real-time notification delivery via Server-Sent Events — notifications now appear instantly without waiting for the 30-second poll cycle
- Budget alert notifications automatically surface AWS budget threshold breaches to affected recipients every 15 minutes
- Report completion notifications alert you when scheduled reports finish generating or fail
- AI chat completion notifications let you know when long-running async analyses are ready
- Feedback submission now sends an in-app confirmation so you know your report was received

### Improvements
- Notification deduplication now correctly prevents duplicate alerts when the same event is processed multiple times
- SSE connections gracefully fall back to polling with exponential backoff reconnect when the real-time stream is interrupted
- Polling interval automatically slows from 30s to 60s while the SSE connection is active, reducing unnecessary server load

---

## [1.15.0] - 2026-03-23
<!-- highlights: Tag Analysis, Estimated Proforma Costs -->

### New Features
- Tag Analysis tab on the Cost Dashboard lets you break down an account's spend by any tag key, with coverage stats, cost distribution bars, and CSV export
- Drill into any tag value to see a service-level and resource-level cost breakdown plus a per-value trend chart
- Tag costs now show estimated proforma amounts by default, with clear labeling and links to documentation explaining the extrapolation
- Dashboard scope controls let you switch between "My Accounts" and "All Accounts" views with persistent preferences
- My Accounts section on the home page highlights your accounts with recent activity and cost summaries
- Security findings analysis added to the dashboard for at-a-glance security posture

### Improvements
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
