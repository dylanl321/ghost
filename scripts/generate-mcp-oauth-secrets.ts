import { randomBytes, randomUUID } from 'node:crypto'
import { exportJWK, generateKeyPair } from 'jose'

const { privateKey } = await generateKeyPair('RS256', { extractable: true })
const jwk = await exportJWK(privateKey)
jwk.alg = 'RS256'
jwk.use = 'sig'
jwk.kid = randomUUID()

process.stdout.write(JSON.stringify({
  ghost_oauth_jwks_json: JSON.stringify({ keys: [jwk] }),
  ghost_oauth_cookie_keys: `${randomBytes(32).toString('hex')},${randomBytes(32).toString('hex')}`,
  ghost_mcp_request_state_key: randomBytes(32).toString('hex')
}, null, 2) + '\n')

