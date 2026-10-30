/**
 * Client network address behind the load balancer.
 *
 * The ALB appends the address it saw to X-Forwarded-For, so every entry left of
 * that is whatever the client chose to send. Reading the first entry lets any
 * caller pick their own address, which defeats per-address rate limits and
 * poisons audit records. We read from the right instead, skipping one entry per
 * trusted proxy hop (GHOST_TRUSTED_PROXY_HOPS, default 1 for the ALB).
 */

interface RequestLike {
  headers?: Record<string, string | string[] | undefined>
  socket?: { remoteAddress?: string }
}

function trustedProxyHops(): number {
  const hops = Number(process.env.GHOST_TRUSTED_PROXY_HOPS ?? 1)
  return Number.isInteger(hops) && hops >= 0 ? hops : 1
}

export function getClientAddress(req: RequestLike | undefined, hops = trustedProxyHops()): string | undefined {
  if (!req) return undefined
  const socketAddress = req.socket?.remoteAddress || undefined
  if (hops === 0) return socketAddress

  const header = req.headers?.['x-forwarded-for']
  const entries = (Array.isArray(header) ? header.join(',') : header || '')
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean)
  if (entries.length === 0) return socketAddress
  // With more hops configured than entries present, the leftmost entry is the
  // closest thing to a client address we have.
  return entries[Math.max(0, entries.length - hops)]
}
