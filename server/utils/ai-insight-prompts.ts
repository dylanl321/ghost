/**
 * AI Insight Prompt Templates
 *
 * Each insight type defines a system prompt and a context-to-prompt builder.
 * All prompts produce plain-English narratives — no JSON, no markdown.
 */

export interface InsightPromptConfig {
  systemPrompt: string
  buildPrompt: (context: Record<string, any>) => string
  /** Cache TTL override in seconds (default: 1800 = 30 min) */
  ttl?: number
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

function pctChange(current: number, previous: number): string {
  if (!previous) return 'N/A'
  const pct = ((current - previous) / previous) * 100
  const dir = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat'
  return `${Math.abs(pct).toFixed(1)}% ${dir}`
}

function billingCycleContext(): string {
  const now = new Date()
  const day = now.getDate()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const pct = Math.round((day / daysInMonth) * 100)
  return `Day ${day} of ${daysInMonth} (${pct}% through billing cycle)`
}

const DATA_CONSTRAINT = `Only reference data provided below — do not speculate, suggest what's missing, or recommend actions the data doesn't clearly support.`

export const insightPrompts: Record<string, InsightPromptConfig> = {

  'dashboard-briefing': {
    systemPrompt: [
      'You are a cloud FinOps analyst writing an executive briefing for an AWS organization dashboard.',
      'Use markdown formatting to make the briefing scannable:',
      '- Start with a one-sentence **bold summary** of the overall spending posture (on-track, at-risk, or critical).',
      '- Use a short bullet list for key metrics: MTD spend, projected month-end, budget status.',
      '- If there are budget alerts or notable trends, call them out briefly.',
      '- Use **bold** for dollar amounts and percentages.',
      '- Keep the total response to 4-8 lines. Be concise but informative.',
      DATA_CONSTRAINT
    ].join(' '),
    ttl: 1800,
    buildPrompt(ctx) {
      const lines: string[] = ['Provide a brief executive summary of this AWS organization:']

      lines.push(`- Billing cycle position: ${billingCycleContext()}`)
      lines.push(`- Month-to-date spend: ${formatCurrency(ctx.mtdTotal || 0)}`)

      if (ctx.previousMonthSpend) {
        lines.push(`- Previous full month: ${formatCurrency(ctx.previousMonthSpend)}`)
        lines.push(`- MTD vs previous month: ${pctChange(ctx.mtdTotal || 0, ctx.previousMonthSpend)}`)
      }
      if (ctx.projectedSpend) lines.push(`- Projected month-end: ${formatCurrency(ctx.projectedSpend)}`)

      lines.push(`- Active accounts: ${ctx.activeAccounts || 0}`)

      if (ctx.budgetHealth) {
        const bh = ctx.budgetHealth
        if (bh.totalBudget) {
          lines.push(`- Organization budget: ${formatCurrency(bh.totalBudget)}`)
          lines.push(`- Accounts over budget: ${bh.accountsOverBudget || 0} of ${bh.accountsWithBudget || '?'} tracked`)
          if (bh.actualDailyBurnRate && bh.expectedDailyBudgetRate) {
            lines.push(`- Daily burn rate: ${formatCurrency(bh.actualDailyBurnRate)} (budget pace: ${formatCurrency(bh.expectedDailyBudgetRate)})`)
          }
        }
      }

      if (ctx.alertsBySeverity) {
        const a = ctx.alertsBySeverity
        const parts: string[] = []
        if (a.critical) parts.push(`${a.critical} critical`)
        if (a.escalation) parts.push(`${a.escalation} escalation`)
        if (a.warning) parts.push(`${a.warning} warning`)
        if (parts.length) lines.push(`- Active budget alerts: ${parts.join(', ')}`)
      }

      // Month-over-month trend direction
      if (ctx.previousMonthSpend && ctx.mtdTotal !== undefined) {
        const change = ((ctx.mtdTotal - ctx.previousMonthSpend) / ctx.previousMonthSpend) * 100
        const direction = change > 5 ? 'increasing' : change < -5 ? 'decreasing' : 'stable'
        lines.push(`- Month-over-month trend: ${direction}`)
      }

      // Cost efficiency: MTD vs projected vs budget
      if (ctx.projectedSpend && ctx.budgetHealth?.totalBudget) {
        const utilization = (ctx.projectedSpend / ctx.budgetHealth.totalBudget) * 100
        lines.push(`- Projected budget utilization: ${utilization.toFixed(1)}%`)
      }

      if (ctx.topAccounts?.length) {
        const top = ctx.topAccounts.slice(0, 5).map((a: any) => {
          let entry = `${a.name}: ${formatCurrency(a.cost)}`
          if (a.percentOfTotal) entry += ` (${a.percentOfTotal.toFixed(1)}% of total)`
          if (a.budget) {
            const budgetUtil = (a.cost / a.budget) * 100
            entry += ` [budget: ${formatCurrency(a.budget)}, ${budgetUtil.toFixed(0)}% used]`
          }
          return entry
        }).join('; ')
        lines.push(`- Top spenders: ${top}`)
      }

      if (ctx.userAccountCount && ctx.userMtdCost !== undefined) {
        lines.push(`- Viewer's accounts: ${ctx.userAccountCount} accounts, ${formatCurrency(ctx.userMtdCost)} MTD`)
      }

      return lines.join('\n')
    }
  },

  'cost-summary': {
    systemPrompt: [
      'You are an AWS FinOps analyst writing a brief cost summary for a cost analytics dashboard.',
      'Write exactly 2-3 sentences. Focus on what stands out: the dominant cost drivers, budget posture, and any accounts exceeding their budget.',
      'Use exact dollar amounts. When budget data is present, frame spending relative to the budget — not just the raw number.',
      'If viewing proforma data, note that costs include shared/overhead allocations.',
      'Write in plain prose — no headings, no bullet points, no markdown.',
      DATA_CONSTRAINT
    ].join(' '),
    ttl: 1800,
    buildPrompt(ctx) {
      const lines: string[] = ['Summarize this cost analytics view:']

      lines.push(`- Billing cycle position: ${billingCycleContext()}`)
      lines.push(`- Timeframe: ${ctx.timeframe || 'current month'}`)
      lines.push(`- Data mode: ${ctx.dataMode === 'proforma' ? 'Proforma (includes shared/overhead allocations)' : 'Billable (raw AWS charges)'}`)
      lines.push(`- Total cost: ${formatCurrency(ctx.totalCost || 0)}`)
      lines.push(`- Accounts in scope: ${ctx.accountCount || 0}`)

      if (ctx.accountNames?.length) {
        lines.push(`- Account names: ${ctx.accountNames.join(', ')}`)
      }

      if (ctx.topServices?.length) {
        const svcs = ctx.topServices.slice(0, 5).map((s: any) => `${s.name}: ${formatCurrency(s.cost)}`).join('; ')
        lines.push(`- Top services: ${svcs}`)
      }

      if (ctx.totalBudget) {
        lines.push(`- Total budget: ${formatCurrency(ctx.totalBudget)}`)
      }
      if (ctx.budgetUtilization !== undefined) {
        lines.push(`- Budget utilization: ${ctx.budgetUtilization.toFixed(1)}%`)
      }

      if (ctx.overBudgetAccounts?.length) {
        const accts = ctx.overBudgetAccounts.map((a: any) => {
          let entry = `${a.name}: ${formatCurrency(a.actual)} vs ${formatCurrency(a.budget)} budget`
          if (a.variancePercent) entry += ` (${a.variancePercent.toFixed(0)}% over)`
          return entry
        }).join('; ')
        lines.push(`- Over-budget accounts: ${accts}`)
      }

      return lines.join('\n')
    }
  },

  'account-health': {
    systemPrompt: [
      'You are an AWS FinOps analyst writing a one-line health assessment for a single AWS account card.',
      'Write exactly 1-2 sentences. Be direct: state whether the account is on track, at risk, or over budget.',
      'If budget data exists, frame the spend relative to the budget and billing cycle position. If no budget is set, note the MTD spend and mention that no budget is configured.',
      'For inactive or suspended accounts, note the status clearly.',
      'Write in plain prose — no headings, no bullet points, no markdown.',
      DATA_CONSTRAINT
    ].join(' '),
    ttl: 1800,
    buildPrompt(ctx) {
      const lines: string[] = ['Assess the health of this AWS account:']

      lines.push(`- Billing cycle position: ${billingCycleContext()}`)
      lines.push(`- Account: ${ctx.accountName || ctx.accountId || 'Unknown'}`)
      if (ctx.lob) lines.push(`- Line of Business: ${ctx.lob}`)
      if (ctx.status) lines.push(`- Account status: ${ctx.status}`)
      if (ctx.mtdCost !== undefined) lines.push(`- MTD cost: ${formatCurrency(ctx.mtdCost)}`)

      if (ctx.budget) {
        lines.push(`- Monthly budget: ${formatCurrency(ctx.budget)}`)
        if (ctx.budgetUtilization !== undefined) {
          lines.push(`- Budget utilization: ${ctx.budgetUtilization.toFixed(1)}%`)
          // Add context on whether pace is healthy given billing cycle position
          const now = new Date()
          const expectedPct = Math.round((now.getDate() / new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()) * 100)
          const delta = ctx.budgetUtilization - expectedPct
          if (delta > 15) lines.push(`- Pace: running ${delta.toFixed(0)}pp ahead of expected for this point in the month`)
          else if (delta < -15) lines.push(`- Pace: running ${Math.abs(delta).toFixed(0)}pp below expected for this point in the month`)
          else lines.push(`- Pace: roughly on track for this point in the month`)
        }
      } else {
        lines.push(`- Monthly budget: not configured`)
      }

      if (ctx.instanceCount !== undefined) lines.push(`- Running EC2 instances: ${ctx.instanceCount}`)

      return lines.join('\n')
    }
  },

  'variance-driver': {
    systemPrompt: [
      'You are an AWS FinOps analyst writing a brief variance summary for a finance dashboard.',
      'Write exactly 2-3 short sentences, no more. Each sentence must be concise and direct.',
      'State the primary driver of the variance, any notable trend in recent months, and whether the category is tracking above or below plan.',
      'If budget is zero or not set, note the spend without a budget reference.',
      'Do NOT start with any introduction, preamble, or category name. Jump directly to the observation.',
      'Write in plain prose — no headings, no bullet points, no markdown.',
      DATA_CONSTRAINT
    ].join(' '),
    ttl: 3600,
    buildPrompt(ctx) {
      const lines: string[] = ['Explain the primary variance driver for this AWS cost category:']

      lines.push(`- Category: ${ctx.categoryName || 'Unknown'}`)
      lines.push(`- Department: ${ctx.department || 'Unknown'}`)
      lines.push(`- YTD plan: ${formatCurrency(ctx.ytdBudget || 0)}`)
      lines.push(`- YTD actual: ${formatCurrency(ctx.ytdActual || 0)}`)

      const variance = (ctx.ytdActual || 0) - (ctx.ytdBudget || 0)
      const variancePct = ctx.ytdBudget > 0 ? (variance / ctx.ytdBudget) * 100 : 0
      lines.push(`- YTD variance: ${variance >= 0 ? '+' : ''}${formatCurrency(variance)} (${variancePct >= 0 ? '+' : ''}${variancePct.toFixed(1)}%)`)

      if (ctx.monthlyActuals && Object.keys(ctx.monthlyActuals).length > 0) {
        const sorted = Object.entries(ctx.monthlyActuals as Record<string, number>).sort(([a], [b]) => a.localeCompare(b))
        const recent = sorted.slice(-3).map(([m, v]) => {
          const [, mo] = m.split('-').map(Number)
          const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
          return `${monthNames[mo - 1]}: ${formatCurrency(v)}`
        }).join(', ')
        lines.push(`- Recent monthly actuals: ${recent}`)
      }

      if (ctx.accountCount !== undefined) lines.push(`- Accounts in category: ${ctx.accountCount}`)
      if (ctx.topAccount) lines.push(`- Largest account: ${ctx.topAccount.name} (${formatCurrency(ctx.topAccount.ytdActual)} YTD)`)

      return lines.join('\n')
    }
  }
}
