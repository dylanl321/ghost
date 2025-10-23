---
title: Using Swagger UI for API Testing
lastUpdated: 2025-01-15
icon: i-heroicons-code-bracket
---

# Using Swagger UI for API Testing

Swagger UI lets you test GHOST's APIs interactively without writing any code. Just point and click.

## Getting There

Go to `/api/swagger-ui` in your browser, or click your profile icon → **API Documentation**.

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

1. Find `GET /api/costs/summary` under Costs
2. Click "Try it out"
3. Set parameters:
   ```
   period: thisMonth
   groupBy: LINKED_ACCOUNT
   enhanced: true
   ```
4. Hit "Execute"

You'll see the full response with all the cost data.

## Common Endpoints

**All accounts:**
```
GET /api/accounts/list?source=full&enrichment=full
```

**Cost analysis:**
```
GET /api/costs/analysis?period=thisMonth&groupBy=LINKED_ACCOUNT&includeBudget=true
```

**Forecast:**
```
GET /api/costs/forecast?period=current-month-remainder&granularity=DAILY
```

## Using API Keys

If you have an API key, click the **Authorize** button at the top and paste it in. Then all your requests will use that key instead of your browser session.

Two ways to authenticate:
- `x-api-key` header (recommended)
- `Bearer` token

## Tips

- **Copy curl commands** - Each request shows you the curl command you can run in terminal
- **Check examples** - Click "Example Value" to see what the response looks like
- **Start small** - Test with filters to keep responses manageable
- **Read the descriptions** - Hover over parameters to see what they do

## If Something Breaks

**401 Unauthorized** - You're not logged in or your API key is wrong

**400 Bad Request** - Missing or invalid parameters, check what's required

**500 Server Error** - Something went wrong on our end, try again or contact support

