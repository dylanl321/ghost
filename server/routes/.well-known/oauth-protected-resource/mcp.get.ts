import { buildOAuthProtectedResourceMetadata } from '@modelcontextprotocol/server'
import { defineEventHandler, setHeader } from 'h3'
import { getMcpResourceUrl, getOAuthIssuer } from '../../../mcp/config'
import { GHOST_MCP_SCOPES } from '../../../mcp/types'
import { getOAuthStageInstrumentation, readRawNetworkAddress } from '../../../mcp/oauth/admin/stage-instrumentation'

export default defineEventHandler(event => {
  setHeader(event, 'Access-Control-Allow-Origin', '*')
  setHeader(event, 'Cache-Control', 'public, max-age=300')
  // Protected-resource discovery success observed at GHOST's network boundary.
  // Fire-and-forget; raw address pseudonymized by the collector then discarded.
  getOAuthStageInstrumentation().record({
    stage: 'protected-resource-discovery',
    outcome: 'success',
    rawNetworkAddress: readRawNetworkAddress(event.node.req)
  })
  return buildOAuthProtectedResourceMetadata({
    oauthMetadata: {
      issuer: getOAuthIssuer(),
      authorization_endpoint: `${getOAuthIssuer()}/oauth/authorize`,
      token_endpoint: `${getOAuthIssuer()}/oauth/token`,
      registration_endpoint: `${getOAuthIssuer()}/oauth/register`,
      revocation_endpoint: `${getOAuthIssuer()}/oauth/revoke`,
      jwks_uri: `${getOAuthIssuer()}/oauth/jwks`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: [...GHOST_MCP_SCOPES, 'offline_access']
    },
    resourceServerUrl: getMcpResourceUrl(),
    resourceName: 'GHOST AWS Data',
    scopesSupported: [...GHOST_MCP_SCOPES],
    dangerouslyAllowInsecureIssuerUrl: process.env.NODE_ENV === 'development'
  })
})

