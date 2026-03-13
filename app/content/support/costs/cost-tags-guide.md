---
title: Tag Analysis & Tag-Based Cost Grouping
lastUpdated: 2026-03-13
icon: i-heroicons-tag
---

> **Prerequisite:** Cost Allocation Tags must be **activated** in the AWS Billing Console before they appear in GHOST. If you don't see any tags, ask your AWS administrator to enable them. It can take up to 24 hours after activation for tags to show up.

# Tag Analysis & Tag-Based Cost Grouping

## Overview

Tags let you label AWS resources (e.g., `Project: Phoenix`, `Team: Platform`, `Environment: Production`). The Tag Analysis feature lets you see how your AWS costs break down by these labels, so you can answer questions like:

- "How much is the Phoenix project costing us?"
- "What percentage of our spend is properly tagged?"
- "Which accounts have untagged resources?"

## Viewing Costs by Tag

### From the Cost Dashboard

1. Navigate to **Cost Dashboard** (`/account/costs`)
2. In the header bar, look for the **Tags** dropdown
3. Select a tag key (e.g., "Environment", "Project", or "Team")
4. The dashboard switches to show costs grouped by that tag's values

When tag grouping is active:
- A **Tag Cost Breakdown** panel appears showing cost per tag value
- A bar chart visualizes the distribution
- An **"Untagged"** row shows costs from resources without that tag
- Click any tag value to filter to just those costs

### Clearing Tag Grouping

To go back to the normal view, click the **X** on the tag badge in the header, or select a different grouping option.

## Tag Analysis Page

For a deeper look across all your accounts, use the dedicated Tag Analysis page.

### Accessing the Page

1. Click **Tag Analysis** in the sidebar (under Accounts)
2. Or navigate directly to `/account/cost-tags`

### Tag Discovery

The top section shows all cost allocation tags found across your accounts. Click any tag badge to select it for analysis.

### Tag Coverage

Once you select a tag, the **Tag Coverage** section shows:
- **Overall Coverage** - What percentage of total costs have this tag applied
- **Per-Account Breakdown** - Each account's tagged vs. untagged costs with a progress bar
  - **Green** (75%+): Good coverage
  - **Yellow** (50-75%): Needs improvement
  - **Red** (below 50%): Many resources are missing this tag

### Cost by Tag

Below coverage, you'll see a table and chart showing how costs distribute across the tag's values. For example, if you select the "Environment" tag, you might see:
- Production: $45,000
- Development: $12,000
- Staging: $3,000
- Untagged: $8,000

### Untagged Cost Alerts

Accounts where more than 50% of costs are untagged are highlighted as alerts. This helps you prioritize which accounts need better tagging.

## Configuring Important Tags

As an account admin, you can mark which tags matter most for your account. This makes them easier to find in dropdowns and highlights them for your team.

### Setting Up Important Tags

1. Go to the **Cost Dashboard** (`/account/costs`)
2. Select a single account in the sidebar
3. Click the **Tag Configuration** button (visible to account admins only)
4. In the configuration panel:
   - **Check the box** next to tags you want to mark as important
   - **Set a default tag** to automatically group costs by when viewing this account
   - **Add descriptions** to explain what each tag means for your team
5. Click **Save**

Important tags appear at the top of all tag dropdowns with a visual separator, making them quick to find.

## Filtering by Tag Values

You can narrow your cost view to specific tag values:

1. When tag grouping is active on the Cost Dashboard, the **Tag Filter** panel appears
2. Select a tag key, then pick one or more values
3. Filter badges appear showing your active filters
4. Click the **X** on any badge to remove that filter
5. Click **Clear All** to remove all tag filters

## Common Questions

### Why don't I see any tags?

Cost Allocation Tags must be activated in the AWS Billing Console. Contact your AWS administrator and ask them to:
1. Go to **AWS Billing Console** > **Cost Allocation Tags**
2. Select the tags to activate
3. Click **Activate**

Tags take up to 24 hours to appear after activation. Only costs incurred **after** activation will be tagged.

### What does "Untagged" mean?

Resources without a value for the selected tag are grouped as **Untagged**. This is normal for shared services (like data transfer), but a high untagged percentage may mean resources need tagging.

### Can I see tags from multiple accounts at once?

Yes. The Tag Analysis page (`/account/cost-tags`) shows tags across all your accounts. The coverage section breaks down tagging quality per account.

### Who can configure important tags?

Only **account administrators** can set up important tags and default grouping. All users can view and use tags for grouping and filtering.

### Do tags affect my actual AWS bill?

No. Tags are labels for organizing and analyzing costs. They don't change what you're charged.

## Tips

- **Start with one tag** - Pick your most important tag (like "Project" or "Team") and get comfortable before adding more
- **Check coverage regularly** - Use the Tag Analysis page to monitor tagging compliance
- **Tag early** - Apply tags when creating resources, not after. Costs before tagging won't be retroactively tagged
- **Standardize names** - Agree on tag keys and values across teams (e.g., always "Environment", not "Env" or "env")
- **Use the untagged alerts** - Focus cleanup efforts on accounts with the highest untagged costs
