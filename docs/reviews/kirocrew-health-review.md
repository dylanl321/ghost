# Kiro Crew admin health and validation

The Kiro Crew admin page at `/admin/kirocrew` now opens on **Health and status**.
**Publish configuration** keeps the existing revision editor separate. Switching
to health or refreshing observations does not reload or overwrite editor drafts.

`GET /api/admin/kirocrew/health` requires the existing server-side administrator
authorization and sends `Cache-Control: no-store`. The configuration read and
publish routes now explicitly enforce the same authorization. The health
endpoint is registered in the internal Swagger catalog.

## What the view checks

| Check | Evidence |
| --- | --- |
| Configuration storage | Reads the current revision using the configured repository. In-memory development storage is identified as unverified persistence. |
| Published profile | Validates the current bootstrap, record safety, and collaboration definitions; returns only revision/time metadata and counts. |
| Installer payload | Reads the published revision's stored metadata and compares its size, checksum metadata, revision, and size ceiling. This does not download or hash the payload contents. |
| Collaboration runtime | Inspects the runtime actually registered in this process. Routes existing in the source tree or an enabled profile alone do not establish a connected runtime. |
| Cleanup/deletion workers | Reports unverified until durable execution telemetry is connected. Terraform resources alone are not proof of worker execution. |
| Pilot acceptance | Reports unverified until acceptance evidence is connected. The health endpoint cannot enable collaboration. |

Configuration and collaboration have separate status summaries. A working
configuration service can coexist with disabled or incomplete collaboration.
An installed runtime is still reported as unverified: this read-only endpoint
does not exercise end-to-end authorization, mutation, artifact, or workstation
flows. Missing observations are not presented as success.

The response contains no profile values, group identifiers, source fingerprints,
record bodies, tokens, secret/storage URIs, or raw exceptions. Individual checks
use fixed explanations. Failed refreshes retain the last observation with an
explicit stale warning and timestamp; authentication/authorization failures clear
the previous result and cached configuration/drafts. Initial loading never
displays invented health.

Health observations have a five-second response deadline. Concurrent requests
share the active probe, including after a timeout, so repeatedly clicking refresh
does not create an unbounded number of outstanding provider calls.

## Validation scope

The review covers the current collaboration modules/routes and their tests,
the existing configuration service, new admin health/service/authorization tests,
Vue component rendering, contract fixture identity, and the dedicated Terraform
module's mock-provider tests. Component tests compile the individual Vue file;
they do not build the Nuxt application.

Tests cover invalid/absent profiles, disabled and enabled profiles, runtime
absence, memory storage, payload mismatch/missing/oversize/read failures, safe
projections, timeout/coalescing/recovery, server-side admin denial before storage
access, accessible health labels, loading, and stale/denied UI states.

The source review found an ambiguous collaboration barrel export for
`SourceType`/`SubjectReference`; the public readonly contract is now explicitly
selected. Validation also corrected import/lint issues, checked array indexing,
Node stream adaptation, an unused feed assignment, and attachment filename
control-character handling. Request bodies are now bounded while reading;
interrupted uploads cannot be mistaken for empty successful uploads. Production collaboration
wiring, durable worker telemetry, and pilot evidence remain incomplete and are
surfaced in the UI.

No deployed GHOST server was listening at the local Swagger address during this
review. Live AWS, Graph, and two-workstation acceptance are not established by
local tests. Application/image builds and deployment remain CI-owned.

### Local verification results

- All 276 tests in the Kiro Crew, Shared Investigations, and Swagger suites
  passed. Transport tests exercise declared/chunked byte limits, aborted uploads, and
  loading every actual Nitro route with a disconnected runtime.
- Five Terraform tests passed against the mocked AWS provider; Terraform format
  checks passed.
- Targeted TypeScript checks passed for the collaboration modules and health
  service. ESLint passed for the reviewed collaboration/admin code and tests.
- Canonical/vendored collaboration fixtures are byte-identical.
- A temporary Chromium/Vite development harness exercised the real admin page
  with synthetic HTTP responses and basic host-component substitutes: health
  loads first, configuration is loaded only when selected, drafts survive normal
  refreshes, transport failures are marked stale, server error bodies stay hidden,
  denial clears cached observations/drafts, and recovery reloads current data.
  No browser page errors were observed. This is not a deployed Nuxt/OIDC session
  test.
- The Nuxt Vue type-check imports the broader application's component/type
  graph and still reports existing errors in account/cost components and other
  utilities. It reported no errors in the new health panel or Kiro Crew page.
  Applicable navigation, collaboration key indexing and download stream typing
  errors found by that check were corrected. A clean full-application type gate
  is not claimed.
