import assert from 'node:assert/strict'
import test from 'node:test'

import { buildAssumeRoleArn } from '../../server/lib/aws-client-factory'
import { buildFindingsSource } from '../../server/utils/security-hub-athena'

test('uses the configured path for the GovCloud organizations master role', () => {
  process.env.AWS_GOVCLOUD_ORGANIZATIONS_ACCOUNT_ID = '374673712317'
  process.env.AWS_GOVCLOUD_ORGANIZATIONS_ROLE_PATH = '/GD/'

  assert.equal(
    buildAssumeRoleArn('govcloud', '374673712317', 'GDMSOrganizationsRole'),
    'arn:aws-us-gov:iam::374673712317:role/GD/GDMSOrganizationsRole',
  )
})

test('keeps member-account roles at the IAM root', () => {
  process.env.AWS_GOVCLOUD_ORGANIZATIONS_ACCOUNT_ID = '374673712317'
  process.env.AWS_GOVCLOUD_ORGANIZATIONS_ROLE_PATH = 'GD'

  assert.equal(
    buildAssumeRoleArn('govcloud', '607587758758', 'GDMSOrganizationsRole'),
    'arn:aws-us-gov:iam::607587758758:role/GDMSOrganizationsRole',
  )
})

test('builds Security Athena sources from the live parquet table', () => {
  assert.match(buildFindingsSource('all'), /security_hub\.parquet_findings/)
  assert.doesNotMatch(buildFindingsSource('all'), /WHERE/)
  assert.match(buildFindingsSource('platform'), /productname IN \('Security Hub', 'Inspector'\)/)
  assert.match(buildFindingsSource('os'), /productname LIKE 'Inspector CIS Benchmark%'/)
})
