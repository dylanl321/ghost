import assert from 'node:assert/strict'
import test from 'node:test'
import { getOpenApiSpec, registerEndpoint } from '../../server/plugins/swagger'
import '../../server/api/v1/accounts/index.get'
import '../../server/api/v1/accounts/[identifier].get'
import '../../server/api/v1/costs/summary.get'
import '../../server/api/v1/forecasts/aws.get'
import '../../server/api/v1/forecasts/financial.get'
import '../../server/api/v1/organization.get'
import '../../server/api/v1/security/findings.get'
import '../../server/api/v1/security/inspector/findings.get'
import '../../server/api/v1/security/summary.get'

test('OpenAPI output is deterministic and supplies operation IDs and path parameters', () => {
  registerEndpoint('/api/v1/test/{identifier}', 'GET', {
    summary: 'Test endpoint',
    responses: { 200: { description: 'OK' } }
  })
  registerEndpoint('/api/v1/another', 'GET', {
    summary: 'Another endpoint',
    responses: { 200: { description: 'OK' } }
  })

  const first = getOpenApiSpec()
  const second = getOpenApiSpec()
  assert.deepEqual(first, second)

  const operation = first.paths['/api/v1/test/{identifier}'].get
  assert.equal(operation.operationId, 'get_v1_test_identifier')
  assert.ok(operation.parameters.some((parameter: any) =>
    parameter.name === 'identifier' && parameter.in === 'path' && parameter.required === true
  ))

  const operationIds = Object.values(first.paths)
    .flatMap((path: any) => Object.values(path))
    .map((item: any) => item.operationId)
  assert.equal(new Set(operationIds).size, operationIds.length)
  assert.deepEqual(
    Object.keys(first.paths),
    [...Object.keys(first.paths)].sort((left, right) => left.localeCompare(right))
  )
})

test('OpenAPI component references resolve', () => {
  const spec: any = getOpenApiSpec()
  const serialized = JSON.stringify(spec)
  const references = [...serialized.matchAll(/"#\/components\/(schemas|parameters)\/([^"]+)"/g)]
  for (const [, group, name] of references) {
    assert.ok(spec.components[group!][name!], `missing #/components/${group}/${name}`)
  }
  for (const path of Object.values(spec.paths) as any[]) {
    for (const operation of Object.values(path) as any[]) {
      for (const requirement of operation.security || []) {
        for (const scheme of Object.keys(requirement)) {
          assert.ok(spec.components.securitySchemes[scheme], `missing security scheme ${scheme}`)
        }
      }
    }
  }
})

test('every account-scoped v1 operation documents canonical account selectors', () => {
  const spec: any = getOpenApiSpec()
  const accountScopedPaths = [
    '/api/v1/accounts',
    '/api/v1/costs/summary',
    '/api/v1/forecasts/aws',
    '/api/v1/forecasts/financial',
    '/api/v1/organization',
    '/api/v1/security/summary',
    '/api/v1/security/findings',
    '/api/v1/security/inspector/findings'
  ]
  for (const path of accountScopedPaths) {
    const names = new Set(spec.paths[path].get.parameters?.map((parameter: any) => parameter.name))
    assert.ok(names.has('accountIdentifiers'), `${path} must support accountIdentifiers`)
    assert.ok(names.has('adminOf'), `${path} must support adminOf`)
    assert.ok(names.has('ownedBy'), `${path} must support ownedBy`)
  }
})
