# Feature Review Backlog

This document tracks the major feature areas that need in-depth code review, ordered by priority based on complexity, code size, and risk.

## Review Status

| # | Feature Area | Status | Total LOC (est.) | Key Risk |
|---|-------------|--------|-----------------|----------|
| 1 | [Costs Page & Ecosystem](./reviews/costs-review.md) | **Up Next** | ~15,000 | Largest codebase concentration; multiple files 3-5x guideline |
| 2 | [User Access & History](./reviews/user-access-review.md) | Pending | ~5,500 | Oversized components; CloudTrail query complexity |
| 3 | [AI Chat System](./reviews/ai-chat-review.md) | Pending | ~5,000 | Streaming state management; agent integration |
| 4 | [Support Tools](./reviews/support-tools-review.md) | Pending | ~2,500 | Single monolithic page; security tooling |
| 5 | [Admin Dashboard](./reviews/admin-review.md) | Pending | ~6,000 | Many oversized panels; configuration management |
| 6 | Account Details Page | **Completed** | ~8,600 | Reviewed and refactored |

## Completed Reviews

### Account Details Page (Completed)
- Fixed 8 bugs including duplicate API calls, broken Tailwind classes, display errors, budget mismatches
- Extracted 3 new composables (`useAccountTour`, `useAccountData`, `useAccountInfo`)
- Created reusable `InactiveAccountOverlay` component
- Reduced main page from 671 to 393 lines (41% reduction)
- Consolidated duplicate `formatCurrency` definitions
- Fixed dark-mode-only styling on sub-pages
- Made chart colors theme-aware
