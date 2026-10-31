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
import '../../server/api/v1/costs/tags.get'
import '../../server/api/v1/costs/tag-keys.get'
import '../../server/api/v1/forecasts/aws.get'
import '../../server/api/v1/forecasts/financial.get'
import '../../server/api/v1/organization.get'
import '../../server/api/v1/security/findings.get'
import '../../server/api/v1/security/inspector/findings.get'
import '../../server/api/v1/security/summary.get'

test('generated registry includes direct and helper-registered route modules', () => {
  // The audit removed 15 unused documented routes (162 -> 147); this floor only
  // catches a generator that misses helper-registered modules wholesale.
  assert.ok(documentedRouteCount >= 140, 'generated registry must contain every documented route module')
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

test('primary OpenAPI contains exactly the supported v1 paths', () => {
  const spec: any = getOpenApiSpec()
  assert.deepEqual(Object.keys(spec.paths).sort(), [...supportedV1Paths].sort())
  assert.equal(Object.keys(spec.paths).length, 11)
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
    '/api/v1/costs/tags',
    '/api/v1/costs/tag-keys',
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

test('cost APIs document tag discovery, normalized cost data, and page-compatible options', () => {
  const spec = getOpenApiSpec()
  const analysis = spec.paths['/api/v1/costs/tags'].get
  const discovery = spec.paths['/api/v1/costs/tag-keys'].get
  const summary = spec.paths['/api/v1/costs/summary'].get
  const names = (operation: any): Map<string, any> =>
    new Map(operation.parameters.map((item: any) => [item.name, item]))
  const parameters = names(analysis)
  for (const name of ['tagKey', 'period', 'startDate', 'endDate', 'includeValues', 'includeAccounts', 'valueGroupKey', 'proforma']) {
    assert.ok(parameters.has(name), `Tag costs must document ${name}`)
  }
  assert.equal(parameters.get('tagKey').required, true)
  assert.equal(parameters.get('includeValues').schema.default, true)
  assert.equal(parameters.get('includeAccounts').schema.default, true)
  assert.match(parameters.get('endDate').description, /exclusive/i)
  assert.match(parameters.get('proforma').description, /estimates/i)
  assert.equal(names(discovery).get('tagKey').required, false)
  assert.ok(names(summary).has('period'))
  assert.ok(names(summary).has('tagFilterValues'))

  const data = analysis.responses[200].content['application/json'].schema.properties.data
  for (const field of ['values', 'accounts', 'signedTotalCost', 'totalTaggedCost', 'totalUntaggedCost', 'overallCoverage', 'proformaEstimation']) {
    assert.ok(data.properties[field], `Tag costs must document ${field}`)
  }
  for (const operation of [analysis, discovery]) {
    assert.deepEqual(operation.security, [{ ApiKeyAuth: [] }, { OIDCAuth: [] }])
  }

  // Aliases must not change the browser endpoint's default coverage-only payload.
  const internal = getInternalOpenApiSpec().paths['/api/costs/tag-coverage'].get
  assert.equal(names(internal).get('includeValues').schema.default, false)
})

test('security v1 operations expose complete cursor metadata, filters, defaults, and examples', () => {
  const spec: any = getOpenApiSpec()
  const hub = spec.paths['/api/v1/security/findings'].get
  const inspector = spec.paths['/api/v1/security/inspector/findings'].get
  const summary = spec.paths['/api/v1/security/summary'].get
  const names = (operation: any): Map<string, any> =>
    new Map(operation.parameters.map((item: any) => [item.name, item]))

  const hubParameters = names(hub)
  for (const name of ['cursor', 'limit', 'sortBy', 'sortOrder', 'startDate', 'endDate', 'lookbackDays', 'recordState', 'workflowStatus', 'resourceTypes', 'findingTypes', 'controls', 'complianceStandards', 'complianceStatus', 'format']) {
    assert.ok(hubParameters.has(name), `Security Hub must document ${name}`)
  }
  for (const removed of ['page', 'region', 'status', 'activeOnly', 'resourceId', 'instanceIds']) {
    assert.equal(hubParameters.has(removed), false, `Security Hub must not expose legacy ${removed}`)
  }
  assert.equal(hubParameters.get('limit').schema.default, 100)
  assert.equal(hubParameters.get('format').schema.default, 'normalized')
  assert.ok(hub.responses[200].content['application/json'].examples.rawAsff)
  assert.ok(hub.responses[200].content['application/json'].examples.nextCursor)

  const inspectorParameters = names(inspector)
  for (const name of ['status', 'findingTypes', 'resourceTypes', 'vulnerabilityIds', 'relatedVulnerabilityIds', 'packageNames', 'repositoryNames', 'imageDigests', 'fixAvailable', 'exploitAvailable', 'minInspectorScore', 'maxInspectorScore', 'title']) {
    assert.ok(inspectorParameters.has(name), `Inspector must document ${name}`)
  }
  for (const removed of ['page', 'region', 'instanceIds', 'cveIds']) {
    assert.equal(inspectorParameters.has(removed), false, `Inspector must not expose legacy ${removed}`)
  }
  assert.match(inspector.description, /At least one of accountIdentifiers, adminOf, or ownedBy is required/)
  assert.ok(inspector.responses[200].content['application/json'].examples.historicalClosed)
  assert.match(summary.responses[200].description, /source, asOf, totalIsExact, and truncated/)

  const pagination = spec.components.schemas.PaginationInfo
  assert.deepEqual(pagination.required, ['limit', 'returned', 'hasMore', 'nextCursor', 'total', 'totalIsExact'])
  assert.equal(pagination.properties.total.nullable, true)
  assert.ok(spec.components.schemas.NormalizedSecurityHubFinding)
  assert.ok(spec.components.schemas.NormalizedInspectorFinding)
  assert.ok(spec.components.schemas.SecurityAccountError)
  assert.ok(hub.responses[200].content['application/json'].examples.missingGovCloudAccount)
})
