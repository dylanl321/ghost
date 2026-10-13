import type { H3Event } from 'h3'
import { getOAuthProvider } from './provider'
import { enforceManagedLifecycleGate, type GatedBoundary } from './provider-lifecycle-gate'

/**
 * Delegate a request to the `oidc-provider` HTTP callback.
 *
 * When a `boundary` is supplied (`authorize` / `token`), the managed lifecycle
 * gate runs FIRST (task 8.2). For a MANAGED client under an enforcing policy the
 * gate denies the request and sends its own response, so the provider is not
 * invoked. For an UNMANAGED client (no managed-policy extension) — or if the
 * gate cannot positively identify an enforcing policy — the gate is a pure
 * pass-through and existing behavior is preserved exactly (Req 7.7, 18.2, 18.3).
 */
export async function handleOAuthProviderRequest(event: H3Event, boundary?: GatedBoundary): Promise<void> {
  if (boundary) {
    const denied = await enforceManagedLifecycleGate(event, boundary)
    if (denied) return
  }
  const provider = await getOAuthProvider()
  await provider.callback()(event.node.req, event.node.res)
}
