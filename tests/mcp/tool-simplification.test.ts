import assert from 'node:assert/strict'
import test from 'node:test'
import { buildCloudTrailFilterPattern } from '../../server/utils/cloudtrail-data'
import { resolveConfigAccountScope } from '../../server/utils/aws-config-data'
import { isCentralAccount } from '../../server/mcp/guidance'
import {
  McpInputError,
  booleanValue,
  boundedInteger,
  operationalEnvironment,
  resolveAccountReference,
  resourceTypes,
  stringList
} from '../../server/mcp/tool-input'

const itAiOps = {
  name: 'it-aiops',
  accountName: 'it-aiops',
  projectName: 'it-aiops',
  accountId: '130647805848',
  awsStandardAccountID: '130647805848',
  govCloudAccountId: '519494780165',
  awsGovCloudAccountID: '519494780165'
}

test('normalizes friendly scalar tool inputs', () => {
  assert.deepEqual(stringList('RunInstances, TerminateInstances'), ['RunInstances', 'TerminateInstances'])
  assert.deepEqual(resourceTypes(['ec2', 's3']), ['AWS::EC2::Instance', 'AWS::S3::Bucket'])
  assert.equal(booleanValue('YES'), true)
  assert.equal(operationalEnvironment('Gov Cloud'), 'govcloud')
  assert.equal(boundedInteger('25', { name: 'limit', minimum: 1, maximum: 100, fallback: 10 }), 25)
})

test('returns actionable details instead of silently clamping bounded reads', () => {
  assert.throws(
    () => boundedInteger(365, { name: 'lookback_days', minimum: 1, maximum: 90, fallback: 7 }),
    (error: unknown) => error instanceof McpInputError &&
      error.code === 'OUT_OF_RANGE' &&
      error.details?.maximum === 90 &&
      error.details?.correctedExample === 90
  )
})

test('resolves punctuation-insensitive account names and either account ID', async () => {
  const accounts = [itAiOps]
  assert.equal((await resolveAccountReference('itaiops', accounts)).accountId, '130647805848')
  assert.equal((await resolveAccountReference('519494780165', accounts)).accountId, '130647805848')
})

test('Config account scope maps GovCloud IDs and never broadens an unresolved request', () => {
  const scope = resolveConfigAccountScope([itAiOps], ['519494780165'], 'govcloud')
  assert.deepEqual(scope.validAccounts, ['519494780165'])
  assert.throws(
    () => resolveConfigAccountScope([itAiOps], ['000000000000'], 'govcloud'),
    (error: unknown) => error instanceof Error && error.name === 'ACCOUNT_NOT_FOUND'
  )
  assert.throws(
    () => resolveConfigAccountScope([itAiOps], ['519494780165', '000000000000'], 'govcloud'),
    (error: unknown) => error instanceof Error && error.name === 'ACCOUNT_NOT_FOUND'
  )
})

test('builds CloudWatch JSON filters for organization CloudTrail events', () => {
  const pattern = buildCloudTrailFilterPattern({
    eventNames: ['RunInstances', 'TerminateInstances'],
    eventSources: ['ec2.amazonaws.com'],
    userIdentities: ['terraform'],
    regions: ['us-gov-east-1'],
    writeEventsOnly: true,
    errorsOnly: true
  })
  assert.match(pattern || '', /\$\.eventName = "RunInstances"/)
  assert.match(pattern || '', /\$\.eventSource = "ec2\.amazonaws\.com"/)
  assert.match(pattern || '', /\$\.userIdentity\.sessionContext\.sessionIssuer\.userName/)
  assert.match(pattern || '', /\$\.readOnly = false/)
  assert.match(pattern || '', /\$\.errorCode = \*/)
})

test('central accounts are excluded from direct-query credential guidance', () => {
  assert.equal(isCentralAccount('374673712317'), true)
  assert.equal(isCentralAccount('205950196477'), true)
  assert.equal(isCentralAccount('083876038518'), true)
  assert.equal(isCentralAccount('519494780165'), false)
})
