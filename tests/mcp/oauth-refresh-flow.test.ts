import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import test from 'node:test'
import { exportJWK, generateKeyPair } from 'jose'
import Provider from 'oidc-provider'
import { createEvent } from 'h3'
import { parseTokenRequestAndRestore } from '../../server/mcp/oauth/provider-lifecycle-gate'
import { createGhostOAuthConfiguration } from '../../server/mcp/oauth/provider'

interface StoredValue {
  payload: Record<string, any>
  expiresAt?: number
}

class SharedTestAdapter {
  static values = new Map<string, StoredValue>()

  constructor(private readonly model: string) {}

  private key(id: string) {
    return `${this.model}#${id}`
  }

  async upsert(id: string, payload: Record<string, any>, expiresIn?: number) {
    SharedTestAdapter.values.set(this.key(id), {
      payload: structuredClone(payload),
      expiresAt: expiresIn ? Date.now() + expiresIn * 1000 : undefined
    })
  }

  async find(id: string) {
    const value = SharedTestAdapter.values.get(this.key(id))
    if (!value || (value.expiresAt && value.expiresAt <= Date.now())) return undefined
    return structuredClone(value.payload)
  }

  async findByUid(uid: string) {
    return this.findBy('uid', uid)
  }

  async findByUserCode(userCode: string) {
    return this.findBy('userCode', userCode)
  }

  private async findBy(field: string, expected: string) {
    const prefix = `${this.model}#`
    for (const [key, value] of SharedTestAdapter.values) {
      if (key.startsWith(prefix) && value.payload[field] === expected) return structuredClone(value.payload)
    }
    return undefined
  }

  async consume(id: string) {
    const value = SharedTestAdapter.values.get(this.key(id))
    if (value) value.payload.consumed = Math.floor(Date.now() / 1000)
  }

  async destroy(id: string) {
    SharedTestAdapter.values.delete(this.key(id))
  }

  async revokeByGrantId(grantId: string) {
    for (const [key, value] of SharedTestAdapter.values) {
      if (value.payload.grantId === grantId) SharedTestAdapter.values.delete(key)
    }
  }
}

async function jwks() {
  const { privateKey } = await generateKeyPair('RS256', { extractable: true })
  const key = await exportJWK(privateKey)
  return { keys: [{ ...key, kid: 'test-key', alg: 'RS256', use: 'sig' }] }
}

function providerConfiguration(keys: Awaited<ReturnType<typeof jwks>>) {
  return createGhostOAuthConfiguration({
    resource: 'http://127.0.0.1/mcp',
    jwks: keys,
    adapter: SharedTestAdapter,
    clients: [{
      client_id: 'codex-test',
      client_name: 'Codex Test',
      application_type: 'native',
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      redirect_uris: ['http://127.0.0.1/callback']
    }],
    findAccount: async (_ctx, subject) => ({ accountId: subject, claims: async () => ({ sub: subject }) }),
    extraTokenClaims: async () => ({})
  })
}

async function listen(provider: Provider, replay = false): Promise<{ server: Server; origin: string }> {
  const server = createServer(async (req, res) => {
    const event = createEvent(req, res)
    try {
      if (replay) await parseTokenRequestAndRestore(event)
      await provider.callback()(event.node.req, res)
    } catch {
      res.statusCode = 500
      res.end(JSON.stringify({ error: 'request_adapter_failed' }))
    }
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Test OAuth server did not bind')
  return { server, origin: `http://127.0.0.1:${address.port}` }
}

async function refresh(origin: string, refreshToken: string) {
  const response = await fetch(`${origin}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: 'codex-test', refresh_token: refreshToken })
  })
  const body = await response.json() as Record<string, any>
  assert.equal(response.status, 200, JSON.stringify(body))
  assert.equal(typeof body.access_token, 'string')
  assert.equal(body.refresh_token, refreshToken)
}

async function refreshFlow(replay = false) {
  SharedTestAdapter.values.clear()
  const keys = await jwks()
  const firstProvider = new Provider('http://127.0.0.1', providerConfiguration(keys))
  const client = await firstProvider.Client.find('codex-test')
  assert.ok(client)
  const grant = new firstProvider.Grant({ accountId: 'test-user', clientId: client.clientId })
  grant.addResourceScope('http://127.0.0.1/mcp', ['ghost.read'])
  const grantId = await grant.save()
  const token = new firstProvider.RefreshToken({
    accountId: 'test-user',
    authTime: Math.floor(Date.now() / 1000),
    client,
    grantId,
    gty: 'authorization_code',
    resource: 'http://127.0.0.1/mcp',
    scope: 'ghost.read'
  })
  const refreshToken = await token.save()

  const first = await listen(firstProvider, replay)
  try {
    await refresh(first.origin, refreshToken)
    await refresh(first.origin, refreshToken)
  } finally {
    await new Promise<void>((resolve, reject) => first.server.close(error => error ? reject(error) : resolve()))
  }

  const restartedProvider = new Provider('http://127.0.0.1', providerConfiguration(keys))
  const restarted = await listen(restartedProvider, replay)
  try {
    await refresh(restarted.origin, refreshToken)
  } finally {
    await new Promise<void>((resolve, reject) => restarted.server.close(error => error ? reject(error) : resolve()))
  }
}

test('the same Codex refresh token works repeatedly and after provider restart', () => refreshFlow())
test('token-body inspection preserves refresh through the real provider HTTP callback', () => refreshFlow(true))
