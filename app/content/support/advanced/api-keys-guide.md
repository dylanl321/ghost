---
title: API Keys & Programmatic Access
lastUpdated: 2026-09-03
icon: i-heroicons-key
---

# API Keys & Programmatic Access

Need to access GHOST from a script or automation tool? You'll need an API key.

## Getting an API Key

Open **Settings → API Access**. Create a key, select only the read permissions the integration needs, and copy the secret immediately. It is shown only once.

## Permissions

Keys can read accounts, costs, forecasts, and security data through `/api/v1`. They are organization-wide and cannot call mutation, Entra, generic DynamoDB, or arbitrary Security Lake APIs.

Every account-scoped v1 endpoint uses the same selectors:

- `accountIdentifiers`: account IDs, GovCloud IDs, request IDs, or account emails
- `adminOf`: accounts where a person is primary admin, delegate, or cost manager
- `ownedBy`: accounts owned by an account email or primary account admin

Security integrations can use `/api/v1/security/findings` for Security Hub ASFF/normalized findings or `/api/v1/security/inspector/findings` for resource, CVE/GHSA, package, repository, image, score, fix, exploit, status, and Inspector-specific filters. Inspector requests must include at least one account selector.

Security finding lists use signed cursor pagination. Read `metadata.pagination.nextCursor` and pass it unchanged as `cursor` until `hasMore` is false. Numeric `page` remains available temporarily but is deprecated. `total` is `null` whenever AWS cannot calculate an exact total; never treat `returned` as the complete count.

## Using Your Key

Send the key in the `x-api-key` header:
```bash
curl -H "x-api-key: YOUR_KEY" /api/v1/accounts
```

List globally sorted Security Hub findings for two accounts:
```bash
curl -G -H "x-api-key: YOUR_KEY" \
  --data-urlencode "accountIdentifiers=111111111111,222222222222" \
  --data-urlencode "severity=CRITICAL,HIGH" \
  --data-urlencode "sortBy=severity" \
  --data-urlencode "sortOrder=desc" \
  "https://ghost.example/api/v1/security/findings"
```

List historical closed Inspector findings in an inclusive date range:
```bash
curl -G -H "x-api-key: YOUR_KEY" \
  --data-urlencode "accountIdentifiers=111111111111" \
  --data-urlencode "status=CLOSED" \
  --data-urlencode "dateField=updatedAt" \
  --data-urlencode "startDate=2026-01-01T00:00:00Z" \
  --data-urlencode "endDate=2026-01-31T23:59:59Z" \
  "https://ghost.example/api/v1/security/inspector/findings"
```

Fetch raw ASFF and follow a cursor:
```bash
curl -G -H "x-api-key: YOUR_KEY" \
  --data-urlencode "format=asff" \
  "https://ghost.example/api/v1/security/findings"

curl -G -H "x-api-key: YOUR_KEY" \
  --data-urlencode "format=asff" \
  --data-urlencode "cursor=PASTE_NEXT_CURSOR_HERE" \
  "https://ghost.example/api/v1/security/findings"
```

`startDate` and `endDate` are inclusive, must be supplied together, and cannot be combined with `lookbackDays`. Security Hub defaults to the last 30 days by `firstObservedAt`; Inspector defaults to all active findings.

## Code Examples

**Python:**
```python
import requests
import os

API_KEY = os.environ["GHOST_API_KEY"]

response = requests.get(
    "/api/v1/costs/summary",
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
    `/api/v1/costs/summary?period=thisMonth&groupBy=LINKED_ACCOUNT`,
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

## If Your Key Stops Working

**401 Unauthorized** - Key is wrong or expired, double-check it

**403 Forbidden** - You don't have permission for that endpoint, ask for more access

## Revoking Keys

Revoke the key from **Settings → API Access** immediately if it leaks or is no longer needed.

## Need Help?

1. Try it in Swagger UI first (`/api/swagger-ui`)
2. Check you're using the right endpoint and parameters
3. Contact AWS team with the error message and what you were trying to do
