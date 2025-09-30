export interface SupportArticle {
  id: string
  title: string
  content: string
  lastUpdated?: string
}

export interface SupportCategory {
  id: string
  title: string
  articles: SupportArticle[]
}

export const supportCategories: SupportCategory[] = [
  {
    id: 'ghost-features',
    title: 'Using GHOST Features',
    articles: [
      {
        id: 'cost-dashboard-guide',
        title: 'Using the Cost Dashboard',
        lastUpdated: '2025-01-15',
        content: `# Using the Cost Dashboard

## Overview

The Cost Dashboard (\`/account/costs\`) provides comprehensive AWS cost analytics, forecasting, and budget tracking across all your accounts.

## Accessing the Dashboard

1. Click **Accounts** in the sidebar
2. Select **Cost Dashboard**
3. Or navigate directly to \`/account/costs\`

## Dashboard Layout

### Top Metrics Card
Displays key cost information:
- **Current Month Spend**: Month-to-date costs
- **Forecasted Total**: Projected month-end cost
- **vs Last Month**: Percentage change comparison
- **Budget Status**: Visual indicator of budget usage

### Cost Trend Chart
Interactive chart showing:
- Historical daily costs (blue line)
- Forecast projection (dashed line)
- Hover over data points for exact values
- Click and drag to zoom into specific date ranges

### Account Breakdown
Lists all accounts with their costs:
- **Account Name** and ID
- **Month-to-Date Cost**
- **Environment** (Production, Development, etc.)
- **Sort** by clicking column headers
- **Filter** using the search box

## Using the Settings Menu

Click the **gear icon** (⚙️) in the top-right to access Cost Settings.

### Filter Transactions
Hide specific cost types:
- ✅ **Hide Savings Plans** - Exclude savings plan charges
- ✅ **Hide Enterprise Support** - Remove support fees
- ✅ **Hide Reserved Instances** - Filter out RI charges
- ✅ **Hide Dev Accounts** - Focus on production costs

### Minimum Cost Threshold
Set a minimum amount to hide low-cost accounts:
- Enter dollar amount (e.g., \`100\`)
- Accounts below threshold won't appear in lists
- Useful for focusing on major cost drivers

### Currency Display Format
Choose how costs are displayed:
- **Abbreviated**: $1.2M, $500K (easier to scan)
- **Full**: $1,200,000.00 (precise amounts)

### Account Visibility
- ✅ **Show Decommissioned Accounts** - Include inactive accounts in reports

### Import Forecast Data (Admin Only)
If you're a member of AWS-Product-Team:
- Upload forecast data files
- Update cost projections
- Bulk import budgets

## Sharing Cost Data

### Share Current View
1. Apply filters and settings you want
2. Copy the browser URL
3. Send to colleagues - they'll see the same view
4. URL includes all filter parameters

### Export to CSV/Excel
1. Use browser's print function (Ctrl/Cmd + P)
2. Save as PDF for reports
3. Or use screenshot tools for quick shares

### Generate Reports
1. Set desired date range and filters
2. Click **Export** (if available)
3. Select format (CSV, Excel, PDF)
4. Reports include all visible data

## Understanding the Data

### Data Refresh Schedule
- Cost data updates **daily at 2 AM EST**
- AWS has 24-48 hour reporting delay
- Current day costs are estimates
- Month-end finalization takes 3-5 days

### Cost Attribution
Costs are attributed by:
- **Account**: Specific AWS account
- **Service**: EC2, S3, RDS, etc.
- **Environment**: Based on account tags
- **Project**: From cost allocation tags

### Forecasting
Forecasts are calculated using:
- Historical trends (last 90 days)
- Seasonal patterns
- Linear regression models
- Manual forecast uploads (admin)

## Tips for Cost Analysis

### Find Cost Spikes
1. Look for sudden vertical jumps in the chart
2. Check "Top Accounts" for unusual increases
3. Compare to previous month's pattern
4. Click the spike to see what changed

### Compare Time Periods
1. Note the current month total
2. Check "vs Last Month" percentage
3. Look for seasonal patterns
4. Use date range selector for custom comparisons

### Identify Trends
- **Steady increase**: Likely growth-related
- **Flat**: Stable, predictable costs
- **Spiky**: Variable workloads or issues
- **Downward**: Optimization successes

### Budget Monitoring
- **Green indicator**: Within budget
- **Yellow**: Approaching limit (>75%)
- **Red**: Over budget
- Set alerts at 50%, 75%, 90% thresholds

## Common Tasks

### Weekly Cost Review
1. Open Cost Dashboard
2. Check current month progress
3. Look for unexpected spikes
4. Review top 5 accounts
5. Compare to forecast

### Monthly Cost Reporting
1. Wait until 5th of next month (data finalization)
2. Apply relevant filters
3. Export full report
4. Share with stakeholders
5. Document any anomalies

### Budget Planning
1. Review last 3 months trends
2. Check forecast accuracy
3. Account for seasonal changes
4. Add buffer for growth
5. Coordinate with FinOps team

## Troubleshooting

### Costs Show $0.00
- AWS hasn't updated data yet (24-48 hour delay)
- Check "Last Updated" timestamp
- Current day is always incomplete

### Forecast Seems Wrong
- Requires 14 days minimum data
- May not account for one-time charges
- Contact admin to upload manual forecast

### Missing Accounts
- You may not have access to those accounts
- Apply account access through SailPoint
- Check filters aren't hiding them

### Data Doesn't Match AWS Console
- GHOST uses AWS Cost Explorer API
- 24-hour sync delay is normal
- Month-end data takes longer to finalize
- Rounding differences are normal

## Pro Tips

💡 **Bookmark filtered views** - Save URLs with your most-used filters

💡 **Use threshold filters** - Hide noise by setting minimum $1,000

💡 **Check daily** - Catch cost spikes early before they grow

💡 **Compare weekdays vs weekends** - Identify 24/7 resources to optimize

💡 **Review tags** - Ensure all resources are properly tagged for accurate reporting
`
      },
      {
        id: 'sharing-links',
        title: 'Sharing GHOST Links and Views',
        lastUpdated: '2025-01-15',
        content: `# Sharing GHOST Links and Views

## Direct Account Links

### Share Specific Accounts
Navigate to an account and copy the URL:
\`\`\`
/account/[id]/index
/account/[id]/users
/account/[id]/groups
\`\`\`

Recipients with access will see the same account details.

### Account Explorer Links
Deep link to filtered explorer views:
\`\`\`
/account/explorer?filter=production
/account/explorer?search=webapp
\`\`\`

Query parameters preserve your filters and search terms.

## User Profile Links

### Share User Pages
\`\`\`
/account/user/[username]
\`\`\`

Example: \`/account/user/john.smith\`

Shows the user's:
- AWS account access
- Group memberships
- Roles and permissions
- Contact information

### Your Own Profile
Quick link to your profile:
\`\`\`
/profile
\`\`\`

Or from user menu: Click avatar → Profile

## Cost Dashboard Sharing

### Share with Filters
Cost dashboard URL preserves all settings:
\`\`\`
/account/costs?hideSupport=true&minThreshold=500
\`\`\`

All filters, thresholds, and display options are in the URL.

### Share Specific Views
1. Configure your filters and settings
2. Copy the URL from address bar
3. Send to colleagues
4. They'll see exactly what you see

**Example:**
\`\`\`
/account/costs?hideDevAccounts=true&currencyFormat=abbreviated
\`\`\`

## Organization Chart Links

### Share Org Chart
\`\`\`
/account/org-chart
\`\`\`

Shows hierarchical view of AWS organization.

### Deep Link to Account in Org Chart
\`\`\`
/account/org-chart?highlight=[account-id]
\`\`\`

Highlights specific account in the tree.

## Search Results

### Share Search Queries
Universal search results are shareable:
\`\`\`
/?q=production+accounts
\`\`\`

The \`q\` parameter contains the search term.

## Documentation Links

### Link to Specific Articles
\`\`\`
/support/docs?topic=cost-dashboard-guide
/support/docs?topic=sharing-links
\`\`\`

Direct link to any help article.

### Support Home
\`\`\`
/support
/support/docs
/support/aws-access
\`\`\`

## Best Practices for Sharing

### ✅ Do's
- **Verify permissions** - Recipient needs access to the resource
- **Use descriptive links** - Add context when sharing
- **Test the link** - Open in incognito to verify it works
- **Use short URLs** - Consider URL shortener for complex links
- **Add instructions** - Explain what they'll see

### ❌ Don'ts
- **Don't share session tokens** - Never share login credentials
- **Don't assume access** - Not everyone has access to all accounts
- **Don't share sensitive data** - Use appropriate channels
- **Don't use screenshots for dynamic data** - Link instead

## Creating Shareable Reports

### Cost Reports
1. Configure Cost Dashboard filters
2. Copy URL
3. Add to email or Slack: "See current month costs: [link]"
4. Recipients see live data

### Account Lists
1. Use Account Explorer filters
2. Copy URL
3. Share with: "Here are the production accounts: [link]"

### User Access Reports
1. Navigate to user page
2. Copy URL
3. Share: "See John's current access: [link]"

## URL Parameters Reference

### Cost Dashboard
- \`hideSupport=true\` - Hide support costs
- \`hideSavings=true\` - Hide savings plans
- \`hideRI=true\` - Hide reserved instances
- \`hideDevAccounts=true\` - Hide dev accounts
- \`minThreshold=100\` - Minimum cost threshold
- \`currencyFormat=abbreviated\` - Currency display
- \`showDecommissioned=true\` - Show inactive accounts

### Account Explorer
- \`search=term\` - Search query
- \`filter=production\` - Environment filter
- \`sort=name\` - Sort column
- \`direction=asc\` - Sort direction

### Universal Search
- \`q=search+terms\` - Search query
- \`type=account\` - Filter by type

## Email Templates

### Cost Report Share
\`\`\`
Subject: AWS Costs - [Month] [Year]

Hi team,

Here's our current AWS spending for this month:
[GHOST Cost Dashboard Link]

Key highlights:
- Current spend: [amount]
- Forecast: [amount]
- Top account: [account name]

Questions? Reply to this email.
\`\`\`

### Account Access Share
\`\`\`
Subject: Your AWS Account Access

Hi [Name],

Your AWS account access has been provisioned:
[Link to user's profile page in GHOST]

You now have access to [X] accounts.
To access AWS Console, visit GHOST and click the console link.
\`\`\`

## Security Notes

🔒 **All GHOST links require authentication**
- Recipients must log in to GHOST
- Access control still applies
- Links expire with session

🔒 **Don't share via public channels**
- Use corporate email or Slack
- Don't post on public forums
- Don't share in unencrypted channels

🔒 **Verify permissions before sharing**
- Ensure recipient has required access
- Test links in incognito mode
- Provide context about what they'll see
`
      },
      {
        id: 'universal-search',
        title: 'Using Universal Search',
        lastUpdated: '2025-01-15',
        content: `# Using Universal Search

## Overview

Universal Search (top navigation bar) searches across accounts, users, resources, and more in GHOST.

## Quick Access

### Keyboard Shortcut
Press **\`/\`** to instantly focus the search bar from anywhere in GHOST.

### Search Bar Location
Top-right of every page, next to your user avatar.

## What You Can Search

### AWS Accounts
Search by:
- Account name: \`production webapp\`
- Account ID: \`123456789012\`
- Environment: \`prod\`, \`dev\`, \`staging\`
- Owner name: \`john smith\`

### Users
Search by:
- Name: \`Jane Doe\`
- Email: \`jane.doe@company.com\`
- Username: \`jdoe\`
- Department: \`Engineering\`

### Resources (Coming Soon)
- EC2 instances
- S3 buckets
- RDS databases
- Lambda functions

## Search Syntax

### Basic Search
Just type what you're looking for:
- \`webapp\` - Finds anything with "webapp"
- \`john\` - Finds users and accounts related to "john"

### Exact Matches
Use quotes for exact phrases:
- \`"Production Account"\` - Must match exactly
- \`"123456789012"\` - Exact account ID

### Wildcards
Use \`*\` for partial matches:
- \`prod*\` - Matches prod, production, productive
- \`*test*\` - Matches test anywhere in the name

### Type Filters
Narrow by resource type:
- \`type:account production\` - Only accounts
- \`type:user jane\` - Only users

### Environment Filters
- \`env:production\` - Production accounts only
- \`env:dev\` - Development accounts only

## Search Results

### Result Types
Results are grouped by:
- **Accounts** - AWS accounts you have access to
- **Users** - People in your organization
- **Groups** - AD/Entra ID groups
- **Resources** - AWS resources (if enabled)

### Result Actions
- **Click** to navigate to detail page
- **Hover** to see preview
- **Right-click** for context menu (copy link, open in new tab)

### Result Sorting
Results are ranked by:
1. Exact matches first
2. Name matches
3. Partial matches
4. Recent activity

## Advanced Tips

### Search Operators

**AND (implicit)**
\`\`\`
production webapp
\`\`\`
Finds results containing BOTH terms.

**OR**
\`\`\`
production OR staging
\`\`\`
Finds results with EITHER term.

**NOT**
\`\`\`
account NOT test
\`\`\`
Excludes results with "test".

**Grouping**
\`\`\`
(production OR staging) webapp
\`\`\`
Complex queries with parentheses.

### Field-Specific Search

**Account Fields**
- \`name:webapp\` - Search account names
- \`id:123456\` - Search account IDs
- \`owner:john\` - Search by owner
- \`env:prod\` - Search by environment

**User Fields**
- \`email:jane@\` - Search by email
- \`dept:engineering\` - Search by department
- \`title:manager\` - Search by job title

## Common Search Tasks

### Find My Accounts
Search for your name or team:
\`\`\`
owner:[your name]
\`\`\`

### Find Production Accounts
\`\`\`
env:production
type:account production
\`\`\`

### Find Specific User
\`\`\`
type:user john smith
jane.doe@company.com
\`\`\`

### Find Account by ID
\`\`\`
123456789012
\`\`\`
Paste the 12-digit account ID.

### Find All Dev Accounts
\`\`\`
env:dev
environment:development
\`\`\`

## Search Performance

### Instant Results
- Search updates as you type
- No need to press Enter
- Results appear within 100ms

### Search Index
- Updates every hour
- New accounts appear within 60 minutes
- New users sync immediately

## Troubleshooting

### No Results Found
✅ **Check spelling** - Try alternative terms
✅ **Remove filters** - Too many filters narrow results
✅ **Use wildcards** - Try \`prod*\` instead of \`production\`
✅ **Check permissions** - You only see accounts you can access

### Too Many Results
✅ **Add more terms** - Be more specific
✅ **Use type filters** - \`type:account\` to narrow
✅ **Use exact matches** - Quote phrases: \`"exact name"\`

### Wrong Results
✅ **Use field search** - \`name:production\` instead of just \`production\`
✅ **Check filters** - Verify type and env filters are correct

### Slow Search
✅ **Check connection** - Verify network status
✅ **Simplify query** - Remove complex operators
✅ **Clear cache** - Hard refresh (Ctrl+F5)

## Pro Tips

💡 **Save frequent searches** - Bookmark search URLs

💡 **Use keyboard shortcuts** - \`/\` to focus search, \`Esc\` to close results

💡 **Start with account ID** - Most precise search method

💡 **Search your own name** - Quick way to find your access

💡 **Use type filters** - Faster results with fewer mismatches

## Search Best Practices

### For Quick Lookups
- Use account IDs when known
- Start with specific terms
- Add filters progressively

### For Exploration
- Start broad, refine as needed
- Use wildcards liberally
- Browse result categories

### For Reporting
- Use precise field searches
- Save URLs for reuse
- Document search patterns

## Privacy & Security

🔒 **Search respects permissions**
- You only see accounts you can access
- User search limited to public info
- Sensitive data not searchable

🔒 **Search history**
- Not stored server-side
- Browser may cache locally
- Clear history with browser settings

🔒 **Audit trail**
- Account access is logged
- Search queries not logged
- Actions from search results are tracked
`
      },
      {
        id: 'roles-permissions',
        title: 'Understanding Roles and Permissions',
        lastUpdated: '2025-01-15',
        content: `# Understanding Roles and Permissions

## Overview

GHOST uses role-based access control (RBAC) to manage what users can see and do in the application.

## Your Roles

### View Your Roles
1. Click your **avatar** in top-right
2. Select **Profile**
3. Scroll to **System Roles** section

Or visit: \`/profile\`

### Role Types

#### Administrator
**Who gets it:** Members of \`AWS-Product-Team\` group

**Permissions:**
- ✅ Import forecast data
- ✅ Edit forecast entries
- ✅ Delete forecast data
- ✅ Access admin pages
- ✅ View system logs
- ✅ Manage user permissions
- ✅ All viewer permissions

**Visible Features:**
- "Admin" in user menu
- Cost Settings → Import Forecast File button
- /admin/* pages

#### Power User
**Who gets it:** Members of \`AWS-Power-Users\` or \`AWS-Managers-*\` groups

**Permissions:**
- ✅ Import forecast data
- ✅ Edit forecast entries
- ✅ Modify cost settings
- ✅ Export cost data
- ✅ Edit account metadata
- ✅ All viewer permissions

**Visible Features:**
- Advanced cost settings
- Forecast editing tools
- Export buttons

#### Finance User
**Who gets it:** Members of \`AWS-Finance-Team\` or Finance/Accounting departments

**Permissions:**
- ✅ Import forecast data
- ✅ Edit forecast entries
- ✅ Export cost data
- ✅ All viewer permissions

**Visible Features:**
- Cost management tools
- Export capabilities
- Budget management

#### Viewer (Default)
**Who gets it:** All authenticated users

**Permissions:**
- ✅ View cost data
- ✅ View accounts
- ✅ View user information
- ✅ Navigate all pages

**Visible Features:**
- All dashboards and reports
- Account details
- Cost trends
- Organization chart

## Permission System

### How Permissions Work

Permissions are assigned based on:
1. **Entra ID Group Membership**
   - \`AWS-Product-Team\` → Admin
   - \`AWS-Power-Users\` → Power User
   - \`AWS-Finance-Team\` → Finance

2. **Department** (from Entra ID)
   - Finance department → Finance User
   - Engineering department → Viewer

3. **Username Pattern**
   - \`.admin\` suffix → Admin
   - \`.pu\` suffix → Power User

### Multiple Roles
You can have multiple roles simultaneously:
- Permissions are **additive**
- Highest privilege applies
- All role permissions combine

**Example:**
- Member of \`AWS-Product-Team\` = Admin
- Also in Finance dept = Finance User
- **Result**: All admin + finance permissions

### Permission Categories

#### Forecast Management
- \`forecast.import\` - Upload forecast files
- \`forecast.edit\` - Modify forecasts
- \`forecast.delete\` - Remove forecast data
- \`forecast.clear\` - Clear all forecasts

#### Cost Management
- \`costs.view\` - View cost dashboards
- \`costs.settings\` - Modify display settings
- \`costs.export\` - Download cost data

#### Account Management
- \`accounts.view\` - View account details
- \`accounts.edit\` - Modify account metadata
- \`accounts.create\` - Add new accounts
- \`accounts.delete\` - Remove accounts

#### User Management
- \`users.view\` - View user profiles
- \`users.manage\` - Assign roles/permissions

#### Administration
- \`admin.logs\` - Access system logs
- \`admin.issues\` - Issue management

## Checking Your Permissions

### In Your Profile
1. Navigate to \`/profile\`
2. View **Active Permissions** card
3. See all your permissions listed

### Debug Mode (Dev Only)
In browser console:
\`\`\`javascript
// View your roles
const { debug } = useUserRoles()
debug()
\`\`\`

Shows:
- Your email
- Assigned roles
- All permissions
- Group memberships

## Permission-Gated Features

### Cost Dashboard Settings
**Import Forecast File Button**
- Requires: \`forecast.import\`
- Visible to: Admin, Power User, Finance
- Location: Cost Settings gear icon ⚙️

### Admin Menu
**Admin Link in User Menu**
- Requires: \`admin.logs\` OR \`admin.issues\`
- Visible to: Admin only
- Location: Avatar menu → Admin

### Edit Functions
**Forecast Edit Buttons**
- Requires: \`forecast.edit\`
- Visible to: Admin, Power User, Finance

**Account Edit Buttons**
- Requires: \`accounts.edit\`
- Visible to: Admin, Power User

## Requesting Additional Access

### Need Higher Permissions?

**For Admin Access:**
1. Must be member of \`AWS-Product-Team\`
2. Contact your manager
3. Request through SailPoint
4. Requires business justification

**For Power User:**
1. Join \`AWS-Power-Users\` group
2. Or get manager role
3. Request through SailPoint

**For Finance Access:**
1. Join \`AWS-Finance-Team\`
2. Or change department to Finance
3. Contact HR for department changes

### Access Review
- Roles reviewed **quarterly**
- Unused access removed automatically
- Re-certification required annually

## Security & Compliance

### Principle of Least Privilege
- Users get **minimum necessary access**
- Request only what you need
- Elevated access is time-bound
- Regular access reviews

### Audit Logging
All permission checks are logged:
- Who accessed what
- When access occurred
- Which permission was used
- Actions taken

### Role Assignment Audit
- Automatic assignment based on groups
- Manual role grants logged
- Changes trigger notifications
- Compliance team reviews monthly

## Troubleshooting

### Can't See a Feature
✅ Check your roles in \`/profile\`
✅ Verify required permission
✅ Confirm group membership in Entra ID
✅ Log out and back in to refresh

### Permission Denied Error
✅ You don't have required permission
✅ Request access through SailPoint
✅ Contact your manager
✅ Or use read-only alternatives

### Role Not Showing
✅ Entra group sync takes up to 1 hour
✅ Log out and back in
✅ Clear browser cache
✅ Check group membership in Azure portal

### Wrong Permissions
✅ Review group memberships
✅ Contact admin to verify role assignment
✅ Submit ServiceNow ticket if incorrect

## Best Practices

💡 **Check your profile** - Know your permissions before requesting features

💡 **Request minimum access** - Only ask for what you need

💡 **Document your need** - Provide business justification clearly

💡 **Review regularly** - Remove access you no longer need

💡 **Use viewer first** - Try read-only access before requesting edits

## Support Resources

Need help with roles/permissions?
- View documentation: \`/support/docs?topic=roles-permissions\`
- Your profile: \`/profile\`
- Role guide: \`/support/roles\`
- Submit ticket: ServiceNow → GHOST Application
`
      }
    ]
  },
  {
    id: 'getting-started',
    title: 'Getting Started',
    articles: [
      {
        id: 'welcome',
        title: 'Welcome to GHOST',
        content: `# Welcome to GHOST

GHOST (GD Hub for Operations, Security, and Technology) is your centralized platform for managing AWS accounts and resources across both Commercial and GovCloud environments.

## What is GHOST?

GHOST provides a unified interface to:
- **View and manage AWS accounts** across your organization
- **Monitor costs and usage** with detailed breakdowns
- **Access account information** including owners, users, and resources
- **Navigate to AWS consoles** with single sign-on
- **Track security compliance** and account health

## Key Features

### Account Management
- Comprehensive account directory with search and filtering
- Account hierarchy visualization (organization chart view)
- User and group management integration with SailPoint
- Quick access to AWS console for each account

### Cost Monitoring
- Real-time cost data from AWS Cost Explorer
- Historical cost trends and forecasting
- Breakdown by service, account, and tag
- Budget alerts and anomaly detection

### Security & Compliance
- Security Lake integration for audit logs
- Compliance dashboard for account health
- Access request workflow through ServiceNow
- Role-based access control (RBAC)

## Getting Help

If you need assistance:
1. Check our documentation for guides and tutorials
2. Submit a ticket through ServiceNow
3. Contact the Cloud Operations team

## Quick Links

- [Request AWS Access](/support/docs?topic=request-access)
- [Understanding Account Types](/support/docs?topic=account-types)
- [Cost Management Best Practices](/support/docs?topic=cost-management)
`
      },
      {
        id: 'first-login',
        title: 'First Time Login',
        content: `# First Time Login

## Prerequisites

Before logging into GHOST, ensure you have:
- **Active AD account** with proper group membership
- **Multi-factor authentication (MFA)** configured
- **ServiceNow access** for support tickets

## Login Process

### Step 1: Navigate to GHOST
Open your browser and go to the GHOST application URL provided by your administrator.

### Step 2: Authenticate with Entra ID
1. Click the **Sign In** button
2. Enter your corporate email address
3. Enter your password
4. Complete MFA verification

### Step 3: Initial Setup
On your first login, GHOST will:
- Fetch your group memberships from Azure AD
- Load your AWS account associations
- Configure your default preferences

## Troubleshooting Login Issues

### "Access Denied" Error
This typically means you're not in the required AD groups. Contact your manager to request access through SailPoint.

### MFA Not Working
1. Ensure your authenticator app is synced
2. Try using backup codes if available
3. Contact IT support if issues persist

### Page Not Loading
- Clear your browser cache and cookies
- Try using a different browser
- Check if you're on the corporate network or VPN

## Next Steps

After successful login:
1. [Explore the Account Directory](/support/docs?topic=account-directory)
2. [Set up your dashboard preferences](/support/docs?topic=dashboard-setup)
3. [Request access to AWS accounts](/support/docs?topic=request-access)
`
      },
      {
        id: 'navigation',
        title: 'Navigating GHOST',
        content: `# Navigating GHOST

## Main Navigation

### Top Navigation Bar
- **Home**: Return to the main dashboard
- **Search**: Universal search for accounts, users, and resources
- **User Menu**: Access profile, settings, and logout

### Side Navigation
- **Accounts**: Browse and manage AWS accounts
- **Cost Explorer**: View cost analytics and reports
- **Admin**: Administrative functions (role-based)
- **Support**: Documentation and help resources

## Account Pages

### Account List View
The main accounts page displays all AWS accounts you have access to:
- Use filters to narrow down by environment, status, or owner
- Click column headers to sort
- Use the search bar for quick filtering

### Account Details
Click on any account to view:
- **Overview Tab**: General information and metrics
- **Users Tab**: Associated users and permissions
- **Groups Tab**: AD groups with access
- **Resources Tab**: AWS resources in the account
- **Costs Tab**: Detailed cost breakdown

## Search Functionality

### Universal Search
The search bar in the top navigation searches across:
- Account names and IDs
- User names and emails
- Resource tags and descriptions

### Advanced Search Tips
- Use quotes for exact matches: "production account"
- Filter by type: type:account production
- Use wildcards: prod*

## Keyboard Shortcuts

- **/** - Focus search bar
- **Esc** - Close modals and overlays
- **Ctrl/Cmd + K** - Quick account search
- **G then A** - Go to Accounts
- **G then C** - Go to Cost Explorer
`
      }
    ]
  },
  {
    id: 'aws-accounts',
    title: 'AWS Accounts',
    articles: [
      {
        id: 'request-access',
        title: 'How to Request AWS Access',
        content: `# How to Request AWS Access

## Overview

Access to AWS accounts is managed through SailPoint and requires manager approval. This guide walks you through the request process.

## Step 1: Determine Required Access

### Access Levels
- **Read-Only**: View resources and configurations
- **Developer**: Deploy and manage applications
- **Administrator**: Full account management

### Environment Types
- **Development**: For testing and development
- **Staging**: Pre-production environment
- **Production**: Live production systems

## Step 2: Submit Request in SailPoint

### Navigate to SailPoint
1. Go to [SailPoint Portal](https://sailpoint.gd-ms.us)
2. Click **Request Access**
3. Search for "AWS" in the catalog

### Select the Appropriate Role
Choose the role that matches your needs:
- **AWS-[Account]-ReadOnly**
- **AWS-[Account]-Developer**
- **AWS-[Account]-Administrator**

### Provide Justification
Include in your request:
- Business reason for access
- Duration needed (temporary or permanent)
- Specific tasks you'll perform
- Project or ticket number

## Step 3: Manager Approval

Your request will be routed to:
1. Your direct manager
2. Account owner (if different)
3. Security team (for production access)

**Typical approval time**: 1-2 business days

## Step 4: Access Provisioning

Once approved:
1. You'll receive an email confirmation
2. Access will be provisioned within 4 hours
3. Your account will appear in GHOST
4. You can access the AWS Console through GHOST

## Troubleshooting

### Request Denied
Common reasons:
- Insufficient business justification
- Requesting higher access than needed
- Missing required training

### Access Not Working
If approved but not working:
1. Wait the full 4 hours for provisioning
2. Log out and back into GHOST
3. Clear your browser cache
4. Submit a ServiceNow ticket if issues persist

## Best Practices

- **Request minimum necessary access**
- **Set expiration dates** for temporary access
- **Document your business need** clearly
- **Complete AWS training** before requesting production access
`
      },
      {
        id: 'account-types',
        title: 'Understanding Account Types',
        content: `# Understanding Account Types

## Commercial vs GovCloud

### Commercial Cloud (AWS Commercial)
- **Region**: us-east-1, us-west-2, and others
- **Compliance**: Standard commercial compliance
- **Services**: Full AWS service catalog
- **Use Cases**: General business applications

### GovCloud (AWS GovCloud)
- **Region**: us-gov-east-1, us-gov-west-1
- **Compliance**: FedRAMP, ITAR, DoD SRG
- **Services**: Limited to compliance-approved services
- **Use Cases**: Government and defense applications

## Account Categories

### Production Accounts
**Characteristics:**
- Hosts live, customer-facing applications
- Strict change control processes
- 24/7 monitoring and support
- Regular backups and disaster recovery

**Access Requirements:**
- Completed security training
- Manager and account owner approval
- On-call rotation (for admin access)

### Development Accounts
**Characteristics:**
- For building and testing new features
- Relaxed change controls
- Limited monitoring
- May be shut down outside business hours

**Access Requirements:**
- Basic AWS training
- Manager approval

### Staging/Pre-Production
**Characteristics:**
- Mirrors production environment
- Used for final testing before production
- Production-like security controls
- Performance testing environment

### Shared Services
**Characteristics:**
- Hosts shared infrastructure (DNS, logging, etc.)
- Managed by Cloud Operations team
- Limited direct access
- Critical for all other accounts

## Account Naming Conventions

### Standard Format
**[Environment]-[Application]-[Type]-[Number]**

Examples:
- prod-webapp-commercial-001
- dev-mobile-govcloud-002
- shared-logging-commercial-001

### Environment Codes
- **prod**: Production
- **stg**: Staging
- **dev**: Development
- **test**: Testing
- **shared**: Shared services

## Cost Allocation

### Tagging Strategy
All accounts must have:
- **Environment** tag
- **Owner** tag
- **CostCenter** tag
- **Project** tag

### Billing
- Consolidated billing through organization master
- Monthly cost reports by account
- Chargeback to business units

## Security Requirements

### All Accounts
- MFA required for console access
- CloudTrail logging enabled
- Security Hub enabled
- Regular security scanning

### Production Additional Requirements
- WAF for web applications
- GuardDuty threat detection
- Macie for data classification
- Regular penetration testing
`
      },
      {
        id: 'account-management',
        title: 'Account Management Best Practices',
        content: `# Account Management Best Practices

## Account Organization

### Use Organizational Units (OUs)
Structure accounts in a hierarchy:
- **Security OU**: Audit and log archive accounts
- **Production OU**: Production workloads
- **Development OU**: Development and testing
- **Sandbox OU**: Experimentation

### Separate by Workload
- One account per application or service
- Isolate different environments
- Separate data from compute resources

## Access Management

### Principle of Least Privilege
- Grant minimum necessary permissions
- Use time-bound access for elevated privileges
- Regular access reviews (quarterly)

### Role-Based Access Control (RBAC)
Define standard roles:
- **Viewer**: Read-only access
- **Developer**: Deploy and manage applications
- **Administrator**: Full account management
- **Auditor**: Compliance and security review

### Federation and SSO
- Use Entra ID for authentication
- No local IAM users (except break-glass)
- Centralized identity management

## Cost Optimization

### Resource Tagging
Mandatory tags for all resources:
- Environment
- Owner
- Project
- CostCenter
- DataClassification

### Budget Alerts
Set up alerts at:
- 50% of monthly budget
- 75% of monthly budget
- 90% of monthly budget
- Actual exceeds forecast

### Regular Reviews
- Monthly cost analysis
- Quarterly optimization reviews
- Identify unused resources
- Right-size instances

## Security Best Practices

### Enable Security Services
- **CloudTrail**: API logging
- **GuardDuty**: Threat detection
- **Security Hub**: Compliance monitoring
- **Config**: Resource compliance

### Network Security
- Use VPCs for network isolation
- Implement security groups as firewalls
- Enable VPC Flow Logs
- Use PrivateLink for service access

### Data Protection
- Encrypt data at rest (S3, EBS, RDS)
- Encrypt data in transit (TLS/SSL)
- Use KMS for key management
- Enable versioning for critical data

## Monitoring and Alerting

### CloudWatch Setup
- Standard metrics for all services
- Custom metrics for applications
- Log aggregation to CloudWatch Logs
- Dashboards for key metrics

### Alert Configuration
Critical alerts for:
- Service availability
- Performance degradation
- Security events
- Cost anomalies

## Compliance

### Regular Audits
- Quarterly access reviews
- Annual security assessments
- Compliance scanning (daily)
- Penetration testing (annually)

### Documentation
Maintain current documentation for:
- Architecture diagrams
- Runbooks and playbooks
- Disaster recovery plans
- Security controls

## Disaster Recovery

### Backup Strategy
- Automated daily backups
- Cross-region replication for critical data
- Regular restore testing
- Retention policies based on compliance

### Business Continuity
- Define RTO and RPO for each service
- Multi-region deployment for critical apps
- Automated failover procedures
- Regular DR drills
`
      }
    ]
  },
  {
    id: 'cost-management',
    title: 'Cost Management',
    articles: [
      {
        id: 'understanding-costs',
        title: 'Understanding Your AWS Costs',
        content: `# Understanding Your AWS Costs

## Cost Components

### Compute Costs
**EC2 Instances**
- On-Demand: Pay per hour/second
- Reserved Instances: 1-3 year commitment for discount
- Spot Instances: Bid on unused capacity
- Savings Plans: Flexible pricing model

**Lambda Functions**
- Charged per request and compute time
- Free tier: 1M requests/month

### Storage Costs
**S3 Storage**
- Standard: Frequently accessed data
- Infrequent Access: Lower cost for archived data
- Glacier: Long-term archive
- Intelligent-Tiering: Automatic cost optimization

**EBS Volumes**
- Charged per GB-month provisioned
- Snapshot storage additional cost

### Data Transfer
- Data transfer IN: Free
- Data transfer OUT: Charged per GB
- Inter-region transfer: Charged both ways
- Inter-AZ transfer: Charged in some services

## Cost Analysis in GHOST

### Dashboard Metrics
The cost dashboard shows:
- **Monthly spend**: Current month-to-date
- **Forecast**: Projected month-end cost
- **Budget status**: Percentage of budget used
- **Top services**: Highest cost services

### Cost Breakdown Views
- **By Service**: EC2, S3, RDS, etc.
- **By Account**: Individual account costs
- **By Tag**: Project, team, environment
- **By Region**: Geographic distribution

### Historical Trends
- Compare month-over-month changes
- Identify cost spikes and anomalies
- Track optimization efforts
- Seasonal patterns

## Reading Your Cost Reports

### Cost Explorer Integration
GHOST integrates with AWS Cost Explorer to provide:
- Detailed cost breakdowns
- Custom date ranges
- Filtering and grouping options
- Downloadable reports

### Key Metrics to Monitor
- **Daily spend rate**: Average daily cost
- **Utilization**: Reserved Instance usage
- **Coverage**: Percentage covered by RIs/Savings Plans
- **Waste**: Unused or underutilized resources

## Common Cost Drivers

### Unexpected Charges
Common causes:
- Forgotten resources running
- Data transfer costs
- NAT Gateway charges
- Unused Elastic IPs

### Development/Test Environments
- Running 24/7 when only needed business hours
- Over-provisioned instances
- Production-grade resources for testing

## Cost Allocation

### Tagging for Cost Tracking
Essential tags:
- **Project**: Which project owns the resource
- **Environment**: dev/staging/prod
- **Owner**: Team or individual responsible
- **CostCenter**: Billing department

### Chargeback Reports
- Monthly reports by cost center
- Detailed breakdown by service
- Comparison to budget
- Optimization recommendations
`
      },
      {
        id: 'cost-optimization',
        title: 'Cost Optimization Strategies',
        content: `# Cost Optimization Strategies

## Quick Wins

### 1. Delete Unused Resources
**Identify and remove:**
- Unattached EBS volumes
- Unused Elastic IPs
- Old snapshots and AMIs
- Stopped instances not needed

**How to find them:**
- Use GHOST's resource usage reports
- AWS Trusted Advisor recommendations
- Cost Explorer's unused resource reports

### 2. Right-Size Instances
**Steps:**
1. Review CloudWatch metrics for CPU and memory
2. Identify over-provisioned instances (<20% utilization)
3. Downsize to appropriate instance type
4. Monitor performance after change

**Tools:**
- AWS Compute Optimizer
- CloudWatch metrics
- GHOST utilization reports

### 3. Schedule Non-Production Resources
**Implementation:**
- Use AWS Instance Scheduler
- Stop dev/test environments nights and weekends
- Potential savings: 65-75% for non-production

## Reserved Capacity

### Reserved Instances (RIs)
**When to use:**
- Steady-state workloads
- Predictable usage patterns
- Production databases

**Types:**
- Standard RIs: Up to 72% discount
- Convertible RIs: Up to 54% discount, flexible
- Scheduled RIs: For recurring schedules

### Savings Plans
**Benefits:**
- More flexible than RIs
- Applies across instance families
- Up to 72% discount

**Types:**
- Compute Savings Plans: Any EC2, Lambda, Fargate
- EC2 Instance Savings Plans: Specific instance family

## Storage Optimization

### S3 Lifecycle Policies
**Automate transitions:**
- Standard → Infrequent Access (after 30 days)
- Infrequent Access → Glacier (after 90 days)
- Delete old versions and incomplete uploads

### EBS Optimization
- Use GP3 instead of GP2 (20% cheaper)
- Delete unattached volumes
- Use appropriate volume types
- Implement snapshot lifecycle policies

## Architecture Optimization

### Serverless Where Possible
**Benefits:**
- No idle capacity charges
- Automatic scaling
- Pay only for actual usage

**Use cases:**
- Batch processing (Lambda)
- Web APIs (API Gateway + Lambda)
- Static websites (S3 + CloudFront)

### Auto Scaling
**Configure for:**
- Scale down during low usage
- Scale up only when needed
- Use target tracking policies
- Set appropriate cooldown periods

### Spot Instances
**Good for:**
- Batch processing
- Development environments
- Fault-tolerant workloads
- Big data analysis

**Savings:** Up to 90% vs On-Demand

## Database Optimization

### RDS Cost Reduction
- Use Aurora Serverless for variable workloads
- Enable storage auto-scaling
- Delete automated backups not needed
- Use read replicas efficiently

### DynamoDB Optimization
- Use on-demand for unpredictable workloads
- Implement auto-scaling for provisioned capacity
- Archive old data to S3
- Use Global Secondary Indexes efficiently

## Monitoring and Governance

### Set Up Budget Alerts
- Create budgets for each account
- Set alerts at 50%, 75%, 90%
- Include forecast alerts
- Weekly cost anomaly reports

### Regular Reviews
**Monthly:**
- Review top spending resources
- Check for anomalies
- Validate tagged vs untagged resources

**Quarterly:**
- RI/Savings Plan utilization
- Architecture optimization opportunities
- Update budgets and forecasts

### Cost Optimization Tools
**AWS Native:**
- Trusted Advisor
- Compute Optimizer
- Cost Explorer
- Cost Anomaly Detection

**In GHOST:**
- Cost trending dashboards
- Budget tracking
- Optimization recommendations
- Resource utilization reports
`
      }
    ]
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting',
    articles: [
      {
        id: 'common-issues',
        title: 'Common Issues and Solutions',
        content: `# Common Issues and Solutions

## Login Issues

### Cannot Log Into GHOST

**Symptoms:**
- Login page doesn't load
- Authentication fails
- Redirect loops

**Solutions:**
1. Clear browser cache and cookies
2. Ensure you're on corporate network or VPN
3. Try incognito/private browsing mode
4. Check if your AD account is active
5. Verify MFA is configured correctly

### "Access Denied" After Login

**Cause:** Not in required AD groups

**Solution:**
1. Request access through SailPoint
2. Have manager approve request
3. Wait 4 hours for provisioning
4. Log out and back into GHOST

## Account Access Issues

### AWS Account Not Showing in GHOST

**Possible Causes:**
- Access not yet provisioned
- Account not linked to GHOST
- Permission sync delay

**Solutions:**
1. Wait full 4 hours after approval
2. Refresh GHOST (Ctrl+F5)
3. Log out and log back in
4. Verify SailPoint request was approved
5. Submit ServiceNow ticket if persists

### Cannot Access AWS Console

**Error:** "Invalid session" or "No permission"

**Solutions:**
1. Ensure you're logged into GHOST first
2. Check if session expired (12-hour limit)
3. Verify account access is still valid
4. Try different browser
5. Clear AWS console cookies

## Cost Data Issues

### Cost Data Not Updating

**Symptoms:**
- Costs showing as $0
- Data several days old
- Missing recent charges

**Understanding:**
- AWS updates cost data every 24 hours
- Some services have 48-hour delay
- Month-end processing takes 3-5 days

**Solutions:**
1. Check "Last Updated" timestamp
2. Wait for next sync (daily at 2 AM EST)
3. Report if data >3 days old

### Cost Allocation Tags Not Showing

**Common Causes:**
- Tags not activated in billing console
- 24-hour activation delay
- Resources not tagged properly

**Solutions:**
1. Verify tags are activated in AWS
2. Wait 24 hours after activation
3. Check resources are tagged correctly
4. Use GHOST tag compliance report

## Performance Issues

### GHOST Running Slowly

**Troubleshooting Steps:**
1. Check your internet connection
2. Clear browser cache
3. Disable browser extensions
4. Try different browser
5. Check AWS service health dashboard

### Search Not Working

**Common Issues:**
- Index not updated
- Too many results
- Special characters in search

**Solutions:**
1. Use specific search terms
2. Use filters to narrow results
3. Avoid special characters
4. Try advanced search syntax

## Data Sync Issues

### User Groups Not Updating

**Symptoms:**
- Old group memberships showing
- New groups not appearing
- Incorrect permissions

**Solutions:**
1. Manual sync: Settings → Sync Groups
2. Wait for hourly automatic sync
3. Verify groups in Azure AD
4. Clear local storage and re-login

### Resource Data Outdated

**Understanding:**
- Resources sync every 6 hours
- Large accounts may take longer
- Some regions sync separately

**Solutions:**
1. Check last sync timestamp
2. Request manual refresh (admin only)
3. Verify in AWS Console directly
4. Report if >12 hours outdated

## Browser-Specific Issues

### Chrome/Edge
- Enable third-party cookies for *.gd-ms.com
- Disable aggressive ad blockers
- Clear site data if issues persist

### Firefox
- Add GHOST to trusted sites
- Enable enhanced tracking protection exceptions
- Check for certificate issues

### Safari
- Disable "Prevent cross-site tracking"
- Allow pop-ups for GHOST domain
- Enable developer menu for debugging

## Getting Help

### Before Submitting a Ticket

1. Check this troubleshooting guide
2. Try basic solutions (clear cache, re-login)
3. Gather error information:
   - Screenshot of error
   - Browser console errors (F12)
   - Time of occurrence
   - Account/resource affected

### Submitting a ServiceNow Ticket

Include:
- Clear description of issue
- Steps to reproduce
- Expected vs actual behavior
- Screenshots or error messages
- Your environment (browser, OS)
- Urgency/impact assessment
`
      },
      {
        id: 'error-messages',
        title: 'Error Messages Explained',
        content: `# Error Messages Explained

## Authentication Errors

### "Invalid credentials"
**Meaning:** Username or password incorrect
**Solution:** Verify your AD credentials, check for account lockout

### "Session expired"
**Meaning:** Your login session has timed out
**Solution:** Log in again. Sessions expire after 12 hours

### "MFA challenge failed"
**Meaning:** Multi-factor authentication code invalid
**Solution:** Ensure your authenticator app time is synced

### "Not authorized for this application"
**Meaning:** You don't have access to GHOST
**Solution:** Request access through SailPoint

## AWS Access Errors

### "AssumeRole failed"
**Meaning:** Cannot assume the AWS IAM role
**Solution:** Verify your account access is active and role exists

### "Access Denied - AWS"
**Meaning:** You don't have permission for this AWS action
**Solution:** Check your role permissions, request elevated access if needed

### "Invalid AWS credentials"
**Meaning:** Temporary credentials have expired
**Solution:** Refresh the page to get new credentials

### "Account not found"
**Meaning:** AWS account doesn't exist or isn't linked
**Solution:** Verify account ID, contact Cloud Operations

## API Errors

### "500 Internal Server Error"
**Meaning:** Server encountered an unexpected error
**Solution:** Wait a few minutes and retry, report if persistent

### "503 Service Unavailable"
**Meaning:** Service temporarily unavailable
**Solution:** Check AWS service health, try again later

### "429 Too Many Requests"
**Meaning:** Rate limit exceeded
**Solution:** Wait before making more requests, reduce request frequency

### "404 Not Found"
**Meaning:** Requested resource doesn't exist
**Solution:** Verify the resource ID/path is correct

## Data Errors

### "No data available"
**Meaning:** Data hasn't been collected yet
**Solution:** Wait for next sync cycle, check if feature is enabled

### "Sync failed"
**Meaning:** Could not retrieve latest data
**Solution:** Check network connection, retry sync, report if continues

### "Invalid filter criteria"
**Meaning:** Search/filter parameters are incorrect
**Solution:** Review filter syntax, remove special characters

### "Export failed"
**Meaning:** Could not generate export file
**Solution:** Reduce data range, try different format, check permissions

## Permission Errors

### "Insufficient privileges"
**Meaning:** Your role doesn't have this permission
**Solution:** Request appropriate access level through SailPoint

### "Feature not available for your role"
**Meaning:** This feature requires admin/elevated access
**Solution:** Contact administrator or request role upgrade

### "Read-only access"
**Meaning:** You can view but not modify
**Solution:** This is expected for read-only roles

## Cost Data Errors

### "Cost data unavailable"
**Meaning:** AWS hasn't provided cost data yet
**Solution:** Cost data has 24-48 hour delay, check back later

### "Budget not configured"
**Meaning:** No budget set for this account
**Solution:** Contact FinOps team to set budget

### "Forecast unavailable"
**Meaning:** Not enough historical data
**Solution:** Forecasts require 14 days of data minimum

## Network Errors

### "Connection timeout"
**Meaning:** Request took too long to complete
**Solution:** Check network connection, try again

### "SSL certificate error"
**Meaning:** Security certificate issue
**Solution:** Ensure system time is correct, update browser

### "CORS error"
**Meaning:** Cross-origin request blocked
**Solution:** This is a configuration issue, report to support

## How to Report Errors

### Information to Collect

1. **Error Details**
   - Exact error message
   - Error code if provided
   - Time of occurrence

2. **Context**
   - What you were trying to do
   - Which account/resource
   - Steps to reproduce

3. **Environment**
   - Browser and version
   - Operating system
   - Network (corporate/VPN/remote)

4. **Screenshots**
   - Error message
   - Browser console (F12 → Console tab)
   - Network tab if API errors

### Submitting the Report

1. Go to ServiceNow
2. Select "Cloud Services" category
3. Choose "GHOST Application" as service
4. Include all collected information
5. Set appropriate priority
`
      }
    ]
  },
  {
    id: 'security',
    title: 'Security & Compliance',
    articles: [
      {
        id: 'security-best-practices',
        title: 'Security Best Practices',
        content: `# Security Best Practices

## Access Management

### Use Strong Authentication
- **Always use MFA** for AWS console access
- **Rotate credentials** regularly (90 days)
- **Never share accounts** or credentials
- **Use temporary credentials** when possible

### Follow Least Privilege Principle
- Request only the access you need
- Use read-only access for investigation
- Escalate privileges only when necessary
- Review and remove unused access quarterly

### Secure Your Workstation
- Lock screen when away (Windows+L)
- Use full-disk encryption
- Keep OS and browsers updated
- Use corporate VPN for remote access

## Data Protection

### Classify Your Data
**Data Classification Levels:**
- **Public**: Marketing materials, documentation
- **Internal**: Business data, non-sensitive
- **Confidential**: Customer data, PII
- **Restricted**: Credentials, security data

### Encryption Requirements
**Data at Rest:**
- Enable S3 bucket encryption
- Use encrypted EBS volumes
- Enable RDS encryption
- Use AWS KMS for key management

**Data in Transit:**
- Use HTTPS/TLS for all connections
- Enable VPN for site-to-site
- Use PrivateLink for AWS services
- Implement certificate pinning for APIs

## Incident Response

### If You Suspect a Security Incident

1. **Don't Panic** - Follow the process
2. **Don't Touch** - Preserve evidence
3. **Document** - Note what you observed
4. **Report Immediately** - Use emergency contact

### Reporting Security Issues

**Emergency (Active Breach):**
- Call Security Operations Center
- Available 24/7
- Follow up with ticket

**Non-Emergency:**
- Submit ServiceNow security ticket
- Include all relevant details
- Mark appropriate priority

### Common Security Incidents
- Exposed credentials in code
- Suspicious account activity  
- Unexpected AWS charges
- Data exposure/leak
- Malware detection
- Phishing attempts

## Compliance Requirements

### Regulatory Compliance
**FedRAMP (GovCloud):**
- Annual security assessments
- Continuous monitoring
- Incident response plan
- Required for government data

**HIPAA (Healthcare Data):**
- Business Associate Agreements
- Encryption requirements
- Audit logging
- Access controls

**PCI DSS (Payment Cards):**
- Network segmentation
- Regular security scanning
- No storage of sensitive auth data
- Quarterly reviews

### Audit Logging

**Required Logs:**
- AWS CloudTrail (API calls)
- VPC Flow Logs (network traffic)
- Application logs
- Database query logs
- Access logs

**Log Retention:**
- Production: 7 years
- Non-production: 1 year
- Security events: Indefinite
- Comply with legal holds

## Security Tools in GHOST

### Security Dashboard
Monitor:
- Compliance score
- Open vulnerabilities
- Policy violations
- Access reviews pending

### Automated Scanning
GHOST integrates with:
- AWS Security Hub
- GuardDuty findings
- Inspector vulnerabilities
- Macie data classification

### Compliance Reports
Available reports:
- Access review report
- Unused credentials
- Policy compliance
- Encryption status
- Public resource exposure

## Best Practices Checklist

### Daily
- [ ] Review any security alerts
- [ ] Check for unusual activity
- [ ] Verify MFA is working

### Weekly  
- [ ] Review access logs
- [ ] Check for policy violations
- [ ] Update security patches

### Monthly
- [ ] Rotate credentials
- [ ] Review IAM permissions
- [ ] Audit public resources
- [ ] Security training

### Quarterly
- [ ] Access recertification
- [ ] Security assessment
- [ ] Update security documentation
- [ ] Disaster recovery test

## Security Training

### Required Training
- Annual security awareness
- Role-specific training
- Incident response procedures
- Data handling guidelines

### Additional Resources
- AWS Security Best Practices
- OWASP Top 10
- Cloud Security Alliance guidance
- Internal security wiki
`
      }
    ]
  }
]

// Helper function to get article by ID
export function getArticleById(articleId: string): SupportArticle | undefined {
  for (const category of supportCategories) {
    const article = category.articles.find(a => a.id === articleId)
    if (article) return article
  }
  return undefined
}

// Helper function to get category by article ID
export function getCategoryByArticleId(articleId: string): SupportCategory | undefined {
  return supportCategories.find(category =>
    category.articles.some(article => article.id === articleId)
  )
}