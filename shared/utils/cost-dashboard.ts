/**
 * Pure helpers behind the redesigned costs and home dashboards: budget status,
 * whole-group selection detection, the one-sentence summary, the "Needs
 * attention" feed and the account tiles. No Vue, Nuxt or AWS imports, so the
 * same logic serves the client and node tests.
 *
 * Every helper compares spend with the `budget` it is given. Callers decide the
 * basis: the costs page passes the pace-to-date budget when it has one (as
 * BudgetHealthSummaryCards does), so accounts don't all look underutilized early
 * in the month.
 */

export type BudgetStatus = 'over' | 'healthy' | 'under' | 'no-budget'

/** Same thresholds as the Budget Health cards: over above 100%, healthy 50–100%, under below 50%. */
export function budgetStatus(spend: number, budget: number): BudgetStatus {
  if (!(budget > 0)) return 'no-budget'
  const utilization = spend / budget
  if (utilization > 1) return 'over'
  if (utilization >= 0.5) return 'healthy'
  return 'under'
}

export function formatCompactCurrency(value: number): string {
  const sign = value < 0 ? '-' : ''
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`
  return `${sign}$${abs.toFixed(0)}`
}

const percent = (ratio: number): string => `${Math.round(ratio * 100)}%`

// ---------------------------------------------------------------------------
// Whole-group selection
// ---------------------------------------------------------------------------

export interface GroupableAccount {
  id: string
  lineOfBusiness?: string | null
  department?: string | null
}

export type GroupSelection =
  | { kind: 'lob', name: string }
  | { kind: 'department', name: string }

/**
 * When the selection is exactly every account of one line of business (or one
 * department), return that group. Single accounts and partial groups return
 * null, so they keep the single/few-accounts scenarios. LOB wins when a
 * selection is both a whole LOB and a whole department.
 */
export function detectGroupSelection(
  selectedIds: readonly string[],
  accounts: readonly GroupableAccount[]
): GroupSelection | null {
  if (selectedIds.length < 2) return null
  const selected = new Set(selectedIds)
  const chosen = accounts.filter(a => selected.has(a.id))
  // Every selected id must be a known account
  if (chosen.length !== selected.size) return null

  const wholeGroup = (key: 'lineOfBusiness' | 'department'): string | null => {
    const name = chosen[0]?.[key]?.trim()
    if (!name || !chosen.every(a => a[key]?.trim() === name)) return null
    const members = accounts.filter(a => a[key]?.trim() === name)
    return members.length === chosen.length ? name : null
  }

  const lob = wholeGroup('lineOfBusiness')
  if (lob) return { kind: 'lob', name: lob }
  const department = wholeGroup('department')
  if (department) return { kind: 'department', name: department }
  return null
}

// ---------------------------------------------------------------------------
// Summary sentence
// ---------------------------------------------------------------------------

export interface NarrativeAccount {
  id: string
  name: string
  spend: number
  budget: number
}

export interface CostNarrativeInput {
  /** Leading period phrase, e.g. "In October" or "So far this quarter" */
  periodPhrase: string
  /** Who spent it, e.g. "all 40 accounts", "Mission Systems", "Project Falcon 14" */
  scopeLabel: string
  accounts: readonly NarrativeAccount[]
  /** Noun for the budget, e.g. "budget to date" when budgets are prorated to the days with data */
  budgetNoun?: string
  /** Sentence used instead of "No budget is set…" when budgets don't apply, e.g. past periods */
  noBudgetText?: string
  format?: (value: number) => string
}

export interface CostNarrative {
  /** Text before the highlighted amount */
  lead: string
  /** The highlighted variance ("$7.4K over"), empty when there is no budget */
  emphasis: string
  /** Text after the highlighted amount, starting with punctuation */
  tail: string
  tone: 'over' | 'under' | 'neutral'
  /** The whole sentence, for screen readers, exports and tests */
  text: string
}

/** Short display name: drops a leading "Project " so drivers read naturally in a sentence. */
const shortName = (name: string): string => name.replace(/^Project\s+/i, '')

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/**
 * One deterministic sentence that answers "where do we stand?". Built from the
 * numbers already on the page so it always agrees with them.
 */
export function buildCostNarrative(input: CostNarrativeInput): CostNarrative {
  const format = input.format ?? formatCompactCurrency
  const spend = input.accounts.reduce((sum, a) => sum + a.spend, 0)
  const budgeted = input.accounts.filter(a => a.budget > 0)
  const budget = budgeted.reduce((sum, a) => sum + a.budget, 0)

  const lead = `${input.periodPhrase}, ${input.scopeLabel} spent ${format(spend)}`

  if (budget <= 0) {
    const note = input.noBudgetText ?? `No budget is set for ${input.accounts.length === 1 ? 'this account' : 'these accounts'}.`
    return { lead: `${lead}.`, emphasis: '', tail: ` ${note}`, tone: 'neutral', text: `${lead}. ${note}` }
  }

  const variance = spend - budget
  const over = budgeted
    .filter(a => a.spend > a.budget)
    .sort((a, b) => (b.spend - b.budget) - (a.spend - a.budget))
  const overTotal = over.reduce((sum, a) => sum + (a.spend - a.budget), 0)

  const head = `${lead} against a ${format(budget)} ${input.budgetNoun ?? 'budget'}, `
  let emphasis: string
  let tail: string
  let tone: CostNarrative['tone']

  if (variance > 0) {
    tone = 'over'
    emphasis = `${format(variance)} over`
    if (input.accounts.length > 1 && over.length > 0) {
      const drivers = over.slice(0, 2)
      const share = drivers.reduce((sum, a) => sum + (a.spend - a.budget), 0) / overTotal
      const names = joinNames(drivers.map(a => shortName(a.name)))
      tail = drivers.length === over.length
        ? `. ${names} ${drivers.length === 1 ? 'is' : 'are'} the only ${drivers.length === 1 ? 'account' : 'accounts'} over budget.`
        : `. ${names} drive ${percent(share)} of the overrun.`
    } else {
      tail = '.'
    }
  } else {
    tone = 'under'
    emphasis = `${format(-variance)} under`
    tail = over.length > 0 && input.accounts.length > 1
      ? `, though ${over.length} ${over.length === 1 ? 'account is over its own budget' : 'accounts are over their own budgets'}, led by ${shortName(over[0]!.name)}.`
      : '.'
  }

  const text = `${head}${emphasis}${tail}`
  return { lead: head, emphasis, tail, tone, text }
}

// ---------------------------------------------------------------------------
// Needs attention
// ---------------------------------------------------------------------------

export type AttentionSeverity = 'critical' | 'warning' | 'info'

export interface AttentionItem {
  id: string
  severity: AttentionSeverity
  kind: 'overrun' | 'budget-alerts' | 'early-month' | 'historical' | 'carried-forward' | 'untagged'
  title: string
  body: string
  /** What the item's button does; the page maps it to navigation or a filter */
  action: { label: string, type: 'focus-account' | 'open-alerts' | 'switch-to-last-month' | 'switch-to-this-month' | 'open-forecast-upload' | 'open-tag-compliance', accountId?: string }
}

export interface AttentionInput {
  accounts: readonly NarrativeAccount[]
  /** Open budget alerts by severity, as /api/alerts/list summarises them */
  alertsBySeverity?: { critical?: number, escalation?: number, warning?: number, info?: number }
  /** Day of month for the current period, when the period is "this month" */
  currentDayOfMonth?: number
  /** True for past periods, where budgets and forecasts are not compared */
  isHistorical?: boolean
  carriedForward?: { count: number, year: number, from: number }
  /** Share of spend with no tag value for the configured tag key, 0–1 */
  untaggedShare?: number
  untaggedTagKey?: string
  /** Most overruns to list individually */
  maxOverruns?: number
  format?: (value: number) => string
}

const severityRank: Record<AttentionSeverity, number> = { critical: 0, warning: 1, info: 2 }

/** Ranked feed of what needs a look, built from data the dashboards already load. */
export function buildAttentionItems(input: AttentionInput): AttentionItem[] {
  const format = input.format ?? formatCompactCurrency
  const items: AttentionItem[] = []

  if (input.currentDayOfMonth !== undefined && input.currentDayOfMonth <= 5) {
    items.push({
      id: 'early-month',
      severity: 'info',
      kind: 'early-month',
      title: input.currentDayOfMonth <= 1 ? 'This month has no complete days yet' : 'This month is still filling in',
      body: 'AWS Cost Explorer reports through yesterday, so month-to-date figures are partial.',
      action: { label: 'View last month', type: 'switch-to-last-month' }
    })
  }

  if (input.isHistorical) {
    items.push({
      id: 'historical',
      severity: 'info',
      kind: 'historical',
      title: 'Budgets and forecasts are hidden for past periods',
      body: 'Budget data is kept for the current period only, and decommissioned accounts may be missing.',
      action: { label: 'View this month', type: 'switch-to-this-month' }
    })
  } else {
    const over = input.accounts
      .filter(a => a.budget > 0 && a.spend > a.budget)
      .sort((a, b) => (b.spend - b.budget) - (a.spend - a.budget))
    for (const account of over.slice(0, input.maxOverruns ?? 3)) {
      items.push({
        id: `overrun:${account.id}`,
        severity: account.spend >= account.budget * 1.5 ? 'critical' : 'warning',
        kind: 'overrun',
        title: `${shortName(account.name)} is at ${percent(account.spend / account.budget)} of budget`,
        body: `${format(account.spend - account.budget)} over a ${format(account.budget)} budget.`,
        action: { label: 'Focus on this account', type: 'focus-account', accountId: account.id }
      })
    }
  }

  const alerts = input.alertsBySeverity
  const alertTotal = (alerts?.critical ?? 0) + (alerts?.escalation ?? 0) + (alerts?.warning ?? 0) + (alerts?.info ?? 0)
  if (alerts && alertTotal > 0) {
    const parts = ([['critical', alerts.critical], ['escalation', alerts.escalation], ['warning', alerts.warning], ['info', alerts.info]] as const)
      .filter(([, n]) => (n ?? 0) > 0)
      .map(([label, n]) => `${n} ${label}${n === 1 || label === 'info' ? '' : 's'}`)
    items.push({
      id: 'budget-alerts',
      severity: (alerts.critical ?? 0) > 0 ? 'critical' : 'warning',
      kind: 'budget-alerts',
      title: `${alertTotal} open budget ${alertTotal === 1 ? 'alert' : 'alerts'}`,
      body: `${parts.join(', ')}.`,
      action: { label: 'Open budget alerts', type: 'open-alerts' }
    })
  }

  const cf = input.carriedForward
  if (cf && cf.count > 0 && !input.isHistorical) {
    items.push({
      id: 'carried-forward',
      severity: 'warning',
      kind: 'carried-forward',
      title: `${cf.year} PEP budgets missing for ${cf.count} ${cf.count === 1 ? 'account' : 'accounts'}`,
      body: `They use the December ${cf.from} monthly amount until ${cf.year} values are loaded.`,
      action: { label: 'Upload forecast', type: 'open-forecast-upload' }
    })
  }

  if (input.untaggedShare !== undefined && input.untaggedShare >= 0.05) {
    const spend = input.accounts.reduce((sum, a) => sum + a.spend, 0)
    const key = input.untaggedTagKey ? ` ${input.untaggedTagKey}` : ''
    items.push({
      id: 'untagged',
      severity: input.untaggedShare >= 0.2 ? 'warning' : 'info',
      kind: 'untagged',
      title: `${percent(input.untaggedShare)} of spend has no${key} tag`,
      body: `${format(spend * input.untaggedShare)} can't be attributed, so tag views are estimates.`,
      action: { label: 'Open tag compliance', type: 'open-tag-compliance' }
    })
  }

  // Stable sort keeps insertion order within a severity
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => severityRank[a.item.severity] - severityRank[b.item.severity] || a.index - b.index)
    .map(({ item }) => item)
}

// ---------------------------------------------------------------------------
// Account tiles
// ---------------------------------------------------------------------------

export interface AccountTile {
  id: string
  name: string
  spend: number
  budget: number
  /** spend / budget, or null without a budget */
  utilization: number | null
  status: BudgetStatus
  /** Relative size for a flex mosaic: share of the largest spend, floored so small accounts stay clickable */
  weight: number
  selected: boolean
  /** True when something else is selected, so the UI can dim this tile */
  dimmed: boolean
}

export interface AccountTileGroup {
  name: string | null
  spend: number
  budget: number
  status: BudgetStatus
  tiles: AccountTile[]
}

export function buildAccountTiles(
  accounts: readonly (NarrativeAccount & GroupableAccount)[],
  options: { selectedIds?: readonly string[], groupBy?: 'none' | 'lob' | 'department', minWeight?: number } = {}
): AccountTileGroup[] {
  const selected = new Set(options.selectedIds ?? [])
  const hasSelection = selected.size > 0
  const minWeight = options.minWeight ?? 0.08
  const maxSpend = Math.max(0, ...accounts.map(a => a.spend))

  const tile = (a: NarrativeAccount): AccountTile => ({
    id: a.id,
    name: a.name,
    spend: a.spend,
    budget: a.budget,
    utilization: a.budget > 0 ? a.spend / a.budget : null,
    status: budgetStatus(a.spend, a.budget),
    weight: maxSpend > 0 ? Math.max(minWeight, a.spend / maxSpend) : minWeight,
    selected: selected.has(a.id),
    dimmed: hasSelection && !selected.has(a.id)
  })

  const sorted = [...accounts].sort((a, b) => b.spend - a.spend)
  const groupBy = options.groupBy ?? 'none'
  const keyOf = (a: GroupableAccount): string | null =>
    groupBy === 'lob' ? (a.lineOfBusiness?.trim() || 'Unknown LOB')
      : groupBy === 'department' ? (a.department?.trim() || 'Unknown department')
        : null

  const groups = new Map<string | null, typeof sorted>()
  for (const account of sorted) {
    const key = keyOf(account)
    const list = groups.get(key)
    if (list) list.push(account)
    else groups.set(key, [account])
  }

  return [...groups.entries()]
    .map(([name, members]) => {
      const spend = members.reduce((sum, a) => sum + a.spend, 0)
      const budget = members.reduce((sum, a) => sum + (a.budget > 0 ? a.budget : 0), 0)
      return { name, spend, budget, status: budgetStatus(spend, budget), tiles: members.map(tile) }
    })
    .sort((a, b) => b.spend - a.spend)
}
