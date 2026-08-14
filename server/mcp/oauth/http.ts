import type { H3Event } from 'h3'
import { getOAuthProvider } from './provider'

export async function handleOAuthProviderRequest(event: H3Event): Promise<void> {
  const provider = await getOAuthProvider()
  await provider.callback()(event.node.req, event.node.res)
}

