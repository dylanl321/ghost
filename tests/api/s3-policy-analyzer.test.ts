import assert from 'node:assert/strict'
import test from 'node:test'

import { analyzeBucketPolicy } from '../../server/utils/s3-policy-analyzer'

const OWNER = '111111111111'

test('a wildcard action granted to everyone is public read and write', () => {
  const analysis = analyzeBucketPolicy('b', {
    Version: '2012-10-17',
    Statement: [{ Effect: 'Allow', Principal: '*', Action: '*', Resource: 'arn:aws:s3:::b/*' }]
  }, OWNER)
  assert.equal(analysis.isPublic, true)
  assert.equal(analysis.publicAccess.allowsPublicRead, true)
  assert.equal(analysis.publicAccess.allowsPublicWrite, true)
})

test('prefix wildcards such as s3:Get* count as read access', () => {
  const analysis = analyzeBucketPolicy('b', {
    Version: '2012-10-17',
    Statement: { Effect: 'Allow', Principal: { AWS: '*' }, Action: 's3:Get*', Resource: 'arn:aws:s3:::b/*' }
  }, OWNER)
  assert.equal(analysis.publicAccess.allowsPublicRead, true)
  assert.equal(analysis.publicAccess.allowsPublicWrite, false)
})

test('NotAction on an Allow grants everything it does not list', () => {
  const analysis = analyzeBucketPolicy('b', {
    Version: '2012-10-17',
    Statement: [{ Effect: 'Allow', Principal: '*', NotAction: 's3:DeleteObject', Resource: '*' }]
  }, OWNER)
  assert.equal(analysis.publicAccess.allowsPublicRead, true)
  assert.equal(analysis.publicAccess.allowsPublicWrite, true)
})

test('a conditioned wildcard principal is flagged for review, not as public', () => {
  const analysis = analyzeBucketPolicy('b', {
    Version: '2012-10-17',
    Statement: [{
      Effect: 'Allow', Principal: '*', Action: 's3:GetObject', Resource: 'arn:aws:s3:::b/*',
      Condition: { StringEquals: { 'aws:PrincipalOrgID': 'o-abc' } }
    }]
  }, OWNER)
  assert.equal(analysis.isPublic, false)
  assert.equal(analysis.risks[0]?.severity, 'medium')
})

test('bare account IDs and role ARNs count as cross-account principals', () => {
  const analysis = analyzeBucketPolicy('b', {
    Version: '2012-10-17',
    Statement: [{
      Effect: 'Allow',
      Principal: { AWS: ['222222222222', 'arn:aws-us-gov:iam::333333333333:role/reader', `arn:aws:iam::${OWNER}:root`] },
      Action: 's3:GetObject',
      Resource: 'arn:aws:s3:::b/*'
    }]
  }, OWNER)
  assert.deepEqual(analysis.crossAccountPrincipals.sort(), ['222222222222', '333333333333'])
  assert.ok(analysis.risks.every(risk => risk.severity === 'medium'))
})
