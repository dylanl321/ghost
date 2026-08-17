# MCP Tools and Protocol Surface Review

Reviewed: 2026-08-17

## Implementation Decisions

- The Phase 1-3 recommendations were validated against the live repository and selected for implementation.
- MCP SDK 2.0 does not support callable-but-hidden tools, so the six compatibility aliases are removed instead of hidden. `ghost.reports.run` is also removed rather than exposing synchronous long-running execution.
- Cost Explorer already intercepts some empty `GetCostAndUsage` ranges; shared normalization remains necessary for forecast, resource, tag, and dashboard paths.
- Resource registration must enforce OAuth scopes in addition to tool registration. Account resources require read scope, while user and export resources require collaboration scope.
- Evidence lookback applies to time-bounded sources. Config, Inspector, patch, and ownership evidence are labeled as snapshots with observed timestamps.

## Executive Summary

The GHOST MCP server registers 69 tools, 5 resources, and 5 prompts. The public capability page advertises 30 of the tools, but MCP clients discover all tools allowed by their granted scopes. The overall architecture is sound: tools are grouped by OAuth scope, destructive personal operations require confirmation, credential issuance verifies the effective Identity Center assignment, and account-scoped operational tools generally fail closed.

No confirmed P0 issue was found. Eight P1 findings should be addressed before expanding the catalog. The most important are incomplete effective-access results, incorrect GovCloud cost account filtering, broad raw-error argument capture, and bounded Entra searches that apply the requested user filter too late.

The catalog should not grow until canonical contracts are hardened and legacy aliases are removed from normal discovery. Most tools can stay as-is or receive narrow enhancements; six compatibility tools should be deprecated and two overlapping tools should be consolidated into canonical contracts.

### Verdicts

- **Keep**: The contract and implementation are appropriate for the current boundary.
- **Enhance**: Keep the capability, but correct or harden its current contract.
- **Consolidate**: Merge overlapping canonical behavior before deprecating one name.
- **Deprecate**: Preserve temporarily for compatibility, but remove from normal discovery.

### Severity

- **P0**: credential disclosure or unauthorized access requiring immediate response
- **P1**: incorrect account/environment results, sensitive data retention, or unreliable write safety
- **P2**: contract, reliability, observability, or usability defects
- **P3**: cleanup with limited behavioral impact

## Priority Findings

### P1 - Effective user-access tools omit group-derived assignments

`ghost.access.mine` and `ghost.access.for_user` claim to return effective Identity Center access, but `getMcpIdentityCenterUserAccess` calls `listUserAssignments`, which queries only `PrincipalType: 'USER'`. Group memberships are expanded only by the separate explain path. Users whose access is entirely group-derived can therefore receive an incomplete or empty account list.

Evidence: `server/mcp/idc-admin-access.ts:99-123`, `server/mcp/idc-admin-access.ts:167-190`, and `server/mcp/tools/catalog.ts:242-253`.

Recommendation: build one effective-access aggregator that combines direct and group assignments, deduplicates account/permission-set pairs, records assignment sources, and powers `mine`, `for_user`, and `explain`.

### P1 - GovCloud cost filters use Commercial linked-account IDs

All cost tools call `commercialIds`, which always resolves the requested accounts in the Commercial environment. Billable GovCloud Cost Explorer calls then receive Commercial IDs in their `LINKED_ACCOUNT` filters. Forecast tools also pass the Commercial management account as the target even when `environment` is `govcloud`.

Evidence: `server/mcp/tools/catalog.ts:115-119`, `server/mcp/tools/catalog.ts:289-302`, and `server/mcp/tools/catalog.ts:421-443`.

Recommendation: replace `commercialIds` with an environment-aware cost scope result containing both metadata IDs and the IDs valid for the selected billing partition. Select the payer/management account by environment and reject proforma mode outside Commercial consistently.

### P1 - Cost modes and date boundaries are inconsistent

`ghost.costs.budget_vs_actual` does not reject `mode: proforma` with `environment: govcloud`, unlike query and dashboard. Forecast, resource, and tag tools bypass the shared date validator. The dashboard constructs same-day start/end ranges on the first day of a month and same-date completed-year ranges on January 1, which AWS Cost Explorer rejects.

Evidence: `server/mcp/tools/catalog.ts:307-360`, `server/mcp/tools/catalog.ts:421-468`, and `server/utils/date-helpers.ts:100-128`.

Recommendation: use one cost request normalizer for environment, mode, account scope, target account, exclusive-end dates, maximum range, and empty-period handling.

### P1 - Raw error diagnostics retain complete tool arguments

The recent principal minimization correctly removes directory groups and profile data, but every failed handler still sends `{ args, error/result }` to raw-error storage. This can retain credential session IDs, AI prompts and context, chat messages, supplied policies, report configurations, user searches, and account identifiers for 30 days.

Evidence: `server/mcp/tools/register.ts:40-68` and `server/mcp/audit.ts:79-92`, `server/mcp/audit.ts:184-205`.

Recommendation: introduce a default-deny diagnostic serializer. Store parameter names and safe structural metadata by default; allow explicit per-tool safe fields. Always redact credential session IDs, generated credentials, authorization material, free-form content, policies, and report payloads.

### P1 - Entra user search bounds results before applying the search

`ghost.users.search` requests a preview limited to the caller's requested result count. `queryEntraUsers` stops collecting group members at that count, then applies `userSearch`. A matching user outside the first sampled members is reported as absent even though more data exists.

Evidence: `server/mcp/tools/catalog.ts:515-522` and `server/utils/entra-users-data.ts:63-138`.

Recommendation: apply user matching while scanning members and stop only after enough matching records have been collected. Return an explicit partial-search warning when Graph page limits prevent an exhaustive result.

### P1 - OAuth consent grants every GHOST scope

The consent handler adds all `GHOST_MCP_SCOPES` to every grant after processing the provider-computed missing scopes. A client asking only for read access receives AI, collaboration, and credential scopes as well. This weakens least privilege and can make the consent details differ from the resulting grant.

Evidence: `server/routes/oauth/consent/[uid].post.ts:131-155`.

Recommendation: grant only requested resource scopes that are supported and displayed during consent. Keep the current product boundary, but allow clients to request a strict subset. Add a regression test for a read-only grant.

### P1 - Evidence lookback is recorded but not applied

`ghost.evidence.create` accepts `lookback_days`, but `createEvidenceBundle` calls `buildAccountHealth` without it and merely copies the requested number into the output. Account health uses fixed 30-day pipeline windows and fixed source-specific security windows. The resulting artifact can claim a lookback it did not use.

Evidence: `server/mcp/tools/catalog.ts:1131-1140`, `server/mcp/evidence.ts:49-52`, and `server/mcp/account-health.ts:13-26`.

Recommendation: thread an evidence query window into every applicable health-domain collector and record the effective window separately for each domain. Do not present one requested lookback as universally applied.

### P1 - Idempotency is not atomic

`runIdempotent` performs an unconditional read, executes the side effect, then writes the cached result. Concurrent requests with the same key can both execute. A chat-thread create can also persist the thread and fail while adding the initial message, causing a retry to create another thread.

Evidence: `server/mcp/idempotency.ts:13-31` and `server/mcp/tools/catalog.ts:1206-1217`.

Recommendation: reserve idempotency keys with a conditional DynamoDB write before executing, track pending/completed/failed states, and make multi-step creates compensating or transactional.

## P2 Findings

1. `ghost.accounts.search` and `ghost.accounts.list` accept `cursor` but ignore it; list results also lack a deterministic explicit sort. See `server/mcp/tools/catalog.ts:190-234`.
2. `ghost.alerts.list` accepts account, month, and type together but applies only the first filter by hard-coded precedence. Reject conflicting selectors or support intersection semantics. See `server/mcp/tools/catalog.ts:505-511`.
3. `ghost.compliance.summary.detail_level` is echoed but does not alter data collection or response shape. See `server/mcp/tools/catalog.ts:836-858`.
4. `ghost.resources.search` advertises tag filters, but its schema exposes no tag input. See `server/mcp/tools/catalog.ts:715-746`.
5. `ghost.instances.search` and chat-thread search filter a bounded sample after retrieval, so matching records beyond the sample can be missed. See `server/mcp/tools/catalog.ts:755-796` and `server/utils/chat-threads.ts:214-292`.
6. Utilization, security-summary, and patch tools use inconsistent raw `account_id` contracts instead of the shared account/environment resolver. Friendly names or the paired partition ID can resolve incorrectly. See `server/mcp/tools/catalog.ts:813-832` and `server/mcp/tools/catalog.ts:935-938`.
7. `ghost.ai.troubleshoot` says it uses GHOST diagnostic capabilities, but it sends only caller text to Bedrock and collects no diagnostics. Either ground it with direct tool data or describe it as a generic planning tool. See `server/mcp/tools/catalog.ts:1064-1071`.
8. Special AI/export rate limits depend on the optional `mcp-name` HTTP header and all buckets are process-local. Clients omitting the header bypass special limits, and ECS replicas enforce independent totals. See `server/routes/mcp.post.ts:48-55` and `server/mcp/rate-limit.ts:1-24`.
9. Only cost tools define fallback audit sources, and only a subset of account-aware tools provide audit target IDs. Non-cost failures frequently appear with source `unknown`, and team attribution is incomplete.
10. MCP resources are not passed through tool auditing. `ghost://users/me` also returns the entire principal, including directory groups, plus unrestricted preferences. See `server/mcp/server.ts:46-80`.
11. The public capability contract checks only that its 30 entries are registered. It does not classify the other 39 discoverable tools or detect unplanned catalog growth. See `shared/mcp/end-user-capabilities.ts:15-17` and `tests/mcp/catalog-contract.test.ts`.
12. Several write-like tools are not safely retryable: evidence creation has no idempotency key, report execution can be long-running, and the idempotency cache stores full returned content unencrypted for 24 hours.

## Tool Assessment

Visibility values are **Advertised**, **Discoverable** (registered but omitted from the public capability page), and **Legacy**.

### Accounts, Access, and Organization

| Tool | Scope | Visibility | Verdict | Required action |
|---|---|---|---|---|
| `ghost.accounts.search` | read | Advertised | Enhance | Implement real cursor pagination and deterministic ranking metadata. |
| `ghost.accounts.get` | read | Discoverable | Keep | Retain shared exact/fuzzy account resolution and decommissioned guard. |
| `ghost.accounts.list` | read | Discoverable | Enhance | Honor cursor, sort deterministically, and return `nextCursor`. |
| `ghost.accounts.statistics` | read | Discoverable | Keep | Retain aggregate catalog statistics. |
| `ghost.accounts.personal_context` | collaborate | Advertised | Keep | Retain owner-scoped favorite/recent resolution. |
| `ghost.access.mine` | read | Advertised | Enhance | Include group-derived effective assignments. |
| `ghost.access.for_account` | read | Discoverable | Enhance | Add continuation support and per-environment truncation metadata. |
| `ghost.access.for_user` | read | Discoverable | Enhance | Use the same direct-plus-group effective-access aggregator. |
| `ghost.access.explain` | read | Advertised | Enhance | Reuse the aggregator and return only AWS-relevant directory groups when comparison is requested. |
| `ghost.users.search` | read | Discoverable | Enhance | Apply the requested user filter while scanning rather than after the preview limit. |
| `ghost.organization.overview` | read | Discoverable | Keep | Retain partition-aware Organizations lookup. |
| `ghost.organization.structure` | read | Advertised | Keep | Retain cached OU hierarchy response. |
| `ghost.organization.governance` | read | Discoverable | Keep | Retain resolved partition ID and explicit missing-environment error. |

### Costs and Alerts

| Tool | Scope | Visibility | Verdict | Required action |
|---|---|---|---|---|
| `ghost.costs.query` | read | Advertised | Enhance | Use environment-aware linked-account IDs and shared cost normalization. |
| `ghost.costs.dashboard` | read | Advertised | Enhance | Fix partition IDs and empty first-day ranges; preserve projection uncertainty. |
| `ghost.costs.forecast` | read | Discoverable | Consolidate | Make this the canonical forecast contract after date and payer fixes. |
| `ghost.costs.resources` | read | Discoverable | Enhance | Resolve the operational linked-account ID and payer for the requested partition. |
| `ghost.costs.tags` | read | Discoverable | Enhance | Apply shared date validation and bounded/paginated tag results. |
| `ghost.costs.budget_vs_actual` | read | Advertised | Enhance | Enforce proforma/Commercial rules and map GovCloud actuals back to Commercial budget metadata. |
| `ghost.forecasts.get` | read | Discoverable | Deprecate | Alias to `ghost.costs.forecast`, emit deprecation metadata, then remove. |
| `ghost.alerts.list` | read | Advertised | Enhance | Define intersection semantics or enforce exactly one selector. |

### Documentation and Output

| Tool | Scope | Visibility | Verdict | Required action |
|---|---|---|---|---|
| `ghost.docs.search` | read | Advertised | Keep | Retain as the canonical documentation-first lookup. |
| `ghost.docs.answer` | read | Advertised | Keep | Retain cited, bounded knowledge-base answers. |
| `ghost.catalog.golden_amis` | read | Advertised | Keep | Retain documented/live-catalog reconciliation. |
| `ghost.support.search` | read | Legacy | Deprecate | Keep temporary alias behavior but remove from normal discovery. |
| `ghost.outputs.render` | read | Discoverable | Keep | Retain bounded JSON/Markdown/CSV/text rendering. |

### Inventory, Security, Audit, and Pipelines

| Tool | Scope | Visibility | Verdict | Required action |
|---|---|---|---|---|
| `ghost.resources.search` | read | Advertised | Enhance | Add the promised tag/compliance inputs or narrow the description. |
| `ghost.instances.search` | read | Advertised | Enhance | Push state filtering into the query or scan until the match limit is satisfied. |
| `ghost.instances.get` | read | Legacy | Deprecate | Remove from discovery after clients migrate to `instances.search`. |
| `ghost.instances.utilization` | read | Advertised | Enhance | Resolve friendly account references and validate classifications. |
| `ghost.security.summary` | read | Advertised | Enhance | Pass the resolved operational ID rather than the caller's raw identifier. |
| `ghost.security.findings` | read | Discoverable | Keep | Retain bounded preview semantics; add audit targets and result cursors if supported. |
| `ghost.compliance.summary` | read | Advertised | Enhance | Implement meaningful summary/detailed shapes or remove `detail_level`. |
| `ghost.support.patch_compliance` | read | Advertised | Enhance | Resolve the correct partition account ID and validate instance/region formats. |
| `ghost.security.remediation_plan` | read | Advertised | Keep | Retain read-only grouping; replace date-sensitive deployment-state tests. |
| `ghost.account.health` | read | Discoverable | Enhance | Make pipeline IDs partition-independent and expose each domain's actual window. |
| `ghost.s3.analyze_policy` | read | Discoverable | Keep | Retain local policy analysis; add an input-size bound during hardening. |
| `ghost.audit.search` | read | Advertised | Keep | Retain account-required, fail-closed cursor search. |
| `ghost.audit.cloudtrail` | read | Legacy | Deprecate | Remove from discovery after migration to `audit.search`. |
| `ghost.pipelines.search` | read | Advertised | Keep | Retain canonical overview/account/resource modes. |
| `ghost.pipelines.overview` | read | Discoverable | Consolidate | Route through `pipelines.search` overview mode. |
| `ghost.pipelines.get_run` | read | Discoverable | Keep | Return `PIPELINE_NOT_FOUND` when the pipeline record is null. |
| `ghost.pipelines.for_account` | read | Legacy | Deprecate | Replace with `pipelines.search` account mode. |
| `ghost.pipelines.search_resources` | read | Legacy | Deprecate | Replace with `pipelines.search` query mode. |

### AI and Credentials

| Tool | Scope | Visibility | Verdict | Required action |
|---|---|---|---|---|
| `ghost.ai.usage` | read | Advertised | Enhance | Replace free-form period input with the supported period enum. |
| `ghost.ai.insight` | ai | Advertised | Enhance | Bound serialized context size and exclude free-form context from raw diagnostics. |
| `ghost.ai.troubleshoot` | ai | Advertised | Enhance | Ground with selected GHOST evidence or narrow the stated capability. |
| `ghost.ai.chat` | ai | Discoverable | Keep | Retain as fallback agent access with recursion/configuration safeguards documented. |
| `ghost.credentials.start` | credentials | Advertised | Keep | Retain encrypted, subject-bound device sessions. |
| `ghost.credentials.issue` | credentials | Advertised | Enhance | Preserve assignment verification and confirmation; exclude `session_id` from diagnostics. |

### Personal Workspace

| Tool | Scope | Visibility | Verdict | Required action |
|---|---|---|---|---|
| `ghost.preferences.get` | collaborate | Discoverable | Keep | Retain owner-scoped preferences. |
| `ghost.preferences.update` | collaborate | Discoverable | Enhance | Validate IANA timezone, preference keys, list sizes, and payload size. |
| `ghost.notifications.list` | collaborate | Advertised | Keep | Retain owner-scoped cursor pagination. |
| `ghost.evidence.create` | collaborate | Advertised | Enhance | Apply effective windows and add atomic idempotency. |
| `ghost.evidence.list` | collaborate | Discoverable | Keep | Retain owner-scoped bounded listing. |
| `ghost.evidence.get` | collaborate | Discoverable | Keep | Retain ownership check and optional content. |
| `ghost.evidence.download` | collaborate | Discoverable | Keep | Retain owner check and five-minute URL. |
| `ghost.evidence.delete` | collaborate | Discoverable | Keep | Retain owner check and signed confirmation state. |
| `ghost.chat_threads.list` | collaborate | Advertised | Enhance | Add cursor input and exhaustive search semantics. |
| `ghost.chat_threads.get` | collaborate | Discoverable | Keep | Retain ownership validation. |
| `ghost.chat_threads.create` | collaborate | Discoverable | Enhance | Make idempotency atomic and initial-message creation recoverable. |
| `ghost.chat_threads.update` | collaborate | Discoverable | Keep | Retain owner-scoped metadata updates. |
| `ghost.chat_threads.add_message` | collaborate | Discoverable | Enhance | Use atomic idempotency and return bounded message content. |
| `ghost.chat_threads.delete` | collaborate | Discoverable | Keep | Retain owner check and signed confirmation state. |
| `ghost.reports.list` | collaborate | Advertised | Enhance | Add export pagination/status filtering instead of slicing a fixed backend page. |
| `ghost.reports.start_export` | collaborate | Discoverable | Enhance | Use atomic idempotency and safe diagnostic summaries. |
| `ghost.reports.export_status` | collaborate | Discoverable | Keep | Retain ownership validation. |
| `ghost.reports.download_url` | collaborate | Discoverable | Keep | Retain ownership/completion checks and five-minute URL. |
| `ghost.reports.run` | collaborate | Discoverable | Enhance | Prefer queued execution and atomic idempotency for long-running reports. |

## Resources and Prompts

| Capability | Verdict | Required action |
|---|---|---|
| `ghost://catalog` | Enhance | Generate domains and boundaries from registered canonical metadata. |
| `ghost://context/environment` | Keep | Retain public cache scope and GovCloud-first terminology. |
| `ghost://users/me` | Enhance | Return a minimal profile and validated preferences; omit raw directory groups and internal timestamps. |
| `ghost://accounts/{identifier}` | Keep | Retain shared account resolution; add resource-read audit coverage. |
| `ghost://exports/{jobId}` | Keep | Retain owner validation; use a stable not-found error contract. |
| `investigate-account` | Keep | Retain after referenced tool contracts are hardened. |
| `analyze-cost-variance` | Enhance | Route to a canonical comparison capability once added. |
| `review-security-posture` | Enhance | Avoid promising policy exposure unless governance/policy evidence is queried. |
| `audit-user-access` | Enhance | Depend on the corrected effective-access aggregator. |
| `triage-pipeline-failure` | Keep | Retain confirmed-vs-hypothesis guidance. |

## Missing Capabilities

These additions fit the existing boundary and should be considered only after consolidation.

1. **Cost comparison and variance**: add `ghost.costs.compare` for two validated periods with reconciled totals and service/account deltas. The existing prompt asks for this workflow but currently requires multiple loosely coordinated calls.
2. **Cost anomalies**: add a bounded `ghost.costs.anomalies` backed by the existing support anomaly logic, with explicit observed window and confidence metadata.
3. **Notification lifecycle**: add one owner-scoped action tool for mark-read, archive, and mute operations with idempotency. Do not create separate tools per action.
4. **Export cancellation**: add an owner-scoped cancel action for queued/running dataset exports using the existing cancellation utility and confirmation only when useful.
5. **Pipeline health/drift mode**: enhance `ghost.pipelines.search` with explicit health/drift modes backed by existing account pipeline APIs rather than adding more top-level pipeline tools.
6. **Instance health**: add a bounded read-only health mode to `ghost.instances.search` or a single `ghost.instances.health` tool backed by the existing support endpoint; avoid exposing operational mutations.

Scheduled-report CRUD, chat sharing, account notes, administrative reads, and AWS resource mutations remain out of scope until there is a demonstrated MCP workflow and a separate authorization design.

## Remediation Roadmap

### Phase 1 - Correctness and Data Minimization

1. Fix effective Identity Center assignment aggregation.
2. Introduce environment-aware cost scope and shared cost validation.
3. Replace raw argument capture with per-tool safe diagnostic summaries.
4. Fix filtered search collection for Entra users and instance/chat searches.
5. Restrict OAuth grants to requested supported scopes.
6. Apply effective evidence windows and atomic idempotency.

### Phase 2 - Contract and Operational Hardening

1. Implement or remove ignored cursor/detail parameters.
2. Standardize account/environment resolution for utilization, security, patching, and costs.
3. Add stable error codes, source attribution, target attribution, and resource-read auditing.
4. Move special rate limits to shared storage and derive the method/tool from the parsed MCP envelope.
5. Add handler-level contract tests with mocked backends for every canonical domain.

### Phase 3 - Catalog Consolidation

1. Make canonical tool metadata the source for registration and the public catalog.
2. Hide the six aliases/duplicates from discovery while preserving compatibility for one release cycle.
3. Publish deprecation metadata and usage telemetry, then remove aliases after two releases with no material calls.

### Phase 4 - Focused Additions

Implement cost comparison, anomalies, notification lifecycle, export cancellation, pipeline health/drift, and instance health in that order. Each addition must reuse an existing backend, include owner/account authorization, expose bounded results, and ship with handler-level tests.

## Validation and Coverage

The current MCP suite emphasizes utility behavior, OAuth flow, registration, and catalog presence. It does not execute most registered handlers or verify backend argument mapping. The catalog contract is one-way: advertised tools must exist, but unexpected discoverable tools are allowed.

Required future coverage:

- Parameterized registration test proving all 69 tools have intentional scope, visibility, annotations, source, and verdict.
- Mocked handler tests for Commercial/GovCloud account mapping and proforma/billable combinations.
- Direct-plus-group Identity Center access tests.
- Filter-before-limit tests for Entra, instances, and chat threads.
- Sensitive-field redaction tests for every raw diagnostic class.
- Atomic idempotency concurrency tests.
- First-day-of-month and January 1 cost-dashboard tests.
- Resource ownership and minimal-profile tests.
- Requested-scope OAuth consent tests.

The baseline `npm run test:mcp` run on 2026-08-17 passed 56 of 57 tests. The only failure was the date-sensitive remediation fixture expecting `currently_deployed` while current logic classified the undated finding as `stale_superseded`; it is unrelated to the recent account-resolution and audit hardening changes but should be made deterministic.

Additional verification results:

- The report inventory check accounted for all 69 registered tools exactly once.
- `git diff --check` passed.
- Broad MCP lint found two existing `consistent-type-imports` errors in `server/mcp/idc-admin-access.ts` for `IdentitystoreClient` and `SSOAdminClient`; no auto-fix was run during the review.
- `npm run check:types` could not start because the installed dependencies are missing the optional `@rolldown/binding-linux-x64-gnu`/WASI native binding. Dependencies were not reinstalled or modified during the review.

## Review Boundaries

- Preserve organization-wide reads for this release.
- Preserve user-owned collaboration writes and explicitly confirmed, assigned-role credentials.
- Do not add administrative capabilities or AWS infrastructure mutations.
- Validate through code tracing and tests; no live AWS, Graph, or GHOST service calls were made.
- No runtime API or tool contract was changed by this review.
