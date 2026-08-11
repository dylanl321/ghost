import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveAIUsageDateRange } from '../../server/utils/ai-usage-query'
import { toAIUsageAccountScope } from '../../server/utils/ai-usage-scope'
import { selectMantleDetailMetrics } from '../../server/utils/ai-usage-collector'
import { withAIUsageFactKeys } from '../../server/utils/ai-usage-storage'
import { emptyAIUsageMetrics } from '../../shared/types/ai-usage'

test('pairs Commercial and GovCloud accounts into one enclave scope', () => {
  const scope = toAIUsageAccountScope({
    accountId: '111111111111',
    govCloudAccountId: '222222222222',
    name: 'AI Platform',
    linesOfBusiness: 'Space',
    pepDepartment: 'DE158'
  })
  assert.equal(scope?.enclaveId, '111111111111')
  assert.deepEqual(scope?.members, [
    { environment: 'commercial', accountId: '111111111111' },
    { environment: 'govcloud', accountId: '222222222222' }
  ])
  assert.equal(scope?.department, 'DE158')
})

test('environment selection keeps only the matching member account', () => {
  const scope = toAIUsageAccountScope({
    accountId: '111111111111',
    govCloudAccountId: '222222222222'
  }, 'govcloud')
  assert.deepEqual(scope?.members, [{ environment: 'govcloud', accountId: '222222222222' }])
})

test('Mantle normalization chooses project and model dimensions without duplicate rollups', () => {
  const metrics = [
    { Namespace: 'AWS/BedrockMantle', MetricName: 'Inferences', Dimensions: [] },
    { Namespace: 'AWS/BedrockMantle', MetricName: 'Inferences', Dimensions: [{ Name: 'Model', Value: 'claude' }] },
    { Namespace: 'AWS/BedrockMantle', MetricName: 'Inferences', Dimensions: [{ Name: 'Project', Value: 'platform' }, { Name: 'Model', Value: 'claude' }] }
  ]
  const selected = selectMantleDetailMetrics(metrics)
  assert.equal(selected.length, 1)
  assert.equal(selected[0]?.Dimensions?.length, 2)
})

test('AI usage periods include the current UTC day with an exclusive end', () => {
  const range = resolveAIUsageDateRange({ period: 'last7days' }, new Date('2026-08-11T15:00:00Z'))
  assert.deepEqual(range, {
    startDate: '2026-08-05',
    endDate: '2026-08-12',
    label: 'Last 7 days'
  })
})

test('fact keys isolate environment accounts and preserve stable dimensions', () => {
  const fact = withAIUsageFactKeys({
    granularity: 'day',
    bucket: '2026-08-11',
    environment: 'govcloud',
    enclaveId: '111111111111',
    enclaveName: 'AI Platform',
    accountId: '222222222222',
    provider: 'bedrock-mantle',
    service: 'Amazon Bedrock Mantle',
    projectId: 'project-a',
    modelId: 'anthropic.claude-opus-4-7',
    region: 'us-gov-west-1',
    metrics: emptyAIUsageMetrics(),
    actualCost: 0,
    estimatedCost: 0,
    pricedTokens: 0,
    collectedAt: '2026-08-11T15:00:00Z',
    ttl: 1
  })
  assert.equal(fact.pk, 'GOVCLOUD#222222222222')
  assert.match(fact.sk, /^D#2026-08-11#bedrock-mantle#usage#us-gov-west-1/)
})
