import { randomUUID } from 'node:crypto'
import {
  CreateTokenCommand,
  RegisterClientCommand,
  SSOOIDCClient,
  StartDeviceAuthorizationCommand
} from '@aws-sdk/client-sso-oidc'
import { GetRoleCredentialsCommand, SSOClient } from '@aws-sdk/client-sso'
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
  expiresAt: number
  expiresAtIso: string
}

const registeredClients = new Map<IdentityCenterEnvironment, RegisteredClient>()
const deviceSessions = new Map<string, DeviceAuthorizationSession>()
const DEVICE_CODE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code'

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

function cleanupExpiredSessions() {
  const now = Date.now()
  for (const [id, session] of deviceSessions) {
    if (session.expiresAt <= now) deviceSessions.delete(id)
  }
}

async function getRegisteredClient(config: IdentityCenterConfig): Promise<RegisteredClient> {
  const existing = registeredClients.get(config.environment)
  if (existing && existing.expiresAt > Date.now() + 5 * 60_000) return existing

  const client = new SSOOIDCClient({ region: config.region })
  const response = await client.send(new RegisterClientCommand({
    clientName: 'ghost-mcp',
    clientType: 'public',
    scopes: ['sso:account:access'],
    grantTypes: [DEVICE_CODE_GRANT]
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

export async function beginMcpIdentityCenterAuthorization(principal: GhostMcpPrincipal, environment: IdentityCenterEnvironment) {
  if (!isMcpIdentityCenterDeviceFlowEnabled()) {
    const error = new Error('Identity Center credential brokering is not enabled for this GHOST deployment.')
    error.name = 'IDC_DEVICE_FLOW_DISABLED'
    throw error
  }

  cleanupExpiredSessions()
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
  deviceSessions.set(sessionId, {
    ...config,
    ...registered,
    sessionId,
    subject: principal.subject,
    deviceCode: authorization.deviceCode,
    expiresAt,
    expiresAtIso: new Date(expiresAt).toISOString()
  })

  return {
    sessionId,
    verificationUri: authorization.verificationUri,
    verificationUriComplete: authorization.verificationUriComplete,
    userCode: authorization.userCode,
    expiresAt: new Date(expiresAt).toISOString(),
    pollIntervalSeconds: authorization.interval || 5
  }
}

export async function issueMcpIdentityCenterCredentials(
  principal: GhostMcpPrincipal,
  sessionId: string,
  accountId: string,
  roleName: string
) {
  cleanupExpiredSessions()
  const session = deviceSessions.get(sessionId)
  if (!session || session.subject !== principal.subject) {
    const error = new Error('Identity Center authorization session was not found for the authenticated user.')
    error.name = 'IDC_SESSION_NOT_FOUND'
    throw error
  }

  const oidc = new SSOOIDCClient({ region: session.region })
  let accessToken: string
  try {
    const token = await oidc.send(new CreateTokenCommand({
      clientId: session.clientId,
      clientSecret: session.clientSecret,
      deviceCode: session.deviceCode,
      grantType: DEVICE_CODE_GRANT
    }))
    if (!token.accessToken) throw new Error('IAM Identity Center did not return an access token.')
    accessToken = token.accessToken
  } catch (error: any) {
    if (error?.name === 'AuthorizationPendingException' || error?.name === 'SlowDownException') {
      const pending = new Error('Complete the IAM Identity Center browser authorization, then request credentials again.')
      pending.name = 'IDC_AUTHORIZATION_PENDING'
      throw pending
    }
    throw error
  }

  try {
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
  } finally {
    // Device grants are one-time. Never retain a user access token or refresh token in GHOST.
    deviceSessions.delete(sessionId)
  }
}
