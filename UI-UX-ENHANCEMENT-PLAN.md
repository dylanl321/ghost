# GHOST UI/UX Enhancement Plan

**Version:** 1.15.0 | **Date:** 2026-03-25 | **Status:** Reviewed & Validated

---

## Executive Summary

A comprehensive review of GHOST's 49 pages, 203 components, 64 composables, 255 API endpoints, and 7 Pinia stores identified 20 enhancement opportunities across 5 categories. The app has strong foundations — consistent dark theme, customizable dashboard, command palette, D3/ECharts visualizations, and robust state management. These enhancements focus on making the experience more interactive, polished, and delightful for enterprise AWS users.

**Current Strengths:**
- Consistent emerald/slate dark theme with CSS variables
- Customizable dashboard (drag-reorder, show/hide, width options, org defaults)
- Command palette (Cmd+K) with grouped navigation
- D3.js org chart with zoom/pan, ECharts for business charts
- Background polling for async AI chat jobs
- Robust Pinia state management (7 stores, all persisted)
- User preferences system (favorites, recents, layout)
- Welcome banner with dismiss tracking, dashboard feature spotlight
- Export to PDF/CSV/Excel/JSON across the app

---

## Phase 1: Quick Wins

Low effort, high polish. Each item is 1-2 days of work.

---

### 1.1 Animated Number Counters on Dashboard Metrics

**What:** Smooth count-up animation (0 to final value over ~800ms with easing) when metric cards load or data refreshes.

**Why:** The dashboard is the first screen users see. Static numbers feel dead; animated numbers draw attention to important data and make the app feel alive.

**Implementation:**
- Create `app/composables/useCountUp.ts` — a small composable using `requestAnimationFrame` and an ease-out function. No external dependency needed.
- Modify `app/components/dashboard/DashboardMetricCards.vue` — wrap the 5 metric values (MTD spend, forecast, previous month, active accounts, budget health) with the composable.
- Use existing `app/utils/formatters.ts` (`formatCurrency`, `formatNumber`) for final display formatting.
- Respect `prefers-reduced-motion` by skipping animation when set.

**Affected Files:**
- New: `app/composables/useCountUp.ts`
- Modify: `app/components/dashboard/DashboardMetricCards.vue` (lines 26, 68, 104, 137, 176)

---

### 1.2 Page Transition Animations

**What:** Subtle fade+slide transition (150ms, out-in mode) between route changes.

**Why:** Currently there are zero page transitions anywhere in the app. Instant route swaps feel jarring. Even a simple 150ms fade makes navigation feel dramatically more polished and helps users maintain spatial orientation.

**Implementation:**
- Add `app: { pageTransition: { name: 'page', mode: 'out-in' } }` to `nuxt.config.ts`.
- Add transition CSS classes (`.page-enter-active`, `.page-leave-active`, `.page-enter-from`, `.page-leave-to`) to `app/assets/css/main.css`.
- Use `opacity` + `translateY(4px)` for the effect. Keep duration short (150-200ms) to avoid feeling sluggish.

**Affected Files:**
- Modify: `nuxt.config.ts`
- Modify: `app/assets/css/main.css`

---

### 1.3 Custom Error Page (404/500)

**What:** Branded error page with the GHOST ghost icon, contextual messages for different error codes, a "Go Home" button, and a link to open the command palette.

**Why:** No `app/error.vue` exists. Nuxt currently shows a generic, unbranded error page that breaks the user experience. The session-expired page (`app/pages/auth/session-expired.vue`) already demonstrates the design language — gradient background, glow orbs, card with backdrop blur — so this is mostly copying an existing pattern.

**Implementation:**
- Create `app/error.vue` with error code detection (`404` vs `500` vs generic).
- Reuse the visual pattern from `app/pages/auth/session-expired.vue` (gradient background, glow effects, grid pattern overlay).
- Use the `i-fa6-solid-ghost` icon already used in the footer.
- Include "Go to Dashboard" button and "Press Cmd+K to search" hint.

**Affected Files:**
- New: `app/error.vue`

---

### 1.4 Optimistic UI for Favorites and Notes

**What:** When a user favorites an account or saves a note, immediately update the UI state before the API response returns. Revert on failure with a toast notification.

**Why:** Favoriting/unfavoriting feels sluggish because the UI waits for the full round-trip. Optimistic updates make the app feel instant — update local state first, fire API call, revert on error.

**Implementation:**
- **Phase A (favorites):** In `app/composables/useFavoriteAccounts.ts`: update the local favorites array immediately, then call the API. On error, remove the item and show a toast.
- **Phase B (notes, follow-up):** In `app/composables/useAccountNotes.ts`: append the note to the local list immediately, then persist. On error, remove and notify. Notes have more complex rollback requirements (rich content, timestamps) so tackle after favorites are stable.
- Use existing `useToast()` from NuxtUI for rollback notifications.

**Affected Files:**
- Modify: `app/composables/useFavoriteAccounts.ts`
- Modify (follow-up): `app/composables/useAccountNotes.ts`

---

### 1.5 Link Hover Prefetching

**What:** Add Nuxt's native `prefetch` attribute to high-traffic `NuxtLink` components so route data is fetched on hover before the user clicks.

**Why:** Makes navigation feel near-instant for common routes. Nuxt supports this natively but no files currently use prefetch.

**Implementation:**
- Add `:prefetch="true"` to NuxtLink elements in sidebar navigation, favorite accounts, and recent accounts components.
- No new dependencies needed — this is built into Nuxt.

**Affected Files:**
- Modify: `app/components/navigation/SideNav.vue`
- Modify: `app/components/navigation/FavoriteAccountsNav.vue`
- Modify: `app/components/navigation/RecentAccountsNav.vue`

---

### 1.6 Smooth Chart Data Transitions

**What:** Configure ECharts instances to use `animationDurationUpdate` and `animationEasingUpdate` so that when data changes (timeframe switch, account selection), charts morph smoothly between states instead of flash-rerendering.

**Why:** When switching tabs or timeframes on the cost dashboard, charts disappear and re-render from scratch. Smooth transitions maintain user context and feel significantly more polished. This is a configuration change — ECharts supports this natively.

**Implementation:**
- Create a small `app/utils/chartAnimationDefaults.ts` utility exporting default animation options: `{ animationDuration: 500, animationDurationUpdate: 300, animationEasingUpdate: 'cubicOut' }`.
- Apply these defaults at the ECharts component level (not in `useChartRegistry.ts` which is a 2125-line data extraction registry, not a rendering config).
- Ensure `vue-echarts` component instances use `:update-options="{ notMerge: false }"` to enable morphing.

**Affected Files:**
- New: `app/utils/chartAnimationDefaults.ts`
- Modify: Cost chart components in `app/components/costs/` (apply defaults per-component)

---

## Phase 2: High-Value Interactivity

Medium effort, significant user impact. Each item is 2-5 days of work.

---

### 2.1 Enhanced Command Palette with Account Search

**What:** Extend the Cmd+K command palette to search across AWS accounts (by name, ID, or alias) in addition to the existing static navigation commands. Use Fuse.js for fuzzy matching.

**Why:** The current palette has ~20 commands (8 navigation + 4 settings + 8 admin). But GHOST manages hundreds of AWS accounts — the palette should be the universal search hub where users can find anything. The `useAwsAccountsStore` already has all account data loaded in memory.

**Implementation:**
- In `app/composables/useCommandPalette.ts`: add an "Accounts" group that dynamically builds commands from `useAwsAccountsStore.accountsList`. Use Fuse.js (already in `package.json`) for fuzzy matching on account name, ID, email, and alias.
- In `app/components/shared/CommandPalette.vue`: render account results with account ID badge and environment indicator (Commercial/GovCloud).
- Selecting an account navigates to `/account/{id}`.
- Show max 5 account results to avoid overwhelming the palette.

**Affected Files:**
- Modify: `app/composables/useCommandPalette.ts`
- Modify: `app/components/shared/CommandPalette.vue`

**Reuse:** `fuse.js` (already installed), `useAwsAccountsStore` (already loaded), `server/utils/fuzzy-search.ts` (reference pattern)

---

### 2.2 Keyboard Shortcuts for Power Users

**What:** Add vim-style navigation shortcuts (`g d` = go to dashboard, `g c` = go to costs, `g e` = go to explorer, `g s` = go to security, `g a` = go to admin). Add `?` to show a shortcuts help overlay.

**Why:** Enterprise/AWS audience values keyboard efficiency. Only Cmd+K exists currently. The command palette already handles keydown events — extending it to support `g+key` sequences is straightforward.

**Implementation:**
- In `app/composables/useCommandPalette.ts`: extend `handleKeydown` to detect a `g` prefix key, wait 500ms for the second key, then navigate via `router.push`. Press `?` to open a shortcuts help modal.
- Create a simple shortcuts help modal listing all available shortcuts.
- Show shortcut hints next to commands in the command palette UI.

**Affected Files:**
- Modify: `app/composables/useCommandPalette.ts`
- Modify: `app/components/shared/CommandPalette.vue`
- New: `app/components/shared/KeyboardShortcutsModal.vue`

---

### 2.3 Sparklines in Tables

**What:** Create a lightweight `SparklineCell` component that renders a tiny inline SVG line chart (60x20px, 6-12 data points) showing cost trends. Add it to the dashboard cost tables and Account Explorer.

**Why:** Tables are data-dense but lack at-a-glance trend information. A sparkline next to a cost number instantly communicates "going up" or "going down" without clicking into details. Enterprise users managing hundreds of accounts benefit enormously.

**Implementation:**
- Create `app/components/shared/SparklineCell.vue` — pure SVG, no external dependencies. Accept `data: number[]` prop, render a polyline with optional gradient fill.
- Color the line green (trending down) or red (trending up) based on first vs last data point.
- Add as an optional column to cost table components.

**Affected Files:**
- New: `app/components/shared/SparklineCell.vue`
- Modify: Cost table components in `app/components/costs/`

**Reuse:** `useChartRegistry.ts` already extracts per-account trend data that can feed sparklines.

---

### 2.4 "What's New" Modal After Version Updates

**What:** On app load, compare the stored `lastSeenVersion` (in user preferences) to `$config.public.appVersion`. If different, show a modal highlighting the top 3-5 changes from the changelog.

**Why:** The changelog page exists and is beautifully designed, but it's passive — users don't visit it. A one-time modal after updates ensures users discover new features. The changelog content is already parsed and available at runtime via `nuxt.config.ts`.

**Implementation:**
- Create `app/components/shared/WhatsNewModal.vue` — uses `UModal`, displays parsed changelog highlights for the current version.
- In `app/layouts/default.vue`: on mount, check `useUserPreferences.getPreference('lastSeenVersion')` vs `$config.public.appVersion`. Show modal if different, then update the preference.
- Parse highlights from the changelog content (already injected at build time).

**Affected Files:**
- New: `app/components/shared/WhatsNewModal.vue`
- Modify: `app/layouts/default.vue`
- Modify: `app/composables/useUserPreferences.ts` (add `lastSeenVersion` key)

---

### 2.5 Standardized Loading States

**What:** Create a configurable `LoadingSkeleton` component with presets (card, table-row, metric, chart) and establish clear guidelines: skeleton for known layouts, spinner for actions/modals, progress bar for multi-step processes.

**Why:** 31+ files (54 occurrences) implement loading differently — some use `animate-pulse` divs, some use `CenteredLoadingSpinner.vue`, some use `UProgress`. Standardizing creates visual consistency and reduces code duplication.

**Implementation:**
- Create `app/components/shared/LoadingSkeleton.vue` with configurable presets via props: `type="card"`, `type="table"`, `type="metric"`, `type="chart"`.
- Migrate the top 10 most-visible components to use the standardized component.
- Keep existing `CenteredLoadingSpinner.vue` for action/modal loading only.

**Affected Files:**
- New: `app/components/shared/LoadingSkeleton.vue`
- Modify: Top 10 components with inline loading markup (DashboardMetricCards, DashboardCostTrend, DashboardFavoriteAccounts, etc.)

---

## Phase 3: Data Visualization & Power Features

Higher effort, transformative for data-heavy workflows. Each item is 3-7 days.

---

### 3.1 Chart Crosshair Linking

**What:** When hovering over a data point on one ECharts chart (e.g., the monthly cost trend line), highlight the corresponding time period on all sibling charts on the same page.

**Why:** The cost dashboard shows 3-5 charts for the same time range. Without crosshair linking, users lose context when comparing across charts. ECharts natively supports `connect()` for grouping chart instances — this is a configuration change, not a rewrite.

**Implementation:**
- In `app/composables/useContextualCharts.ts`: register each chart instance with a shared group ID via `echarts.connect(groupId)`.
- Ensure all cost page chart components call `connect` on mount and `disconnect` on unmount.

**Affected Files:**
- Modify: `app/composables/useContextualCharts.ts`
- Modify: Cost chart components in `app/components/costs/`

---

### 3.2 Saveable Cost Filter Presets

**What:** Let users save their current cost dashboard filter configuration (selected accounts, timeframe, mode, tag filters) as named presets. Show a dropdown to quickly switch between saved presets.

**Why:** Enterprise users repeatedly analyze the same set of accounts (their business unit, their team's accounts). Saving filter presets eliminates repetitive setup — a major time-saver for power users.

**Implementation:**
- Create `app/components/costs/FilterPresets.vue` — dropdown with save/load/delete/rename operations.
- In `app/composables/useCostData.ts`: add `serializeFilters()` and `deserializeFilters()` methods.
- Store presets under `costFilterPresets` key in `useUserPreferences` (DynamoDB-backed with localStorage fallback).

**Affected Files:**
- New: `app/components/costs/FilterPresets.vue`
- Modify: `app/pages/account/costs.vue`
- Modify: `app/composables/useUserPreferences.ts`

**Reuse:** `useAdvancedFilters.ts` for filter state shape, `useUserPreferences.setPreference()` for persistence.

---

### 3.3 Security Gauge Drill-Down

**What:** Make the security gauge charts (`SecurityRiskGauge.vue`, `OrgComplianceGauge.vue`) clickable. On click, open a slideover panel showing the underlying findings that contribute to the score, with filtering and sorting.

**Why:** Gauges currently show a score but provide no path to action. Users see "72% compliance" but can't discover what the 28% gap consists of. This turns a passive indicator into an actionable tool.

**Implementation:**
- Add click handlers to gauge chart components that emit an event with the score breakdown.
- Create `app/components/security/GaugeDrilldownSlideover.vue` using NuxtUI `USlideover`, containing a filtered `SecurityFindingsTable`.
- Pass the relevant severity/compliance filter to scope the findings.

**Affected Files:**
- Modify: `app/components/accounts/security/SecurityRiskGauge.vue`
- Modify: `app/components/security/OrgComplianceGauge.vue`
- New: `app/components/security/GaugeDrilldownSlideover.vue`

**Reuse:** `SecurityFindingsTable.vue` already exists and handles search/filter/sort.

---

### 3.4 Cost Period Comparison Mode

**What:** A "Compare" toggle on the cost dashboard that lets users select two time periods (this month vs last month, Q1 vs Q2) and see them side-by-side with difference highlights, percentage changes, and delta bars.

**Why:** Cost analysis is a core use case. Currently users must mentally compare by switching timeframes. A dedicated comparison mode with delta visualization would be the single most impactful feature for finance-oriented users.

**Implementation:**
- Create `app/components/costs/CostComparisonView.vue` — split layout with period A on left, period B on right, delta column in center.
- Create `app/composables/useCostComparison.ts` — manages two independent cost data fetches and computes deltas.
- Add a "Compare" toggle button to the cost page header.

**Affected Files:**
- New: `app/components/costs/CostComparisonView.vue`
- New: `app/composables/useCostComparison.ts`
- Modify: `app/pages/account/costs.vue`

**Reuse:** `useCostDataCache.ts` for multi-timeframe caching, `useChartRegistry.ts` for chart definitions.

---

## Phase 4: Performance & Feel

Focused on making the app feel fast and responsive.

---

### 4.1 Virtual Scrolling for Large Lists

**What:** Implement virtual scrolling in the Account Explorer and any table/list that can exceed 200+ rows. Only render visible rows in the DOM.

**Why:** Organizations with 500+ AWS accounts experience scroll jank because all accounts are rendered in the DOM simultaneously. Virtual scrolling renders only visible rows, dramatically improving performance.

**Implementation:**
- Add `@tanstack/vue-virtual` or create a lightweight `useVirtualList` composable.
- Replace full-list rendering in `app/pages/account/explorer.vue` with virtualized rendering.
- Apply to any other tables that regularly exceed 200 rows.

**Affected Files:**
- Modify: `app/pages/account/explorer.vue`
- New: `app/composables/useVirtualList.ts` (or add `@tanstack/vue-virtual` to `package.json`)

---

### 4.2 Persistent Client-Side Cost Cache

**What:** Migrate cost data caching from component-scoped refs (cleared on navigation) to a Pinia store with 5-minute TTL.

**Why:** Currently `useCostDataCache` is lossy — data is cleared when leaving the costs page, forcing a re-fetch when the user navigates back (even within the same session). A Pinia-backed cache would enable instant back-button navigation.

**Implementation:**
- Extend the existing `useCostDataCache.ts` to use a Pinia store (or `useAsyncData` with smart cache keys) instead of module-level Maps.
- Keep the existing 5-minute TTL and 10-entry LRU eviction.
- Server-side cache (15-30 min) remains unchanged.

**Affected Files:**
- Modify: `app/composables/useCostDataCache.ts`
- Potentially new: `app/stores/useCostCacheStore.ts`

---

## Phase 5: Communication & Collaboration

Features that improve team workflows.

---

### 5.1 In-App Announcements System

**What:** An admin-managed announcement banner system for time-limited messages (maintenance windows, feature launches, policy changes). Displayed below the WelcomeBanner, dismissible per-user.

**Why:** `WelcomeBanner.vue` and `useSiteConfigStore` (with `welcomeMessage`/`showWelcomeCard`) already provide basic announcement capability, but it's limited to a single static message. Admins need severity types (info/warning/maintenance), scheduling, and per-user dismissal tracking to communicate time-sensitive information without deploying code changes.

**Implementation:**
- Create `app/components/shared/AnnouncementBanner.vue` — renders active announcements with dismiss, supports severity levels (info, warning, critical).
- Create API endpoints at `server/api/admin/announcements/` for CRUD.
- Store announcements in DynamoDB via site config pattern.
- Render in `app/layouts/default.vue` below WelcomeBanner.

**Affected Files:**
- New: `app/components/shared/AnnouncementBanner.vue`
- New: `server/api/admin/announcements/` (list, create, update, delete endpoints)
- Modify: `app/layouts/default.vue`
- Modify: `app/stores/useSiteConfigStore.ts`

---

### 5.2 Notification Preferences

**What:** Per-user notification configuration in Settings — which alert types they want (budget alerts, security findings, pipeline failures) and delivery preferences (in-app, email digest, frequency).

**Why:** The admin alert system exists (`AlertSettingsPanel.vue`) but individual users can't customize their notification experience. This is expected in enterprise tools.

**Implementation:**
- Create `app/components/settings/NotificationPreferences.vue` — grouped toggle switches for each alert category, frequency selector for email digests.
- Add to the existing `app/pages/settings/preferences.vue` page.
- Store in `useUserPreferences` under `notificationPreferences` key.

**Affected Files:**
- New: `app/components/settings/NotificationPreferences.vue`
- Modify: `app/pages/settings/preferences.vue`
- Modify: `app/composables/useUserPreferences.ts`

---

## Implementation Priority Matrix

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| Tier 1 | 1.2 Page Transitions | Low | High polish |
| Tier 1 | 1.3 Custom Error Page | Low | High polish |
| Tier 1 | 2.5 Loading Standardization | Medium | Consistency |
| Tier 1 | 2.4 What's New Modal | Medium | Feature discovery |
| Tier 2 | 1.1 Animated Counters | Low | Delight |
| Tier 2 | 2.3 Sparklines | Medium | Data density |
| Tier 2 | 1.4 Optimistic UI (favorites first) | Low | Snappiness |
| Tier 2 | 3.2 Saveable Filter Presets | Medium | Efficiency |
| Tier 2 | 3.3 Security Gauge Drill-Down | Medium | Actionability |
| Tier 2 | 4.2 Persistent Cost Cache | Medium | Speed |
| Tier 3 | 3.4 Cost Comparison Mode | High | Core feature |
| Tier 3 | 2.1 Command Palette + Accounts | Medium | Efficiency |
| Tier 3 | 2.2 Keyboard Shortcuts | Medium | Power users |
| Tier 3 | 3.1 Chart Crosshair Linking | Medium | Data analysis |
| Tier 3 | 5.2 Notification Preferences | Medium | Personalization |
| Tier 3 | 5.1 Announcements System | Medium | Communication |
| Tier 4 | 1.5 Link Prefetching | Low | Speed (measure first) |
| Tier 4 | 1.6 Chart Transitions | Low | Polish (scope per-component) |
| Tier 4 | 4.1 Virtual Scrolling | Medium | Performance (try cap first) |

**Bug fix (do immediately):** Remove debug output from `app/components/costs/ShareButton.vue:189-191`

---

## Key Files Reference

| Purpose | File Path |
|---------|-----------|
| Main Layout | `app/layouts/default.vue` |
| Global CSS | `app/assets/css/main.css` |
| Nuxt Config | `nuxt.config.ts` |
| Command Palette | `app/components/shared/CommandPalette.vue` |
| Command Palette Logic | `app/composables/useCommandPalette.ts` |
| Dashboard Page | `app/pages/index.vue` |
| Dashboard Metrics | `app/components/dashboard/DashboardMetricCards.vue` |
| Cost Page | `app/pages/account/costs.vue` |
| Chart Registry | `app/composables/useChartRegistry.ts` |
| Contextual Charts | `app/composables/useContextualCharts.ts` |
| Account Store | `app/stores/useAwsAccountsStore.ts` |
| User Preferences | `app/composables/useUserPreferences.ts` |
| Site Config Store | `app/stores/useSiteConfigStore.ts` |
| Chart Animation Defaults | `app/utils/chartAnimationDefaults.ts` (new) |
| Favorite Accounts | `app/composables/useFavoriteAccounts.ts` |
| Account Notes | `app/composables/useAccountNotes.ts` |
| Cost Data Cache | `app/composables/useCostDataCache.ts` |
| Advanced Filters | `app/composables/useAdvancedFilters.ts` |
| Share Links | `app/composables/useShareLink.ts` |
| Formatters | `app/utils/formatters.ts` |
| Security Risk Gauge | `app/components/accounts/security/SecurityRiskGauge.vue` |
| Org Compliance Gauge | `app/components/security/OrgComplianceGauge.vue` |
| Security Findings Table | `app/components/accounts/security/SecurityFindingsTable.vue` |
| Account Explorer | `app/pages/account/explorer.vue` |
| Session Expired (design ref) | `app/pages/auth/session-expired.vue` |

---

## Existing Libraries Available (No New Dependencies Needed)

| Library | Version | Use For |
|---------|---------|---------|
| fuse.js | 7.1.0 | Fuzzy search in command palette |
| driver.js | 1.3.1 | Guided tours |
| echarts | 6.0.0 | Chart crosshair linking, animations |
| d3 | 7.9.0 | Custom visualizations |
| sortablejs | 1.15.7 | Drag-and-drop |
| date-fns | 4.1.0 | Date formatting |
| jspdf | 3.0.2 | PDF export |
| xlsx | 0.18.5 | Excel export |
| mermaid | 11.12.1 | Diagrams |

---

## Verification Checklist

For each enhancement:

1. **Dev Server** — `npm run dev`, verify on `http://localhost:3000`
2. **Dark Mode** — Confirm rendering in dark theme (forced default)
3. **Responsive** — Resize browser through mobile/tablet/desktop breakpoints
4. **Keyboard** — Test keyboard navigation and shortcuts
5. **Performance** — Check Network/Performance tabs for regressions
6. **No Regressions** — Navigate all major pages (dashboard, costs, explorer, security, chat, admin)
7. **Error States** — Test with network errors, empty data, loading states
