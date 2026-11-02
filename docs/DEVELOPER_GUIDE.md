# GHOST Developer Guide

This guide covers local setup, the day-to-day commands, how the code is laid
out, how to add API endpoints, how tests are organized, and how the GitLab
pipeline builds and deploys the app. For coding conventions aimed at AI coding
agents, see [`AGENTS.md`](../AGENTS.md). For release and changelog rules, see
[`VERSIONING.md`](../VERSIONING.md).

## 1. Toolchain

| Tool | Version | Where it is pinned |
| --- | --- | --- |
| Node.js | 26 LTS (26.13.0 in the container). Node 22.22.2+ still works locally during the transition. | `Dockerfile` (`NODE_VERSION`), `package.json` `engines.node` (`>=22.22.2 <27`), `.gitlab-ci.yml` (`code_quality_check` image) |
| npm | 11.x (11.18.0 in the container) | `package.json` `packageManager` and `engines.npm`, `Dockerfile` (`NPM_VERSION`) |
| Nuxt | 4 | `package.json` |
| Terraform | Provided by the GitLab `cicd` runner image | `.gitlab-ci.yml` |

Key libraries: Nuxt 4 / Nitro, Vue 3, Nuxt UI, Pinia 4 with
`pinia-plugin-persistedstate`, `nuxt-oidc-auth` (Entra ID), AWS SDK v3, zod 4
with `@asteasolutions/zod-to-openapi` 9, the MCP server SDK, ECharts and D3,
marked 18, mermaid 12, uuid 14 and dotenv 18.

## 2. Installing dependencies

The lockfile resolves packages through the internal Nexus mirror
(`https://nexus.engapps.gd-ms.us/repository/TOS-npm/`). On the GD-MS network:

```bash
npm config set registry https://nexus.engapps.gd-ms.us/repository/TOS-npm/
npm ci --legacy-peer-deps
```

`--legacy-peer-deps` is required because some Nuxt modules declare peer ranges
that npm's strict resolver rejects.

`npm ci` runs `postinstall` (`nuxt prepare`), which generates `.nuxt/`,
including the ESLint config that `eslint.config.mjs` extends.

**Off the internal network:** in a throwaway copy of the repo, rewrite the
Nexus prefix in `package-lock.json` to `https://registry.npmjs.org/` and install
from there. Never commit that rewrite; the committed lockfile must keep the
Nexus URLs so CI and the Docker build can install.

**Changing dependencies:** after editing `package.json`, regenerate
`package-lock.json` against Nexus (`npm install --legacy-peer-deps` with the
Nexus registry configured) and commit both files together. CI uses `npm ci`,
which fails if the two are out of sync.

## 3. Environment

Copy `.env.example` to `.env` and fill in values from another contributor. In
deployed environments the same variables come from AWS Secrets Manager and the
ECS task definition (`terraform/ecs.tf`, `terraform/secrets.tf`).

The groups that matter for local development:

- `AWS_COMMERCIAL_*` and `AWS_GOVCLOUD_*`: credentials, regions and
  Organizations management account for each partition.
- `AWS_ASSUME_ROLE_NAME`: the cross-account role GHOST assumes in member
  accounts (`GDMSOrganizationsRole`).
- `NUXT_OIDC_*`: Entra ID application settings for sign-in.
- Table names (`AWS_ACCOUNTS_TABLE_NAME`, `*_TABLE`, `*_TABLE_NAME`): most have
  environment-specific defaults in code and only need overriding to point at a
  non-default table.
- `ADMIN_BYPASS=true` grants every signed-in user admin rights. It is ignored
  when `NODE_ENV` is `prod`/`production`. Use it only on a personal machine.

## 4. Daily commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Generates the Swagger route registry and starts Nuxt on `http://localhost:3000` (12 GB heap). |
| `npm run check:lint` / `check:lint:fix` | ESLint over the repo using the Nuxt flat config. |
| `npm run check:types` | `nuxi typecheck` (vue-tsc). There are known pre-existing errors; do not add new ones. |
| `npm run check:unused` / `check:deps` | ts-prune and depcheck reports. |
| `npm run validate` / `validate:fix` | Repository conventions checker (`scripts/validate-codebase.ts`). |
| `npm run swagger:prepare` | Copies Swagger UI assets and regenerates `server/generated/swagger-routes.ts`. Runs automatically before `dev` and `build`. |
| `npm run bundle:support` | Bundles `app/content/support/**` into the server support-article index. Runs before `build`. |
| `npm run changelog:generate X.Y.Z` | Drafts a changelog entry from commits (see `VERSIONING.md`). |
| `npm run mcp:secrets` | Generates the MCP OAuth signing secrets. |
| `npm run seed:email-templates` | Seeds the email templates table. |

Do not run `npm run build` or `docker build` as a routine check; they are slow
and CI already does both. Use tests, lint and targeted type checks instead.

## 5. Code layout

```
app/                 Nuxt frontend (pages, components, composables, stores, utils, plugins)
  content/support/   Markdown support articles shown in the in-app help center
  config/            roles.yaml, badges.yaml
server/
  api/               Nitro file-based API routes (route.method.ts)
    v1/              Supported, API-key-authenticated integration contract
  routes/            Non-/api routes: the hosted MCP endpoint and OAuth flows
  middleware/        Request timing and Entra / API-key authentication
  plugins/           Nitro plugins: Swagger, scheduler, OAuth background loops, export worker
  mcp/               MCP server, tools and OAuth implementation
  lib/               AWS client factory, config, DynamoDB config, shortlinks
  utils/             Server utilities (auto-imported); unit tests live in utils/__tests__/
  generated/         Generated, committed files such as swagger-routes.ts (regenerate, do not hand-edit)
shared/              Types and utilities shared by the app and the server (#shared/*)
scripts/             Operational and build scripts (TypeScript run with tsx, plus a few Python)
tests/               node:test suites, grouped by area
terraform/           ECS, ALB, DynamoDB, ECR, IAM, monitoring and related infrastructure
docs/                Internal design and operations documentation
FEATURES/            Feature design documents (OAuth administration, achievements)
```

## 6. Authentication and authorization

`server/middleware/entra-auth.ts` runs on every request:

- Browser routes and internal `/api/*` routes require an Entra ID session from
  `nuxt-oidc-auth`. Roles come from Entra group membership
  (`server/utils/user-roles.ts`, `app/config/roles.yaml`).
- `/api/v1/*` accepts API keys only, in the `x-api-key` header, and returns
  the v1 error envelope (`server/utils/v1-errors.ts`).
- `/mcp` is authenticated by the MCP OAuth token verifier in
  `server/mcp/oauth/`.

The middleware also requires the Administrator role for every `/api/admin/*`
route, except a short allowlist in the same file. Any other permission check,
such as role- or account-scoped access, belongs in the route handler.

## 7. Adding an API endpoint

1. Search for an existing endpoint or utility first (`server/api`,
   `server/utils`, and Swagger UI at `/api/swagger-ui`).
2. Create `server/api/<path>.<method>.ts` and wrap the handler with
   `handleAsync`; return `sendSuccess` / `sendPaginated` and use `errors.*`
   from `server/utils/api-response.ts`.
3. Register OpenAPI documentation with `registerEndpoint` from
   `server/plugins/swagger.ts`. The generator only includes route files that
   call `registerEndpoint` (or `defineV1Alias`), and a test enforces a minimum
   number of documented routes.
4. Validate query and body input (zod 4 or the helpers in
   `server/utils/api-response.ts`), and clamp numeric parameters.
5. Get AWS clients from `server/lib/aws-client-factory.ts`
   (`getClient`, `getDynamoDBClient`, `getOrganizationsClient`, …) so
   credentials, cross-account role assumption and caching are handled once.
6. Add or extend a test under `tests/<area>/`.

```ts
// server/api/example/summary.get.ts
import { defineEventHandler, getQuery } from 'h3'
import { sendSuccess, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'

registerEndpoint('/api/example/summary', 'GET', {
  summary: 'Example summary',
  tags: ['Example'],
  parameters: [{ $ref: '#/components/parameters/Environment' }],
  responses: { 200: { description: 'Summary' } }
})

export default defineEventHandler(handleAsync(async (event) => {
  const { environment = 'govcloud' } = getQuery(event)
  return sendSuccess(event, { environment })
}))
```

Swagger UI: `http://localhost:3000/api/swagger-ui`. OpenAPI JSON:
`/api/swagger.json`. Internal-route reference for signed-in users: `/api/swagger-internal-ui`.

## 8. Tests

Tests use the built-in `node:test` runner through `tsx`. Run a whole area with
`npx tsx --test tests/<area>/*.test.ts`, or use the named scripts:

| Area | Script |
| --- | --- |
| `tests/api` | `npm run test:api` |
| `tests/costs` | `npm run test:costs` |
| `tests/mcp` | `npm run test:mcp` |
| `tests/kirocrew` | `npm run test:kirocrew` |
| `tests/notifications` | `npm run test:notifications` |
| `tests/scheduled-reports` | `npm run test:scheduled-reports` |
| `tests/shared-investigations` | `npm run test:shared-investigations` (contract check: `npm run contract:shared-investigations:check`) |
| `tests/shared-content` | `npm run test:shared-content` |
| `tests/ai-usage` | `npm run test:ai-usage` |
| `tests/vmaas` | `npm run test:vmaas` |
| `tests/aws`, `tests/dataset-reports`, `tests/observability`, `server/utils/__tests__` | `npm run test:aws`, `test:dataset-reports`, `test:observability`, `test:server-utils` |
| Everything above | `npm test` |

`tests/scripts/test_cleanup_ecr_images.py` covers the Python ECR cleanup script
and runs with `python3 -m unittest`.

Tests must not call AWS. Inject clients or stub the factory as the existing
suites do.

## 9. CI/CD (GitLab)

The pipeline is defined in `.gitlab-ci.yml`. Pushes create branch pipelines;
merge-request pipelines are disabled so the same build does not run twice.

| Branch | `ENV` | Jobs |
| --- | --- | --- |
| feature branches | `test` | `test_docker_build` (full image build) and `code_quality_check` (`npm ci`, `npm test`, non-blocking `nuxi typecheck`) |
| `dev` | `dev` | `get_ecr_credentials` → `build` (push `dev` and `dev-<sha>` tags) → `Refresh Service` (ECS rolling deploy, waits for stability). Manual: `plan` → `apply`, `seed_kirocrew_config`, `diagnose_kirocrew`. |
| `master` | `prod` | Same as dev, but `build`, `Refresh Service`, `plan` and `apply` are manual. |

Notes:

- The `code_quality_check` image tracks the Dockerfile's `NODE_VERSION`. Bump
  both together.
- CI installs through Nexus using the runner's CA bundle
  (`CI_SERVER_TLS_CA_FILE`) and `replace-registry-host npmjs`, so lockfile
  entries that still point at `registry.npmjs.org` are redirected to Nexus.
- Images are tagged `$ENV` (what ECS pulls) and `$ENV-<short sha>` (immutable,
  for rollback). The ECR lifecycle policy in `terraform/ecr.tf` expires old
  per-commit tags.
- Terraform state is per environment (`terraform/conf/<env>.conf`).

## 10. Container image

`Dockerfile` is a two-stage build. The build stage installs dependencies from
Nexus, runs `nuxt prepare`, and builds the Nitro server with an 8 GB heap. The
runtime stage is `node:<version>-bookworm-slim` with npm, npx, corepack and yarn
removed, runs as the `node` user, and starts `.output/server/index.mjs` on port
3000. `.dockerignore` keeps `.env*`, `ecr-credentials` and local tooling out of
the build context.

## 11. Releases

Bump `package.json` `version` and add a `CHANGELOG.md` section as described in
`VERSIONING.md`. The version is shown in the footer and on the changelog page.
