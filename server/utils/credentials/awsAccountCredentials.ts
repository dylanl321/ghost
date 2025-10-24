import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";
import type { AwsCredentialIdentity } from "@aws-sdk/types";
import { logger } from '../logger'

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

export async function assumeChildAccountRole(environment: 'commercial' | 'govcloud', accountId: string) {
  const cache = credentialCache[accountId]
  if (cache && cache.expiration && cache.expiration > new Date()) {
    return cache
  }

  if (!aws_commercial_access_key || !aws_commercial_secret_access_key || !aws_commercial_region || !aws_govcloud_access_key ||
    !aws_govcloud_secret_access_key || !aws_govcloud_region) {
    throw new Error("One or more AWS credential environment variables is not set.");
  }

  logger.debug(`Assuming role for account ${accountId}...`);

  // If we are retrieving credentials for the deployment account, and this code is live, use the EC2 instance metadata
  const config = useRuntimeConfig();
  if (accountId === deploymentAccount && (config.public.environment === "dev" || config.public.environment === "prod")) {

    // Use ECS metadata credentials in deployed environment
    const { fromContainerMetadata } = await import("@aws-sdk/credential-providers");
    const credentialsProvider = fromContainerMetadata();

    const creds = await credentialsProvider();
    const credential: CachedAwsCredentialIdentity = {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      sessionToken: creds.sessionToken,
      expiration: creds.expiration,
    };
    credentialCache[accountId] = credential;
    return credential;
  } else {
    const creds = getMasterAccountCredentials(environment);

    const stsClient = new STSClient({
      region: environment === "govcloud" ? "us-gov-west-1" : "us-east-1",
      credentials: creds
    });

    const partition = environment === "govcloud" ? "aws-us-gov" : "aws";
    const roleArn = `arn:${partition}:iam::${accountId}:role/GDMSOrganizationsRole`;

    const assumeRoleCommand = new AssumeRoleCommand({
      RoleArn: roleArn,
      RoleSessionName: "child-account-session",
      DurationSeconds: 3600,
    });

    const response = await stsClient.send(assumeRoleCommand);

    if (!response.Credentials) throw new Error("Failed to assume role. Make sure 'environment' lines up with 'accountId'.");

    const credential: CachedAwsCredentialIdentity = {
      accessKeyId: response.Credentials.AccessKeyId!,
      secretAccessKey: response.Credentials.SecretAccessKey!,
      sessionToken: response.Credentials.SessionToken,
      expiration: response.Credentials.Expiration,
    };
    credentialCache[accountId] = credential;

    return credential;
  }
}