import assert from 'node:assert/strict'
import test from 'node:test'
import { buildConfigSearchQuery, configTagsToRecord, parseConfigQueryRow } from '../../server/utils/config-service'
import { parseModelJson } from '../../server/utils/bedrock-client'

test('Config search query uses trailing wildcards only and escapes quotes', () => {
  const sql = buildConfigSearchQuery(["payment", "o'hare", 'ab', '%%'], 'AWS::EC2::Instance')!
  assert.ok(!sql.includes("'%"), 'no leading wildcard')
  assert.match(sql, /resourceName LIKE 'payment%'/)
  assert.match(sql, /tags\.value LIKE 'o''hare%'/)
  assert.ok(!sql.includes("'ab"), 'terms under three characters are dropped')
  assert.equal(buildConfigSearchQuery(['ab', '_%']), null)
})

test('Config search query ignores a resource type that is not an AWS type name', () => {
  const sql = buildConfigSearchQuery(['webapp'], "AWS::EC2::Instance' OR 1=1 --")!
  assert.match(sql, /resourceType = 'AWS::EC2::Instance' AND/)
})

test('Config rows and tags parse from strings or objects', () => {
  const row = parseConfigQueryRow(JSON.stringify({
    resourceId: 'i-1',
    configuration: JSON.stringify({ instanceType: 't3.micro' }),
    tags: [{ key: 'Name', value: 'web' }]
  }))
  assert.equal(row.configuration.instanceType, 't3.micro')
  assert.deepEqual(configTagsToRecord(row.tags), { Name: 'web' })
  assert.deepEqual(configTagsToRecord({ Env: 'prod' }), { Env: 'prod' })
  assert.deepEqual(configTagsToRecord(null), {})
})

test('model JSON parses fenced and prefixed answers', () => {
  assert.deepEqual(parseModelJson('```json\n{"a":1}\n```'), { a: 1 })
  assert.deepEqual(parseModelJson('Here you go:\n[{"a":1}]'), [{ a: 1 }])
  assert.throws(() => parseModelJson('No response generated'))
})
