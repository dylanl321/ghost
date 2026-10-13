# OAuth administration panel

Status: Proposed feature; this document does not represent an implemented panel.

## Problem and outcome

An administrator must be able to explain why an application cannot sign in,
inspect the effective OAuth configuration, manage approved applications, and
investigate user login activity without reading raw credentials or searching
unrelated infrastructure logs.

The September 2026 Crew installer incident demonstrates the gap: the development
website was accessible, production Crew discovery returned 404, and development
client registration later returned 429. Website availability and an existing
browser session did not establish that a new OAuth client could authenticate.
The panel should identify the failing stage, environment, affected clients,
applicable limit, next action, and evidence needed to verify recovery.

## Audience and placement

Add **OAuth & Applications** to GHOST administration, with a proposed route of
`/admin/oauth`. It serves authorized identity administrators and support staff;
ordinary users continue to use their application's sign-in and consent screens.

Every page must display the environment and the time its observations were
collected. Development and Production must never be inferred from an application's
display name. Cross-environment inspection, if supported, requires separately
authorized server-side connections; selecting an environment must clear stale
results and pending actions from the previous environment.

The initial implementation uses the existing `requireAdmin` server-side gate.
Before enabling mutations, introduce explicit capabilities for viewing
configuration, viewing user activity, managing applications, revoking grants,
and proposing operational changes. Hiding a button is not authorization.

## Existing implementation to reuse

| Concern | Existing source | Integration |
| --- | --- | --- |
| OAuth provider, scopes, grants, lifetimes, PKCE and refresh policy | `server/mcp/oauth/provider.ts`, `server/mcp/config.ts` | Project safe effective configuration from the running provider |
| Durable provider storage | `server/mcp/oauth/adapter.ts` | Use supported provider/model operations; never expose an artifact-table browser |
| Dynamic registration and rate decisions | `server/routes/oauth/register.post.ts`, `server/mcp/rate-limit.ts` | Instrument registration results and publish quota observations without incrementing counters |
| Protected resources | `server/routes/.well-known/oauth-protected-resource/`, `server/kirocrew/types.ts` | Inspect advertised metadata and compare it with runtime resource/scope definitions |
| Crew profile health | `server/api/admin/kirocrew/health.get.ts` | Link configuration health to authentication diagnostics, without returning profile secrets |
| MCP audit summaries | `server/api/admin/mcp-usage/overview.get.ts`, `server/mcp/usage.ts` | Reuse audit infrastructure while distinguishing OAuth events from successful MCP activity |
| Admin authorization and settings history | `server/utils/user-roles.ts`, `server/api/admin/site-config/` | Reuse access checks and change-history patterns; do not invent a parallel admin identity |
| Runtime environment and deployment | `terraform/ecs.tf`, `.gitlab-ci.yml` | Display configuration provenance and the deployment required to change it |

Refresh success/failure events already exist, but a complete correlated OAuth
timeline, searchable application inventory, registration-counter view, and the
management APIs proposed below require implementation. Do not present absent
telemetry as zero failures, zero users, or healthy status.

## Screens and workflows

### 1. Overview and effective configuration

Show independent status cards for website session authentication, protected-resource
discovery, authorization-server discovery, registration, authorization/consent,
token exchange, refresh, revocation, provider storage, and Crew profile retrieval.
Each card includes its observation time, evidence source, last result and remedy.
Successful website login must not turn the entire OAuth system green.

Display issuer and approved public endpoints, resource audiences and scope names,
supported grant types, PKCE policy, client authentication methods, registration
policy, token/grant lifetimes, refresh rotation policy, quota settings and
durability status. Show signing key IDs, algorithms and rotation dates only;
private keys, cookie keys and configuration-secret contents remain inaccessible.

Distinguish configured, deployed and observed values. Include available release
SHA, pipeline, image digest and task revision so administrators can determine
whether a setting has reached the running service. Missing build evidence is
“unknown,” not an assumed match with the latest Git commit.

Each setting has a provenance label: provider default, environment variable,
approved configuration document or supported runtime setting. Deployment-backed
settings offer **Propose change**, with the exact diff and destination workflow.
They must not appear saved or effective until deployment and verification finish.

### 2. Applications and new application registration

Provide a paginated live inventory of OAuth clients with client ID, name, owner,
environment, native/public or other supported type, registration origin, allowed
grant types, redirect URI policy, approved resource/scope permissions, creation
date, last observed use and administrative lifecycle state.

Selecting an application opens its metadata, recent authorization attempts,
active-grant summaries, issues and audit history. “Last observed use” must state
the available observation window; absent telemetry is not proof of inactivity.

**Create application** is an administrator workflow:

1. Identify the application and accountable owner/team, purpose and environment.
2. Choose from client types supported by the current GHOST provider. The current
   provider supports native public clients with no client secret; unsupported
   confidential-client flows must not appear usable.
3. Register and validate redirect URIs using the provider's native/web rules,
   including loopback handling. Reject arbitrary wildcards, open redirects and
   unsupported schemes; preserve PKCE requirements.
4. Select approved resources and least-privilege scopes. A requested scope is not
   evidence of user consent or an issued grant.
5. Preview the registration and permissions, then confirm. Submit once using an
   idempotent operation so retries do not create duplicate clients.
6. Return client ID and non-secret integration guidance, then offer a controlled
   development sign-in test. Public clients must not receive invented secrets.

Application management includes metadata updates, ownership transfer, scope and
redirect changes, deprecation, blocking new authorizations, and retirement.
Define each action's effect on existing sessions, grants, access tokens and
refresh tokens before implementing it. The UI must not offer “disable” or
“revoke all” until the provider can enforce and verify the promised behavior.

Retirement preserves audit records and includes explicit options for existing
grants. Application registration access tokens and any future confidential-client
credentials remain server-side in protected storage; never return them in list,
detail, diagnostic-export or ordinary audit responses.

### 3. User logins, consent and grant activity

Search by authorized user identity, application, resource, environment, time
range, outcome, failure stage or diagnostic reference. Display an attempt
timeline:

`discovery → registration/reuse → authorization → browser sign-in → consent → callback → token exchange → resource access`

Also show refresh and revocation events. Use explicit states such as pending,
waiting for user, succeeded, denied, cancelled, expired, failed and unknown.
Pre-login registration failures may have neither a user nor a client ID; do not
attach them to whichever user most recently signed into the website.

For authorized investigations, show identity metadata, application, requested
versus granted scopes, consent time, grant expiry and last observed refresh.
Never display authorization codes, cookies, raw tokens or token-bearing URLs.
An administrator may revoke a selected grant with a reason and impact preview,
but may not impersonate a user or mint a user's session from the panel.

Revocation results must distinguish provider confirmation from downstream token
invalidity. Show any propagation delay or existing access-token lifetime until
resource requests prove that access is denied.

### 4. Issues and diagnostics

Group repeated failures by stage, safe error code, application/resource,
environment and time window. Issue rows show first/last observation, attempt
count, affected known users/clients, severity, owner, investigation notes,
mitigation and verification status. Keep anonymous registration attempts
separate from authenticated-user counts.

Required issue categories include missing discovery routes, issuer/audience
mismatches, invalid client metadata or redirect URIs, PKCE/state failures,
registration throttling, denied consent, expired/invalid grants, callback
failures, storage/permission failures, profile publication failures and transport
or corporate TLS failures.

An issue detail page answers:

- Which stage failed, and which stages succeeded?
- Which environment and deployed version handled the request?
- Is the cause client-side, provider-side, downstream, or still unknown?
- What action is supported, who owns it, and what verifies recovery?
- Is the proposed action local, a provider mutation, or a deployment?

Correlate installer diagnostic references with server request/attempt IDs when
instrumentation supplies that mapping. If a reference has no server event,
explain that it may represent a local failure or missing telemetry. Do not infer
a server error solely from an installer reference.

Safe diagnostics can recheck discovery metadata, public-key availability,
advertised resource/scopes, dependency permissions and configuration health.
They must use approved endpoints, bounded timeouts and cancellable jobs.
Routine refresh and health checks must never register applications, start
browser consent or increment registration quotas. A synthetic authorization test
is a separate explicit action using a reusable dedicated test client and human
consent where required.

### 5. Registration quotas and operational controls

Display the effective limit, window duration, current count, remaining allowance,
reset time, quota key type and observation source. Report shared corporate egress
as a possible aggregation boundary rather than treating every network address
as one user. Default to privacy-preserving network identifiers; exact address
access requires a separately justified support capability.

Reading quota usage must be read-only. Implement a read projection or aggregate
query; do not call the existing incrementing rate-decision function to draw the
page. When current counters cannot be read, display “usage unavailable” while
retaining the known configured limit.

On HTTP 429, the provider should return `Retry-After`; clients and the panel
should respect it and avoid retry storms. Show whether rejected registrations
count toward the active window. Registration reuse should be the normal client
behavior so cancelled browser attempts do not consume new client registrations.

**Propose quota change** shows before/after values, environment, affected quota
keys, duration if temporary, rationale and deployment requirements. Preserve
bounded abuse controls. Any future emergency adjustment must target a specific
window/key, record an audit event and report the resulting count; it must not be
an unrestricted “clear all OAuth state” action.

### 6. Audit history, exports and alerts

Audit application and permission changes, consent/grant revocation, diagnostic
jobs, operational changes, and access to restricted investigation data. Record
actor, capability, environment, operation ID, reason, safe before/after fields,
timestamps, outcome and verification evidence.

Provide a redacted support export containing issue metadata, stage outcomes,
safe HTTP/error codes, release references and relevant configuration names.
Exclude tokens, cookies, credentials, secret/profile documents, raw request
bodies, authorization query strings and unapproved personal data.

Configurable alerts should cover sustained registration throttling, a rise in
token/refresh failures, discovery mismatches, unavailable storage and signing-key
expiry/rotation problems. Deduplicate alerts and provide recovery notices.
Notification destinations come from approved organization configuration.

## API and data requirements

The following are proposed contracts, not existing endpoints:

| Proposed API | Purpose |
| --- | --- |
| `GET /api/admin/oauth/overview` | Stage health and observation freshness |
| `GET /api/admin/oauth/configuration` | Safe effective configuration and provenance |
| `GET /api/admin/oauth/applications` and `GET /applications/:id` | Cursor-paginated client inventory and safe details |
| `POST /api/admin/oauth/applications` and `PATCH /applications/:id` | Validated, audited, idempotent management operations |
| `GET /api/admin/oauth/attempts` and `GET /attempts/:id` | Correlated stage timeline |
| `GET /api/admin/oauth/grants` and `POST /grants/:id/revoke` | Authorized grant inventory and scoped revocation |
| `GET /api/admin/oauth/issues` and `PATCH /issues/:id` | Grouped failures and investigation workflow |
| `GET /api/admin/oauth/limits` | Non-mutating quota observations |
| `POST /api/admin/oauth/diagnostics` and `GET /diagnostics/:id` | Bounded diagnostic job submission and results |
| `POST /api/admin/oauth/change-proposals` | Reviewable deployment/configuration proposals |
| `GET /api/admin/oauth/audit` | Restricted, paginated change history |

Document all implemented endpoints in Swagger, including validation,
authorization, error envelopes, pagination and sensitive-field exclusions.
Mutations need CSRF protection for browser sessions, server-side authorization,
idempotency keys and optimistic concurrency where concurrent edits are possible.
No admin endpoint accepts arbitrary probe destinations or raw storage queries.

Define an allowlisted OAuth event schema: event/attempt/correlation IDs,
timestamp, environment, stage, result, safe error code, HTTP status, duration,
application/resource identifiers when known, authorized identity reference when
known, quota outcome, and deployed-version reference. Avoid retaining raw
requests and exceptions as the event payload.

Design indexes for environment/time, application/time, authorized user/time,
correlation ID and issue grouping. Do not scan the provider's token table to
populate every page. Telemetry should use a separate safe event projection with
bounded retention. Any application index is a projection; the provider remains
authoritative for client and grant enforcement.

## Delivery sequence

1. Instrument discovery, registration, authorization, token exchange, refresh,
   revocation and resource-access failures with safe correlation. Add provider
   `Retry-After` and non-mutating quota observations.
2. Ship the read-only overview, configuration, application inventory, attempt
   timeline and issue diagnostics against real development traffic.
3. Add validated application creation/editing and scoped grant revocation,
   enforcing capabilities, idempotency and complete audit records.
4. Add operational change proposals, alerting and redacted support exports.
   Enable Production only after access, privacy and recovery acceptance passes.

## Acceptance criteria

- An administrator can distinguish “website login works” from a Crew registration
  failure and locate the exact failing stage without raw-log access.
- Development and Production never share query results, pending actions,
  clients, grants or quota mutations through an implicit fallback.
- A missing protected-resource route produces an actionable discovery issue,
  even when authorization-server discovery and the website succeed.
- A registration 429 shows the applicable quota and reset evidence; opening or
  refreshing the panel does not increment that quota.
- A cancelled native-app sign-in can retry with the same registration, and
  application-creation retries cannot create duplicate clients.
- Application creation rejects unsupported client types, unauthorized resources,
  invalid redirects and scope escalation; it produces a usable public-client
  configuration without exposing management credentials.
- A real development sign-in can be followed from registration through human
  consent and successful resource access; denial, callback failure, expiry and
  refresh rejection are distinguishable.
- Grant revocation is limited to the selected scope of impact and reports its
  verified provider/resource outcome accurately.
- Unauthorized users cannot call admin APIs or retrieve restricted identity
  details, even with guessed application IDs or diagnostic references.
- List/detail endpoints, exports and audit events pass secret-exclusion tests;
  missing or stale telemetry is visibly marked.
- Keyboard navigation, responsive layouts, readable errors and cancellable jobs
  work without requiring administrators to use the command line.
- A deployment-backed setting remains “pending deployment” until the running
  service reports the approved effective value and verification completes.

## Decisions required before implementation

Confirm the administrator capability model and privileged-action reauthentication
policy; event retention and permitted identity/network fields; expected
registration volume behind corporate egress; supported application ownership
groups; and whether operational changes create GitLab proposals or use an
already approved runtime configuration service. Keep these decisions explicit
rather than introducing new client types or mutable authentication policy by
accident.
