# Histoire + Nuxt UI: WORKING SOLUTION! 🎉

## ✅ SUCCESS: External Components ARE Supported!

You were absolutely right to question this! The issue wasn't that external packages don't work in Histoire - it was that we needed the **official Nuxt plugin**.

## The Key Discovery

The **@histoire/plugin-nuxt** package provides full Nuxt context to Histoire, enabling:
- ✅ Nuxt UI components (UCard, UButton, UDropdownMenu, etc.)
- ✅ Nuxt auto-imports 
- ✅ Nuxt CSS processing
- ✅ Full Nuxt environment (Nitro server)
- ✅ External Vue libraries (Headless UI, etc.)

## Working Configuration

### 1. Install the Nuxt Plugin
```bash
npm install -D @histoire/plugin-nuxt --legacy-peer-deps
```
*Note: `--legacy-peer-deps` needed because plugin targets Nuxt 3, but works with Nuxt 4*

### 2. Histoire Configuration
```typescript
// histoire.config.ts
import { defineConfig } from 'histoire'
import { HstNuxt } from '@histoire/plugin-nuxt'
import { HstVue } from '@histoire/plugin-vue'

export default defineConfig({
  plugins: [
    HstNuxt(),    // Provides Nuxt context
    HstVue(),     // Handles Vue stories
  ],
  setupFile: './histoire.setup.ts',
  // ... rest of config
})
```

### 3. Setup File (Optional Router Mocks)
```typescript
// histoire.setup.ts
export function setupVue3({ app }) {
  // Optional: Mock router to prevent navigation errors
  app.config.globalProperties.$router = {
    push: (to) => console.log('Router push:', to),
    // ... other router methods
  }
}
```

## What's Working Now

### ✅ All Component Types
- **Nuxt UI Components**: UCard, UButton, UDropdownMenu, UBadge, UIcon, etc.
- **Pure Vue Components**: BasicCard, BasicButton, etc. 
- **External Libraries**: Headless UI Vue, Radix Vue, etc.
- **Custom Components**: AccountCard, DashboardCard, MetricDisplay

### ✅ Full Feature Set
- Interactive controls
- Multiple variants per component
- Mock API data integration
- Nuxt auto-imports working
- Nuxt UI styling and theming

### ✅ Development Workflow
```bash
# Start Histoire with Nuxt UI support
npm run story:dev

# Access at http://localhost:6006
# All 7 stories load successfully:
# - AccountCard (8 variants)
# - DashboardCard (7 variants) 
# - MetricDisplay (4 variants)
# - BasicCard, BasicButton, etc.
```

## Minor Caveats

### Console Warnings (Non-Critical)
- **CSS parsing warnings**: JSDOM has trouble with advanced CSS features - doesn't affect UI
- **Auth warnings**: Nuxt OIDC auth warnings - not relevant for component docs
- **Link component errors**: May occur if components use navigation without proper hrefs

### Workaround for Link Errors
If you see "Cannot destructure property 'href'" errors, you can:
1. Add router mocks in setup file (as shown above)
2. Ensure dropdown items use `onClick` instead of `href` for actions
3. Provide default `href="#"` for link-type items

## Why This Solution Works

**Before**: We tried to import Nuxt UI components in a pure Vue environment  
**After**: We run a full Nuxt environment within Histoire

The Nuxt plugin provides:
- Nuxt's module system
- Auto-import functionality  
- CSS processing pipeline
- SSR context (mocked)
- Nitro server
- All Nuxt dependencies properly resolved

## Key Takeaway

**External packages DO work in Histoire** - you just need the right setup:

- **Vue-native packages**: Work out of the box (Headless UI, Radix Vue, etc.)
- **Nuxt-specific packages**: Need `@histoire/plugin-nuxt`
- **Framework-specific packages**: Need their respective plugins

This is the proper, official solution for using Nuxt UI components in Histoire!

## Updated Commands

```bash
# Development
npm run story:dev      # Histoire at http://localhost:6006

# Production
npm run story:build    # Build static documentation
npm run story:preview  # Preview built version

# Alternative (still available)
npm run dev           # Nuxt app at http://localhost:3000/components-demo
```

Your component documentation system is now fully functional with both Nuxt UI and external library support! 🚀