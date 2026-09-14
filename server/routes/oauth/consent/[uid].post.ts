import { createError, defineEventHandler, readBody, type H3Event } from 'h3'
import { evaluateUserRoles } from '../../../../app/config/roles'
import { getUserGroups } from '../../../utils/entra/graph-client'
import { getUserSession } from '../../../utils/entra/session'
import { logger } from '../../../utils/logger'
import { getKiroCrewResourceUrl } from '../../../kirocrew/config'
import { KIROCREW_SCOPES } from '../../../kirocrew/types'
import { getOAuthProvider } from '../../../mcp/oauth/provider'
import { getMcpResourceUrl } from '../../../mcp/config'
import { saveMcpGraphDelegation } from '../../../mcp/oauth/delegated-graph'
import { saveGhostMcpIdentity } from '../../../mcp/oauth/identity'
import { GHOST_MCP_SCOPES, type GhostMcpIdentity } from '../../../mcp/types'

interface InteractionBody {
  action: 'details' | 'login' | 'approve' | 'deny'
}

export function requestedGhostResourceScopes(
  params: { scope?: unknown; resource?: unknown },
  missingResourceScopes: Record<string, string[]> | undefined,
  resource: string,
  supportedScopes: readonly string[] = GHOST_MCP_SCOPES
): string[] {
  const requested = new Set(String(params.scope || '').split(' ').filter(scope => supportedScopes.includes(scope)))
  const missing = missingResourceScopes?.[resource]
  const candidates = missing?.length ? missing : [...requested]
  return [...new Set(candidates.filter(scope => requested.has(scope) && supportedScopes.includes(scope)))]
}

export function canGrantKiroCrewAdmin(roles: readonly string[]): boolean {
  // Use the same configured admin role as the browser/admin APIs. Checking one
  // group here caused configured ".admin" users to loop on consent forever.
  return roles.includes('admin')
}

export function identityGroupNames(user: any, graphGroups: readonly string[] = []): string[] {
  const sessionGroups = user?.groups ?? user?.claims?.groups ?? []
  const names = Array.isArray(sessionGroups)
    ? sessionGroups.map((group: any) => {
      if (typeof group === 'string') return group
      return group?.displayName || group?.name || ''
    })
    : []

  return [...new Set([...names, ...graphGroups].filter(Boolean))]
}

function requestedResource(value: unknown): string {
  const candidate = Array.isArray(value) ? value[0] : value
  return typeof candidate === 'string' && candidate
    ? candidate
    : getMcpResourceUrl().href
}

function scopesForResource(resource: string): readonly string[] {
  if (resource === getMcpResourceUrl().href) return GHOST_MCP_SCOPES
  if (resource === getKiroCrewResourceUrl().href) return KIROCREW_SCOPES
  return []
}

function userValue(user: any, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = user?.[key] ?? user?.claims?.[key]
    if (typeof value === 'string' && value) return value
  }
  return undefined
}

async function getAuthenticatedIdentity(event: H3Event): Promise<{ identity: GhostMcpIdentity; refreshToken?: string }> {
  const session = await getUserSession(event)
  if (!session?.user) throw createError({ statusCode: 401, statusMessage: 'Entra authentication is required' })

  const user = session.user
  const oid = userValue(user, 'oid', 'id', 'sub')
  const tenantId = userValue(user, 'tid') || process.env.ENTRA_TENANT_ID || 'unknown-tenant'
  const email = userValue(user, 'email', 'preferred_username', 'upn')
  if (!oid || !email) throw createError({ statusCode: 401, statusMessage: 'Entra identity claims are incomplete' })

  let groups = identityGroupNames(user)
  try {
    groups = identityGroupNames(
      user,
      (await getUserGroups(event, oid)).map(group => group.displayName).filter(Boolean)
    )
  } catch (error) {
    logger.warn('[MCP OAuth] Could not capture delegated Graph groups', error)
  }
  const roles = evaluateUserRoles({
    userPrincipalName: email,
    displayName: userValue(user, 'name', 'displayName'),
    department: userValue(user, 'department'),
    jobTitle: userValue(user, 'jobTitle'),
    groups,
    claims: user.claims
  }).map(role => role.id)

  const now = new Date().toISOString()
  return {
    identity: {
      subject: `${tenantId}:${oid}`,
      oid,
      tenantId,
      email,
      displayName: userValue(user, 'name', 'displayName', 'given_name') || email,
      groups,
      roles,
      createdAt: now,
      updatedAt: now
    },
    refreshToken: session.refreshToken
  }
}

export default defineEventHandler(async event => {
  const body = await readBody<InteractionBody>(event)
  const provider = await getOAuthProvider()
  const details = await provider.interactionDetails(event.node.req, event.node.res)
  const client = await provider.Client.find(String(details.params.client_id))
  const prompt = details.prompt.name

  logger.info('[MCP OAuth] Processing interaction', {
    action: body.action,
    prompt,
    reasons: details.prompt.reasons,
    hasGrant: Boolean(details.grantId)
  })

  if (body.action === 'details') {
    const resource = requestedResource(details.params.resource)
    const supportedScopes = scopesForResource(resource)
    return {
      prompt,
      client: {
        id: details.params.client_id,
        name: client?.clientName || (resource === getKiroCrewResourceUrl().href ? 'Kiro Crew' : 'MCP client'),
        uri: client?.clientUri
      },
      scopes: String(details.params.scope || '').split(' ').filter(scope => supportedScopes.includes(scope)),
      resource
    }
  }

  if (body.action === 'deny') {
    const redirectTo = await provider.interactionResult(event.node.req, event.node.res, {
      error: 'access_denied',
      error_description: 'The user denied access to GHOST.'
    })
    return { redirectTo }
  }

  const { identity, refreshToken } = await getAuthenticatedIdentity(event)
  await saveGhostMcpIdentity(identity)

  if (body.action === 'login') {
    if (prompt !== 'login') throw createError({ statusCode: 400, statusMessage: 'OAuth login is not required' })
    const redirectTo = await provider.interactionResult(event.node.req, event.node.res, {
      login: {
        accountId: identity.subject,
        acr: 'urn:ghost:entra',
        amr: ['federated'],
        remember: true,
        ts: Math.floor(Date.now() / 1000)
      }
    }, { mergeWithLastSubmission: false })
    return { redirectTo }
  }

  if (body.action !== 'approve' || prompt !== 'consent') {
    throw createError({ statusCode: 400, statusMessage: 'OAuth consent is not ready for approval' })
  }
  if (!details.session?.accountId || details.session.accountId !== identity.subject) {
    throw createError({ statusCode: 401, statusMessage: 'OAuth and Entra sessions do not match' })
  }
  const resource = requestedResource(details.params.resource)
  if (resource === getMcpResourceUrl().href) {
    if (refreshToken) {
      await saveMcpGraphDelegation(identity.subject, identity.tenantId, refreshToken)
    } else {
      logger.warn('[MCP Graph] GHOST session did not provide a delegated refresh token')
    }
  }

  const grant = details.grantId
    ? await provider.Grant.find(details.grantId)
    : new provider.Grant({ accountId: details.session.accountId, clientId: String(details.params.client_id) })
  if (!grant) throw createError({ statusCode: 400, statusMessage: 'OAuth grant is unavailable' })

  const missing = (details.prompt.details ?? {}) as {
    missingOIDCScope?: string[]
    missingOIDCClaims?: string[]
    missingResourceScopes?: Record<string, string[]>
  }
  if (!details.prompt.details) {
    logger.warn('[MCP OAuth] Consent prompt had no details payload; granting default scopes only', {
      prompt,
      clientId: String(details.params.client_id),
      hasGrant: Boolean(details.grantId)
    })
  }
  // Grant only the supported resource scopes the client requested and the user saw.
  if (missing.missingOIDCScope?.length) grant.addOIDCScope(missing.missingOIDCScope)
  if (missing.missingOIDCClaims?.length) grant.addOIDCClaims(missing.missingOIDCClaims)
  const supportedScopes = scopesForResource(resource)
  if (!supportedScopes.length) {
    throw createError({ statusCode: 400, statusMessage: 'Unsupported OAuth resource' })
  }
  let requestedScopes = requestedGhostResourceScopes(
    details.params,
    missing.missingResourceScopes,
    resource,
    supportedScopes
  )
  if (
    resource === getKiroCrewResourceUrl().href
    && requestedScopes.includes('kirocrew.config.admin')
    && !canGrantKiroCrewAdmin(identity.roles)
  ) {
    const redirectTo = await provider.interactionResult(event.node.req, event.node.res, {
      error: 'access_denied',
      error_description: 'The GHOST administrator role is required to publish Kiro Crew configuration.'
    })
    return { redirectTo }
  }
  if (requestedScopes.length) grant.addResourceScope(resource, requestedScopes)
  const grantId = await grant.save()
  const consent = details.grantId ? {} : { grantId }

  const redirectTo = await provider.interactionResult(event.node.req, event.node.res, {
    consent
  })
  return { redirectTo }
})
