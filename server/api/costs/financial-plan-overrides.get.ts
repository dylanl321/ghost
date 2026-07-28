/**
 * GET /api/costs/financial-plan-overrides
 *
 * Returns manually entered monthly plan values for a department + year.
 *
 * Query params:
 *   department: string (e.g. "DE158")
 *   year:       number (e.g. 2026)
 *
 * DynamoDB item shape:
 *   PK: department (e.g. "DE158")
 *   month keys: "MM/YYYY" (e.g. "01/2026")
 *
 * Response monthlyValues keys are converted to "YYYY-MM-01" for frontend compatibility.
 */

import { defineEventHandler, getQuery } from 'h3'
import { handleAsync, sendSuccess, errors } from '../../utils/api-response'
import { requirePermission } from '../../utils/user-roles'
import { getItem } from '../../utils/dynamodb'
import { getDynamoDBConfig } from '../../lib/dynamodb-config'

export default defineEventHandler(handleAsync(async (event) => {
  await requirePermission(event, 'costs.budget_vs_actual')

  const query = getQuery(event)
  const department = (query.department as string)?.trim().toUpperCase()
  const year = parseInt(query.year as string) || new Date().getFullYear()

  if (!department) return errors.badRequest(event, 'department is required')

  const config = await getDynamoDBConfig()
  const { tableName, environment, accountId } = config.financialPlanOverrides

  const item = await getItem(
    tableName,
    { pk: department },
    environment,
    accountId
  )

  // Convert MM/YYYY keys → YYYY-MM-01, filtering to the requested year only
  const monthlyValues: Record<string, number> = {}
  if (item) {
    for (const [key, value] of Object.entries(item)) {
      if (key === 'pk') continue
      const match = key.match(/^(\d{2})\/(\d{4})$/)
      if (match && parseInt(match[2]) === year) {
        monthlyValues[`${match[2]}-${match[1]}-01`] = value as number
      }
    }
  }

  return sendSuccess(event, { department, year, monthlyValues })
}))
