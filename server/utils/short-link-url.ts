import type { H3Event } from 'h3'
import { getHeader } from 'h3'

/**
 * Public URL for a short code. Uses the configured site URL so a forged Host
 * header cannot change the link handed back to the user.
 */
export function shortLinkUrl(event: H3Event, shortCode: string): string {
  const siteUrl = process.env.NUXT_PUBLIC_SITE_URL?.replace(/\/+$/, '')
  if (siteUrl) return `${siteUrl}/s/${shortCode}`
  const host = getHeader(event, 'host') || 'localhost:3000'
  const protocol = getHeader(event, 'x-forwarded-proto') || 'http'
  return `${protocol}://${host}/s/${shortCode}`
}
