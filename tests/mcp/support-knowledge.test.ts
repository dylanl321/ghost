import assert from 'node:assert/strict'
import test from 'node:test'
import { getSupportKnowledgeBaseConfig } from '../../server/mcp/support-knowledge'

test('uses the configured ISGDDocs Bedrock Knowledge Base by default', () => {
  const previousEnvironment = process.env.GHOST_SUPPORT_KNOWLEDGE_BASE_ENVIRONMENT
  const previousRegion = process.env.GHOST_SUPPORT_KNOWLEDGE_BASE_REGION
  process.env.GHOST_SUPPORT_KNOWLEDGE_BASE_ENVIRONMENT = 'commercial'
  process.env.GHOST_SUPPORT_KNOWLEDGE_BASE_REGION = 'us-east-1'
  const config = getSupportKnowledgeBaseConfig()
  try {
    assert.equal(config.name, 'isgddocs-knowledge-base')
    assert.equal(config.knowledgeBaseId, 'MWEQITO53C')
    assert.equal(config.accountId, '926182194632')
    assert.equal(config.environment, 'govcloud')
    assert.equal(config.region, 'us-gov-west-1')
  } finally {
    if (previousEnvironment === undefined) delete process.env.GHOST_SUPPORT_KNOWLEDGE_BASE_ENVIRONMENT
    else process.env.GHOST_SUPPORT_KNOWLEDGE_BASE_ENVIRONMENT = previousEnvironment
    if (previousRegion === undefined) delete process.env.GHOST_SUPPORT_KNOWLEDGE_BASE_REGION
    else process.env.GHOST_SUPPORT_KNOWLEDGE_BASE_REGION = previousRegion
  }
})
