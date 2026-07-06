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
 *   PK: "PLAN#DE158#2026"
 *   monthlyValues: { "2026-01-01": 150000, ... }
 *   updatedAt: ISO string
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
    { pk: `PLAN#${department}#${year}` },
    environment,
    accountId
  )

  return sendSuccess(event, {
    department,
    year,
    monthlyValues: (item?.monthlyValues as Record<string, number>) || {}
  })
}))
