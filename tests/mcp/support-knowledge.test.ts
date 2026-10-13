import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getSupportKnowledgeBaseConfig,
  resolveSupportKnowledgeBaseModelArn
} from '../../server/mcp/support-knowledge'

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

test('uses an explicitly configured support knowledge model ARN', () => {
  const config = getSupportKnowledgeBaseConfig()
  const configuredArn = 'arn:aws-us-gov:bedrock:us-gov-west-1:926182194632:inference-profile/custom-profile'

  assert.equal(resolveSupportKnowledgeBaseModelArn(config, ` ${configuredArn} `), configuredArn)
})

test('derives the GovCloud inference-profile ARN from the approved Bedrock model ID', () => {
  const config = getSupportKnowledgeBaseConfig()

  assert.equal(
    resolveSupportKnowledgeBaseModelArn(config, '', 'us-gov.anthropic.claude-sonnet-4-5-20250929-v1:0'),
    'arn:aws-us-gov:bedrock:us-gov-west-1:926182194632:inference-profile/us-gov.anthropic.claude-sonnet-4-5-20250929-v1:0'
  )
})

test('derives a foundation-model ARN for a direct model ID', () => {
  const config = getSupportKnowledgeBaseConfig()

  assert.equal(
    resolveSupportKnowledgeBaseModelArn(config, '', 'anthropic.claude-3-5-sonnet-20240620-v1:0'),
    'arn:aws-us-gov:bedrock:us-gov-west-1::foundation-model/anthropic.claude-3-5-sonnet-20240620-v1:0'
  )
})
