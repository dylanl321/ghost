---
title: API Keys & Programmatic Access
lastUpdated: 2025-01-15
icon: i-heroicons-key
---

# API Keys & Programmatic Access

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
```bash
curl -H "x-api-key: YOUR_KEY" /api/accounts/list
```

**Bearer token:**
```bash
curl -H "Authorization: Bearer YOUR_KEY" /api/accounts/list
```

## Code Examples

**Python:**
```python
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
    print(f"Total cost: ${data['data']['summary']['totalCost']}")
```

**JavaScript:**
```javascript
const API_KEY = process.env.GHOST_API_KEY;

async function getCosts() {
  const response = await fetch(
    `/api/costs/summary?period=thisMonth&groupBy=LINKED_ACCOUNT`,
    { headers: { "x-api-key": API_KEY } }
  );

  const data = await response.json();
  console.log("Total cost:", data.data.summary.totalCost);
}
```

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
```python
import time

def call_api(url, headers):
    response = requests.get(url, headers=headers)

    if response.status_code == 429:
        wait = int(response.headers.get('Retry-After', 60))
        print(f"Rate limited, waiting {wait}s...")
        time.sleep(wait)
        return call_api(url, headers)  # retry

    return response
```

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

1. Try it in Swagger UI first (`/api/swagger-ui`)
2. Check you're using the right endpoint and parameters
3. Contact AWS team with the error message and what you were trying to do

