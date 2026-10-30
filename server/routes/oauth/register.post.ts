import { defineEventHandler } from 'h3'
import { handleOAuthProviderRequest } from '../../mcp/oauth/http'
import { rejectIfRegistrationRateLimited } from '../../mcp/oauth/registration-rate-limit'

export default defineEventHandler(async event => {
  if (await rejectIfRegistrationRateLimited(event)) return
  await handleOAuthProviderRequest(event)
})
