/** GET /api/support/instance-health */

import { defineEventHandler, getQuery } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { lookupAccountUnified } from '../../utils/accounts-consolidated'
import { buildInstanceHealth } from '../../utils/instance-health'
import { registerEndpoint } from '../../plugins/swagger'
import type { AWSEnvironmentType } from '../../types'

registerEndpoint('/api/support/instance-health', 'GET', {
  summary: 'Get comprehensive instance health',
  description: 'Aggregated health view combining AWS Config, patches, security findings, vulnerabilities, and alarms',
  tags: ['Support Tools', 'Health'],
  parameters: [
    { name: 'instanceId', in: 'query', required: true, schema: { type: 'string' }, description: 'EC2 instance ID' },
    { name: 'accountId', in: 'query', required: true, schema: { type: 'string' }, description: 'Commercial or GovCloud AWS account ID' },
    { name: 'environment', in: 'query', required: false, schema: { type: 'string', enum: ['commercial', 'govcloud'] }, description: 'AWS environment (default: govcloud)' },
    { name: 'region', in: 'query', required: false, schema: { type: 'string' }, description: 'AWS region' },
    { name: 'lookbackDays', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 90 }, description: 'Security finding lookback (default: 30)' },
    { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 25 }, description: 'Maximum detail records per domain (default: 10)' }
  ],
  responses: {
    200: {
      description: 'Instance health evidence',
      content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'object' } } } } }
    },
    400: { $ref: '#/components/schemas/Error' },
    404: { $ref: '#/components/schemas/Error' },
    500: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async event => {
  const query = getQuery(event)
  const instanceId = String(query.instanceId || '')
  const accountId = String(query.accountId || '')
  const environment = (query.environment as AWSEnvironmentType) || 'govcloud'
  if (!/^i-[0-9a-f]{8,17}$/.test(instanceId)) return errors.badRequest(event, 'A valid instanceId is required')
  if (!accountId) return errors.badRequest(event, 'accountId is required')
  if (!['commercial', 'govcloud'].includes(environment)) return errors.badRequest(event, 'Environment must be commercial or govcloud')
  const account = await lookupAccountUnified({ accountId }) || await lookupAccountUnified({ govCloudAccountId: accountId })
  if (!account) return errors.notFound(event, 'Account not found')
  try {
    const result = await buildInstanceHealth({
      instanceId,
      account,
      environment,
      region: query.region as string | undefined,
      lookbackDays: Math.max(1, Math.min(Number(query.lookbackDays) || 30, 90)),
      limit: Math.max(1, Math.min(Number(query.limit) || 10, 25))
    })
    return sendSuccess(event, result)
  } catch (error: any) {
    if (error?.code === 'INSTANCE_NOT_FOUND') return errors.notFound(event, error.message)
    if (error?.code === 'ACCOUNT_ENVIRONMENT_MISSING') return errors.badRequest(event, error.message)
    throw error
  }
}))
