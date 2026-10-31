import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import {
  isAllowedIntegrationApiPath,
  isAllowedVmaasCostPath,
  requiresAdminAccess,
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
  assert.equal(requiresAuthentication('/api/swagger-internal-ui'), true)
  assert.equal(requiresAuthentication('/api/swagger-internal.json'), true)
  assert.equal(requiresAuthentication('/api/swagger-assets/swagger-ui.css'), true)
  assert.equal(requiresAuthentication('/api/health'), false)
})

test('Kiro Crew publishing uses the normal authenticated API boundary', () => {
  assert.equal(requiresAuthentication('/api/admin/kirocrew/config'), true)
})

test('only the exact health probe path is public', () => {
  assert.equal(requiresAuthentication('/api/health'), false)
  assert.equal(requiresAuthentication('/api/health?probe=alb'), false)
  assert.equal(requiresAuthentication('/api/health/ready'), true)
  assert.equal(requiresAuthentication('/api/health/'), true)
  assert.equal(requiresAuthentication('/api/healthz'), true)
})

test('only GET of a single short code is public', () => {
  assert.equal(requiresAuthentication('/api/shortlinks/abc123', 'GET'), false)
  assert.equal(requiresAuthentication('/api/shortlinks/abc123', 'HEAD'), false)
  assert.equal(requiresAuthentication('/api/shortlinks/', 'POST'), true)
  assert.equal(requiresAuthentication('/api/shortlinks/', 'GET'), true)
  assert.equal(requiresAuthentication('/api/shortlinks', 'POST'), true)
  assert.equal(requiresAuthentication('/api/shortlinks?createdBy=x', 'GET'), true)
  assert.equal(requiresAuthentication('/api/shortlinks/abc123', 'POST'), true)
  assert.equal(requiresAuthentication('/api/shortlinks/abc123/extra', 'GET'), true)
})

test('dot segments cannot borrow a public prefix', () => {
  assert.equal(requiresAuthentication('/api/health/../admin/scheduled-reports/all'), true)
  assert.equal(requiresAuthentication('/api/_auth/../accounts/list'), true)
  assert.equal(requiresAuthentication('/api/reports/download/%2e%2e/%2e%2e/accounts/list'), true)
  assert.equal(requiresAuthentication('/api/shortlinks/..', 'GET'), true)
  assert.equal(requiresAuthentication('//api/admin/scheduled-reports/all'), true)
  assert.equal(requiresAuthentication('/api//accounts/list'), true)
})

test('every /api/admin route requires an administrator except the two shared reads', () => {
  assert.equal(requiresAdminAccess('/api/admin/scheduled-reports/run-now', 'POST'), true)
  assert.equal(requiresAdminAccess('/api/admin/stored-reports/delete', 'DELETE'), true)
  assert.equal(requiresAdminAccess('/api/admin/notifications/list?limit=100', 'GET'), true)
  assert.equal(requiresAdminAccess('/api/admin/alert-config', 'GET'), true)

  assert.equal(requiresAdminAccess('/api/admin/announcements/list', 'GET'), false)
  assert.equal(requiresAdminAccess('/api/admin/announcements/list/', 'GET'), false)
  assert.equal(requiresAdminAccess('/api/admin/dashboard-layout/get-default', 'GET'), false)
  // Writes to the same paths, and their siblings, stay admin-only.
  assert.equal(requiresAdminAccess('/api/admin/announcements/list', 'POST'), true)
  assert.equal(requiresAdminAccess('/api/admin/dashboard-layout/set-default', 'POST'), true)

  assert.equal(requiresAdminAccess('/api/accounts/list', 'GET'), false)
  assert.equal(requiresAdminAccess('/api/announcements/../admin/fix', 'POST'), true)
  assert.equal(requiresAdminAccess('//api/admin/stored-reports/list', 'GET'), true)
})

/** Convert server/api/admin/<file> into the route path and HTTP method Nitro serves it at. */
function adminRoutes(dir: string, base = '/api/admin'): Array<{ file: string, path: string, method: string }> {
  const routes: Array<{ file: string, path: string, method: string }> = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      routes.push(...adminRoutes(full, `${base}/${entry.name}`))
      continue
    }
    if (!entry.name.endsWith('.ts') || entry.name.startsWith('_')) continue
    const parts = entry.name.replace(/\.ts$/, '').split('.')
    const method = ['get', 'post', 'put', 'patch', 'delete', 'head'].includes(parts.at(-1) || '')
      ? parts.pop()!.toUpperCase()
      : 'GET'
    const name = parts.join('.').replace(/\[[^\]]+\]/g, 'x')
    const path = name === 'index' ? base : `${base}/${name}`
    routes.push({ file: full, path: path.replace(/\[[^\]]+\]/g, 'x'), method })
  }
  return routes
}

test('no admin route file is reachable by a non-administrator unless allowlisted', () => {
  const allowlisted = new Set([
    'GET /api/admin/announcements/list',
    'GET /api/admin/dashboard-layout/get-default'
  ])
  const routes = adminRoutes(join(process.cwd(), 'server/api/admin'))
  assert.ok(routes.length > 50, 'expected to discover the admin route files')

  for (const route of routes) {
    const key = `${route.method} ${route.path}`
    assert.equal(requiresAdminAccess(route.path, route.method), !allowlisted.has(key), key)
  }
})

test('the generic DynamoDB table read/write routes are gone', () => {
  assert.equal(existsSync(join(process.cwd(), 'server/api/dynamodb')), false)
  const registry = readFileSync(join(process.cwd(), 'server/generated/swagger-routes.ts'), 'utf8')
  assert.equal(registry.includes('api/dynamodb/'), false)
})

test('privileged non-admin-prefixed routes check the caller server-side', () => {
  const guarded: Record<string, RegExp> = {
    'server/api/support/execute-query.post.ts': /await requireAdmin\(event\)/,
    'server/api/support/cloudwatch-logs.get.ts': /await requireAdmin\(event\)/,
    'server/api/instances/[instanceId]/tags.put.ts': /await requireAdmin\(event\)/,
    'server/api/feedback/update.patch.ts': /await requirePermission\(event, 'admin\.issues'\)/
  }
  for (const [file, pattern] of Object.entries(guarded)) {
    assert.match(readFileSync(join(process.cwd(), file), 'utf8'), pattern, file)
  }
})
