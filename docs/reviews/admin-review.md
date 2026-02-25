# Admin Dashboard & Panels - Review Notes

## Scope

The admin area provides system configuration, user management, pipeline analytics, AI monitoring, and content management. It has a hub page plus multiple oversized panel components.

## Files to Review

### Pages
| File | Lines | Role |
|------|-------|------|
| `app/pages/admin/index.vue` | 768 | Admin hub/dashboard |
| `app/pages/admin/pipelines/[repoId]/[pipelineId]/index.vue` | 800 | Pipeline run detail |
| `app/pages/admin/pipelines/[repoId]/index.vue` | 434 | Repository pipeline view |
| `app/pages/admin/pipelines/index.vue` | 340 | Pipeline overview |
| `app/pages/admin/pipelines/repositories/index.vue` | 323 | Repository listing |
| `app/pages/admin/pipelines/authors/[authorEmail]/index.vue` | 255 | Author pipeline view |
| `app/pages/admin/pipelines/authors/index.vue` | 248 | Author listing |
| `app/pages/admin/settings/index.vue` | 121 | System settings |
| `app/pages/admin/ai/index.vue` | 112 | AI operations |
| `app/pages/admin/monitoring/index.vue` | 112 | System monitoring |
| `app/pages/admin/content.vue` | 104 | Content management |
| `app/pages/admin/users/index.vue` | 100 | User management |
| `app/pages/admin/budget-alerts.vue` | 78 | Budget alert config |

### Components (in `app/components/admin/`)
| File | Lines | Role |
|------|-------|------|
| `UserPreferencesPanel.vue` | 1,090 | User preferences admin panel |
| `UserJourneyVisualizer.vue` | 1,003 | User journey/session visualizer |
| `ScheduledReportsPanel.vue` | 952 | Scheduled reports management |
| `AIChatMonitorPanel.vue` | 871 | AI chat session monitoring |
| `ApiKeysPanel.vue` | 737 | API key management |
| `AlertMetricsPanel.vue` | 643 | Budget alert metrics |
| `SystemLogsPanel.vue` | 643 | System log viewer |

### Composables
| File | Lines | Role |
|------|-------|------|
| `useScheduledReports.ts` | 591 | Scheduled report CRUD |
| `useBackgroundPolling.ts` | 574 | Background data polling |
| `useAIChatMonitoring.ts` | 409 | AI session monitoring |
| `useAlertConfig.ts` | 387 | Alert configuration |
| `useAdminSearch.ts` | 353 | Admin search utilities |

## Known Concerns

### Critical Size Issues
- 7 admin panel components exceed the 500-600 line guideline
- `UserPreferencesPanel.vue` at 1,090 lines and `UserJourneyVisualizer.vue` at 1,003 lines are both 2x the guideline
- The pipeline pages collectively total ~2,400 lines with likely duplicated patterns

### Likely Problems to Investigate
- **Panel monoliths** - each panel does CRUD + display + filtering in one component
- **Pipeline page duplication** - similar table/filter patterns repeated across 6 pipeline pages
- **Background polling** - 574-line polling composable may have cleanup/memory issues
- **API key security** - key management UI needs careful review for exposure risks
- **Admin access gates** - are all admin pages properly access-controlled?
- **Scheduled reports** - complex cron-like scheduling UI is error-prone
- **System logs** - log viewer at 643 lines likely needs pagination and virtualization
