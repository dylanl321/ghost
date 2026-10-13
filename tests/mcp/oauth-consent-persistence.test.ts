import assert from 'node:assert/strict'
import test from 'node:test'
import { interactionPolicy } from 'oidc-provider'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import { consentSubmission } from '../../server/routes/oauth/consent/[uid].post'
import { sanitizeForDynamoDB } from '../../server/utils/dynamodb'

function storedResult(result: Record<string, unknown>) {
  const artifact = { model: 'Interaction', payload: { result } }
  return unmarshall(marshall(sanitizeForDynamoDB(artifact))).payload.result
}

function needsNativeConsent(result: unknown) {
  const check = interactionPolicy.base().get('consent')!.checks.get('native_client_prompt')!
  return check.check({
    oidc: {
      client: { applicationType: 'native' },
      params: { response_type: 'code' },
      result
    }
  } as never)
}

test('an empty approval disappears in DynamoDB and repeats native consent', async () => {
  const persisted = storedResult({ login: { accountId: 'test-user' }, consent: {} })
  assert.equal(persisted.consent, undefined)
  assert.equal(await needsNativeConsent(persisted), true)
})

test('approval of a reused grant survives storage and satisfies native consent', async () => {
  const persisted = storedResult({
    login: { accountId: 'test-user' },
    ...consentSubmission('existing-approved-grant')
  })
  assert.equal(persisted.consent.grantId, 'existing-approved-grant')
  assert.equal(await needsNativeConsent(persisted), false)
  assert.deepEqual(Object.keys(persisted.consent), ['grantId'])
})

test('a new approved grant retains the same consent result', async () => {
  const persisted = storedResult(consentSubmission('new-approved-grant'))
  assert.equal(persisted.consent.grantId, 'new-approved-grant')
  assert.equal(await needsNativeConsent(persisted), false)
})
