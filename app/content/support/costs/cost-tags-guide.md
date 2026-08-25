---
title: Tag Analysis & Cost Breakdown by Tag
lastUpdated: 2026-03-23
icon: i-heroicons-tag
---

# Tag Analysis & Cost Breakdown by Tag

## Overview

Tag Analysis lets you break down AWS costs by tag key across one account, a selected group of accounts, or the entire organization. For any given tag, you can see what percentage of spend is covered, identify untagged costs, and drill from a tag value into its contributing accounts, services, and resources. Use it to answer questions like:

- "How much is the Phoenix project costing us?"
- "What percentage of our spend is properly tagged?"
- "Who created the most expensive resources?"

## Understanding AWS Tags

### What Are Tags?

Tags are key-value labels attached to AWS resources. For example, a tag with key `Project` and value `Phoenix` would be written as `Project: Phoenix`. Tags are used for:

- **Cost allocation** — breaking down your AWS bill by project, team, or environment
- **Ownership tracking** — identifying who created or manages a resource
- **Compliance** — ensuring resources meet organizational tagging requirements

### AWS-Generated vs. User-Defined Tags

**AWS-generated tags** are prefixed with `aws:` and created automatically by AWS services:

- `aws:createdBy` — records who or what created the resource (IAM user, assumed role, or AWS service)
- `aws:cloudformation:stack-name` — set by CloudFormation on resources it creates
- These appear automatically but must still be **activated** in the Billing Console before they show up in cost analysis

**User-defined tags** are created by your team when provisioning resources:

- Examples: `Project`, `Team`, `Environment`, `CostCenter`
- **Not automatic** — your project team must implement a tagging strategy and apply tags at resource creation time
- Tags applied after resource creation only affect costs going forward (they are not retroactive)

### Why Some Resources Are Untagged

The "Untagged" row in the cost breakdown captures several scenarios:

- **Not all resource types support tags** — some charges like data transfer fees and certain shared services cannot be tagged
- **Tags were never applied** — the resource was created without the tag you're analyzing
- **The tag was added later** — costs incurred before tagging won't be retroactively tagged
- **Blank tag values** — the tag key exists on the resource but has no value

### Understanding `aws:createdBy` Values

The `aws:createdBy` tag produces several value formats depending on how the resource was created. GHOST parses these automatically into readable display names:

| Raw Value Format | What It Means | Display Name |
|---|---|---|
| `AssumedRole:AROAXXXX:user@example.com` | A user assumed an IAM role (most common in SSO environments) | `user@example.com` |
| `AWSService:serviceName` | An AWS service created the resource (e.g., Auto Scaling, CloudFormation) | `serviceName` |
| `arn:aws:iam::123456:user/username` | An IAM user directly created the resource | `username` |
| `arn:aws:iam::123456:role/rolename` | An IAM role created the resource | `rolename` |

When `aws:createdBy` is selected, GHOST opens in **People** view. Email-backed assumed-role sessions are combined case-insensitively across role IDs and accounts. Explicit IAM user ARNs are combined by their user path across accounts. The **All creators** option adds automation sessions, AWS services, IAM roles, Root, instance sessions, and untagged costs back to the table.

People view keeps the complete account scope as its percentage denominator, so each person's percentage remains their share of all spend even though non-user rows are hidden. Coverage cards are also unchanged by the People filter.

## Using the Tag Analysis Tab

1. Navigate to the **Cost Dashboard** and choose the account scope in the sidebar:
   - Leave the selection empty to analyze all accounts
   - Select several accounts to analyze only that group
   - Select one account for account-specific tag settings and aliases
2. Switch to the **Tag Analysis** tab
3. Use the **tag dropdown** to select a tag key — favorite/important tags appear at the top with a separator for easy access
4. Three **coverage stat cards** appear showing:
   - **Coverage %** — percentage of total cost that has this tag applied (color-coded: green 80%+, amber 50-79%, red below 50%)
   - **Tagged Cost** — total dollar amount from resources with this tag
   - **Untagged Cost** — total dollar amount from resources without this tag (highlighted with amber border when coverage is low)
5. The tag list is scoped to cost data for the selected accounts and timeframe

## Cost Breakdown Table

Below the coverage cards, a table shows every value for the selected tag, sorted by cost:

| Column | Description |
|---|---|
| **Display Name** | Friendly name for the tag value. Click to edit (set an alias). A pencil icon appears on hover. |
| **Raw Value** | The original value from AWS Cost Explorer. Combined people show a source-value count; hover to see every underlying value. |
| **Cost Distribution** | Visual bar showing relative cost (blue for tagged values, amber for untagged). |
| **Total Cost** | Dollar amount for this tag value. |
| **%** | Percentage of total cost. |

### Interacting with the Table

- **Filter values** — use the search field to find a project, username, email address, or raw tag value.
- **Click a row** to expand its detail panel. In a multi-account view, the panel first shows each contributing account and its share of that tag value. Expand an account to see its service-level costs, trend, and resource detail. A single-account view opens the existing service and trend detail directly.
- **Edit display names** — in a single-account view, click any display name or the pencil icon to set a custom alias. When you've made changes, a **Save Aliases** button appears above the table. Click it to persist all pending alias changes at once.
- **$0-cost values** — a toggle at the bottom of the table lets you show or hide tag values with zero cost
- **Export** — use the download button in the toolbar to export the breakdown as CSV. People view exports one combined row per person with contributing accounts and source-value count. Other multi-account views contain one row per tag value and contributing account.

## Historical Trend

Below the breakdown table, a line chart shows cost over time for the top tag values across the active account scope. Less common values are grouped into an "Other" category to keep the chart readable.

## Tag Settings

Tag settings are account-specific. Select exactly one account, then click the **settings icon** (adjustments/gear) in the toolbar to open the Tag Settings slideover panel. It contains three sections:

1. **Favorite Tags** — toggle which tags appear at the top of the tag dropdown for quick access. You can also add custom tag names manually, or click **Discover** to scan your AWS account for tags that are actually in use on your resources.
2. **Default Tag** — choose a tag to auto-select when you open the Tag Analysis tab, so you don't have to pick one each time.
3. **Tag Notes** — add descriptions explaining what each favorite tag means for your team. These appear as tooltips throughout the interface.

Click **Save Settings** at the bottom to persist your changes.

## Proforma Cost Estimates

By default, the Cost Dashboard shows **proforma costs** (what your account is actually charged via AWS Billing Conductor). However, AWS Billing Conductor **does not support cost allocation tags** — tag-level cost breakdowns are only available from billable (master account) data via Cost Explorer.

To bridge this gap, GHOST **extrapolates proforma costs per account and AWS time bucket** by applying each account's billable Net Unblended tag distribution to that account's proforma total for the same month. GHOST publishes the estimate only when every account/month bucket is available, then combines the results for multi-account views.

**What this means for you:**

- **Billable percentages are exact** — the relative distribution comes directly from the same Net Unblended metric used by the Cost Explorer console
- **Dollar amounts are estimates** — indicated by "(est.)" labels throughout the interface
- **Coverage % remains billable** — coverage measures the exact tagged vs. untagged billable ratio
- **Switch to billable mode** on the Cost Dashboard toggle to see exact billable costs per tag (without estimation)
- **Fallback is explicit** — if GHOST cannot calculate every contributing account's proforma ratio, the tab reports that the estimate is unavailable and shows exact billable costs instead

> **Important:** Tag-level proforma cost estimates are for directional insight only. They are extrapolated from billable percentages, not calculated by AWS Billing Conductor, and should **not** be used for chargeback or financial reconciliation. For chargeback, use proforma account-level totals, which are calculated directly by AWS Billing Conductor.

### Compute Foundry VMaaS exception

The dedicated **VMaaS Costs → Allocated usage** report is not the generic Tag
Analysis estimate. It uses a fixed shared account, a locked `TenantID` and
`CostCenter` contract, registered team cost managers, a closed month, and an
explicit reconciliation to the authoritative account-level pro forma total.
Only this dedicated, Finance-approved VMaaS report may be used to allocate
Compute Foundry tenant usage. Shared and untagged residual costs remain owned by
GDMS IT.

When estimated proforma costs are shown, a note appears above the breakdown table explaining the extrapolation.

## Common Questions

### What does "Untagged" mean?

Resources without a value for the selected tag are grouped as **Untagged**. This includes resources that don't support tags (like some data transfer charges), resources where the tag was never applied, and resources with a blank tag value. A high untagged percentage may indicate your team needs to improve its tagging strategy.

### Why do some `aws:createdBy` values show emails and others show role names?

The format depends on how the resource was created. Users signing in through SSO typically show up as `AssumedRole:...:email@example.com`. GHOST combines those values by email even when the role ID or account differs. Explicit IAM user ARNs are combined by user path. Resources created by AWS services or assumed roles without an email session remain non-user creators and appear under **All creators**.

### Can I rename tag values?

Yes, while viewing a single account. Click any display name in the breakdown table to set a custom alias. This doesn't change anything in AWS — it only changes how the value appears in GHOST. Use this to turn cryptic values like `AssumedRole:AROAXXXX:j.smith@company.com` into friendly names like "Jane Smith". Click **Save Aliases** to persist your changes.

### Who can configure tag settings?

Any user with access to an account can configure its favorite tags, default tag, tag notes, and aliases while viewing that single account. Settings and alias editing are hidden in multi-account and all-account views because configurations may differ between accounts.

### Why do tag costs show as estimated?

AWS Billing Conductor (which calculates proforma costs) does not support cost allocation tags. GHOST applies each account's billable Net Unblended tag distribution to that account's proforma total in the same monthly bucket, then combines complete results. The resulting dollar amounts are estimates and are marked with "(est.)". To see exact costs per tag, switch the Cost Dashboard to billable mode. These tag-level estimates should not be used for chargeback; use proforma account-level totals for that purpose.

### Do tags affect my actual AWS bill?

No. Tags are labels for organizing and analyzing costs. They don't change what you're charged.

## Tips

- **Start with one tag** — pick your most important tag (like "Project" or "Team") and get comfortable before adding more
- **Tag early** — apply tags when creating resources, not after. Costs before tagging won't be retroactively tagged
- **Use `aws:createdBy`** to identify who is driving costs even before implementing a full tagging strategy
- **Use aliases** to clean up cryptic tag values into team-friendly names
- **Standardize names** — agree on tag keys and values across teams (e.g., always "Environment", not "Env" or "env")
- **Set a default tag** in Tag Settings so the analysis loads automatically when you open the tab
- **Export to CSV** for offline analysis or sharing with stakeholders who don't have GHOST access
