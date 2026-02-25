# User Access & History - Review Notes

## Scope

The user access feature covers user profile pages, AWS access role mapping, and CloudTrail-based access history. It has two significantly oversized files and complex data flows involving Microsoft Graph API, Entra ID groups, and AWS CloudTrail.

## Files to Review

### Pages
| File | Lines | Role |
|------|-------|------|
| `app/pages/account/user/[username]/access-history.vue` | 2,432 | CloudTrail access history viewer |
| `app/pages/account/user/[username]/index.vue` | 678 | User profile detail page |
| `app/pages/account/user/index.vue` | 653 | User search and directory |
| `app/pages/profile.vue` | 1,275 | Current user's own profile |

### Components
| File | Lines | Role |
|------|-------|------|
| `accounts/UserAccess.vue` | 1,994 | User's AWS access across all accounts (4x guideline) |
| `accounts/UserShareButton.vue` | 214 | Share link for user profiles |

### Composables
| File | Lines | Role |
|------|-------|------|
| `useGroupMembers.ts` | 389 | Fetches enclave users via Graph API |
| `useGraphApi.ts` | 439 | Microsoft Graph API wrapper |
| `useAwsGroupParser.ts` | 136 | Parses Entra group names to extract AWS roles |
| `useEnclaveRoles.ts` | 124 | Maps users to enclave roles |

## Known Concerns

### Critical Size Issues
- `access-history.vue` at 2,432 lines is the largest page in the project. CloudTrail query building, result parsing, date filtering, event inspection, and table rendering are all in one file.
- `UserAccess.vue` at 1,994 lines handles card/table toggle views, role filtering, export (CSV/JSON in multiple formats), group detail modals, and custom export modals -- all in one component.
- `profile.vue` at 1,275 lines duplicates much of what UserAccess already does.

### Likely Problems to Investigate
- **Massive component monoliths** needing decomposition
- **Duplicated user info display** between profile.vue and user/[username]/index.vue
- **CloudTrail query complexity** - is the query builder properly parameterized and secured?
- **Graph API token handling** - are tokens refreshed properly? Error recovery?
- **Role parsing fragility** - Entra group name parsing with regex is brittle
- **Export format sprawl** - multiple export formats in UserAccess suggests possible consolidation
