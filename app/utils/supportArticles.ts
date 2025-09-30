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
    title: 'GHOST Documentation',
    articles: [
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

## Search Tips

### Basic Search
Just type what you're looking for:
- \`webapp\` - Finds anything with "webapp"
- \`john\` - Finds users and accounts related to "john"

### Exact Matches
Use quotes for exact phrases:
- \`"Production Account"\` - Must match exactly
- \`"123456789012"\` - Exact account ID

### Type Filters
Narrow by resource type:
- \`type:account production\` - Only accounts
- \`type:user jane\` - Only users

## Common Searches

### Find My Accounts
Search for your name or team

### Find Production Accounts
\`\`\`
env:production
\`\`\`

### Find Account by ID
\`\`\`
123456789012
\`\`\`
Paste the 12-digit account ID.

## Tips

💡 **Use keyboard shortcuts** - \`/\` to focus search, \`Esc\` to close results

💡 **Start with account ID** - Most precise search method

💡 **Use type filters** - Faster results with fewer mismatches
`
      },
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

## Understanding the Data

### Data Refresh Schedule
- Cost data updates **daily at 2 AM EST**
- AWS has 24-48 hour reporting delay
- Current day costs are estimates
- Month-end finalization takes 3-5 days

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

## Pro Tips

💡 **Bookmark filtered views** - Save URLs with your most-used filters

💡 **Use threshold filters** - Hide noise by setting minimum $1,000

💡 **Check daily** - Catch cost spikes early before they grow

💡 **Compare weekdays vs weekends** - Identify 24/7 resources to optimize

💡 **Review tags** - Ensure all resources are properly tagged for accurate reporting
`
      },
      {
        id: 'org-chart-guide',
        title: 'Using the Organization Chart',
        lastUpdated: '2025-01-15',
        content: `# Using the Organization Chart

## Overview

The Organization Chart (\`/account/org-chart\`) provides a visual hierarchy of all AWS accounts in your organization, showing the relationship between organizational units (OUs) and accounts.

## Accessing the Org Chart

1. Click **Accounts** in the sidebar
2. Select **Organization Chart**
3. Or navigate directly to \`/account/org-chart\`

## Understanding the View

### Tree Structure
- **Root**: Organization root node
- **Organizational Units (OUs)**: Folders that group accounts
- **Accounts**: Individual AWS accounts shown as leaf nodes

### Account Information
Hover over any account to see:
- Account name and ID
- Environment (Production, Development, etc.)
- Current month cost
- Account owner

## Navigating the Chart

### Zoom and Pan
- **Zoom in/out**: Use mouse scroll wheel or pinch gesture
- **Pan**: Click and drag the background
- **Reset view**: Click the reset button to center the chart

### Expand/Collapse
- Click on any OU node to expand or collapse its children
- Use the "Expand All" / "Collapse All" buttons for bulk actions

### Search in Chart
- Use the search box to highlight specific accounts
- Matching accounts will be highlighted in the tree
- Click highlighted account to center on it

## Common Use Cases

### Find Account Location
Use the org chart to see which OU an account belongs to and its position in the hierarchy.

### Review Account Structure
Quickly understand how your AWS organization is structured and which accounts are grouped together.

### Identify Account Relationships
See which accounts share the same OU and organizational policies.

## Tips

💡 **Use search first** - Find accounts quickly before navigating the tree

💡 **Bookmark views** - Save the URL with a specific account selected

💡 **Export the view** - Take screenshots for documentation or planning
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
