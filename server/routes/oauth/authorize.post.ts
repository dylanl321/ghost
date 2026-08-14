import { defineEventHandler } from 'h3'
import { handleOAuthProviderRequest } from '../../mcp/oauth/http'

export default defineEventHandler(handleOAuthProviderRequest)

