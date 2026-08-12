import { defineEventHandler } from 'h3'
import { getMcpResourceUrl, getOAuthIssuer } from '../../mcp/config'
import { GHOST_MCP_SCOPES } from '../../mcp/types'

export default defineEventHandler(() => {
  const serverUrl = getMcpResourceUrl().href
  const scopeList = GHOST_MCP_SCOPES.join(',')
  return {
    name: 'ghost',
    protocolVersion: '2026-07-28',
    transport: 'streamable_http',
    serverUrl,
    resource: serverUrl,
    authorizationServer: getOAuthIssuer(),
    protectedResourceMetadata: new URL('/.well-known/oauth-protected-resource/mcp', serverUrl).href,
    scopes: [
      { id: 'ghost.read', label: 'GHOST data', description: 'Read account, cost, user, access, resource, security, audit, and pipeline data.' },
      { id: 'ghost.ai.invoke', label: 'GHOST AI', description: 'Invoke bounded Bedrock insights, troubleshooting, and the GHOST Strands agent.' },
      { id: 'ghost.collaborate', label: 'Personal workflows', description: 'Manage your preferences, chat threads, reports, and export jobs.' },
      { id: 'ghost.credentials.issue', label: 'AWS Identity Center credentials', description: 'Authorize and issue short-lived, user-assigned AWS role credentials after confirmation.' }
    ],
    codex: {
      addCommand: `codex mcp add ghost --url ${serverUrl} --oauth-resource ${serverUrl}`,
      loginCommand: `codex mcp login ghost --scopes ${scopeList}`,
      verifyCommands: ['codex mcp get ghost --json', 'codex mcp list'],
      resetCommands: ['codex mcp logout ghost', 'codex mcp remove ghost'],
      configToml: `[mcp_servers.ghost]\nurl = "${serverUrl}"\noauth_resource = "${serverUrl}"`
    }
  }
})
