import { defineEventHandler } from 'h3'
import { handleOAuthProviderRequest } from '../../../mcp/oauth/http'

// oidc-provider resumes completed interactions at the authorization endpoint plus the interaction ID.
export default defineEventHandler(handleOAuthProviderRequest)
