import { defineEventHandler } from 'h3'
import { handleOAuthProviderRequest } from '../../mcp/oauth/http'
import { getOAuthStageInstrumentation, readRawNetworkAddress } from '../../mcp/oauth/admin/stage-instrumentation'

export default defineEventHandler(async event => {
  await handleOAuthProviderRequest(event)
  // Authorization-server discovery success observed at GHOST's network boundary
  // (the provider only emits `discovery.error` on failure). Fire-and-forget;
  // the raw address is pseudonymized by the collector and discarded (16.4).
  getOAuthStageInstrumentation().record({
    stage: 'authorization-server-discovery',
    outcome: 'success',
    httpStatus: event.node.res.statusCode,
    rawNetworkAddress: readRawNetworkAddress(event.node.req)
  })
})
