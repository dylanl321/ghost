export type DisplayStyle = 'full' | 'two-thirds' | 'half' | 'third'

export type DashboardSectionId =
  | 'budgetAlerts'
  | 'metricCards'
  | 'myAccounts'
  | 'adminOverview'
  | 'costTrend'
  | 'topAccounts'
  | 'quickStart'
  | 'favoriteAccounts'
  | 'recentlyViewed'
  | 'myAccountCosts'
  | 'newAccounts'
  | 'operationsGlance'
  | 'myActivity'
  | 'securitySnapshot'
  | 'adminAlerts'
  | 'adminPipeline'
  | 'adminFeedback'
  | 'aiBriefing'
  | 'quickChat'
  | 'commandPalette'

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
  topAccounts: 'Top Accounts',
  quickStart: 'Quick Start',
  favoriteAccounts: 'Favorite Accounts',
  recentlyViewed: 'Recently Viewed',
  myAccountCosts: 'My Account Costs',
  newAccounts: 'New Accounts',
  operationsGlance: 'Operations Glance',
  myActivity: 'My Activity',
  securitySnapshot: 'Security Snapshot',
  adminAlerts: 'Admin: Budget Alerts',
  adminPipeline: 'Admin: Pipeline Activity',
  adminFeedback: 'Admin: Feature Requests',
  aiBriefing: 'AI Briefing',
  quickChat: 'Quick Chat',
  commandPalette: 'Command Palette',
}

export const SECTION_STYLE_SUPPORT: Record<DashboardSectionId, DisplayStyle[]> = {
  budgetAlerts: ['full', 'two-thirds', 'half', 'third'],
  metricCards: ['full'],
  myAccounts: ['full', 'two-thirds', 'half', 'third'],
  adminOverview: ['full'],
  costTrend: ['full', 'two-thirds', 'half', 'third'],
  topAccounts: ['full', 'two-thirds', 'half', 'third'],
  quickStart: ['full', 'third'],
  favoriteAccounts: ['full', 'two-thirds', 'half', 'third'],
  recentlyViewed: ['full', 'two-thirds', 'half', 'third'],
  myAccountCosts: ['full', 'two-thirds', 'half'],
  newAccounts: ['full', 'two-thirds', 'half', 'third'],
  operationsGlance: ['full', 'two-thirds', 'half'],
  myActivity: ['full', 'two-thirds', 'half', 'third'],
  securitySnapshot: ['full', 'two-thirds', 'half'],
  adminAlerts: ['full', 'two-thirds', 'half', 'third'],
  adminPipeline: ['full', 'two-thirds', 'half', 'third'],
  adminFeedback: ['full', 'two-thirds', 'half', 'third'],
  aiBriefing: ['full', 'two-thirds', 'half'],
  quickChat: ['full', 'two-thirds', 'half', 'third'],
  commandPalette: ['full', 'two-thirds', 'half', 'third'],
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
  'topAccounts',
  'quickStart',
  'favoriteAccounts',
  'recentlyViewed',
  'myAccountCosts',
  'newAccounts',
  'operationsGlance',
  'myActivity',
  'securitySnapshot',
  'adminAlerts',
  'adminPipeline',
  'adminFeedback',
  'aiBriefing',
  'quickChat',
  'commandPalette',
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
    { id: 'aiBriefing', visible: true },
    { id: 'myAccounts', visible: true },
    { id: 'adminAlerts', visible: true, displayStyle: 'third' },
    { id: 'adminPipeline', visible: true, displayStyle: 'third' },
    { id: 'adminFeedback', visible: true, displayStyle: 'third' },
    { id: 'costTrend', visible: true, displayStyle: 'half' },
    { id: 'topAccounts', visible: true, displayStyle: 'half' },
    { id: 'quickStart', visible: true },
    { id: 'favoriteAccounts', visible: true, displayStyle: 'half' },
    { id: 'operationsGlance', visible: true, displayStyle: 'half' },
    { id: 'myActivity', visible: true, displayStyle: 'half' },
    { id: 'recentlyViewed', visible: false, displayStyle: 'half' },
    { id: 'myAccountCosts', visible: false },
    { id: 'newAccounts', visible: false },
    { id: 'securitySnapshot', visible: false },
    { id: 'adminOverview', visible: false },
    { id: 'quickChat', visible: false, displayStyle: 'half' },
    { id: 'commandPalette', visible: true, displayStyle: 'third' },
  ],
  metricCards: Object.fromEntries(ALL_METRIC_CARD_IDS.map(id => [id, true])) as Record<MetricCardId, boolean>,
}
