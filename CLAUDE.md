# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an AWS Dashboard application built with Nuxt 4 and Nuxt UI v3. It provides a RESTful API for managing AWS resources across both Commercial and GovCloud environments, with automatic OpenAPI documentation and standardized utility functions.

## Essential Commands

### Development

- `npm run dev` - Start development server on http://localhost:3000
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally
- `npm run generate` - Generate static site

### Code Quality

- `npm run lint` - Check code with ESLint
- `npm run lint:fix` - Auto-fix linting issues

### Component Documentation

- `npm run story:dev` - Start Histoire dev server on http://localhost:6006
- `npm run story:build` - Build static Histoire for deployment
- `npm run story:preview` - Preview built Histoire

## Architecture

### Core Structure

- **`app/`** - Main application directory
  - `app.vue` - Root component with UApp wrapper
  - `pages/` - Nuxt pages using file-based routing
  - `components/` - Reusable Vue components with Storybook stories
  - `assets/css/main.css` - Global styles with Tailwind and custom theme
  - `app.config.ts` - UI theme configuration
- **`server/`** - Server-side API and utilities
  - `api/` - API endpoints with file-based routing
  - `lib/` - Core libraries (AWS clients, config)
  - `utils/` - Utility functions (DynamoDB, Cost Explorer, API responses)
  - `types/` - TypeScript type definitions
  - `plugins/` - Nitro plugins (Swagger/OpenAPI)

### Key Technologies

- **Nuxt 4** - Full-stack Vue framework with SSR/SSG capabilities
- **Nuxt UI v3** - Component library built on Tailwind CSS
- **TypeScript** - Full TypeScript support via Nuxt
- **Tailwind CSS** - Utility-first CSS framework
- **AWS SDK v3** - Modular AWS service clients
- **OpenAPI/Swagger** - Automatic API documentation
- **Histoire** - Component development and documentation environment

### Auto-generated Directories

- `.nuxt/` - Build artifacts (do not edit)
- `.output/` - Production build output
- `node_modules/` - Dependencies

## Development Patterns

### Component Usage

Nuxt UI components are auto-imported. Use them directly:

```vue
<UButton>Click me</UButton>
<UContainer>Content</UContainer>
```

### Component Development with Histoire

1. **Create Component**: Add new components in `app/components/`
2. **Write Stories**: Create `ComponentName.story.vue` alongside your component
3. **Run Histoire**: Use `npm run story:dev` to develop in isolation
4. **Interactive Controls**: Stories provide live controls for component props

Example story structure:
```vue
<!-- ComponentName.story.vue -->
<template>
  <Story title="Component Name" group="dashboard">
    <Variant title="Default">
      <ComponentName :prop="value" />
    </Variant>
    
    <Variant title="Interactive">
      <ComponentName 
        :prop="controlledProp"
        :other-prop="otherValue"
      />
    </Variant>

    <template #controls>
      <HstText v-model="controlledProp" title="Prop Name" />
      <HstCheckbox v-model="otherValue" title="Other Prop" />
    </template>
  </Story>
</template>

<script setup lang="ts">
import ComponentName from './ComponentName.vue'

const controlledProp = $ref('default value')
const otherValue = $ref(false)
</script>
```

### Page Creation

Add `.vue` files to `app/pages/` for automatic routing:

- `pages/index.vue` → `/`
- `pages/about.vue` → `/about`
- `pages/blog/[id].vue` → `/blog/:id`

### Styling

- Primary color: Emerald
- Neutral color: Slate
- Custom green palette defined in `main.css`
- Font: 'Public Sans'
- Use Tailwind classes directly in templates

### Configuration

- `nuxt.config.ts` - Main Nuxt configuration
- `app.config.ts` - Runtime app configuration for UI theme
- `tsconfig.json` - TypeScript configuration (extends Nuxt's)
- `eslint.config.mjs` - ESLint rules

## Server API Development

### API Documentation

- **Swagger UI**: http://localhost:3000/api/docs
- **OpenAPI JSON**: http://localhost:3000/api/swagger.json

### Creating New API Endpoints

1. Create file in `server/api/` (e.g., `server/api/resource.get.ts`)
2. Use `defineEventHandler` with `handleAsync` wrapper
3. Register OpenAPI documentation with `registerEndpoint`
4. Use utility functions from `server/utils/`
5. Return standardized responses with `sendSuccess`, `sendError`

### AWS Client Usage

Use the new `getClient()` function for cross-account access:

```typescript
// Basic client for current account
const client = await getClient("commercial", "dynamodb", "us-east-1");

// Cross-account client with role assumption
const client = await getClient(
  "govcloud",
  "organizations",
  "us-gov-west-1",
  "123456789012"
);

// Convenience functions also support cross-account
const dynamoClient = await getDynamoDBClient(
  "commercial",
  "us-east-1",
  "123456789012"
);
```

### AWS Configuration

Set environment variables for AWS access:

- `AWS_COMMERCIAL_*` - Commercial AWS credentials
- `AWS_GOVCLOUD_*` - GovCloud AWS credentials
  See `.env.example` for full configuration

### Available Utility Functions

- **DynamoDB**: `getItem`, `putItem`, `queryItems`, `scanItems`, etc.
- **Cost Explorer**: `getCostAndUsage`, `getCostsByService`, etc.
- **Accounts**: `lookupAccount`, `getEnrichedAccount`, `searchAccounts`, `syncAccountData`, `bulkSyncAccounts`
- **Organizations**: `getOrganizationInfo`, `getOrganizationalUnitTree`, `getAccountOU`, `moveAccount`
- **Response**: `sendSuccess`, `sendPaginated`, `errors.*`
- **AWS Clients**: `getClient`, `getDynamoDBClient`, `getOrganizationsClient`, etc.

## Important Notes

### Testing

No testing framework included. Install Vitest if needed:

```bash
npm install -D @nuxt/test-utils vitest @vue/test-utils
```

### AWS SDK Dependencies

Install dependencies before running:

```bash
npm install
```

### Environment Setup

1. Copy `.env.example` to `.env`
2. Add your AWS credentials
3. Configure both Commercial and/or GovCloud environments

### Deployment

Build with `npm run build` then deploy `.output/` directory.

### Package Management

Both npm and pnpm lockfiles exist. Use either, but be consistent within a session.

This is the migration guide to nuxt4. You where originally trained with nuxt 3 and that is not compatable syntax. review @./nuxt4.md for migration information

This is the migration guide to nuxt ui 3. You where originally trained with nuxt ui 2 and that is not compatable syntax. review @./nuxtui3.md for migration information
