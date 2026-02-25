# Support Tools - Review Notes

## Scope

The support tools page is an admin-only debugging toolkit providing AWS investigation utilities. It is a single monolithic page file.

## Files to Review

### Pages
| File | Lines | Role |
|------|-------|------|
| `app/pages/support-tools.vue` | 2,190 | Admin support/debugging toolkit |

### Supporting Composables
| File | Lines | Role |
|------|-------|------|
| `useSupportContext.ts` | 290 | Support context and state management |
| `useAdminSearch.ts` | 353 | Admin search across accounts/users/resources |

## Known Concerns

### Critical Size Issues
- `support-tools.vue` at 2,190 lines is a single monolithic page containing what appears to be multiple independent tools (IP lookup, Security Lake queries, resource investigation, etc.) all in one file.

### Likely Problems to Investigate
- **Monolithic page** - 2,190 lines in a single .vue file is 4x the guideline; each tool should be its own component
- **Security concerns** - admin tools that query Security Lake and CloudTrail need careful input validation
- **No component decomposition** - the entire page should be split into individual tool card components
- **State isolation** - are the independent tools sharing state when they shouldn't be?
- **Error handling** - investigation tools hitting AWS APIs need robust timeout and error handling
- **Loading states** - Security Lake queries can be very slow; are there proper timeout indicators?
