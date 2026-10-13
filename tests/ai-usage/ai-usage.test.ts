import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canonicalAIUsageService,
  deriveAIUsageTelemetryStatus,
  resolveAIUsageDateRange
} from '../../server/utils/ai-usage-query'
import { toAIUsageAccountScope } from '../../server/utils/ai-usage-scope'
import { selectMantleDetailMetrics } from '../../server/utils/ai-usage-collector'
import { genAIObservabilityQuery, parseGenAIObservabilityRows } from '../../server/utils/ai-usage-genai-observability'
import { classifyAIUsageCollectionFailure } from '../../server/utils/ai-usage-failures'
import {
  isAIUsageTableMissing,
  withAIUsageErrorCauseKeys,
  withAIUsageCollectionMarkerKeys,
  withAIUsageFactKeys
} from '../../server/utils/ai-usage-storage'
import { summarizeAIUsageCostDriverPeriods } from '../../server/utils/ai-usage-cost-drivers'
import { aiUsageErrorRate, emptyAIUsageMetrics } from '../../shared/types/ai-usage'

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

test('GenAI observability parsing retains only allowlisted error metadata', () => {
  const rows = [[
    { field: '@timestamp', value: '2026-08-12T12:00:00.000Z' },
    { field: 'pointer', value: 'pointer-1' },
    { field: 'errorCode', value: 'ThrottlingException' },
    { field: 'modelId', value: 'example.model' },
    { field: 'operation', value: 'InvokeModel' },
    { field: 'accountId', value: '111111111111' },
    { field: 'region', value: 'us-east-1' },
    { field: 'requestId', value: 'request-1' },
    { field: 'inputBodyJson', value: '{"prompt":"must never persist"}' },
    { field: 'outputBodyJson', value: '{"completion":"must never persist"}' }
  ]]
  const parsed = parseGenAIObservabilityRows(rows)
  assert.deepEqual(parsed, [{
    timestamp: '2026-08-12T12:00:00.000Z',
    pointer: 'pointer-1',
    errorCode: 'ThrottlingException',
    modelId: 'example.model',
    operation: 'InvokeModel',
    accountId: '111111111111',
    region: 'us-east-1',
    requestId: 'request-1'
  }])
  assert.doesNotMatch(genAIObservabilityQuery(), /inputBodyJson|outputBodyJson/)
})

test('GenAI causes use source-qualified keys', () => {
  const cause = withAIUsageErrorCauseKeys({
    recordType: 'error-cause',
    eventId: 'request-1',
    environment: 'commercial',
    enclaveId: '111111111111',
    enclaveName: 'AI Platform',
    accountId: '111111111111',
    region: 'us-east-1',
    source: 'cloudwatch-genai',
    operation: 'InvokeModel',
    errorCode: 'ThrottlingException',
    timestamp: '2026-08-12T12:00:00.000Z',
    ttl: 1
  })
  assert.equal(cause.sk, 'E#2026-08-12T12:00:00.000Z#cloudwatch-genai#request-1')

  const runtimeCause = withAIUsageErrorCauseKeys({ ...cause, source: 'bedrock-runtime' })
  assert.equal(runtimeCause.sk, 'E#2026-08-12T12:00:00.000Z#request-1')
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

test('only missing-table errors are treated as an empty undeployed data source', () => {
  assert.equal(isAIUsageTableMissing({ name: 'ResourceNotFoundException' }), true)
  assert.equal(isAIUsageTableMissing(new Error('Requested resource not found')), true)
  assert.equal(isAIUsageTableMissing(new Error('Access denied')), false)
})

test('collection markers persist successful zero-activity account-region targets', () => {
  const marker = withAIUsageCollectionMarkerKeys({
    recordType: 'collection-marker',
    bucket: '2026-08-11',
    environment: 'commercial',
    enclaveId: '111111111111',
    enclaveName: 'Zero Usage',
    accountId: '111111111111',
    region: 'us-east-1',
    status: 'complete',
    collectedAt: '2026-08-11T15:00:00Z',
    ttl: 1
  })
  assert.equal(marker.pk, 'COMMERCIAL#111111111111')
  assert.equal(marker.sk, 'M#2026-08-11#us-east-1')
})

test('telemetry states distinguish zero usage, partial, unavailable, and cost-only data', () => {
  assert.equal(deriveAIUsageTelemetryStatus({ telemetryCapable: true, hasTelemetryFacts: false, hasCostFacts: false, targets: 2, targetsCollected: 2 }), 'complete')
  assert.equal(deriveAIUsageTelemetryStatus({ telemetryCapable: true, hasTelemetryFacts: true, hasCostFacts: false, targets: 2, targetsCollected: 1 }), 'partial')
  assert.equal(deriveAIUsageTelemetryStatus({ telemetryCapable: true, hasTelemetryFacts: false, hasCostFacts: false, targets: 2, targetsCollected: 0 }), 'unavailable')
  assert.equal(deriveAIUsageTelemetryStatus({ telemetryCapable: false, hasTelemetryFacts: false, hasCostFacts: true, targets: 0, targetsCollected: 0 }), 'cost-only')
})

test('Bedrock billing has one parent service while Runtime and Mantle remain sources', () => {
  assert.equal(canonicalAIUsageService('Amazon Bedrock Runtime', 'bedrock-runtime'), 'Amazon Bedrock')
  assert.equal(canonicalAIUsageService('Amazon Bedrock Mantle', 'bedrock-mantle'), 'Amazon Bedrock')
  assert.equal(canonicalAIUsageService('Amazon Bedrock Service', 'bedrock-cost'), 'Amazon Bedrock')
})

test('Capstone SageMaker cost remains cost-only with actionable driver totals', () => {
  const summary = summarizeAIUsageCostDriverPeriods([{
    Groups: [{
      Keys: ['USE1-Hosting:ml.g5.2xlarge', 'RunInstance'],
      Metrics: { UnblendedCost: { Amount: '2030', Unit: 'USD' } }
    }]
  }])
  assert.equal(summary.groupedCost, 2030)
  assert.equal(summary.usageTypes[0]?.cost, 2030)
  assert.equal(deriveAIUsageTelemetryStatus({ telemetryCapable: false, hasTelemetryFacts: false, hasCostFacts: true, targets: 0, targetsCollected: 0 }), 'cost-only')
})

test('error rate includes client, server, and throttle failures in attempts', () => {
  const metrics = { ...emptyAIUsageMetrics(), invocations: 90, clientErrors: 4, serverErrors: 3, throttles: 3 }
  assert.equal(aiUsageErrorRate(metrics), 10)
})

test('DynamoDB-only accounts retain cost scope but are excluded from telemetry targets', () => {
  const scope = toAIUsageAccountScope({
    accountId: '111111111111',
    name: 'Historical account',
    source: 'dynamodb'
  })
  assert.equal(scope?.telemetryEligible, false)
  assert.equal(scope?.members.length, 1)
})

test('collector failures provide actionable categories', () => {
  const failure = classifyAIUsageCollectionFailure('AccessDenied for cloudwatch:ListMetrics')
  assert.equal(failure.category, 'CloudWatch permission')
  assert.match(failure.remediation, /ListMetrics/)

  const missingLogging = classifyAIUsageCollectionFailure('Bedrock model invocation logging is not configured to send events to CloudWatch Logs.')
  assert.equal(missingLogging.category, 'GenAI observability configuration')
  assert.match(missingLogging.remediation, /Enable Bedrock model invocation logging/)
})
