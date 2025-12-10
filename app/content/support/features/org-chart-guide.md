---
title: Using the Organization Chart
lastUpdated: 2025-01-15
icon: i-heroicons-chart-pie
---

# Using the Organization Chart

## Overview

The Organization Chart (`/account/org-chart`) provides a visual hierarchy of all AWS accounts in your organization, showing the relationship between organizational units (OUs) and accounts.

## Accessing the Org Chart

1. Click **Accounts** in the sidebar
2. Select **Organization Chart**
3. Or navigate directly to `/account/org-chart`

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

