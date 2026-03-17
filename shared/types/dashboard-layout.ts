export type DisplayStyle = 'full' | 'half' | 'compact'

export type DashboardSectionId =
  | 'budgetAlerts'
  | 'metricCards'
  | 'myAccounts'
  | 'adminOverview'
  | 'costTrend'
  | 'quickStart'
  | 'favoriteAccounts'
  | 'recentlyViewed'
  | 'myAccountCosts'
  | 'newAccounts'
  | 'operationsGlance'
  | 'myActivity'
  | 'securitySnapshot'

export type MetricCardId =
  | 'mtdSpend'
  | 'forecastedCost'
  | 'previousMonth'
  | 'activeAccounts'
  | 'budgetHealth'

export interface DashboardSectionConfig {
  id: DashboardSectionId
  visible: boolean
  displayStyle?: DisplayStyle
}

export interface DashboardLayoutConfig {
  sections: DashboardSectionConfig[]
  metricCards: Record<MetricCardId, boolean>
}

export const SECTION_LABELS: Record<DashboardSectionId, string> = {
  budgetAlerts: 'Budget Alerts',
  metricCards: 'Metric Cards',
  myAccounts: 'My Accounts',
  adminOverview: 'Admin Overview',
  costTrend: 'Cost Trends',
  quickStart: 'Quick Start',
  favoriteAccounts: 'Favorite Accounts',
  recentlyViewed: 'Recently Viewed',
  myAccountCosts: 'My Account Costs',
  newAccounts: 'New Accounts',
  operationsGlance: 'Operations Glance',
  myActivity: 'My Activity',
  securitySnapshot: 'Security Snapshot',
}

export const SECTION_STYLE_SUPPORT: Record<DashboardSectionId, DisplayStyle[]> = {
  budgetAlerts: ['full'],
  metricCards: ['full'],
  myAccounts: ['full', 'half', 'compact'],
  adminOverview: ['full'],
  costTrend: ['full'],
  quickStart: ['full', 'compact'],
  favoriteAccounts: ['full', 'half', 'compact'],
  recentlyViewed: ['full', 'half', 'compact'],
  myAccountCosts: ['full', 'half'],
  newAccounts: ['full', 'half', 'compact'],
  operationsGlance: ['full', 'half'],
  myActivity: ['full', 'half', 'compact'],
  securitySnapshot: ['full', 'half'],
}

export const METRIC_CARD_LABELS: Record<MetricCardId, string> = {
  mtdSpend: 'Month to Date',
  forecastedCost: 'Forecast',
  previousMonth: 'Previous Month',
  activeAccounts: 'Active Accounts',
  budgetHealth: 'Budget Health',
}

export const ALL_SECTION_IDS: DashboardSectionId[] = [
  'budgetAlerts',
  'metricCards',
  'myAccounts',
  'adminOverview',
  'costTrend',
  'quickStart',
  'favoriteAccounts',
  'recentlyViewed',
  'myAccountCosts',
  'newAccounts',
  'operationsGlance',
  'myActivity',
  'securitySnapshot',
]

export const ALL_METRIC_CARD_IDS: MetricCardId[] = [
  'mtdSpend',
  'forecastedCost',
  'previousMonth',
  'activeAccounts',
  'budgetHealth',
]

export const DEFAULT_DASHBOARD_LAYOUT: DashboardLayoutConfig = {
  sections: [
    { id: 'budgetAlerts', visible: true },
    { id: 'metricCards', visible: true },
    { id: 'myAccounts', visible: true },
    { id: 'adminOverview', visible: true },
    { id: 'costTrend', visible: true },
    { id: 'quickStart', visible: true },
    { id: 'favoriteAccounts', visible: true, displayStyle: 'half' },
    { id: 'operationsGlance', visible: true, displayStyle: 'half' },
    { id: 'myActivity', visible: true, displayStyle: 'half' },
    { id: 'recentlyViewed', visible: false, displayStyle: 'half' },
    { id: 'myAccountCosts', visible: false },
    { id: 'newAccounts', visible: false },
    { id: 'securitySnapshot', visible: false },
  ],
  metricCards: Object.fromEntries(ALL_METRIC_CARD_IDS.map(id => [id, true])) as Record<MetricCardId, boolean>,
}
