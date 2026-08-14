import { defineEventHandler } from 'h3'
import { handleOAuthProviderRequest } from '../../mcp/oauth/http'

export default defineEventHandler(async event => {
  await handleOAuthProviderRequest(event)
})

