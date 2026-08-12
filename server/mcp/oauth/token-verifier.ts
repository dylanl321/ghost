import { OAuthError, OAuthErrorCode, type AuthInfo, type OAuthTokenVerifier } from '@modelcontextprotocol/server'
import { getMcpResourceUrl } from '../config'
import type { GhostMcpAuthInfo, GhostMcpPrincipal, GhostMcpScope } from '../types'
import { getGhostMcpIdentity } from './identity'
import { getOAuthProvider } from './provider'

export const ghostOAuthTokenVerifier: OAuthTokenVerifier = {
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const provider = await getOAuthProvider()
    const accessToken = await provider.AccessToken.find(token)
    if (!accessToken?.accountId || !accessToken.clientId || !accessToken.exp) {
      throw new OAuthError(OAuthErrorCode.InvalidToken, 'The access token is invalid or expired')
    }

    const resource = getMcpResourceUrl()
    const audience = Array.isArray(accessToken.aud) ? accessToken.aud : [accessToken.aud]
    if (!audience.filter(Boolean).includes(resource.href)) {
      throw new OAuthError(OAuthErrorCode.InvalidToken, 'The access token was not issued for this MCP server')
    }

    const identity = await getGhostMcpIdentity(accessToken.accountId)
    if (!identity) throw new OAuthError(OAuthErrorCode.InvalidToken, 'The token identity no longer exists')

    const scopes = (accessToken.scope || '').split(' ').filter(Boolean) as GhostMcpScope[]
    const principal: GhostMcpPrincipal = {
      ...identity,
      clientId: accessToken.clientId,
      scopes
    }
    const authInfo: GhostMcpAuthInfo = {
      token,
      clientId: accessToken.clientId,
      scopes,
      expiresAt: accessToken.exp,
      resource,
      extra: { principal }
    }
    return authInfo
  }
}

