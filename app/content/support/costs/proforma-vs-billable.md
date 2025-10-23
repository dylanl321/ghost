---
title: Understanding Proforma Cost Data
lastUpdated: 2025-10-09
icon: i-heroicons-currency-dollar
---

## What is Proforma Cost Data?

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

