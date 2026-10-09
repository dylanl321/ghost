import { defineEventHandler } from 'h3'
import { handleOAuthProviderRequest } from '../../mcp/oauth/http'

// Managed lifecycle gate (task 8.2) runs at the authorization boundary before
// the provider; unmanaged clients pass through unchanged.
export default defineEventHandler(event => handleOAuthProviderRequest(event, 'authorize'))
