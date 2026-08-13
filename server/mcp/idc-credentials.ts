import { randomUUID } from 'node:crypto'
import {
  CreateTokenCommand,
  RegisterClientCommand,
  SSOOIDCClient,
  StartDeviceAuthorizationCommand
} from '@aws-sdk/client-sso-oidc'
import {
  GetRoleCredentialsCommand,
  SSOClient
} from '@aws-sdk/client-sso'
import { deleteItem, getItem, putItem } from '../utils/dynamodb'
import { getOAuthTableConfig } from './config'
import { decryptMcpSecret, encryptMcpSecret, isMcpSecretVaultEnabled } from './secret-vault'
import type { GhostMcpPrincipal } from './types'

type IdentityCenterEnvironment = 'commercial' | 'govcloud'

interface IdentityCenterConfig {
  environment: IdentityCenterEnvironment
  startUrl: string
  region: string
}

interface RegisteredClient {
  clientId: string
  clientSecret: string
  expiresAt: number
}

interface DeviceAuthorizationSession extends RegisteredClient, IdentityCenterConfig {
  sessionId: string
  subject: string
  deviceCode: string
  expiresAtIso: string
  accessToken?: string
  accessTokenExpiresAt?: number
  refreshToken?: string
  refreshTokenExpiresAt?: number
}

const registeredClients = new Map<IdentityCenterEnvironment, RegisteredClient>()
const DEVICE_CODE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code'
const REFRESH_TOKEN_GRANT = 'refresh_token'
const IDC_REFRESH_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

export function isMcpIdentityCenterDeviceFlowEnabled(): boolean {
  return process.env.GHOST_MCP_IDC_DEVICE_FLOW_ENABLED === 'true'
}

function getConfig(environment: IdentityCenterEnvironment): IdentityCenterConfig {
  if (environment === 'govcloud') {
    return {
      environment,
      startUrl: process.env.GHOST_MCP_IDC_GOVCLOUD_START_URL || 'https://start.us-gov-west-1.us-gov-home.awsapps.com/directory/gd',
      region: process.env.GHOST_MCP_IDC_GOVCLOUD_REGION || 'us-gov-west-1'
    }
  }
  return {
    environment,
    startUrl: process.env.GHOST_MCP_IDC_COMMERCIAL_START_URL || 'https://gdms.awsapps.com/start',
    region: process.env.GHOST_MCP_IDC_COMMERCIAL_REGION || 'us-east-1'
  }
}

function sessionKey(sessionId: string) {
  return { artifactId: `IdentityCenterSession#${sessionId}` }
}

function sessionEncryptionContext(sessionId: string, subject: string) {
  return { purpose: 'ghost-mcp-idc-session', sessionId, subject }
}

async function saveDeviceSession(session: DeviceAuthorizationSession, expiresAt: number): Promise<void> {
  if (!isMcpSecretVaultEnabled()) throw new Error('Identity Center session encryption is not configured.')
  const config = getOAuthTableConfig()
  const ttl = Math.floor(expiresAt / 1000)
  const encryptedSession = await encryptMcpSecret(
    JSON.stringify(session),
    sessionEncryptionContext(session.sessionId, session.subject)
  )
  await putItem(config.tableName, {
    ...sessionKey(session.sessionId),
    model: 'IdentityCenterSession',
    payload: { ciphertext: encryptedSession },
    ttl
  }, config.environment, config.accountId)
}

async function loadDeviceSession(sessionId: string, subject: string): Promise<DeviceAuthorizationSession | null> {
  const config = getOAuthTableConfig()
  const item = await getItem(config.tableName, sessionKey(sessionId), config.environment, config.accountId) as {
    payload?: { ciphertext?: string }
    ttl?: number
  } | null
  if (!item?.payload?.ciphertext || (item.ttl && item.ttl <= Math.floor(Date.now() / 1000))) return null
  const session = JSON.parse(await decryptMcpSecret(
    item.payload.ciphertext,
    sessionEncryptionContext(sessionId, subject)
  )) as DeviceAuthorizationSession
  return session.subject === subject ? session : null
}

async function deleteDeviceSession(session: DeviceAuthorizationSession): Promise<void> {
  const config = getOAuthTableConfig()
  await deleteItem(config.tableName, sessionKey(session.sessionId), config.environment, config.accountId)
}

async function getRegisteredClient(config: IdentityCenterConfig): Promise<RegisteredClient> {
  const existing = registeredClients.get(config.environment)
  if (existing && existing.expiresAt > Date.now() + 5 * 60_000) return existing

  const client = new SSOOIDCClient({ region: config.region })
  const response = await client.send(new RegisterClientCommand({
    clientName: 'ghost-mcp',
    clientType: 'public',
    scopes: ['sso:account:access'],
    grantTypes: [DEVICE_CODE_GRANT, REFRESH_TOKEN_GRANT]
  }))
  if (!response.clientId || !response.clientSecret || !response.clientSecretExpiresAt) {
    throw new Error('IAM Identity Center did not return a usable client registration.')
  }

  const registered = {
    clientId: response.clientId,
    clientSecret: response.clientSecret,
    expiresAt: response.clientSecretExpiresAt * 1000
  }
  registeredClients.set(config.environment, registered)
  return registered
}

export async function beginMcpIdentityCenterAuthorization(
  principal: GhostMcpPrincipal,
  environment: IdentityCenterEnvironment
) {
  if (!isMcpIdentityCenterDeviceFlowEnabled()) {
    const error = new Error('Identity Center authorization is not enabled for this GHOST deployment.')
    error.name = 'IDC_DEVICE_FLOW_DISABLED'
    throw error
  }

  const config = getConfig(environment)
  const registered = await getRegisteredClient(config)
  const client = new SSOOIDCClient({ region: config.region })
  const authorization = await client.send(new StartDeviceAuthorizationCommand({
    clientId: registered.clientId,
    clientSecret: registered.clientSecret,
    startUrl: config.startUrl
  }))
  if (!authorization.deviceCode || !authorization.verificationUri || !authorization.expiresIn) {
    throw new Error('IAM Identity Center did not return a usable device authorization request.')
  }

  const sessionId = randomUUID()
  const expiresAt = Date.now() + authorization.expiresIn * 1000
  const session: DeviceAuthorizationSession = {
    ...config,
    ...registered,
    sessionId,
    subject: principal.subject,
    deviceCode: authorization.deviceCode,
    expiresAtIso: new Date(expiresAt).toISOString()
  }
  await saveDeviceSession(session, expiresAt)

  return {
    sessionId,
    environment,
    verificationUri: authorization.verificationUri,
    verificationUriComplete: authorization.verificationUriComplete,
    userCode: authorization.userCode,
    expiresAt: session.expiresAtIso,
    pollIntervalSeconds: authorization.interval || 5
  }
}

async function getIdentityCenterAccessToken(
  principal: GhostMcpPrincipal,
  sessionId: string
): Promise<{ session: DeviceAuthorizationSession; accessToken: string }> {
  const session = await loadDeviceSession(sessionId, principal.subject)
  if (!session) {
    const error = new Error('Identity Center authorization session was not found for the authenticated user.')
    error.name = 'IDC_SESSION_NOT_FOUND'
    throw error
  }
  if (session.accessToken && (session.accessTokenExpiresAt || 0) > Date.now() + 60_000) {
    return { session, accessToken: session.accessToken }
  }

  const oidc = new SSOOIDCClient({ region: session.region })
  try {
    const token = await oidc.send(new CreateTokenCommand(session.refreshToken
      ? {
          clientId: session.clientId,
          clientSecret: session.clientSecret,
          refreshToken: session.refreshToken,
          grantType: REFRESH_TOKEN_GRANT
        }
      : {
          clientId: session.clientId,
          clientSecret: session.clientSecret,
          deviceCode: session.deviceCode,
          grantType: DEVICE_CODE_GRANT
        }))
    if (!token.accessToken) throw new Error('IAM Identity Center did not return an access token.')
    session.accessToken = token.accessToken
    session.accessTokenExpiresAt = Date.now() + (token.expiresIn || 3600) * 1000
    if (token.refreshToken) session.refreshToken = token.refreshToken
    if (session.refreshToken) {
      session.refreshTokenExpiresAt = Math.min(
        session.expiresAt,
        Date.now() + IDC_REFRESH_SESSION_TTL_MS
      )
    }
    await saveDeviceSession(session, session.refreshTokenExpiresAt || session.accessTokenExpiresAt)
    return { session, accessToken: token.accessToken }
  } catch (error: any) {
    if (error?.name === 'AuthorizationPendingException' || error?.name === 'SlowDownException') {
      const pending = new Error('Complete the IAM Identity Center browser authorization, then try again.')
      pending.name = 'IDC_AUTHORIZATION_PENDING'
      throw pending
    }
    if (['InvalidGrantException', 'InvalidClientException', 'ExpiredTokenException'].includes(error?.name)) {
      await deleteDeviceSession(session)
      const reauth = new Error('IAM Identity Center authorization expired or was revoked. Start a new IDC authorization session.')
      reauth.name = 'IDC_REAUTH_REQUIRED'
      throw reauth
    }
    throw error
  }
}

export async function issueMcpIdentityCenterCredentials(
  principal: GhostMcpPrincipal,
  sessionId: string,
  accountId: string,
  roleName: string
) {
  const { session, accessToken } = await getIdentityCenterAccessToken(principal, sessionId)

  const sso = new SSOClient({ region: session.region })
  const response = await sso.send(new GetRoleCredentialsCommand({ accountId, roleName, accessToken }))
  const credentials = response.roleCredentials
  if (!credentials?.accessKeyId || !credentials.secretAccessKey || !credentials.sessionToken || !credentials.expiration) {
    throw new Error('IAM Identity Center did not return complete role credentials.')
  }
  return {
    accessKeyId: credentials.accessKeyId,
    secretAccessKey: credentials.secretAccessKey,
    sessionToken: credentials.sessionToken,
    expiration: new Date(credentials.expiration).toISOString(),
    accountId,
    roleName,
    environment: session.environment,
    region: session.region
  }
}
