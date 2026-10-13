# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

When the user invokes AI-DLC, read and follow
`.aidlc/aidlc-rules/aws-aidlc-rules/core-workflow.md` to start the workflow.

## Project Overview
GHOST is a web dashboard providing centralized access to AWS account data and functionality. It's built with Nuxt 4, uses Entra ID for authentication, and integrates with multiple AWS services.

## CRITICAL: Before Writing Any Code
1. **ALWAYS search for existing implementations first** - Most common functionality already exists
2. **Reuse existing utilities and components** - Don't recreate what's already built
3. **Add simple comments for complex logic** - Explain the "why" not the "what"
4. **Check the Swagger UI** (`/api/swagger-ui`) to understand existing API endpoints

## CRITICAL: Never Build This App Locally
- **NEVER run any local application build on this machine.** Builds are too slow and interrupt development.
- Do not run `npm run build`, `npm run generate`, `npm run preview`, `npm run story:build`, `npm run story:preview`, `nuxt build`, `nuxi build`, or any local `docker build` for this repository.
- Do not use a production build as a verification step. Use focused tests, linting, formatting, or targeted type checks instead.
- CI/CD owns application and image builds. Do not change or trigger deployment/build jobs unless the user explicitly requests it.

## Essential Commands

### Development
```bash
npm install --legacy-peer-deps  # Install dependencies (legacy-peer-deps required for Histoire module)
npm run dev                     # Start development server on http://localhost:3000
```

### Component Development
```bash
npm run story:dev      # Start Histoire component development
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
- **Frontend**: Nuxt 4, Vue 3, NuxtUI components, TailwindCSS
- **State Management**: Pinia stores with persistence
- **Authentication**: Nuxt OIDC Auth with Entra ID
- **AWS Integration**: AWS SDK v3 for multiple services
- **API**: Nitro server with auto-imported utilities
- **Documentation**: Swagger UI available at `/api/swagger-ui`

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
  - `/plugins` - Server plugins (Swagger integration)

- `/shared` - Code shared between frontend and backend
  - `/types` - Shared TypeScript types

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
- AWS services used: Organizations, Cost Explorer, DynamoDB, EC2, S3, Security Lake, etc.

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
- Use `/server/utils/api-response.ts` for consistent error handling
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
   - `/app/stores` - Existing Pinia stores (useEnclaveStore, useUserGroupStore)
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
- Check for testing commands in package.json
- Verify changes don't break existing functionality
- Use Swagger UI for API testing during development

### Common Issues
- If auto-imports aren't working, restart dev server
- Composables must be directly in `/app/composables` (no subfolders)
- Use `--legacy-peer-deps` when installing packages

## Deployment
- Deployed to AWS ECS using Terraform
- CI/CD via GitLab pipeline
- Secrets stored in AWS Secrets Manager
- Terraform configuration in `/terraform` directory
