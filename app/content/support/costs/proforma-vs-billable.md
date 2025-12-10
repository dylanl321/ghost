---
title: Understanding Proforma Cost Data
lastUpdated: 2025-10-09
icon: i-heroicons-currency-dollar
---

> 📖 **New to cost concepts?** Start with the [Cost Concepts Overview](/support/docs?topic=cost-concepts-overview) to understand all key terminology.

## What is Proforma Cost Data?

AWS billing has two cost views: **Billable** and **Proforma**.

**Billable Costs**
Official AWS invoice charges. IT pays this to AWS.

**Proforma Costs**
Adjusted charges created by AWS Billing Conductor. Distributes savings plan discounts to accounts that used the resources.

## Why Use Proforma Costs?

Savings Plans are purchased at the master account level but consumed across all accounts. Without Proforma, discounts only show in IT's payer account while linked accounts show full rates.

**Proforma allocates discounts:**
- Each account gets credit for savings plan discounts it used
- Enables accurate internal chargeback
- Shows actual resource costs with discounts applied

## Example

**Billable:**
- Master account: Savings plan purchase and credits
- Linked accounts: Full usage rates

**Proforma:**
- Discounts distributed to accounts
- Each account shows adjusted cost after savings

## FAQ

**Why don't I see Billable numbers in my dashboard?**
Account dashboards show Proforma costs for chargeback accuracy. Only IT sees Billable for invoice payment.

**What does Proforma represent?**
Account costs after savings plan discounts have been distributed.

**Does Proforma change the AWS bill?**
No. AWS invoices are always Billable. Proforma is for internal allocation only.

**Which number matters for chargeback?**
Proforma. Billable is only for IT invoice payment.

**Why do Proforma costs differ from usage estimates?**
Proforma includes savings plan discounts. Accounts using covered resources show reduced costs.

**Why use Billable for org-wide views?**
Proforma cannot include the master account in billing groups. Billable shows complete org costs without splitting calculations.

## Switching Views in GHOST

Use the **Billable/Proforma** dropdown in Cost Dashboard header. All charts and tables update accordingly.

**When to use:**
- **Billable**: Org-wide totals, invoice reconciliation
- **Proforma**: Account tracking, chargeback, resource costs

