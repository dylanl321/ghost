import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  DynamoGrantRevocationMarkerStore,
  type OAuthGrantRevocationMarker
} from '../../server/mcp/oauth/admin/grant-revocation-service'
import type { OAuthDeploymentContext } from '../../shared/types/oauth-administration'

const deployment: OAuthDeploymentContext = {
  deploymentId: 'test-deployment',
  environment: 'development',
  executionMode: 'test',
  partition: 'govcloud',
  provenance: 'effective'
}
const config = () => ({ tableName: 'test-admin-table', environment: 'govcloud' as const })

function storage() {
  const rows = new Map<string, Record<string, any>>()
  const schema = readFileSync(new URL('../../terraform/oauth-administration.tf', import.meta.url), 'utf8')
  const hash = schema.match(/hash_key\s*=\s*"([^"]+)"/)![1]!
  const range = schema.match(/range_key\s*=\s*"([^"]+)"/)![1]!
  function key(item: Record<string, any>) {
    assert.equal(typeof item[hash], 'string', 'Hash key must match deployed Terraform schema')
    assert.equal(typeof item[range], 'string', 'Range key must match deployed Terraform schema')
    return JSON.stringify([item[hash], item[range]])
  }
  return {
    rows,
    async putItem(_table: string, item: Record<string, any>) { rows.set(key(item), structuredClone(item)); return item },
    async getItem(_table: string, item: Record<string, any>) { return rows.get(key(item)) || null }
  }
}

test('an unmarked grant uses the deployed table keys and is not revoked', async () => {
  const store = new DynamoGrantRevocationMarkerStore(config, storage(), deployment)
  assert.equal(await store.isMarked('active-grant'), false)
})

test('a revoked grant stays rejected after a new process reads its marker', async () => {
  const backend = storage()
  const marker: OAuthGrantRevocationMarker = {
    grantReference: 'revoked-grant',
    markedAt: '2026-09-17T12:00:00.000Z',
    markedBy: 'test-admin',
    operationId: 'test-operation'
  }
  await new DynamoGrantRevocationMarkerStore(config, backend, deployment).put(marker)
  const restarted = new DynamoGrantRevocationMarkerStore(config, backend, deployment)
  assert.equal(await restarted.isMarked('revoked-grant'), true)
  assert.equal(await restarted.isMarked('other-grant'), false)
  assert.equal(await new DynamoGrantRevocationMarkerStore(config, backend, {
    ...deployment, deploymentId: 'other-deployment'
  }).isMarked('revoked-grant'), false)
  assert.equal([...backend.rows.values()][0]!.PK, 'ENV#test-deployment#grants#REVOCATION')
})

test('storage errors still propagate instead of bypassing revocation enforcement', async () => {
  const backend = storage()
  backend.getItem = async () => { throw new Error('storage unavailable') }
  const store = new DynamoGrantRevocationMarkerStore(config, backend, deployment)
  await assert.rejects(() => Promise.resolve(store.isMarked('grant')), /storage unavailable/)
})
