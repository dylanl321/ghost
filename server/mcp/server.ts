import {
  McpServer,
  ResourceTemplate,
  createMcpHandler,
  createRequestStateCodec,
  type AuthInfo,
  type McpRequestContext
} from '@modelcontextprotocol/server'
import * as z from 'zod-v4'
import { findAccountByIdentifierOptimized } from '../utils/account-lookup-optimized'
import { getAllAccountsUnified } from '../utils/accounts-consolidated'
import { resolveAccountReference } from './tool-input'
import { getDatasetExportJob } from '../utils/dataset-export-jobs'
import { getUserPreferences } from '../utils/user-preferences'
import { getRequestStateKey } from './config'
import { ghostEnvironmentContext, ghostMcpInstructions } from './environment-context'
import { getMcpPrincipal } from './policy'
import { registerCatalogTools } from './tools/catalog'
import { prepareMcpDiagnosticFailure, recordMcpAudit } from './audit'
import { ghostMcpCatalog } from '../../shared/mcp/catalog'

const confirmationCodec = createRequestStateCodec<{ tool: string; targetId: string }>({
  key: getRequestStateKey(),
  ttlSeconds: 600,
  bind: context => {
    const principal = getMcpPrincipal(context.http?.authInfo)
    return `${principal.subject}\0${context.http?.authInfo?.clientId || ''}\0${context.mcpReq.method}`
  }
})

function jsonResource(uri: URL, value: unknown) {
  return {
    contents: [{
      uri: uri.href,
      mimeType: 'application/json',
      text: JSON.stringify(value, null, 2)
    }]
  }
}

async function resolveResourceAccount(identifier: string) {
  const optimized = await findAccountByIdentifierOptimized(identifier, { includeDecommissioned: true })
  if (optimized) return optimized
  const account = await resolveAccountReference(identifier, await getAllAccountsUnified(true))
  return { account, identifierType: 'name', matchedValue: identifier, source: account.source }
}

async function auditedResourceRead<T>(
  principal: ReturnType<typeof getMcpPrincipal>,
  operation: string,
  source: string,
  targetIds: string[] | undefined,
  execute: () => Promise<T> | T
): Promise<T> {
  const start = performance.now()
  try {
    const value = await execute()
    await recordMcpAudit({ principal, tool: operation, status: 'success', durationMs: performance.now() - start, targetIds, source })
    return value
  } catch (error: any) {
    await recordMcpAudit({
      principal,
      tool: operation,
      status: 'error',
      durationMs: performance.now() - start,
      targetIds,
      source,
      errorCode: error?.code || error?.name,
      errorExplanation: error?.message,
      rawFailure: prepareMcpDiagnosticFailure({}, error)
    })
    throw error
  }
}

function registerResources(server: McpServer, authInfo?: AuthInfo) {
  const principal = getMcpPrincipal(authInfo)
  server.registerResource('ghost-catalog', 'ghost://catalog', {
    title: 'GHOST MCP capability catalog',
    description: 'Available GHOST data domains and safety boundaries.',
    mimeType: 'application/json',
    cacheHint: { ttlMs: 300_000, cacheScope: 'private' }
  }, async (uri: URL) => auditedResourceRead(principal, 'resource.ghost.catalog', 'GHOST MCP catalog', undefined, () => jsonResource(uri, {
    domains: [...new Set(ghostMcpCatalog.filter(tool => principal.scopes.includes(tool.scope)).map(tool => tool.domain))],
    tools: ghostMcpCatalog.filter(tool => principal.scopes.includes(tool.scope)),
    environmentContext: ghostEnvironmentContext,
    scopes: principal.scopes,
    boundaries: ['organization-wide reads', 'user-owned collaboration writes', 'explicitly confirmed user-assigned Identity Center credentials', 'no administrative or AWS infrastructure mutations']
  })))

  server.registerResource('ghost-environment-context', 'ghost://context/environment', {
    title: 'GDMS AWS environment context',
    description: 'GovCloud-first operating rules, Commercial exceptions, management accounts, account pairing, and GHOST terminology.',
    mimeType: 'application/json',
    cacheHint: { ttlMs: 3_600_000, cacheScope: 'public' }
  }, async (uri: URL) => auditedResourceRead(principal, 'resource.ghost.environment', 'GHOST environment context', undefined, () => jsonResource(uri, ghostEnvironmentContext)))

  if (principal.scopes.includes('ghost.collaborate')) server.registerResource('ghost-user', 'ghost://users/me', {
    title: 'Current GHOST MCP user', mimeType: 'application/json', cacheHint: { ttlMs: 60_000, cacheScope: 'private' }
  }, async (uri: URL) => auditedResourceRead(principal, 'resource.ghost.user', 'GHOST user preferences', undefined, async () => {
    const preferences = await getUserPreferences(principal.email)
    return jsonResource(uri, {
      user: { subject: principal.subject, email: principal.email, displayName: principal.displayName },
      scopes: principal.scopes,
      preferences: {
        timezone: preferences.timezone,
        favoriteAccountCount: Array.isArray(preferences.preferences?.favoriteAccounts) ? preferences.preferences.favoriteAccounts.length : 0,
        recentAccountCount: Array.isArray(preferences.preferences?.recentlyViewedAccounts) ? preferences.preferences.recentlyViewedAccounts.length : 0
      }
    })
  }))

  if (principal.scopes.includes('ghost.read')) server.registerResource('ghost-account', new ResourceTemplate('ghost://accounts/{identifier}', { list: undefined }), {
    title: 'GHOST account metadata', description: 'One account resolved by any GHOST identifier.', mimeType: 'application/json'
  }, async (uri, variables) => {
    const identifier = String(variables.identifier)
    return auditedResourceRead(principal, 'resource.ghost.account', 'Organizations and GHOST account metadata', [identifier], async () => jsonResource(uri, await resolveResourceAccount(identifier)))
  })

  if (principal.scopes.includes('ghost.collaborate')) server.registerResource('ghost-export', new ResourceTemplate('ghost://exports/{jobId}', { list: undefined }), {
    title: 'GHOST dataset export status', mimeType: 'application/json'
  }, async (uri, variables) => {
    const jobId = String(variables.jobId)
    return auditedResourceRead(principal, 'resource.ghost.export', 'GHOST dataset export queue', undefined, async () => {
      const job = await getDatasetExportJob(jobId, principal.email)
      if (!job) {
        const error = new Error('Export job not found')
        error.name = 'EXPORT_NOT_FOUND'
        throw error
      }
      return jsonResource(uri, job)
    })
  })
}

function registerPrompts(server: McpServer) {
  const accountArgs = z.object({ account: z.string().describe('Account name, ID, email, or request ID') })
  server.registerPrompt('investigate-account', {
    title: 'Investigate a GHOST account', description: 'Build a structured account health investigation.', argsSchema: accountArgs
  }, ({ account }) => ({ messages: [{ role: 'user', content: { type: 'text', text: `Investigate GHOST account ${account}. Resolve it first, then review metadata, costs, resources, security findings, user access, recent CloudTrail activity, and pipelines. Cite the source and timestamp for each finding, and do not perform writes.` } }] }))

  server.registerPrompt('analyze-cost-variance', {
    title: 'Analyze cost variance', description: 'Compare account cost periods and explain material changes.',
    argsSchema: z.object({ account: z.string(), current_period: z.string(), comparison_period: z.string() })
  }, args => ({ messages: [{ role: 'user', content: { type: 'text', text: `Analyze AWS cost variance for ${args.account}. Use ghost.costs.compare for ${args.current_period} versus ${args.comparison_period}, reconcile authoritative totals, break changes down by service and account, and identify uncertainty.` } }] }))

  server.registerPrompt('review-security-posture', {
    title: 'Review security posture', description: 'Review account security findings and recent audit activity.', argsSchema: accountArgs
  }, ({ account }) => ({ messages: [{ role: 'user', content: { type: 'text', text: `Review the security posture of ${account}. Prioritize critical and high findings, patch compliance, and suspicious CloudTrail changes. Query account governance before discussing policy exposure. Provide evidence and remediation priorities without changing AWS resources.` } }] }))

  server.registerPrompt('audit-user-access', {
    title: 'Audit user access', description: 'Review a user’s account and role mappings.', argsSchema: z.object({ user: z.string() })
  }, ({ user }) => ({ messages: [{ role: 'user', content: { type: 'text', text: `Audit effective IAM Identity Center access for ${user}. List direct and group-derived account permission sets, duplicate or broad mappings, and recent activity where available. Treat Entra directory groups only as optional non-authoritative comparison data.` } }] }))

  server.registerPrompt('triage-pipeline-failure', {
    title: 'Triage pipeline failure', description: 'Investigate one failed pipeline and related account impact.', argsSchema: z.object({ pipeline_id: z.string() })
  }, ({ pipeline_id }) => ({ messages: [{ role: 'user', content: { type: 'text', text: `Triage GHOST pipeline ${pipeline_id}. Review run metadata, account plans, errors, resource changes, and recurring cross-account patterns. Separate confirmed causes from hypotheses.` } }] }))
}

export async function createGhostMcpServer(context: McpRequestContext): Promise<McpServer> {
  const principal = getMcpPrincipal(context.authInfo)
  const server = new McpServer({ name: 'ghost-aws', version: '2.1.0' }, {
    instructions: ghostMcpInstructions,
    cacheHints: {
      'server/discover': { ttlMs: 300_000, cacheScope: 'private' },
      'tools/list': { ttlMs: 300_000, cacheScope: 'private' },
      'resources/list': { ttlMs: 300_000, cacheScope: 'private' },
      'resources/templates/list': { ttlMs: 300_000, cacheScope: 'private' },
      'prompts/list': { ttlMs: 300_000, cacheScope: 'private' }
    },
    requestState: { verify: confirmationCodec.verify },
    inputRequired: { maxRounds: 2, legacyShim: false }
  })
  registerCatalogTools(server, principal, confirmationCodec, {
    userAgent: context.requestInfo?.headers.get('user-agent') || undefined
  })
  registerResources(server, context.authInfo)
  if (principal.scopes.includes('ghost.read')) registerPrompts(server)
  return server
}

export const ghostMcpHandler = createMcpHandler(createGhostMcpServer, {
  legacy: 'stateless'
})
