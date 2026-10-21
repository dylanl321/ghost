import assert from 'node:assert/strict'
import test from 'node:test'
import { BEDROCK_COMPLETION_EVENT, buildBedrockCompletionLog } from '../../server/utils/bedrock-logging'

test('completion record carries the stable event name plus model/timing/token fields', () => {
  const record = buildBedrockCompletionLog({
    requestedModel: 'claude-sonnet',
    actualModel: 'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
    processingTimeMs: 1234,
    inputTokens: 100,
    outputTokens: 250
  })

  assert.equal(record.event, BEDROCK_COMPLETION_EVENT)
  assert.equal(record.requestedModel, 'claude-sonnet')
  assert.equal(record.model, 'us.anthropic.claude-3-5-sonnet-20241022-v2:0')
  assert.equal(record.processingTimeMs, 1234)
  assert.equal(record.inputTokens, 100)
  assert.equal(record.outputTokens, 250)
})

test('completion record exposes only safe, non-sensitive fields', () => {
  const record = buildBedrockCompletionLog({
    requestedModel: 'nova-pro',
    actualModel: 'amazon.nova-pro-v1:0',
    processingTimeMs: 5
  })

  // Exactly the allow-listed keys — no prompt, generated content, credentials,
  // or user data can ride along, even as the record evolves.
  assert.deepEqual(Object.keys(record).sort(), [
    'event',
    'inputTokens',
    'model',
    'outputTokens',
    'processingTimeMs',
    'requestedModel'
  ])

  // Missing token counts stay undefined rather than fabricating a value.
  assert.equal(record.inputTokens, undefined)
  assert.equal(record.outputTokens, undefined)

  // Nothing in the serialized record leaks a prompt/content-shaped field.
  const serialized = JSON.stringify(record).toLowerCase()
  for (const forbidden of ['prompt', 'content', 'credential', 'secret', 'accesskey']) {
    assert.ok(!serialized.includes(forbidden), `record must not contain "${forbidden}"`)
  }
})
