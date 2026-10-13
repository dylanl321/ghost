/**
 * PUT /api/costs/financial-plan-overrides
 *
 * Saves manually entered monthly plan values for a department + year.
 *
 * Body:
 *   { department: string, year: number, monthlyValues: Record<string, number> }
 *   monthlyValues keys must be "YYYY-MM-01" (e.g. "2026-01-01")
 *
 * DynamoDB item shape:
 *   PK: department (e.g. "DE158")
 *   month keys: "MM/YYYY" (e.g. "01/2026")
 */

import { defineEventHandler, readBody } from 'h3'
import { handleAsync, sendSuccess, errors } from '../../utils/api-response'
import { getUserEmail, requirePermission } from '../../utils/user-roles'
import { saveFinancialPlan } from '../../utils/financial-plan-history'

export default defineEventHandler(handleAsync(async (event) => {
  await requirePermission(event, 'costs.budget_vs_actual')

  const body = await readBody(event)
  const department = (body?.department as string)?.trim().toUpperCase()
  const year = parseInt(body?.year)
  const monthlyValues = body?.monthlyValues

  if (!department) return errors.badRequest(event, 'department is required')
  if (!year || isNaN(year)) return errors.badRequest(event, 'year is required')
  if (!monthlyValues || typeof monthlyValues !== 'object') return errors.badRequest(event, 'monthlyValues is required')

  await saveFinancialPlan({
    department,
    year,
    monthlyValues,
    action: 'manual-save',
    actor: getUserEmail(event) || 'Unknown user'
  })

  // Convert incoming YYYY-MM-01 keys → MM/YYYY, merging over existing item

  return sendSuccess(event, { department, year, monthlyValues })
}))
