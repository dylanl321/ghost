import type { H3Event } from 'h3'

let cachedToken: { value: string; expiresAt: number } | null = null

async function getGraphApplicationToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value
  const clientId = process.env.ENTRA_CLIENT_ID || process.env.NUXT_OIDC_PROVIDERS_ENTRA_CLIENT_ID
  const clientSecret = process.env.ENTRA_CLIENT_SECRET || process.env.NUXT_OIDC_PROVIDERS_ENTRA_CLIENT_SECRET
  const tenantId = process.env.ENTRA_TENANT_ID || '7c5a26cf-ddf0-400c-9703-4070b4e3a54d'
  if (!clientId || !clientSecret) throw new Error('Entra application credentials are not configured for background exports')

  const loginBase = process.env.ENTRA_LOGIN_BASE_URL || 'https://login.microsoftonline.us'
  const graphBase = process.env.ENTRA_GRAPH_BASE_URL || 'https://graph.microsoft.us'
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
    scope: `${graphBase}/.default`
  })
  const response = await fetch(`${loginBase}/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body
  })
  if (!response.ok) throw new Error(`Entra application authentication failed: HTTP ${response.status}`)
  const token = await response.json() as { access_token?: string; expires_in?: number }
  if (!token.access_token) throw new Error('Entra application authentication returned no access token')
  cachedToken = { value: token.access_token, expiresAt: Date.now() + (token.expires_in || 3600) * 1000 }
  return cachedToken.value
}

export async function createEntraServiceEvent(): Promise<H3Event> {
  const accessToken = await getGraphApplicationToken()
  return {
    node: { req: { headers: { authorization: `Bearer ${accessToken}` } } },
    context: { datasetExportService: true }
  } as unknown as H3Event
}
