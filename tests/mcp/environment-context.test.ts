import assert from 'node:assert/strict'
import test from 'node:test'
import { ghostEnvironmentContext, ghostMcpInstructions } from '../../server/mcp/environment-context'

test('GHOST MCP context is GovCloud-first with explicit Commercial exceptions', () => {
  assert.equal(ghostEnvironmentContext.defaultEnvironment, 'govcloud')
  assert.equal(ghostEnvironmentContext.environments.govcloud.primaryRegion, 'us-gov-west-1')
  assert.ok(ghostEnvironmentContext.environments.commercial.useFor.includes('Cost Explorer'))
  assert.equal(ghostEnvironmentContext.knowledgeRouting.officialDocumentationTool, 'ghost.docs.search')
  assert.match(ghostMcpInstructions, /GovCloud-first/)
  assert.match(ghostMcpInstructions, /user IDC device authorization only/)
  assert.match(ghostMcpInstructions, /MUST call ghost\.docs\.search/)
})
