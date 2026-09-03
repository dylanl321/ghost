import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isAllowedIntegrationApiPath,
  isAllowedVmaasCostPath,
  requiresAuthentication
} from '../../server/middleware/entra-auth'

test('normal integration keys are limited to the versioned API contract', () => {
  assert.equal(isAllowedIntegrationApiPath('/api/v1/accounts'), true)
  assert.equal(isAllowedIntegrationApiPath('/api/v1/security/findings'), true)
  assert.equal(isAllowedIntegrationApiPath('/api/accounts/list'), false)
  assert.equal(isAllowedIntegrationApiPath('/api/dynamodb/table/items'), false)
})

test('dedicated VMaaS keys retain only their two read-only routes', () => {
  assert.equal(isAllowedVmaasCostPath('/api/integrations/vmaas/costs', 'GET'), true)
  assert.equal(isAllowedVmaasCostPath('/api/integrations/vmaas/instances/i-12345678/cost', 'GET'), true)
  assert.equal(isAllowedVmaasCostPath('/api/integrations/vmaas/costs', 'POST'), false)
  assert.equal(isAllowedVmaasCostPath('/api/v1/accounts', 'GET'), false)
})

test('Swagger GET, HEAD, specification, and assets require an authenticated session', () => {
  assert.equal(requiresAuthentication('/api/swagger-ui'), true)
  assert.equal(requiresAuthentication('/api/swagger-ui?download=false'), true)
  assert.equal(requiresAuthentication('/api/swagger.json'), true)
  assert.equal(requiresAuthentication('/api/swagger-assets/swagger-ui.css'), true)
  assert.equal(requiresAuthentication('/api/health'), false)
})
