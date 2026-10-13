---
title: API Keys & Programmatic Access
lastUpdated: 2026-10-01
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

If a supplied selector matches no accounts, the request returns an error. Omit selectors to request organization-wide data.

Security integrations can use `/api/v1/security/findings` for Security Hub ASFF/normalized findings or `/api/v1/security/inspector/findings` for resource, CVE/GHSA, package, repository, image, score, fix, exploit, status, and Inspector-specific filters. Inspector requests must include at least one account selector.

Security finding lists use signed cursor pagination. Read `metadata.pagination.nextCursor` and pass it unchanged as `cursor` until `hasMore` is false. `total` is `null` whenever AWS cannot calculate an exact total; never treat `returned` as the complete count.

For security requests, when selected accounts do not have an ID for the requested `environment`, valid accounts are still queried and each skipped account appears in `metadata.errors` with its known IDs and account name.

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

## Costs by Tag

Use a key with `costs:read` to retrieve the same cost breakdown as the Tag Analysis page:

```bash
curl -G -H "x-api-key: YOUR_KEY" \
  --data-urlencode "tagKey=Project" \
  --data-urlencode "period=lastMonth" \
  --data-urlencode "accountIdentifiers=111111111111,222222222222" \
  "https://ghost.example/api/v1/costs/tags"
```

The response includes `data.values` with each normalized tag value, `billableCost`, raw source values, and contributing accounts. It also includes tagged and untagged totals, `signedTotalCost` including credits, and `overallCoverage` calculated from positive charges. Costs use `NetUnblendedCost`, matching the Tag Analysis page.

- Use `/api/v1/costs/tag-keys?period=lastMonth` to discover tag keys. Add `tagKey=Project` to discover that key's raw values.
- Use `includeAccounts=false` for a smaller tag-value response. Each value still includes its `accountCount`.
- Pass a returned `values[].groupKey` as `valueGroupKey` to retrieve one value and its account contributions. Coverage and scope totals still describe the entire tag key.
- Set `tagKey=aws:createdBy` to combine the same creator across accounts. Filter the returned values by `isPerson=true` to reproduce the page's People view.
- Set `proforma=true` in the commercial environment for account-and-month weighted estimates. Check `proformaEstimation.available`; estimates are omitted when the necessary data is incomplete. Use account-level proforma totals for chargeback.

Both tag endpoints accept the standard account selectors and default to `last90days` if no dates are supplied. For cost requests, `startDate` is inclusive and `endDate` is exclusive; supply both or use `period`. For example, August costs use `startDate=2026-08-01&endDate=2026-09-01`.

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
