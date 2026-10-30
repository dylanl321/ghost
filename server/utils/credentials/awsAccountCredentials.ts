import type { AwsCredentialIdentity } from "@aws-sdk/types";
import { logger } from '../logger'
import { getAssumedRoleCredentials } from '../../lib/aws-client-factory'

interface CachedAwsCredentialIdentity extends AwsCredentialIdentity {
  expiration?: Date;
}

type CredentialCache = Record<string, CachedAwsCredentialIdentity>

const credentialCache: CredentialCache = {};

const aws_commercial_access_key = process.env.AWS_COMMERCIAL_ACCESS_KEY_ID;
const aws_commercial_secret_access_key = process.env.AWS_COMMERCIAL_SECRET_ACCESS_KEY;
const aws_commercial_region = process.env.AWS_COMMERCIAL_REGION;
const aws_govcloud_access_key = process.env.AWS_GOVCLOUD_ACCESS_KEY_ID;
const aws_govcloud_secret_access_key = process.env.AWS_GOVCLOUD_SECRET_ACCESS_KEY;
const aws_govcloud_region = process.env.AWS_GOVCLOUD_REGION;

const deploymentAccount = "461760157232"

export default function getMasterAccountCredentials(profileName: 'commercial' | 'govcloud'): AwsCredentialIdentity {
  if (!aws_commercial_access_key || !aws_commercial_secret_access_key || !aws_commercial_region || !aws_govcloud_access_key ||
    !aws_govcloud_secret_access_key || !aws_govcloud_region) {
    throw new Error("One or more AWS credential environment variables is not set.");
  }

  if (profileName === "commercial") {
    return {
      accessKeyId: aws_commercial_access_key,
      secretAccessKey: aws_commercial_secret_access_key,
    };
  }
  else if (profileName === "govcloud") {
    return {
      accessKeyId: aws_govcloud_access_key,
      secretAccessKey: aws_govcloud_secret_access_key,
    };
  }
  else {
    throw new Error(`Profile '${profileName}' not found in AWS_CREDENTIALS.`);
  }
}

/**
 * Credentials for a member account. Role assumption goes through the shared
 * client factory so both code paths share one credential cache, one
 * in-flight STS call per account and one role/partition/duration policy.
 */
export async function assumeChildAccountRole(environment: 'commercial' | 'govcloud', accountId: string): Promise<CachedAwsCredentialIdentity> {
  // If we are retrieving credentials for the deployment account, and this code is live, use the ECS task credentials
  const config = useRuntimeConfig();
  if (accountId === deploymentAccount && (config.public.environment === "dev" || config.public.environment === "prod")) {
    return getContainerCredentials(environment, accountId)
  }

  logger.debug(`Assuming role for account ${accountId}...`);
  return getAssumedRoleCredentials(environment, accountId, { sessionName: 'child-account-session' })
}

const CREDENTIAL_REFRESH_BUFFER_MS = 5 * 60 * 1000
const inflightContainerCredentials = new Map<string, Promise<CachedAwsCredentialIdentity>>()

async function getContainerCredentials(environment: 'commercial' | 'govcloud', accountId: string): Promise<CachedAwsCredentialIdentity> {
  // Keyed by partition too: a commercial and a GovCloud account can share an id.
  const key = `${environment}:${accountId}`
  const cache = credentialCache[key]
  if (cache && (!cache.expiration || cache.expiration.getTime() > Date.now() + CREDENTIAL_REFRESH_BUFFER_MS)) {
    return cache
  }

  const inflight = inflightContainerCredentials.get(key)
  if (inflight) return inflight

  const promise = (async () => {
    const { fromContainerMetadata } = await import("@aws-sdk/credential-providers");
    const creds = await fromContainerMetadata()();
    const credential: CachedAwsCredentialIdentity = {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      sessionToken: creds.sessionToken,
      expiration: creds.expiration,
    };
    credentialCache[key] = credential;
    return credential;
  })().finally(() => inflightContainerCredentials.delete(key))

  inflightContainerCredentials.set(key, promise)
  return promise
}
