import { defineEventHandler } from 'h3'
import { handleOAuthProviderRequest } from '../../mcp/oauth/http'

// Managed lifecycle gate (task 8.2) runs at the token boundary before the
// provider: block/retire deny code exchange and retire denies refresh for a
// managed client; unmanaged clients pass through unchanged.
export default defineEventHandler(event => handleOAuthProviderRequest(event, 'token'))
