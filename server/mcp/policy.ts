import type { AuthInfo } from '@modelcontextprotocol/server'
import type { GhostMcpAuthInfo, GhostMcpPrincipal, GhostMcpScope } from './types'

export function getMcpPrincipal(authInfo?: AuthInfo): GhostMcpPrincipal {
  const principal = (authInfo as GhostMcpAuthInfo | undefined)?.extra?.principal
  if (!principal) throw new Error('Authenticated MCP principal is unavailable')
  return principal
}

export function hasMcpScope(authInfo: AuthInfo | undefined, scope: GhostMcpScope): boolean {
  return Boolean(authInfo?.scopes.includes(scope))
}

export function requireMcpScope(authInfo: AuthInfo | undefined, scope: GhostMcpScope): GhostMcpPrincipal {
  if (!hasMcpScope(authInfo, scope)) throw new Error(`Missing required OAuth scope: ${scope}`)
  return getMcpPrincipal(authInfo)
}

