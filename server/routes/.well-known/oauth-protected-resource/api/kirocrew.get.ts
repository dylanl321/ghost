import { defineEventHandler, setHeader } from 'h3'
import { getOAuthIssuer } from '../../../../mcp/config'
import { getKiroCrewResourceUrl } from '../../../../kirocrew/config'
import { KIROCREW_SCOPES } from '../../../../kirocrew/types'

export default defineEventHandler(event => {
  setHeader(event, 'Access-Control-Allow-Origin', '*')
  setHeader(event, 'Cache-Control', 'public, max-age=300')
  return {
    resource: getKiroCrewResourceUrl().href,
    resource_name: 'GHOST Kiro Crew Configuration',
    authorization_servers: [getOAuthIssuer()],
    scopes_supported: [...KIROCREW_SCOPES],
    bearer_methods_supported: ['header']
  }
})
