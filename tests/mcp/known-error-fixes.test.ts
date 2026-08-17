import assert from 'node:assert/strict'
import test from 'node:test'
import { pipelineIdPredicate } from '../../server/utils/athena-pipeline-queries'
import { buildConfigResourceNamePredicate } from '../../server/utils/aws-config-data'
import { StrandsClientError } from '../../server/utils/strands-client'

test('pipeline predicates tolerate numeric and varchar telemetry schemas', () => {
  assert.equal(pipelineIdPredicate('pipeline_id', '3046499'), "CAST(pipeline_id AS varchar) = '3046499'")
  assert.equal(pipelineIdPredicate('plan_pipeline_id', '3046499'), "CAST(plan_pipeline_id AS varchar) = '3046499'")
  assert.throws(() => pipelineIdPredicate('pipeline_id', '3046499 OR 1=1'), /only digits/)
})

test('AWS Config resource names use supported prefix matching', () => {
  assert.equal(buildConfigResourceNamePredicate('golden'), "resourceName LIKE 'golden%'")
  assert.equal(buildConfigResourceNamePredicate("O'Hare"), "resourceName LIKE 'O''Hare%'")
  assert.equal(buildConfigResourceNamePredicate('ab'), "resourceName = 'ab'")
  assert.throws(() => buildConfigResourceNamePredicate('%%%'), /non-wildcard/)
})

test('Strands service failures retain specific retryability', () => {
  assert.equal(new StrandsClientError('Unavailable', 'HTTP_503', 503).retryable, true)
  assert.equal(new StrandsClientError('Invalid request', 'HTTP_400', 400).retryable, false)
  assert.equal(new StrandsClientError('Timed out', 'REQUEST_TIMEOUT').retryable, true)
})
