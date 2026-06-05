---
title: Exporting an Account's User Access List
lastUpdated: 2026-06-05
icon: i-heroicons-arrow-down-tray
---

# Exporting an Account's User Access List

## Overview

The **Account Users** page (`/account/{accountId}/users`) lists every user with
access to an AWS account along with their assigned roles. You can export this
list to copy it into a System Security Plan (SSP) user-access table or any other
document.

This is the fastest way to grab the current authoritative list of users for an
account when you need to refresh the user-access section of an SSP.

## Accessing the Export

1. Open the account you want (e.g. from the **Account Explorer** or a favorite).
2. Click **Users** (or **View All** on the account's Users card).
3. In the top-right of the account header you'll see the **Export Users** button.

The button is disabled while users are still loading and when the account has no
users.

## Export Options

Click **Export Users** to open the menu. Three options are available:

### Copy to clipboard
Copies the full user list as **tab-separated rows** (Display Name, User Principal
Name, Roles). This is the recommended option for an SSP:

- Paste directly into an Excel/Word table — each tab becomes a new column and each
  user becomes a new row.
- A user with multiple roles has those roles joined with `; ` in a single cell, so
  every user stays on one row.

### Download CSV
Downloads a `.csv` file named
`{account-name}-user-access-list-{timestamp}.csv`. Open it in Excel or import it
into your SSP workbook.

### Download Excel
Downloads a styled `.xlsx` workbook with the same three columns, a bold frozen
header row, and auto-sized columns.

## What's Included

| Column | Description |
| --- | --- |
| Display Name | The user's full display name |
| User Principal Name | The user's UPN / sign-in name |
| Roles | All roles the user holds in this account, joined with `; ` |

Users are sorted alphabetically by display name. The exported list reflects the
users currently loaded on the page — refresh the page first if you want the very
latest membership.

## Tips for the SSP User Access List

- Use **Copy to clipboard** when pasting into an existing SSP table — it preserves
  the column layout without an intermediate file.
- Use **Download Excel** when you want a standalone, formatted artifact to attach
  or archive.
- The export only contains users with access to this single account. To compile a
  multi-account list, export each account and combine them.
