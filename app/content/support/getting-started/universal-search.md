---
title: Using Universal Search
lastUpdated: 2025-01-15
icon: i-heroicons-magnifying-glass
---

# Using Universal Search

## Overview

Universal Search (top navigation bar) searches across accounts, users, resources, and more in GHOST.

## Quick Access

### Keyboard Shortcut
Press **`/`** to instantly focus the search bar from anywhere in GHOST.

### Search Bar Location
Top-right of every page, next to your user avatar.

## What You Can Search

### AWS Accounts
Search by:
- Account name: `production webapp`
- Account ID: `123456789012`
- Environment: `prod`, `dev`, `staging`
- Owner name: `john smith`

### Users
Search by:
- Name: `Jane Doe`
- Email: `jane.doe@company.com`
- Username: `jdoe`

## Search Tips

### Basic Search
Just type what you're looking for:
- `webapp` - Finds anything with "webapp"
- `john` - Finds users and accounts related to "john"

### Exact Matches
Use quotes for exact phrases:
- `"Production Account"` - Must match exactly
- `"123456789012"` - Exact account ID

### Type Filters
Narrow by resource type:
- `type:account production` - Only accounts
- `type:user jane` - Only users

## Common Searches

### Find My Accounts
Search for your name or team

### Find Production Accounts
```
env:production
```

### Find Account by ID
```
123456789012
```
Paste the 12-digit account ID.

## Tips

💡 **Use keyboard shortcuts** - `/` to focus search, `Esc` to close results

💡 **Start with account ID** - Most precise search method

💡 **Use type filters** - Faster results with fewer mismatches

