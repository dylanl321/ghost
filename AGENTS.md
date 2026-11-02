# AGENTS.md

This file provides guidance to AI coding agents working with code in this repository. The human-oriented
setup and workflow guide is [`docs/DEVELOPER_GUIDE.md`](docs/DEVELOPER_GUIDE.md).

When the user invokes AI-DLC, read and follow
`.aidlc/aidlc-rules/aws-aidlc-rules/core-workflow.md` to start the workflow. `.aidlc/` is
local tooling and is git-ignored, so it exists only on machines where it has been installed.

## Project Overview
GHOST is a web dashboard providing centralized access to AWS account data and functionality. It's built with Nuxt 4, uses Entra ID for authentication, and integrates with multiple AWS services.

## CRITICAL: Before Writing Any Code
1. **ALWAYS search for existing implementations first** - Most common functionality already exists
2. **Reuse existing utilities and components** - Don't recreate what's already built
3. **Add simple comments for complex logic** - Explain the "why" not the "what"
4. **Check the Swagger UI** (`/api/swagger-ui`) to understand existing API endpoints

## CRITICAL: Never Build This App Locally
- **NEVER run any local application build on this machine.** Builds are too slow and interrupt development.
- Do not run `npm run build`, `npm run generate`, `npm run preview`, `nuxt build`, `nuxi build`, or any local `docker build` for this repository.
- Do not use a production build as a verification step. Use focused tests, linting, formatting, or targeted type checks instead.
- CI/CD owns application and image builds. Do not change or trigger deployment/build jobs unless the user explicitly requests it.

## Essential Commands

### Development
```bash
npm ci --legacy-peer-deps   # Install the locked dependencies (resolves through the internal Nexus mirror)
npm run dev                 # Start development server on http://localhost:3000
```

Never commit a rewritten `package-lock.json` (for example one pointed at registry.npmjs.org)
or registry configuration. Dependency changes must be locked against Nexus.

### Verification
```bash
npm test                    # Every node:test suite (tests/** and server/utils/__tests__)
npm run test:<area>         # One area, e.g. test:api, test:costs, test:mcp
npm run check:lint          # ESLint (the repo has pre-existing findings; do not add new ones)
npm run check:types         # nuxi typecheck (pre-existing errors; do not add new ones)
```

### Versioning & Releases
```bash
npm run changelog:generate X.Y.Z  # Generate changelog from commits (uses AI)
```

**See `VERSIONING.md` for complete instructions on:**
- When to bump MAJOR, MINOR, or PATCH versions
- How to write user-friendly changelog entries
- Version release checklist

**Quick Reference:**
- Version is defined in `package.json` → `version` field
- Version displays automatically in footer and changelog page
- Changelog entries go in `CHANGELOG.md` with highlights comment

## Architecture Overview

### Tech Stack
- **Runtime**: Node 26 LTS (container pins 26.13.0), npm 11
- **Frontend**: Nuxt 4, Vue 3, NuxtUI components, TailwindCSS
- **State Management**: Pinia 4 stores with `pinia-plugin-persistedstate`
- **Validation**: zod 4, with `@asteasolutions/zod-to-openapi` 9 for schema-driven OpenAPI
- **Authentication**: Nuxt OIDC Auth with Entra ID
- **AWS Integration**: AWS SDK v3 for multiple services
- **API**: Nitro server with auto-imported utilities
- **Documentation**: Swagger UI available at `/api/swagger-ui`
- **MCP**: Hosted MCP server at `/mcp` (`server/routes/mcp.post.ts`, `server/mcp/`) with its own OAuth flow

### Project Structure

#### Key Directories
- `/app` - Frontend application code
  - `/components` - Vue components (auto-imported, no path prefix)
  - `/pages` - File-based routing (each .vue file becomes a route)
  - `/stores` - Pinia stores for state management
  - `/composables` - Vue composition API functions (auto-imported)
  - `/utils` - Utility functions (auto-imported)
  - `/plugins` - Nuxt plugins for app initialization

- `/server` - Backend API and server code
  - `/api` - API routes (file-based routing, e.g., `/api/accounts/list.get.ts`)
  - `/utils` - Server utilities (auto-imported in server context)
  - `/lib` - Server libraries (AWS client factory, config)
  - `/types` - TypeScript type definitions
  - `/plugins` - Nitro plugins (Swagger, report scheduler, OAuth background loops, export worker)
  - `/middleware` - Request timing and Entra / API-key authentication
  - `/routes` - Non-`/api` routes (MCP endpoint, OAuth)
  - `/mcp` - MCP server, tools and OAuth implementation
  - `/generated` - Generated, committed files (`swagger-routes.ts`; regenerate with `npm run swagger:prepare`)

- `/shared` - Code shared between frontend and backend (import via `#shared/*`)
  - `/types` - Shared TypeScript types
  - `/utils` - Shared pure utilities (exports, report schedules, author parsing)

- `/tests` - `node:test` suites grouped by area (run with `npm test`)

### Authentication Flow
The app uses Entra ID (Azure AD) for authentication:
1. Nuxt OIDC Auth middleware redirects unauthenticated users to login
2. After successful Entra authentication, users are redirected to `/auth/loading`
3. User groups and permissions are fetched from Microsoft Graph API
4. Session includes access token for Graph API calls

### AWS Integration
The app integrates with two AWS environments (Commercial and GovCloud):
- Uses cross-account role assumption for accessing different accounts
- Credentials configured via environment variables
- AWS services used: Organizations, Cost Explorer, DynamoDB, EC2, S3, Athena (Security Lake and pipeline data), Security Hub, Inspector, Bedrock, SES, CloudWatch, etc.

## Environment Setup

### Required Environment Variables
Create a `.env` file at the root (get from another contributor). Key variables:
- `AWS_COMMERCIAL_*` - Commercial AWS environment credentials
- `AWS_GOVCLOUD_*` - GovCloud AWS environment credentials
- `NUXT_OIDC_*` - Entra ID OAuth configuration
- `AWS_ACCOUNTS_TABLE_NAME` - DynamoDB table for account data

### Development Authentication
- In development, the app uses Entra ID authentication
- Ensure `.env` has proper Entra configuration
- Access Swagger UI at `http://localhost:3000/api/swagger-ui` for API testing

## Key Implementation Patterns

### API Routes
- Use file-based routing: `server/api/[path].[method].ts`
- Return data using `defineEventHandler`
- Auto-imported utilities available in server context
- Use `/server/utils/api-response.ts` for consistent error handling (`handleAsync`, `sendSuccess`, `errors.*`)
- Register OpenAPI docs with `registerEndpoint` from `/server/plugins/swagger.ts`; only files that call it appear in Swagger
- Every `/api/admin/*` route is Administrator-only, enforced centrally in `server/middleware/entra-auth.ts` (a short allowlist is exempt); any other permission check (role, account scope) belongs in the handler
- `/api/v1/*` is the supported integration contract: API keys only (`x-api-key`), v1 error envelope
- Check existing endpoints before creating new ones:
  - `/api/accounts/*` - Account management endpoints
  - `/api/admin/*` - Admin functionality
  - `/api/user/*` - User-related endpoints
  - `/api/swagger.json` - OpenAPI documentation

### Frontend Components
- Use NuxtUI components when possible (UButton, UCard, UTable, UTooltip, etc.)
- Break large components into smaller logical pieces
- Components are auto-imported from `/app/components`
- Existing component categories:
  - `/navigation` - SideNav, TopNav components
  - Check for UniversalSearch, UserAvatar, UserEnclaves components

### State Management
- Use Pinia stores for cross-component state
- Stores in `/app/stores` are auto-imported
- Persist critical state using `pinia-plugin-persistedstate`
- Existing stores to reuse:
  - `useEnclaveStore` - AWS enclave/environment management
  - `useUserGroupStore` - User groups and permissions
  - `useAwsAccountsStore`, `useCostSettingsStore`, `useNavigationStore`, `useSiteConfigStore`

### TypeScript Usage
- Use TypeScript for all new code
- Shared types in `/shared/types` are auto-imported
- Define API response types for type safety
- Check `/shared/types/accounts.ts` for account-related types
- Check `/server/types/aws.ts` for AWS-related types

## Development Guidelines

### CRITICAL: Code Reuse and Discovery
**BEFORE creating any new code, ALWAYS:**
1. Search for existing implementations using Grep/Glob tools
2. Check these locations for existing code:
   - `/app/components` - Existing Vue components
   - `/app/composables` - Existing composables (useAccountCosts, useD3TreeChart, useGraphApi)
   - `/app/utils` - Frontend utilities (accountHelpers.ts exists)
   - `/server/utils` - Server utilities (accounts-consolidated, api-response, dynamodb, etc.)
   - `/server/api` - Existing API endpoints
   - `/app/stores` - Existing Pinia stores (useEnclaveStore, useUserGroupStore, useAwsAccountsStore, ...)
   - `/shared/types` - Existing TypeScript types

**Common existing utilities and patterns:**
- AWS operations: Use `/server/lib/aws-client-factory.ts` for AWS client creation
- Account data: Use `/server/utils/accounts-consolidated.ts` for account operations
- API responses: Use `/server/utils/api-response.ts` for consistent error handling
- DynamoDB: Use `/server/utils/dynamodb.ts` for database operations
- Graph API: Use `/app/composables/useGraphApi.ts` for Microsoft Graph calls
- Cost data: Use `/app/composables/useAccountCosts.ts` for cost-related operations

### Code Organization
- Keep Vue files under 500-600 lines
- Use composables for reusable logic with Vue reactivity
- Use utils for pure functions without reactivity
- Place API logic in server routes, not frontend
- Add simple, clear comments explaining complex logic or business rules
- Comment "why" not "what" - explain business logic, not obvious code

### Component and Function Discovery
Before implementing new features:
```bash
# Search for existing components
grep -r "component-name" app/components/

# Search for existing API endpoints
ls -la server/api/**/*.ts | grep "endpoint-name"

# Search for existing utilities
grep -r "function-name" app/utils/ server/utils/

# Search for existing types
grep -r "TypeName" shared/types/
```

### Testing
- Tests use `node:test` via `tsx`; add new tests under `tests/<area>/` (or `server/utils/__tests__/`)
- Run `npm test` (or the relevant `npm run test:<area>`) before handing off a change
- Tests must not call AWS; inject or stub clients as existing suites do
- Use Swagger UI for manual API testing during development

### Common Issues
- If auto-imports aren't working, restart dev server
- Composables must be directly in `/app/composables` (no subfolders)
- Use `--legacy-peer-deps` when installing packages

## Deployment
- Deployed to AWS ECS using Terraform
- CI/CD via GitLab pipeline (`.gitlab-ci.yml`); see section 9 of `docs/DEVELOPER_GUIDE.md`
- The `code_quality_check` CI image and the Dockerfile `NODE_VERSION` must stay on the same Node version
- Secrets stored in AWS Secrets Manager
- Terraform configuration in `/terraform` directory
