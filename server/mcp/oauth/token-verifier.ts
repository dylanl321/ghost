import { OAuthError, OAuthErrorCode, type AuthInfo, type OAuthTokenVerifier } from '@modelcontextprotocol/server'
import { getMcpResourceUrl } from '../config'
import type { GhostMcpAuthInfo, GhostMcpPrincipal, GhostMcpScope } from '../types'
import { getGhostMcpIdentity } from './identity'
import { getOAuthProvider } from './provider'
import { getOAuthStageInstrumentation } from './admin/stage-instrumentation'
import { isGrantRevoked } from './admin/lifecycle-enforcement'

export const ghostOAuthTokenVerifier: OAuthTokenVerifier = {
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    // Protected-resource (MCP) verification boundary. Instrumentation is
    // fire-and-forget and self-guarding; it never changes verification behavior
    // and only records the safe outcome/reason (Requirements 2.3, 4.1).
    const telemetry = getOAuthStageInstrumentation()
    const provider = await getOAuthProvider()
    const accessToken = await provider.AccessToken.find(token)
    if (!accessToken?.accountId || !accessToken.clientId || !accessToken.exp) {
      telemetry.record({ stage: 'protected-resource-verification', outcome: 'failure', errorCode: 'invalid_token' })
      throw new OAuthError(OAuthErrorCode.InvalidToken, 'The access token is invalid or expired')
    }

    // Task 9 integration seam (Req 9.2): every opaque-token consumer must reject
    // a grant marked for revocation while cleanup is in flight. Until the task 9
    // revocation service installs the fence, `isGrantRevoked` is a no-op and no
    // token is affected — this task never revokes a grant. Managed lifecycle
    // (block/retire) intentionally does NOT reject an existing access token
    // here; per the matrix those tokens continue to their normal expiry.
    const grantId = (accessToken as { grantId?: string }).grantId
    if (await isGrantRevoked(grantId)) {
      telemetry.record({
        stage: 'protected-resource-verification',
        outcome: 'failure',
        errorCode: 'grant_revoked',
        clientReference: accessToken.clientId,
        subjectReference: accessToken.accountId
      })
      throw new OAuthError(OAuthErrorCode.InvalidToken, 'The access token grant has been revoked')
    }

    const resource = getMcpResourceUrl()
    const audience = Array.isArray(accessToken.aud) ? accessToken.aud : [accessToken.aud]
    if (!audience.filter(Boolean).includes(resource.href)) {
      telemetry.record({
        stage: 'protected-resource-verification',
        outcome: 'failure',
        errorCode: 'invalid_audience',
        clientReference: accessToken.clientId,
        resourceReference: resource.href,
        subjectReference: accessToken.accountId
      })
      throw new OAuthError(OAuthErrorCode.InvalidToken, 'The access token was not issued for this MCP server')
    }

    const identity = await getGhostMcpIdentity(accessToken.accountId)
    if (!identity) {
      telemetry.record({
        stage: 'protected-resource-verification',
        outcome: 'failure',
        errorCode: 'identity_missing',
        clientReference: accessToken.clientId,
        resourceReference: resource.href,
        subjectReference: accessToken.accountId
      })
      throw new OAuthError(OAuthErrorCode.InvalidToken, 'The token identity no longer exists')
    }

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
    telemetry.record({
      stage: 'protected-resource-verification',
      outcome: 'success',
      clientReference: accessToken.clientId,
      resourceReference: resource.href,
      subjectReference: accessToken.accountId
    })
    return authInfo
  }
}

