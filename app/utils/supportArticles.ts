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
      },
      {
        id: 'swagger-ui-guide',
        title: 'Using Swagger UI for API Testing',
        lastUpdated: '2025-01-15',
        content: `# Using Swagger UI for API Testing

Swagger UI lets you test GHOST's APIs interactively without writing any code. Just point and click.

## Getting There

Go to \`/api/swagger-ui\` in your browser, or click your profile icon → **API Documentation**.

## How It Works

When you're logged into GHOST, Swagger automatically uses your session. No need for API keys or tokens to test stuff out.

**Quick test:**
1. Pick any GET endpoint
2. Click "Try it out"
3. Hit "Execute"
4. See your results

That's it. No setup required.

## API Categories

- **Accounts** - List and manage accounts
- **Costs** - Cost data, forecasts, analysis
- **Admin** - Admin stuff
- **User** - Your profile and settings

## Example: Getting Cost Data

Let's grab this month's costs:

1. Find \`GET /api/costs/summary\` under Costs
2. Click "Try it out"
3. Set parameters:
   \`\`\`
   period: thisMonth
   groupBy: LINKED_ACCOUNT
   enhanced: true
   \`\`\`
4. Hit "Execute"

You'll see the full response with all the cost data.

## Common Endpoints

**All accounts:**
\`\`\`
GET /api/accounts/list?source=full&enrichment=full
\`\`\`

**Cost analysis:**
\`\`\`
GET /api/costs/analysis?period=thisMonth&groupBy=LINKED_ACCOUNT&includeBudget=true
\`\`\`

**Forecast:**
\`\`\`
GET /api/costs/forecast?period=current-month-remainder&granularity=DAILY
\`\`\`

## Using API Keys

If you have an API key, click the **Authorize** button at the top and paste it in. Then all your requests will use that key instead of your browser session.

Two ways to authenticate:
- \`x-api-key\` header (recommended)
- \`Bearer\` token

## Tips

- **Copy curl commands** - Each request shows you the curl command you can run in terminal
- **Check examples** - Click "Example Value" to see what the response looks like
- **Start small** - Test with filters to keep responses manageable
- **Read the descriptions** - Hover over parameters to see what they do

## If Something Breaks

**401 Unauthorized** - You're not logged in or your API key is wrong

**400 Bad Request** - Missing or invalid parameters, check what's required

**500 Server Error** - Something went wrong on our end, try again or contact support
`
      },
      {
        id: 'proforma-vs-billable',
        title: 'Understanding Proforma Cost Data',
        lastUpdated: '2025-10-09',
        content: `## What is Proforma Cost Data?

In AWS billing, there are two views of cost: **Billable** and **Proforma**.

**Billable Costs:** These are the official charges that appear on the AWS invoice. IT, as the managing organization, is responsible for paying this bill to AWS.

**Proforma Costs:** These are adjusted charges created by the AWS Billing Conductor service. They distribute shared discounts—like Savings Plans—back to the accounts that actually used the resources.

Since IT pays the consolidated AWS invoice, cost managers within individual accounts do not see the billable data. Instead, they see Proforma data in the AWS cost dashboards, which represents their "effective cost" after discounts are allocated.

## Why Do We Use Proforma Costs?

Savings Plans are purchased at the master (payer) account level but consumed across the entire AWS Organization. Without adjustment, discounts would only show in IT's payer account, while other accounts would appear to pay full, undiscounted rates.

**Proforma costs solve this by:**

- **Allocating discounts fairly:** Each account gets credit for the portion of Savings Plan discounts it actually used.
- **Supporting accurate chargeback:** IT can charge business units based on their discounted, effective usage, rather than raw usage.
- **Providing clear visibility:** Cost managers see costs that reflect real usage with shared discounts applied, not inflated raw charges.

## Example

**Billable (IT view only):**
- IT's payer account shows the Savings Plan purchase and credits
- Linked accounts only show full usage rates

**Proforma (Cost Manager view):**
- Discounts are spread back across the accounts
- Each account's dashboard shows its adjusted share of cost, making internal cost reporting and chargeback accurate

## FAQ: Proforma vs. Billable Costs

**Q1: Why don't I see the Billable numbers in my dashboard?**

Only IT, as the managing function, pays the AWS bill. Cost dashboards for accounts display Proforma costs, since that's the view used for chargeback and management reporting.

**Q2: What does Proforma actually represent?**

It shows your account's costs after shared discounts (like Savings Plans) have been distributed. This is your true cost of usage.

**Q3: Does Proforma change the bill we pay to AWS?**

No. AWS invoices are always based on Billable data. Proforma exists only to help IT distribute those costs fairly within the organization.

**Q4: Which number matters for chargeback?**

For all internal chargeback and reporting, Proforma is the number that matters. Billable costs are only used by IT to pay the invoice.

**Q5: Why do Proforma costs sometimes look different from usage-based estimates?**

Because Proforma redistributes Savings Plan benefits. If your account used resources covered by Savings Plans, your costs are reduced accordingly.

**Q6: Why do we use Billable data for organization-wide views?**

When viewing entire organization costs, we use the Billable data source. This is because Proforma data cannot include the master (payer) account in the billing group.

To get the full picture with Proforma, we would need to:
1. Take the total Proforma cost for all linked accounts
2. Take the total Billable cost for the entire organization
3. Calculate the leftover cost for the master account

Using Billable data for organization-wide views is simpler and more accurate because it shows the complete cost without needing to split or calculate master account costs separately.

## Switching Between Views in GHOST

In the Cost Dashboard, use the **Billable/Proforma** dropdown in the top-right header to switch between views. All charts, tables, and reports will update to reflect your selection.

- **Use Billable** when you need to match costs to AWS invoices (IT only) or view organization-wide totals
- **Use Proforma** for cost management, chargeback, and understanding individual account resource consumption
`
      },
      {
        id: 'budget-risk-scoring',
        title: 'Understanding Budget Risk Scores',
        lastUpdated: '2025-10-21',
        content: `# Understanding Budget Risk Scores

## Why Risk Scores?

Budget Risk Scores solve the problem of comparing accounts with vastly different budget sizes. Consider:

- **Account A**: Budget $100, Actual $200 → 100% over, $100 impact
- **Account B**: Budget $1,000,000, Actual $1,100,000 → 10% over, $100,000 impact

Account A has severe percentage overage but low financial impact. Account B has lower percentage but huge financial impact. Neither metric alone tells the full story.

## How It's Calculated

Risk Score combines both severity (percentage) and impact (dollars) into a single 0-100 score:

### Step 1: Normalize Both Metrics

Scale percentage and dollar overages to 0-100 range relative to the highest values across all accounts:

- **Normalized Percentage** = (Account's % Over / Maximum % Over) × 100
- **Normalized Dollar Amount** = (Account's $ Over / Maximum $ Over) × 100

### Step 2: Apply Weighted Combination

\`\`\`
Risk Score = (Normalized Percentage × 70%) + (Normalized Dollar Amount × 30%)
\`\`\`

The 70/30 weighting prioritizes severity while still accounting for financial impact.

## Example Calculation

Given:
- Budget: $1,000,000
- Actual: $2,000,000
- $ Over: $1,000,000 (100% of max overage in organization)
- % Over: 100% (100% of max % overage in organization)

Calculation:
- Normalized Percentage = (100 / 100) × 100 = 100
- Normalized Dollar = (1,000,000 / 1,000,000) × 100 = 100
- **Risk Score** = (100 × 0.7) + (100 × 0.3) = **100**
`
      },
      {
        id: 'api-keys-guide',
        title: 'API Keys & Programmatic Access',
        lastUpdated: '2025-01-15',
        content: `# API Keys & Programmatic Access

Need to access GHOST from a script or automation tool? You'll need an API key.

## Getting an API Key

Reach out to the AWS product team to request access. They'll walk you through what they need and get you set up.

## Permissions

**Read-only** - View accounts, costs, analytics (most common)

**Write** - Update account data, upload forecasts (needs extra approval)

**Admin** - Full access (needs manager approval)

Start with read-only unless you specifically need to write data.

## Using Your Key

Two ways to authenticate:

**x-api-key header (easier):**
\`\`\`bash
curl -H "x-api-key: YOUR_KEY" /api/accounts/list
\`\`\`

**Bearer token:**
\`\`\`bash
curl -H "Authorization: Bearer YOUR_KEY" /api/accounts/list
\`\`\`

## Code Examples

**Python:**
\`\`\`python
import requests
import os

API_KEY = os.environ["GHOST_API_KEY"]

response = requests.get(
    "/api/costs/summary",
    headers={"x-api-key": API_KEY},
    params={"period": "thisMonth", "groupBy": "LINKED_ACCOUNT"}
)

if response.status_code == 200:
    data = response.json()
    print(f"Total cost: \${data['data']['summary']['totalCost']}")
\`\`\`

**JavaScript:**
\`\`\`javascript
const API_KEY = process.env.GHOST_API_KEY;

async function getCosts() {
  const response = await fetch(
    \`/api/costs/summary?period=thisMonth&groupBy=LINKED_ACCOUNT\`,
    { headers: { "x-api-key": API_KEY } }
  );

  const data = await response.json();
  console.log("Total cost:", data.data.summary.totalCost);
}
\`\`\`

## Security Rules

**Do:**
- Store keys in environment variables
- Use AWS Secrets Manager or similar
- Request new keys every 90 days
- Each person gets their own key

**Don't:**
- Hardcode keys in scripts
- Commit keys to git
- Share keys with teammates
- Log keys in error messages

## Rate Limits

You get:
- 100 requests per minute
- 1000 requests per hour

If you hit the limit, you'll get a 429 error. Wait a bit and retry. Need higher limits? Ask the team.

**Handling rate limits:**
\`\`\`python
import time

def call_api(url, headers):
    response = requests.get(url, headers=headers)

    if response.status_code == 429:
        wait = int(response.headers.get('Retry-After', 60))
        print(f"Rate limited, waiting {wait}s...")
        time.sleep(wait)
        return call_api(url, headers)  # retry

    return response
\`\`\`

## If Your Key Stops Working

**401 Unauthorized** - Key is wrong or expired, double-check it

**403 Forbidden** - You don't have permission for that endpoint, ask for more access

**429 Too Many Requests** - You're going too fast, slow down or ask for higher limits

## Revoking Keys

Think your key leaked? Contact the AWS team immediately. Tell them:
- Which key (first 8 characters is enough)
- Why you need it revoked
- If you need a replacement

Also revoke keys when someone leaves the team or when you're done with a project.

## Need Help?

1. Try it in Swagger UI first (\`/api/swagger-ui\`)
2. Check you're using the right endpoint and parameters
3. Contact AWS team with the error message and what you were trying to do
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
