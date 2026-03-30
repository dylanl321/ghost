# GHOST Frontend UI/UX Exploration Report
**Generated: 2026-03-25**

## Executive Summary

GHOST is a comprehensive AWS dashboard with **professional-grade UI/UX** built on Nuxt 4, Vue 3, and NuxtUI. The application features consistent design patterns, dark mode support, responsive layouts, and sophisticated data visualization. The codebase demonstrates **good architecture** with logical component organization and reusable patterns, though some areas show opportunities for consistency improvements.

---

## 1. ALL PAGES - User-Facing Surface Area

### Main Pages (25+ pages)

#### Dashboard & Core
- **`/` (index.vue)** - Main dashboard with customizable cards
  - Dynamic widget system with drag-reorder capability
  - Multiple scopes (org/mine/favorites) with instant switching
  - Date range selectors (7/14/30 days)
  - Greeting message that updates based on time of day
  - Quick action buttons linking to key features
  - Spotlight tutorial for dashboard customization
  - Admin-specific sections (Budget Alerts, Pipeline, Feedback)

#### Account Management
- **`/account/index.vue`** - Account listing/selector (WIP/under development)
- **`/account/explorer`** - Full-page account explorer with advanced filtering
  - LOB (Line of Business) dropdown filters
  - Status filters (Active/Inactive/Suspended)
  - Environment filters (Commercial/GovCloud/All)
  - Compact header with quick filters
  - Adjustable column visibility
  - Search with instant filtering
  - Badge showing result count
- **`/account/[id]/index.vue`** - Individual account details page
- **`/account/[id]/users.vue`** - Account-level user management
- **`/account/[id]/groups.vue`** - Account-level group management
- **`/account/costs.vue`** - Cost reports with sidebar account selection
  - Account multi-select interface
  - Selected account popover showing results
  - Cost visualization and trending
- **`/account/org-chart.vue`** - AWS Organizations hierarchy visualization
  - Interactive D3.js tree chart (collapsible nodes)
  - Zoom controls (fit to screen, zoom in/out)
  - Node policy details panel on the right
  - Service Control Policy (SCP) visualization
  - Node selection with policy counts
  - Legend and stats cards
- **`/account/user/index.vue`** - User-level access overview
- **`/account/user/[username]/index.vue`** - Individual user details
- **`/account/user/[username]/access-history.vue`** - User access audit trail
- **`/account/user/my-access.vue`** - Current user's access page

#### Admin Section
- **`/admin/index.vue`** - Admin dashboard (Access control + System health cards)
  - Access denied page for non-admins with explanation
  - Quick action buttons (Validation, Agent Health, Feedback, Budget Alerts, Tag Compliance)
  - System health status cards
  - Activity charts and metrics
- **`/admin/users/index.vue`** - User management and feedback
- **`/admin/ai/index.vue`** - AI/Strands agent administration and testing
- **`/admin/content.vue`** - Content management interface
- **`/admin/configuration/index.vue`** - System configuration settings
- **`/admin/system/index.vue`** - System info and diagnostics
- **`/admin/costs/index.vue`** - Cost management overview
- **`/admin/costs/budget-alerts.vue`** - Budget alert configuration
- **`/admin/costs/tag-compliance.vue`** - Tag compliance tracking
- **`/admin/costs/data-validation.vue`** - Cost data validation tools
- **`/admin/pipelines/index.vue`** - Pipeline deployment management
- **`/admin/pipelines/repositories/index.vue`** - Repository list
- **`/admin/pipelines/[repoId]/index.vue`** - Repository details
- **`/admin/pipelines/[repoId]/[pipelineId]/index.vue`** - Pipeline details
- **`/admin/pipelines/authors/index.vue`** - Author management

#### Chat & AI
- **`/chat.vue`** - Full-page chat interface (when Strands enabled)
  - Thread list sidebar with favorite/pin capability
  - Main chat area with thread info header
  - Editable thread titles
  - Thread sharing and export functionality
  - Thread creation workflow
  - Feature disabled notice when Strands is off
- **`/chat/shared/[shareId].vue`** - Shared chat thread view
- **Query routes** - Likely for saved queries

#### Security
- **`/security/index.vue`** - Organization-wide security health dashboard
  - Loading progress panel with region tracking
  - Metric cards for security overview
  - Multiple visualization components
  - Data age indicator with refresh capability

#### Reporting & Data
- **`/reports/datasets.vue`** - Dataset/report creation interface
  - Multi-select account interface
  - CloudTrail, Config, SecurityHub filters
  - Dataset preset selectors
  - Report card components
- **`/reports/scheduled.vue`** - Scheduled report management
  - Report status badges
  - Execution history tables
  - Report sharing interface
  - Schedule display components

#### Support & Documentation
- **`/support/index.vue`** - Support hub landing page
- **`/support/docs.vue`** - Documentation with layout wrapper
  - Support context bar (account/instance/log group selectors)
- **`/support/aws-access.vue`** - AWS access documentation
- **`/support/roles.vue`** - Role documentation

#### Meta Pages
- **`/about.vue`** - About GHOST information
- **`/changelog.vue`** - Changelog with version history
- **`/profile.vue`** - User profile page
- **`/settings/index.vue`** - Main settings
- **`/settings/appearance.vue`** - Theme selection (Light/Dark/System)
- **`/settings/preferences.vue`** - User preference settings
- **`/settings/accounts.vue`** - Account preferences
- **`/auth/loading.vue`** - Post-authentication loading page
- **`/auth/session-expired.vue`** - Session expiration page
- **`/s/[code].vue`** - Short link redirect handler
- **`/support-tools.vue`** - Support tools aggregation

### Page Quality Assessment
- **High Quality (15+ pages)**: Dashboard, Account Explorer, Org Chart, Security Dashboard, Admin Hub, Chat, Reports
  - Professional layouts with logical information hierarchy
  - Consistent use of cards, modals, and filters
  - Strong error and loading states
- **Medium Quality (8+ pages)**: Individual account details, Settings, Support docs
  - Functional interfaces but less polished
  - Some missing loading states or error handling
- **Work in Progress (2+ pages)**: Account listing, some admin sub-pages
  - Incomplete or under development

---

## 2. ALL COMPONENTS - Comprehensive Catalog

### Component Organization (19 categories, 100+ components)

#### Navigation Components (4)
- **SideNav.vue** - Collapsible sidebar with logo, navigation links
  - Desktop collapsed/expanded states with hover expansion
  - Mobile overlay with toggle
  - Smooth transitions (300ms)
  - Fixed positioning z-index management
  - Custom scrollbar styling
  - Responsive breakpoint handling
- **TopNav.vue** - Header with breadcrumbs and mobile menu toggle
- **FavoriteAccountsNav.vue** - Recently/favorite accounts quick access
- **RecentAccountsNav.vue** - Recent accounts sidebar component

#### Shared UI Components (15)
- **CommandPalette.vue** - Cmd+K global search/command interface
  - Search input with escape to close
  - Grouped results (Recent/Pages/Commands)
  - Keyboard navigation support
  - Teleported to body with modal overlay
  - Backdrop blur effect
- **ExportButton.vue** - Standardized export functionality
- **CenteredLoadingSpinner.vue** - Reusable loading indicator
  - Animated rotation (1.2s duration)
  - Heroicons spinning arrow icon

#### Dashboard Components (20+)
- **DashboardMetricCards.vue** - Key metrics display (costs, accounts, trends)
- **DashboardMyAccounts.vue** - User's personal accounts widget
- **DashboardTopAccounts.vue** - Top spending accounts chart
- **DashboardFavoriteAccounts.vue** - Favorite accounts widget
- **DashboardRecentlyViewed.vue** - Recently viewed items
- **DashboardCostTrend.vue** - Cost trend chart (14-day rolling)
- **DashboardSecuritySnapshot.vue** - Security findings summary
- **DashboardPipelineCard.vue** - Pipeline deployment status
- **DashboardBudgetAlerts.vue** - Budget alert summary
- **DashboardAdminSection.vue** - Admin-only widgets
- **DashboardAlertsCard.vue** - Active alerts display
- **DashboardFeedbackCard.vue** - User feedback widget
- **DashboardMyActivity.vue** - User activity feed
- **DashboardNewAccounts.vue** - Newly created accounts
- **DashboardOperationsGlance.vue** - Operations summary
- **DashboardMyAccountCosts.vue** - User's account costs
- **DashboardCustomizePanel.vue** - Dashboard layout editor
  - Drag-reorder capability
  - Show/hide section toggles
  - Display style options (full/half columns)

#### Account Components (30+)
- **AccountDetails.vue** - Main account info display
- **AccountDetailsRow.vue** - Individual detail item
- **AccountUsers.vue** - Account user listing
- **AccountGroups.vue** - Account group membership
- **AccountInsights.vue** - Account-specific insights
- **AccountNotesPanel.vue** - Notes/annotations on accounts
- **AccountShareButton.vue** - Share account access button
- **AccountSecurityDashboard.vue** - Account security overview
- **AccountAlertHistory.vue** - Account alert history table
- **BudgetHealthCard.vue** - Budget status indicator
- **EBSVolumes.vue** - EBS volume management table
- **InstancesTable.vue** - EC2 instances listing
- **InstanceScheduling.vue** - Instance start/stop scheduling
- **InstanceUtilization.vue** - Instance utilization metrics
- **S3Buckets.vue** - S3 bucket list and management
- **OrganizationalStructure.vue** - Hierarchy visualization
- **PolicyAnalyzer.vue** - IAM policy analysis tool
- **PolicyAnalyzerSimple.vue** - Simplified policy display
- **PolicyExportMenu.vue** - Policy export options
- **ResourceUsage.vue** - Resource consumption chart
- **AddFilterModal.vue** - Dynamic filter modal
- **InactiveAccountOverlay.vue** - Overlay for inactive accounts
- **ServiceImpactChart.vue** - Service impact visualization

#### Security Components (20+)
- **SecurityComplianceOverview.vue** - Compliance status
- **SecurityFindingsByCve.vue** - CVE vulnerability breakdown
- **SecurityFindingsByResource.vue** - Findings by resource type
- **SecurityFindingsByTitle.vue** - Findings by title/name
- **SecurityFindingsTable.vue** - Searchable findings table
- **SecurityProductBreakdown.vue** - Breakdown by security product
- **SecurityRecommendations.vue** - Remediation recommendations
- **SecurityRiskGauge.vue** - Risk score gauge chart
- **SecuritySeverityBreakdown.vue** - Severity distribution pie chart
- **SecuritySourceFilter.vue** - Filter by security source
- **OrgSecurityMetricCards.vue** - Organization-level security KPIs
- **OrgProductBreakdown.vue** - Org-wide product breakdown
- **OrgSeverityChart.vue** - Org severity trend
- **OrgTopFindings.vue** - Top critical findings org-wide
- **OrgFindingsByRegion.vue** - Findings geo distribution
- **OrgFindingsTrend.vue** - Finding trend over time
- **OrgSeverityByProduct.vue** - Severity by product matrix
- **OrgFindingAge.vue** - Finding age distribution
- **OrgComplianceGauge.vue** - Overall compliance gauge
- **OrgAccountRiskTable.vue** - Risk ranking by account

#### Admin Components (15+)
- **AlertSettingsPanel.vue** - Alert configuration interface
  - Sections: Recipients, DryRun, Settings, AnomalyDetection, RateLimiting, AlertLevels
- **AIChatMonitorPanel.vue** - AI chat query monitoring
- **RolesPanel.vue** - Role management
- **ShareLinksPanel.vue** - Share link management
- **StoredReportsPanel.vue** - Saved reports listing
- **ConfigItem.vue** - Individual config setting item
- **EmailDeliveryModal.vue** - Email configuration modal
- **StrandsAgentTester.vue** - Agent testing interface
- **SecurityDataPanel.vue** - Security data management

#### AI/Strands Components (10+)
- **StrandsChatPopup.vue** - Floating chat AI popup
- **ChatThreadsSidebar.vue** - Chat threads sidebar
- **ThreadListItem.vue** - Individual thread item
- **ThreadListSidebar.vue** - Thread management sidebar
- **ActiveQueriesIndicator.vue** - Running query indicator
- **AIThinkingBlock.vue** - AI thinking visualization
- **AccountDisambiguationModal.vue** - Account selection modal for queries
- **AiInsightCard.vue** - AI insight widget (dashboard-briefing type)

#### Pipeline/Report Components (20+)
- **PipelineSuccessChart.vue** - Pipeline success rate chart
- **PipelineTimeline.vue** - Timeline visualization
- **PipelineStageVisualizer.vue** - Stage-by-stage flow
- **AccountPerformanceChart.vue** - Account build performance
- **AccountDeploymentHealth.vue** - Deployment health status
- **ActivityHeatMap.vue** - Commit activity heatmap
- **ErrorDistributionChart.vue** - Error distribution chart
- **OrganizationTrendChart.vue** - Org-level trends
- **AuthorBadge.vue** - Author identifier badge
- **AuthorContactIcons.vue** - Contact info icons
- **AuthorSelector.vue** - Author multi-select
- **RepositoryBreakdownTable.vue** - Repository stats table
- **ReportCard.vue** - Report summary card
- **ReportFormModal.vue** - Report creation/edit modal
- **ReportStatusBadge.vue** - Status display
- **ScheduleDisplay.vue** - Schedule info display
- **ShareReportModal.vue** - Report sharing interface
- **SimpleScheduleModal.vue** - Schedule configuration
- **ReportSchedules.vue** - Schedule management list
- **ExecutionHistoryTable.vue** - Execution log table
- **DatasetCard.vue** - Dataset display card
- **DatasetReportCard.vue** - Dataset report variant
- **DatasetPresetSelector.vue** - Preset filter selector
- **DatasetShareModal.vue** - Dataset sharing modal
- **CloudTrailFilters.vue** - CloudTrail filter options
- **ConfigFilters.vue** - Config filter options
- **SecurityHubFilters.vue** - SecurityHub filter options

#### Cost/Billing Components (10+)
- **CostSettings.vue** - Cost calculation settings
- **SidebarAccountItem.vue** - Account item in sidebar
- **SidebarGroupList.vue** - Account group list
- **BudgetHealthSummaryCards.vue** - Budget overview cards

#### Support Components (5+)
- **DocsLayout.vue** - Documentation page wrapper
- **UserRoleInfo.vue** - Role information display
- **SupportContextBar.vue** - Context selector bar
- **SupportAccountSelector.vue** - Account picker
- **SupportInstanceSelector.vue** - Instance picker
- **SupportLogGroupSelector.vue** - Log group picker

#### Other Components
- **ChangelogCard.vue** - Individual changelog entry
- **AboutInfoCard.vue** - About section card
- **DevOptionsPanel.vue** - Dev-only options (visible in dev auth mode)
- **FeedbackModal.vue** - User feedback form
- **WelcomeBanner.vue** - Top-of-page welcome message
- **UniversalSearch.vue** - Global search interface (if exists)
- **UserAvatar.vue** - User profile avatar
- **UserEnclaves.vue** - User enclave display (if exists)
- **QuickStartCard.vue** - Quick start guide widget

---

## 3. STYLING & THEMING

### Design System
- **Framework**: TailwindCSS with NuxtUI preset
- **Color Palette**:
  - Light mode: Slate 100 backgrounds, white surfaces, slate 900 text
  - Dark mode: Slate 900 backgrounds, gray 900 surfaces, gray 50 text
  - Primary: Blue (Heroicons default)
  - Success: Emerald
  - Warning: Amber
  - Danger: Red
  - Purple: For chat/AI features

### CSS Architecture (`/app/assets/css/main.css`)
- **CSS Variables** for themeable values:
  ```
  --ghost-bg (backgrounds)
  --ghost-surface (main surfaces)
  --ghost-surface-2 (secondary surfaces)
  --ghost-text (foreground)
  --ghost-text-muted (secondary text)
  --ghost-border (border colors)
  --ghost-scrollbar-track, thumb, thumb-hover
  ```
- **Dark Mode Support**: Automatic with `.dark` class
  - Preference: 'dark' with fallback to 'dark'
  - Includes light, dark, and system options in settings
- **Custom Scrollbars**:
  - 8px width/height
  - Themed track and thumb colors
  - Hover state changes
- **Transitions**:
  - Standard: `duration-200` to `duration-300`
  - Sidebar collapse: `duration-300 ease-in-out`
  - Hover effects: `transition-all`
- **Rounded Corners**:
  - Cards: `rounded-xl` (8px)
  - Buttons: `rounded-md` (4-6px)
  - Modals: `rounded-xl` (12px)

### Component Styling Patterns
1. **Cards**: `border border-gray-200 dark:border-gray-700 rounded-xl`
2. **Buttons**: NuxtUI variants (solid, soft, ghost, outline)
   - Sizes: xs, sm, md (default), lg
   - Colors: blue (primary), gray, emerald, red, purple
3. **Tables**: NuxtUI UTable with sortable columns, striped rows
4. **Badges**: Color variants with soft/subtle options
5. **Icons**: Heroicons set via i-heroicons-* classes

### Dark Mode Implementation
- **ColorMode**: Nuxt module for theme switching
- **Fallback**: Dark mode if user's OS prefers dark
- **No forced light mode** - respects user preference
- **Settings page** allows: Light, Dark, or System preference

---

## 4. NAVIGATION & LAYOUT

### Main Layout Structure
- **Type**: 3-part layout (SideNav + TopNav + Main Content)
- **Default Layout** (`app/layouts/default.vue`):
  - Fixed left sidebar (collapsible)
  - Top header with breadcrumbs
  - Main content area with padding
  - Footer with GHOST branding and version

### Navigation Patterns

#### SideNav (Left Sidebar)
- **States**:
  - Desktop expanded (w-64): Full text + icons
  - Desktop collapsed (w-16): Icons only
  - Hover expansion: Shows tooltip/expanded on hover
  - Mobile (w-64 with overlay): Full drawer
- **Transitions**: 300ms ease-in-out
- **Mobile**: Overlay backdrop with click-to-close
- **Content**: Navigation links, logos, collapse toggle
- **Responsive**: Uses `md:` breakpoints for desktop/mobile detection
- **Z-index**: z-40 desktop, z-50 mobile with overlay z-30

#### TopNav (Header)
- **Components**:
  - Breadcrumbs (dynamic, route-based)
  - Mobile menu toggle
  - Optional right-side actions
- **Responsive**: Hamburger icon on mobile

#### Breadcrumbs System
- **Auto-generated** from route path
- **Smart collapsing**: `/account/explorer` shown as single "Account Explorer" crumb
- **Links to parent routes**: Each crumb is clickable

#### Command Palette
- **Trigger**: Cmd+K (Ctrl+K on Windows)
- **Features**:
  - Search pages, settings, commands
  - Recent commands shown first
  - Grouped results
  - Arrow key navigation
  - Escape to close
- **Modal**: Teleported to body with backdrop blur

#### Page Layouts
1. **Dashboard** - Grid layout with customizable cards (12-column)
2. **Explorer Pages** - Split view (sidebar + main)
3. **Admin Pages** - Tab-based sub-navigation
4. **Settings** - Sidebar nav + main panel
5. **Full-Screen** - Chat and reports (special layout handling)

### Responsive Breakpoints
- **sm**: 640px
- **md**: 768px (Mobile/Desktop threshold)
- **lg**: 1024px
- **xl**: 1280px
- **2xl**: 1536px

---

## 5. USER FEEDBACK PATTERNS

### Loading States
- **Spinner**: Centered animated icon (CenteredLoadingSpinner.vue)
  - 1.2s rotation duration
  - Heroicons rotating arrow
- **Skeleton**: Placeholder boxes with animate-pulse
  - Used in dashboard header, cards
- **Progress**: UProgress component for long operations
  - Used in security dashboard data loading
- **Badge indicators**: Badge count changes during loading

### Empty States
- **Dashboard**: "Get Started" card for users with no accounts
  - Icon, description, action buttons
  - Links to Browse, Org Chart, Docs
- **Security Dashboard**: Message prompting account setup
- **Reports/Datasets**: Empty message with create button
- **Account selector**: "No accounts match" message

### Error States
- **UAlert**: Red alert boxes for errors
  - Icon + title + description
  - Retry button with loading state
- **Access Denied**: Large centered card with shield icon
  - Explanation + instructions
  - Navigation buttons back to dashboard/profile
- **Component Errors**: Fallback UI instead of crashes
  - Error messages on red background
  - Retry buttons

### Success/Confirmation
- **UToast**: Likely used (not directly seen but referenced)
- **Notifications**: UNotifications component (global)
- **Inline**: Badges showing success state
  - Green badges for connected/healthy
  - Green check mark icons

### Loading Indicators
- **Query Status**: ActiveQueriesIndicator shows running operations
  - Pulsing dot indicator
  - Popover with details
- **Refresh Buttons**: Loading state with spinner
  - Icon rotates when loading
- **Inline Progress**: Progress bars in data tables

### Accessibility
**Observations**:
- ✅ Keyboard navigation support (Cmd+K palette)
- ✅ Semantic HTML (buttons, links, headings)
- ✅ Icon labels with title attributes
- ✅ Color contrast (dark/light themes maintain contrast)
- ⚠️ Limited ARIA labels (aria-label/aria-describedby not heavily used)
- ⚠️ Focus management (some modals may lack focus trap)
- ✅ Mobile-responsive design with touch targets
- ✅ Form inputs have associated labels

**Missing**:
- ARIA role definitions on custom components
- Explicit focus states on interactive elements
- Skip navigation links
- Full keyboard navigation (some components mouse-only)

---

## 6. INTERACTIVE ELEMENTS

### Tables
- **Component**: UTable from NuxtUI
- **Features**:
  - Sortable columns (click header)
  - Striped rows
  - Hover effects
  - Pagination (likely via Paginate component)
  - Row actions (edit, delete buttons in rows)
- **Example**: AccountAlertHistory, SecurityFindingsTable, RepositoryBreakdownTable
- **Large Tables**: Implement virtual scrolling (e.g., Account Explorer)

### Charts & Data Visualization
- **D3.js**:
  - Org Chart (account/ou tree with zoom/pan)
  - Tree hierarchies with collapsible nodes
  - Interactive node selection
  - Policy counts as badges on nodes
- **ECharts** (via nuxt-echarts):
  - Bar charts (spending, severity)
  - Pie charts (product breakdown)
  - Line charts (trends, 14-day rolling)
  - Gauge charts (compliance %, risk scores)
- **Custom**: Heatmaps (ActivityHeatMap), custom visualizations
- **Interactivity**:
  - Hover tooltips showing data
  - Click to drill down
  - Legend toggling (if applicable)
  - Zoom controls (Org Chart)

### Modals & Popups
- **UModal**: Standard modal from NuxtUI
  - Header + body + footer
  - Close button (X)
  - Backdrop click to close
- **Types**:
  - Confirmation dialogs (delete, share)
  - Forms (create report, schedule, config)
  - Info/detail views
- **Popover**: UPopover for hoverable menus
  - Placement options (top, bottom, left, right)
  - Hover mode available
  - Used for details and quick actions

### Dropdowns & Selects
- **USelect/USelectMenu**: NuxtUI dropdown
  - Single and multi-select modes
  - Search/filter options
  - Size variants
  - Custom styling
- **Status buttons**: Button groups acting as filters
  - Mutually exclusive or multi-selectable
  - Highlighted when active

### Filter System
- **AddFilterModal.vue**: Dynamic filter UI
  - Add/remove filter criteria
  - Filter operators (equals, contains, etc.)
  - Filter values (dropdowns, text inputs)
  - Apply/clear filters
- **Quick Filters**:
  - LOB dropdown (Account Explorer)
  - Status buttons (Active/Inactive/Suspended)
  - Environment buttons (Commercial/GovCloud)

### Forms
- **UInput**: Text input from NuxtUI
  - Icon support (trailing/leading)
  - Size variants
  - Placeholder text
  - Clear button (custom implementation)
- **UButton**: CTA buttons
  - Loading states with spinner
  - Icon + label
  - Disabled states
  - Different variants (solid, soft, ghost, outline)

### Drag & Drop
- **Dashboard Customization**: Reorderable cards
  - Likely using Vue Draggable or similar
  - Show/hide toggles
  - Display style options (full/half width)

### Nested Navigation
- **Settings Page**: Sidebar nav with main content
  - Tabs (Appearance, Preferences, Accounts)
  - Side links to different setting groups
  - Consistent styling

---

## 7. RESPONSIVENESS

### Mobile Considerations
- **Breakpoint**: md (768px) is desktop/mobile threshold
- **SideNav**:
  - Mobile: Full-width drawer with backdrop overlay
  - Desktop: Fixed collapsed/expanded sidebar
- **Toolbars**:
  - Mobile: Compact, buttons stack vertically
  - Desktop: Horizontal layout
- **Cards**:
  - Mobile: `grid-cols-1` (full width)
  - Desktop: `md:grid-cols-2 lg:grid-cols-3` (responsive columns)
- **Tables**:
  - Mobile: Horizontal scroll (not ideal, but present)
  - Desktop: Full table view
- **Modals**:
  - Mobile: Full viewport or nearly full
  - Desktop: Centered with max-width
- **Navigation**:
  - Mobile: Hamburger menu triggers SideNav overlay
  - Desktop: SideNav visible (collapsible)

### Responsive Utilities Used
- Tailwind breakpoint prefixes: `sm:`, `md:`, `lg:`, `xl:`, `2xl:`
- Flexbox for responsive spacing
- Grid with responsive columns
- CSS variables for consistent sizing
- Max-width constraints (`max-w-*)

### Mobile Gestures
- **Tap**: Buttons, links, card clicks
- **Swipe**: SideNav close (custom implementation likely)
- **Long-press**: Possible for context menus (not widely used)

---

## 8. ACCESSIBILITY

### Current Implementation
✅ **Strong Points**:
1. **Semantic HTML**: Proper use of `<button>`, `<a>`, `<input>`, `<label>`
2. **Icon Labels**: `title` attributes on hover tooltips
3. **Color + Icons**: Status indicators use both color and icons (not color-only)
4. **Keyboard Support**: Cmd+K command palette, Tab navigation, Enter to submit
5. **Screen Readers**: Alt text on images, icon labels
6. **Contrast**: Dark/light modes maintain WCAG AA contrast ratios
7. **Mobile Accessible**: Touch targets appropriately sized

⚠️ **Gaps**:
1. **ARIA Labels**: Limited use of `aria-label`, `aria-describedby`, `aria-live`
2. **Focus Management**:
   - Focus traps not implemented in modals
   - Focus not returned after modal close
   - Some interactive elements lack visible focus states
3. **Skip Links**: No skip-to-content navigation
4. **Form Validation**: No error message associations with inputs (aria-invalid, aria-errormessage)
5. **Live Regions**: No aria-live for dynamic updates (loading, new data)
6. **Tab Order**: Some components may have non-logical tab order

### Accessibility Features by Component
- **CommandPalette**: Full keyboard nav (arrows, enter, escape)
- **SideNav**: Keyboard toggle (Escape?), but unclear
- **Tables**: Headers semantic, but sortable not marked
- **Buttons**: All have text labels or title attributes
- **Forms**: Labels present but not explicitly associated in some cases

### Missing WCAG Compliance Areas
- **WCAG 2.1 Level AA**:
  - No explicit focus indicators on all interactive elements
  - No form error announcements
  - No skip navigation links
  - Some color-dependent information (fix: add icons/text)

---

## 9. UI QUALITY ASSESSMENT

### Strengths
1. **Consistent Design Language**: Uniform use of cards, buttons, colors across app
2. **Professional Polish**: Smooth transitions, proper spacing, visual hierarchy
3. **Dark Mode**: Fully supported with excellent contrast
4. **Responsive Layout**: Adapts well to mobile/tablet/desktop
5. **Data Visualization**: Charts and graphs are well-designed and interactive
6. **Component Reuse**: Dashboard cards, metric displays, etc.
7. **Error Handling**: Good error states and retry mechanisms
8. **Loading States**: Multiple loading patterns (spinner, skeleton, progress)
9. **Intuitive Navigation**: Breadcrumbs, sidebar, command palette
10. **Theme Customization**: User can switch themes per preference

### Areas for Improvement
1. **Accessibility**:
   - Add ARIA labels to interactive elements
   - Improve focus management in modals
   - Add form validation error associations
2. **Consistency**:
   - Some pages have different header styles (consistency audit needed)
   - Empty state patterns vary across pages
   - Error alerts styled differently in some areas
3. **Mobile Experience**:
   - Some tables are horizontal-scrollable (poor mobile UX)
   - Modal sizes not always optimized for small screens
   - Touch target sizes could be larger on mobile
4. **Documentation**:
   - No Storybook/Histoire stories for standalone component preview
   - Prop documentation sparse
5. **Performance**:
   - Large tables may need virtual scrolling
   - Charts may not be optimized for large datasets
6. **Animation Jank**:
   - Some animations could benefit from `will-change` CSS
   - Modal transitions could be smoother
7. **Empty/Error States**:
   - More detailed error messages needed in some places
   - Some empty states lack action buttons

---

## 10. CHARTING & VISUALIZATION LIBRARIES

### ECharts
- **Purpose**: General charts (bar, line, pie, gauge)
- **Used in**:
  - Cost trends (line chart)
  - Product breakdown (pie chart)
  - Compliance gauges (gauge chart)
  - Severity distributions (bar/pie charts)
- **Configuration**:
  - Dark theme enabled in nuxt.config.ts
  - Charts: BarChart, LineChart, PieChart, GaugeChart
  - Components: TitleComponent, TooltipComponent, LegendComponent, GridComponent

### D3.js
- **Purpose**: Custom hierarchical/tree visualizations
- **Used in**:
  - Organizational structure / account hierarchy (tree layout)
  - Interactive node-based charts
- **Features**:
  - Zoom and pan with d3.zoom()
  - Collapsible nodes (toggle expand/collapse)
  - Custom node styling (rectangles, text, badges)
  - Link drawing (diagonal paths)
  - Node selection with visual feedback

### Heroicons
- **Purpose**: Icon set for UI
- **Usage**: `i-heroicons-[name]` class syntax
- **Examples**:
  - `i-heroicons-check-circle` (success)
  - `i-heroicons-exclamation-triangle` (warning)
  - `i-heroicons-shield-check` (security)
  - `i-heroicons-arrow-path` (loading/refresh)

---

## 11. CRITICAL FINDINGS & RECOMMENDATIONS

### High Priority
1. **Add ARIA labels** to all interactive elements for screen reader support
   - Priority: Components/navigation/buttons
2. **Improve form accessibility**
   - Associate labels with inputs
   - Show error messages with aria-errormessage
3. **Add focus management** to modals
   - Trap focus inside modal
   - Return focus on close

### Medium Priority
1. **Standardize empty states** across all pages
   - Use consistent icon, message, and action pattern
2. **Improve mobile table UX**
   - Implement card-based view for mobile
   - Add horizontal scroll indicators
3. **Add loading skeleton** to more pages
   - Replace simple spinners with skeleton content
4. **Document component API**
   - Add Storybook stories or Histoire file for components
5. **Optimize large visualizations**
   - Add canvas rendering option for ECharts
   - Implement virtual scrolling for large tables

### Low Priority
1. **Animation polish**
   - Add will-change CSS for smoother transitions
   - Consider reduced-motion preferences
2. **Form validation UX**
   - Add inline validation feedback
   - Show validation errors more prominently
3. **Keyboard shortcuts**
   - Document Cmd+K palette
   - Consider additional shortcuts (e.g., ? for help)

---

## 12. MISSING FEATURES OBSERVED

1. **Print Support**: No print stylesheets visible
2. **Export Options**: Limited (ExportButton.vue exists but usage sparse)
3. **Favorites System**: Mentioned in code but inconsistent implementation
4. **Breadcrumb Customization**: Auto-generated, no manual overrides seen
5. **Notification Center**: No persistent notification UI
6. **Settings Persistence**: Likely uses localStorage, but not explicit
7. **User Preferences**: Partially implemented (theme, layout)
8. **Help/Tour System**: Spotlight onboarding for dashboard, but not comprehensive
9. **Zoom Level Control**: Not per-page (browser zoom only)
10. **Sticky Headers**: Not all tables have sticky headers on scroll

---

## File Structure Reference

```
/app
├── pages/                          # 50+ route pages
├── components/                     # 100+ reusable components
│   ├── navigation/                 # SideNav, TopNav
│   ├── dashboard/                  # 20+ dashboard widgets
│   ├── accounts/                   # 30+ account-related
│   ├── security/                   # 20+ security displays
│   ├── admin/                      # 15+ admin tools
│   ├── ai/                         # 10+ chat/AI components
│   ├── pipeline/                   # 20+ deployment viz
│   ├── reports/                    # 20+ report components
│   ├── costs/                      # Cost-related components
│   ├── shared/                     # Global UI (CommandPalette, etc)
│   └── ...                         # 10+ other categories
├── layouts/                        # 5 layouts (default, admin, settings, auth, public)
├── assets/
│   ├── css/main.css               # Global styles + CSS variables
│   └── images/                     # Logo, icons
└── stores/                         # Pinia stores for state
```

---

## Conclusion

GHOST's frontend demonstrates **solid professional design** with good component organization, strong dark mode support, and consistent UI patterns. The codebase shows careful attention to detail in styling and layout responsiveness. However, **accessibility improvements** (ARIA labels, focus management, form validation) are the primary area for enhancement. The application successfully balances functionality with visual polish, making it suitable for enterprise AWS management use.

**Overall UI/UX Quality: 7.5/10**
- Design consistency: 8/10
- Responsiveness: 8/10
- Accessibility: 5/10 (main weakness)
- Loading/Error States: 8/10
- Code Organization: 8/10
