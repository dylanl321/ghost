---
title: Using the Command Palette
lastUpdated: 2026-03-30
icon: i-heroicons-command-line
---

# Using the Command Palette

The Command Palette is a power-user hub for navigating GHOST instantly. Open it from anywhere to search accounts, jump to pages, run actions, or ask AI questions.

## Opening the Command Palette

Press **Ctrl+K** (or **Cmd+K** on Mac) from any page, or click the Command Palette card on the dashboard.

## What You Can Do

### Search Accounts

Start typing an account name or ID. Matching accounts appear instantly using fuzzy search — typos are tolerated. If your query is 3+ characters, the palette also searches the server for broader matches including resources and instances.

### Account Drill-Down

Select an account from results to enter **drill-down mode**. Instead of navigating away, you see contextual sub-actions for that specific account:

- **Overview** — Account overview page
- **Resources** — EC2, S3, Lambda, and other resources
- **Policies** — IAM policies for the account
- **Security Findings** — Security Hub findings
- **Costs** — Cost Dashboard filtered to that account
- **Cost Trends** — Cost trends over time
- **Cost Forecast** — Projected spend
- **Users** — Users with access to the account
- **Groups** — AD groups associated with the account
- **View in Explorer** — Full account detail in Account Explorer

Admin users also see **Pipelines** (CI/CD) and **Notes** sub-actions.

Each sub-action deep-links to the correct page pre-filtered to the selected account. Press **Backspace** on an empty search to go back to the main results.

### Navigate Pages

Type any page name to jump there: `costs`, `security`, `explorer`, `changelog`, `reports`, `admin`, `about`, `support`, `chat`, and more. The search is fuzzy — `cst dshbrd` will find "Cost Dashboard."

### Run Actions

Action commands do things without navigating:

- **Toggle Dark/Light Theme** — Switch between dark and light mode
- **Copy Current URL** — Copy the current page URL to clipboard
- **Toggle Sidebar** — Collapse or expand the sidebar navigation
- **Refresh Page Data** — Reload the current page

### Ask AI

Type a question (starts with how, what, why, show, can, find, or contains `?`) and the palette offers an **Ask AI** option. Selecting it opens GHOST Chat with your question pre-filled.

### Admin Commands

Admin users see additional commands for navigating admin panels, including the Admin Dashboard, Notification Settings, and all configuration panels.

## Keyboard Shortcuts

### Quick Navigation (g-prefix)

Press **g** followed by a second key to jump to pages instantly. These work from anywhere (except inside text inputs):

| Shortcut | Destination |
|----------|-------------|
| **g d** | Dashboard |
| **g c** | Cost Dashboard |
| **g e** | Account Explorer |
| **g s** | Security |
| **g a** | Admin Panel |
| **g h** | AI Chat |
| **g r** | Reports |
| **g o** | Org Chart |
| **g p** | Profile |
| **g l** | Changelog |

The second key must be pressed within 500ms of pressing **g**.

### Inside the Palette

| Key | Action |
|-----|--------|
| **Up/Down** | Navigate results |
| **Enter** | Select item |
| **Escape** | Close palette |
| **Backspace** (empty) | Exit drill-down |

### Other Shortcuts

| Key | Action |
|-----|--------|
| **?** | Open keyboard shortcuts reference modal |
| **Ctrl+K / Cmd+K** | Toggle command palette |

## Context-Aware Suggestions

When the palette opens with no query, it shows suggestions based on your current page. For example, on the Cost Dashboard it suggests Account Explorer and account settings; on the Security page it suggests Explorer and Costs.

## Recent Commands

The palette remembers your last 5 commands. These appear in the "Recent" section when you open the palette and on the dashboard card for quick re-access.

## Server Search

For queries of 3 or more characters, the palette searches the server in addition to local results. Server results include accounts, instances, and resources that may not be loaded in your browser yet. A loading indicator appears while the server search is in progress.

## Dashboard Card

The Command Palette card on the dashboard provides:

- A quick-open button showing the keyboard shortcut
- A search trigger that opens the full palette
- Your recent commands for quick re-access
- Keyboard shortcut reference
- Favorite account chips (in larger layouts)

You can resize, reorder, or hide this card from the dashboard Customize panel.

## Tips

- **Use drill-down** — Select an account first, then pick the specific page you want. This is faster than navigating and then filtering.
- **Type questions** — If you're not sure where something is, just ask. The AI fallback routes you to GHOST Chat.
- **Learn g-shortcuts** — After a few days, muscle memory makes these faster than any mouse navigation.
- **Press ? anywhere** — Opens the full keyboard shortcuts reference modal.
- **Fuzzy matching** — Don't worry about exact spelling. The search tolerates typos and partial matches.
