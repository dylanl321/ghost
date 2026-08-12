import { createError, defineEventHandler, readBody } from 'h3'
import { evaluateUserRoles } from '../../../../app/config/roles'
import { getUserGroups } from '../../../utils/entra/graph-client'
import { getUserSession } from '../../../utils/entra/session'
import { getMcpResourceUrl } from '../../../mcp/config'
import { getOAuthProvider } from '../../../mcp/oauth/provider'
import { saveGhostMcpIdentity } from '../../../mcp/oauth/identity'
import { GHOST_MCP_SCOPES, type GhostMcpIdentity } from '../../../mcp/types'

interface InteractionBody {
  action: 'details' | 'approve' | 'deny'
}

function userValue(user: any, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = user?.[key] ?? user?.claims?.[key]
    if (typeof value === 'string' && value) return value
  }
  return undefined
}

export default defineEventHandler(async event => {
  const body = await readBody<InteractionBody>(event)
  const provider = await getOAuthProvider()
  const details = await provider.interactionDetails(event.node.req, event.node.res)
  const client = await provider.Client.find(String(details.params.client_id))

  if (body.action === 'details') {
    return {
      client: {
        id: details.params.client_id,
        name: client?.clientName || 'MCP client',
        uri: client?.clientUri
      },
      scopes: String(details.params.scope || '').split(' ').filter(scope => GHOST_MCP_SCOPES.includes(scope as any)),
      resource: details.params.resource || getMcpResourceUrl().href
    }
  }

  if (body.action === 'deny') {
    const redirectTo = await provider.interactionResult(event.node.req, event.node.res, {
      error: 'access_denied',
      error_description: 'The user denied access to GHOST.'
    })
    return { redirectTo }
  }

  const session = await getUserSession(event)
  if (!session?.user) throw createError({ statusCode: 401, statusMessage: 'Entra authentication is required' })

  const user = session.user
  const oid = userValue(user, 'oid', 'id', 'sub')
  const tenantId = userValue(user, 'tid') || process.env.ENTRA_TENANT_ID || 'unknown-tenant'
  const email = userValue(user, 'email', 'preferred_username', 'upn')
  if (!oid || !email) throw createError({ statusCode: 401, statusMessage: 'Entra identity claims are incomplete' })

  let groups: string[]
  try {
    groups = (await getUserGroups(event, oid)).map(group => group.displayName).filter(Boolean)
  } catch {
    groups = []
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
  const identity: GhostMcpIdentity = {
    subject: `${tenantId}:${oid}`,
    oid,
    tenantId,
    email,
    displayName: userValue(user, 'name', 'displayName', 'given_name') || email,
    groups,
    roles,
    createdAt: now,
    updatedAt: now
  }
  await saveGhostMcpIdentity(identity)

  const grant = details.grantId
    ? await provider.Grant.find(details.grantId)
    : new provider.Grant({ accountId: identity.subject, clientId: String(details.params.client_id) })
  if (!grant) throw createError({ statusCode: 400, statusMessage: 'OAuth grant is unavailable' })

  const requestedScopes = String(details.params.scope || '').split(' ').filter(Boolean)
  const oidcScopes = requestedScopes.filter(scope => scope === 'openid' || scope === 'offline_access')
  const resourceScopes = requestedScopes.filter(scope => GHOST_MCP_SCOPES.includes(scope as any))
  if (oidcScopes.length) grant.addOIDCScope(oidcScopes.join(' '))
  if (resourceScopes.length) grant.addResourceScope(getMcpResourceUrl().href, resourceScopes.join(' '))
  const grantId = await grant.save()

  const redirectTo = await provider.interactionResult(event.node.req, event.node.res, {
    login: {
      accountId: identity.subject,
      acr: 'urn:ghost:entra',
      amr: ['federated'],
      remember: true,
      ts: Math.floor(Date.now() / 1000)
    },
    consent: { grantId }
  })
  return { redirectTo }
})
