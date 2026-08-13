import assert from 'node:assert/strict'
import test from 'node:test'
import { getSupportKnowledgeBaseConfig } from '../../server/mcp/support-knowledge'

test('uses the configured ISGDDocs Bedrock Knowledge Base by default', () => {
  const config = getSupportKnowledgeBaseConfig()
  assert.equal(config.name, 'isgddocs-knowledge-base')
  assert.equal(config.knowledgeBaseId, 'MWEQITO53C')
  assert.equal(config.accountId, '926182194632')
  assert.equal(config.environment, 'govcloud')
  assert.equal(config.region, 'us-gov-west-1')
})
