import assert from 'node:assert/strict'
import test from 'node:test'
import { bedrockEnvironment, isModelUnavailableError } from '../../server/utils/bedrock-client'

test('Only model availability errors move on to the next fallback model', () => {
  assert.equal(isModelUnavailableError({ name: 'ResourceNotFoundException', message: 'Model not found' }), true)
  assert.equal(isModelUnavailableError({ name: 'ValidationException', message: 'The provided model identifier is invalid.' }), true)
  assert.equal(isModelUnavailableError({
    name: 'ValidationException',
    message: "Invocation of model ID x with on-demand throughput isn't supported. Retry your request with the ID or ARN of an inference profile"
  }), true)
  assert.equal(isModelUnavailableError({ name: 'ValidationException', message: 'prompt is too long: 250000 tokens > 200000 maximum' }), false)
  assert.equal(isModelUnavailableError({ name: 'ValidationException', message: 'temperature: range: 0..1' }), false)
  assert.equal(isModelUnavailableError({ name: 'ThrottlingException', message: 'Too many requests' }), false)
})

test('Bedrock environment defaults to commercial and only switches on govcloud', () => {
  const previous = process.env.BEDROCK_ENVIRONMENT
  try {
    delete process.env.BEDROCK_ENVIRONMENT
    assert.equal(bedrockEnvironment(), 'commercial')
    process.env.BEDROCK_ENVIRONMENT = 'govcloud'
    assert.equal(bedrockEnvironment(), 'govcloud')
    process.env.BEDROCK_ENVIRONMENT = 'GovCloud'
    assert.equal(bedrockEnvironment(), 'commercial')
  } finally {
    if (previous === undefined) delete process.env.BEDROCK_ENVIRONMENT
    else process.env.BEDROCK_ENVIRONMENT = previous
  }
})
