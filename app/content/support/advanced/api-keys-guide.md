---
title: API Keys & Programmatic Access
lastUpdated: 2026-10-30
icon: i-heroicons-key
---

# API Keys & Programmatic Access

Need to access GHOST from a script or automation tool? You'll need an API key.

## Getting an API Key

Open **Settings → API Access**. Create a key, select only the read permissions the integration needs, and copy the secret immediately. It is shown only once.

- Keys look like `gdms_<environment>_<key id>_<secret>`. The key ID in the middle matches the ID shown on the key's card, so you can tell which key a script uses without revealing the secret.
- Keys expire after 90 days unless you pick 30, 180 or 365 days, or **Never expires**.
- Permissions cannot be changed after creation. To add one, create a new key and revoke the old one.

## Permissions

Keys can read accounts, costs, forecasts, and security data through `/api/v1`. They are organization-wide and cannot call mutation, Entra, generic DynamoDB, or arbitrary Security Lake APIs.

| Permission | Endpoints |
|---|---|
| `accounts:read` | `GET /api/v1/accounts`, `GET /api/v1/accounts/{identifier}`, `GET /api/v1/organization` |
| `costs:read` | `GET /api/v1/costs/summary`, `GET /api/v1/costs/tags`, `GET /api/v1/costs/tag-keys` |
| `forecast:read` | `GET /api/v1/forecasts/aws`, `GET /api/v1/forecasts/financial` |
| `security:read` | `GET /api/v1/security/summary`, `GET /api/v1/security/findings`, `GET /api/v1/security/inspector/findings` |

Every account-scoped v1 endpoint uses the same selectors:

- `accountIdentifiers` (or `accountIds`): comma-separated account IDs, GovCloud IDs, request IDs, or account emails
- `adminOf`: accounts where a person is primary admin, delegate, or cost manager
- `ownedBy`: accounts owned by an account email or primary account admin

Selectors combine, up to 100 values per request. A full email address matches only that address; a bare username such as `jane.doe` matches that mailbox on any domain. If an identifier is malformed or matches no account, the request fails with `400` or `404` and names it; if `adminOf`/`ownedBy` resolve to no accounts, it returns `400`. Omit selectors to request organization-wide data.

Cost and AWS forecast data are billed to commercial account IDs. When a selected account has only a GovCloud ID, the other accounts are still returned and the skipped account is listed in `metadata.errors`, so a total is never silently partial.

Security integrations can use `/api/v1/security/findings` for Security Hub ASFF/normalized findings or `/api/v1/security/inspector/findings` for resource, CVE/GHSA, package, repository, image, score, fix, exploit, status, and Inspector-specific filters. Inspector requests must include at least one account selector.

Security finding lists use signed cursor pagination. Read `metadata.pagination.nextCursor` and pass it unchanged as `cursor` until `hasMore` is false. `total` is `null` whenever AWS cannot calculate an exact total; never treat `returned` as the complete count.

For security requests, when selected accounts do not have an ID for the requested `environment`, valid accounts are still queried and each skipped account appears in `metadata.errors` with its known IDs and account name.

## Using Your Key

Send the key in the `x-api-key` header. The examples below use `https://ghost.example`; replace it with the address you use to open GHOST.
```bash
curl -H "x-api-key: $GHOST_API_KEY" "https://ghost.example/api/v1/accounts"
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

## Forecasts

- `/api/v1/forecasts/aws` returns the AWS Cost Explorer forecast. Use `period` (`next-month`, `3-months`, `6-months`, `12-months`, `rest-of-year`, `current-month-remainder`, or `custom` with `months=1..12`).
- `/api/v1/forecasts/financial` returns the Finance forecast uploaded to GHOST, one record per account with monthly amounts in `forecasts`. Filter with `period=YYYY-MM` (records that have that month) and `status`. Selected accounts match on either their commercial or GovCloud ID.

## Code Examples

**Python:**
```python
import os
import requests

GHOST_URL = os.environ["GHOST_URL"]  # e.g. https://ghost.example
API_KEY = os.environ["GHOST_API_KEY"]

response = requests.get(
    f"{GHOST_URL}/api/v1/costs/summary",
    headers={"x-api-key": API_KEY},
    params={"period": "thisMonth", "groupBy": "LINKED_ACCOUNT"},
    timeout=60,
)
body = response.json()
if not response.ok:
    raise RuntimeError(f"{response.status_code} {body['error']['code']}: {body['error']['message']} "
                       f"(request {body['metadata'].get('requestID')})")

print(f"Total cost: ${body['data']['summary']['totalCost']:.2f}")
```

**JavaScript:**
```javascript
const GHOST_URL = process.env.GHOST_URL; // e.g. https://ghost.example
const API_KEY = process.env.GHOST_API_KEY;

async function getCosts() {
  const response = await fetch(
    `${GHOST_URL}/api/v1/costs/summary?period=thisMonth&groupBy=LINKED_ACCOUNT`,
    { headers: { "x-api-key": API_KEY } }
  );
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`${response.status} ${body.error.code}: ${body.error.message}`);
  }
  console.log("Total cost:", body.data.summary.totalCost);
}
```

## Security Rules

**Do:**
- Store keys in environment variables
- Use AWS Secrets Manager or similar
- Rotate keys: create the new key, switch the integration, then revoke the old one
- Each person gets their own key

**Don't:**
- Hardcode keys in scripts
- Commit keys to git
- Share keys with teammates
- Log keys in error messages

## Errors

Every `/api/v1` error has the same shape:

```json
{
  "success": false,
  "error": { "code": "FORBIDDEN", "message": "API key requires costs:read scope" },
  "metadata": { "timestamp": "2026-10-30T12:00:00.000Z", "requestID": "…" }
}
```

| Status | Code | What to do |
|---|---|---|
| 400 | `BAD_REQUEST` | Fix the parameter named in `message` (dates, selectors, filters). |
| 401 | `UNAUTHORIZED` | The message says whether the key is invalid, revoked, or expired. Create a new key if it was revoked or expired. |
| 403 | `FORBIDDEN` | The key lacks the permission for that endpoint. Create a key that includes it. |
| 404 | `NOT_FOUND` | The account identifier did not match any active account. |
| 502 / 503 | `UPSTREAM_ERROR` / `SERVICE_UNAVAILABLE` | GHOST could not check the key or reach AWS. Retry after a short wait (honor `Retry-After` when present); the key is still valid. |
| 500 | `INTERNAL_ERROR` | Retry later; if it persists, report the `requestID`. |

## Checking Usage

Open **Usage** on a key's card to see its calls for the last 30 days: totals for 24 hours, 7 days and 30 days, the endpoints it called, response statuses, and the 20 most recent calls.

## Revoking Keys

Revoke the key from **Settings → API Access** immediately if it leaks or is no longer needed. Revocation takes effect within 30 seconds on every GHOST server.

## Need Help?

1. Try it in Swagger UI first (`/api/swagger-ui`)
2. Check you're using the right endpoint and parameters
3. Contact the AWS team with the error `code`, `message`, `requestID`, and what you were trying to do
