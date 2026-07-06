/**
 * PUT /api/costs/financial-plan-overrides
 *
 * Saves manually entered monthly plan values for a department + year.
 *
 * Body:
 *   { department: string, year: number, monthlyValues: Record<string, number> }
 */

import { defineEventHandler, readBody } from 'h3'
import { handleAsync, sendSuccess, errors } from '../../utils/api-response'
import { requirePermission } from '../../utils/user-roles'
import { putItem } from '../../utils/dynamodb'
import { getDynamoDBConfig } from '../../lib/dynamodb-config'

export default defineEventHandler(handleAsync(async (event) => {
  await requirePermission(event, 'costs.budget_vs_actual')

  const body = await readBody(event)
  const department = (body?.department as string)?.trim().toUpperCase()
  const year = parseInt(body?.year)
  const monthlyValues = body?.monthlyValues

  if (!department) return errors.badRequest(event, 'department is required')
  if (!year || isNaN(year)) return errors.badRequest(event, 'year is required')
  if (!monthlyValues || typeof monthlyValues !== 'object') return errors.badRequest(event, 'monthlyValues is required')

  const config = await getDynamoDBConfig()
  const { tableName, environment, accountId } = config.financialPlanOverrides

  await putItem(
    tableName,
    {
      pk: `PLAN#${department}#${year}`,
      department,
      year,
      monthlyValues,
      updatedAt: new Date().toISOString()
    },
    environment,
    accountId
  )

  return sendSuccess(event, { department, year, monthlyValues })
}))
