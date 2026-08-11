import { defineEventHandler } from 'h3'
import { sendSuccess } from '../../../utils/api-response'
import { getAIUsageCollectorState } from '../../../utils/ai-usage-storage'
import { requireAdmin } from '../../../utils/user-roles'

function errorCategory(message: string): string {
  if (message.includes('sts:AssumeRole')) return 'Assume role'
  if (message.includes('service control policy')) return 'SCP deny'
  if (message.includes('cloudwatch:')) return 'CloudWatch permission'
  if (message.includes('Circuit breaker OPEN')) return 'Circuit breaker'
  if (message.includes('ENOTFOUND') || message.includes('ECONN')) return 'Network'
  return 'Other'
}

export default defineEventHandler(async event => {
  await requireAdmin(event)
  const state = await getAIUsageCollectorState()
  const errors = (state?.warnings || []).map((message, index) => ({
    id: `${index + 1}`,
    category: errorCategory(message),
    message
  }))
  const errorSummary = Object.entries(errors.reduce<Record<string, number>>((summary, error) => {
    summary[error.category] = (summary[error.category] || 0) + 1
    return summary
  }, {})).map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count)

  return sendSuccess(event, {
    state,
    running: state?.status === 'running',
    coveragePercent: state?.accountsAttempted
      ? (state.accountsSucceeded / state.accountsAttempted) * 100
      : 0,
    errors,
    errorSummary
  })
})
