import assert from 'node:assert/strict'
import test from 'node:test'
import { buildDistributionGroupFilter, buildGroupFilter, odataString } from '../../server/utils/entra/config'

test('OData string literals double embedded quotes', () => {
  assert.equal(odataString("o'brien"), "'o''brien'")
  assert.equal(odataString("x') or true or ('"), "'x'') or true or ('''")
})

test('group filters quote the account id and distribution name', () => {
  assert.match(buildGroupFilter("1') or ('1"), /'AWS-1''\) or \(''1_'/)
  assert.equal(buildDistributionGroupFilter("team's"), "displayName eq 'team''s.aws'")
})
