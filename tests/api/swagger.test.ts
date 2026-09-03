import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getInternalOpenApiSpec,
  getOpenApiSpec,
  registerEndpoint,
  supportedV1Paths
} from '../../server/plugins/swagger'
import { documentedRouteCount } from '../../server/generated/swagger-routes'
import '../../server/api/v1/accounts/index.get'
import '../../server/api/v1/accounts/[identifier].get'
import '../../server/api/v1/costs/summary.get'
import '../../server/api/v1/forecasts/aws.get'
import '../../server/api/v1/forecasts/financial.get'
import '../../server/api/v1/organization.get'
import '../../server/api/v1/security/findings.get'
import '../../server/api/v1/security/inspector/findings.get'
import '../../server/api/v1/security/summary.get'

test('generated registry includes direct and helper-registered route modules', () => {
  assert.ok(documentedRouteCount >= 150, 'generated registry must contain every documented route module')
})

test('OpenAPI output is deterministic and supplies operation IDs and path parameters', () => {
  registerEndpoint('/api/test/{identifier}', 'GET', {
    summary: 'Test endpoint',
    responses: { 200: { description: 'OK' } }
  })
  registerEndpoint('/api/another', 'GET', {
    summary: 'Another endpoint',
    responses: { 200: { description: 'OK' } }
  })

  const first = getInternalOpenApiSpec()
  const second = getInternalOpenApiSpec()
  assert.deepEqual(first, second)

  const operation = first.paths['/api/test/{identifier}'].get
  assert.equal(operation.operationId, 'get_test_identifier')
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

test('primary OpenAPI contains exactly the nine supported v1 paths', () => {
  const spec: any = getOpenApiSpec()
  assert.deepEqual(Object.keys(spec.paths).sort(), [...supportedV1Paths].sort())
  assert.equal(Object.keys(spec.paths).length, 9)
  assert.ok(Object.keys(spec.paths).every(path => path.startsWith('/api/v1/')))
  assert.deepEqual(spec.tags.map((tag: any) => tag.name), ['Accounts', 'Costs', 'Forecasts', 'Security'])

  const internal: any = getInternalOpenApiSpec()
  assert.ok(Object.keys(internal.paths).length > 0)
  assert.ok(Object.keys(internal.paths).every(path => !path.startsWith('/api/v1/')))
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

  const operationIds = Object.values(spec.paths)
    .flatMap((path: any) => Object.values(path))
    .map((operation: any) => operation.operationId)
  assert.equal(new Set(operationIds).size, operationIds.length)
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
