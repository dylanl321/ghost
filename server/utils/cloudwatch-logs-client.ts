/**
 * CloudWatch Logs client for a child account, shared by the support log tools.
 * Clients are cached until shortly before their credentials expire.
 */

import { CloudWatchLogsClient } from '@aws-sdk/client-cloudwatch-logs'
import { assumeChildAccountRole } from './credentials/awsAccountCredentials'
import type { AWSEnvironmentType } from '../types'

const REFRESH_BUFFER_MS = 5 * 60 * 1000
// Used when the credential source does not report an expiry
const DEFAULT_TTL_MS = 50 * 60 * 1000

const clientCache = new Map<string, { client: CloudWatchLogsClient, expiresAt: number }>()

export function defaultLogsRegion(environment: AWSEnvironmentType): string {
  return environment === 'govcloud' ? 'us-gov-west-1' : 'us-east-1'
}

export async function getChildAccountLogsClient(
  environment: AWSEnvironmentType,
  accountId: string,
  region: string = defaultLogsRegion(environment)
): Promise<CloudWatchLogsClient> {
  const cacheKey = `${environment}:${accountId}:${region}`
  const cached = clientCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.client
  }

  const credentials = await assumeChildAccountRole(environment, accountId)
  const client = new CloudWatchLogsClient({
    region,
    credentials: {
      accessKeyId: credentials.accessKeyId!,
      secretAccessKey: credentials.secretAccessKey!,
      sessionToken: credentials.sessionToken
    }
  })

  const expiresAt = credentials.expiration
    ? credentials.expiration.getTime() - REFRESH_BUFFER_MS
    : Date.now() + DEFAULT_TTL_MS
  clientCache.set(cacheKey, { client, expiresAt })
  return client
}
