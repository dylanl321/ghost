# Costs Page & Ecosystem - Review Notes

## Scope

The costs feature is the single largest concentration of code in GHOST. It spans a page, 7+ major components, and 6+ composables totaling roughly 15,000 lines.

## Files to Review

### Page
| File | Lines | Role |
|------|-------|------|
| `app/pages/account/costs.vue` | 1,267 | Main cost analytics dashboard |

### Components (in `app/components/costs/`)
| File | Lines | Role |
|------|-------|------|
| `ChartsRenderer.vue` | 3,065 | Renders all ECharts visualizations (5x guideline) |
| `ForecastDataTable.vue` | 1,463 | Forecast/budget data table |
| `OrganizationalCharts.vue` | 1,137 | Org-level cost charts |
| `CostDataTable.vue` | 1,076 | Cost breakdown data table |
| `CostsHeader.vue` | 731 | Page header with filters and controls |
| `ForecastUpload.vue` | 664 | Forecast CSV upload UI |
| `CostTrendChart.vue` | 250 | 14-day cost trend line chart (already reviewed) |

### Composables
| File | Lines | Role |
|------|-------|------|
| `useChartRegistry.ts` | 3,360 | Chart configuration registry (largest composable in project) |
| `useTableRegistry.ts` | 1,262 | Table configuration registry |
| `useCostData.ts` | 321 | Cost data fetching and transformation |
| `useForecastData.ts` | 250 | Forecast data management |
| `useCostFilters.ts` | 123 | Filter state management |
| `useCostExport.ts` | 214 | CSV/PDF export logic |
| `useProformaBillableExport.ts` | 552 | Proforma vs billable export |
| `useCostTour.ts` | 162 | Guided tour for costs page |

### Server API Endpoints
| File | Role |
|------|------|
| `server/api/costs/summary.ts` | Cost summary aggregation |
| `server/api/costs/projections.ts` | AWS Cost Explorer forecast |
| `server/api/costs/analysis.ts` | Per-account cost analysis |
| `server/api/accounts/dashboard-simplified.ts` | Simplified cost dashboard |

## Known Concerns

### Critical Size Issues
- `ChartsRenderer.vue` at 3,065 lines is the largest component in the project. A single component rendering all chart types suggests it should be split into per-chart-type components.
- `useChartRegistry.ts` at 3,360 lines is the largest composable. A "registry" pattern at this scale suggests configuration data that could be externalized or generated.
- `useTableRegistry.ts` at 1,262 lines has the same pattern.

### Likely Problems to Investigate
- **Duplicated rendering logic** between ChartsRenderer and OrganizationalCharts
- **God-object composables** - registries doing too much (config + rendering + state + formatting)
- **Data fetching patterns** - are costs fetched consistently? Is there caching?
- **Filter state management** - how do filters propagate between CostsHeader, charts, and tables?
- **Export logic spread** - three separate export composables suggest fragmented responsibility
- **ECharts integration** - are chart options reactive? Are charts properly disposed?
- **Performance** - rendering 3,000+ lines of chart config for potentially dozens of accounts
- **Theme awareness** - hardcoded colors like we found in CostTrendChart

### Questions to Answer
1. Can ChartsRenderer be split into focused chart components?
2. Can the registry composables be replaced with static config + smaller rendering helpers?
3. Are there dead code paths or unused chart/table configurations?
4. Is the forecast upload flow properly validated and error-handled?
5. How does the sidebar account selector interact with chart/table state?
6. Are there race conditions when switching filters rapidly?
7. Can the individual chart definitons be split up into seperate files?