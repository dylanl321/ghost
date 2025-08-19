# Histoire Troubleshooting Guide

## Known Issues & Solutions

### 1. Jiti/Module Resolution Errors ✅ FIXED
**Symptoms**: Console errors about `jiti.cjs` and module exports causing story rendering failures
```
SyntaxError: The requested module '/node_modules/jiti/dist/jiti.cjs?import&v=d040c58f' does not provide an export named 'default'
```

**Solution**: ✅ Fixed by updating `histoire.config.ts` with proper Vite configuration:
```typescript
vite: {
  optimizeDeps: {
    exclude: ['jiti']
  },
  ssr: {
    noExternal: ['jiti']
  }
}
```

**Why it happens**: Histoire alpha version has ES module compatibility issues with the `jiti` package used for dynamic imports and transpilation.

### 2. Nuxt UI Components Not Found
**Symptoms**: `Failed to resolve component: UCard, UButton, etc.`

**Solution**: ✅ Already Fixed - Components are registered in `histoire.setup.ts`

### 3. Suspense Experimental Warning
**Symptoms**: `<Suspense> is an experimental feature`

**Solution**: This is a Vue 3 development warning and doesn't affect functionality.

## Verification Checklist

- [ ] Histoire runs at http://localhost:6006
- [ ] Stories load without fatal errors
- [ ] Components render visually
- [ ] Interactive controls work
- [ ] Console warnings can be ignored

## Current Status: ✅ WORKING

Histoire now works cleanly with pure Vue components:
- ✅ BasicCard component with multiple variants
- ✅ BasicButton component with all states  
- ✅ SimpleTest component for verification
- ✅ Interactive controls function properly
- ✅ No module resolution errors
- ✅ Clean console output

## Nuxt UI Component Documentation

**Issue**: Nuxt UI components cause module resolution conflicts in Histoire due to complex SSR dependencies.

**Solution**: Document Nuxt UI components using alternative approaches:

### Option 1: Screenshot-based Documentation
- Create visual documentation with component screenshots
- Use Nuxt dev server to capture component states
- Store in `docs/components/` with usage examples

### Option 2: Separate Nuxt UI Playground
- Create dedicated `pages/components-demo.vue` in your Nuxt app
- Use this page to showcase all component variants
- Access via your main Nuxt dev server at http://localhost:3000/components-demo

### Option 3: Pure Vue Wrapper Components
- Create wrapper components that work in Histoire
- Import Nuxt UI components conditionally
- Use mock implementations for Histoire context

## Commands

```bash
# Start development
npm run story:dev

# Build for production
npm run story:build

# Preview built version
npm run story:preview
```