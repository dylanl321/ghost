import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";
import type { AwsCredentialIdentity } from "@aws-sdk/types";

type CredentialCache = Record<string, AwsCredentialIdentity>

const credentialCache: CredentialCache = {};

const aws_commercial_access_key = process.env.AWS_COMMERCIAL_ACCESS_KEY_ID;
const aws_commercial_secret_access_key = process.env.AWS_COMMERCIAL_SECRET_ACCESS_KEY;
const aws_commercial_region = process.env.AWS_COMMERCIAL_REGION;
const aws_govcloud_access_key = process.env.AWS_GOVCLOUD_ACCESS_KEY_ID;
const aws_govcloud_secret_access_key = process.env.AWS_GOVCLOUD_SECRET_ACCESS_KEY;
const aws_govcloud_region = process.env.AWS_GOVCLOUD_REGION;

const deploymentAccount = "461760157232"

export default function getMasterAccountCredentials(profileName: 'commercial' | 'govcloud') {
  if (!aws_commercial_access_key || !aws_commercial_secret_access_key || !aws_commercial_region || !aws_govcloud_access_key ||
    !aws_govcloud_secret_access_key || !aws_govcloud_region) {
    throw new Error("One or more AWS credential environment variables is not set.");
  }

  if (profileName === "commercial") {
    return {
      accessKeyId: aws_commercial_access_key,
      secretAccessKey: aws_commercial_secret_access_key,
      region: aws_commercial_region,
    };
  }
  else if (profileName === "govcloud") {
    return {
      accessKeyId: aws_govcloud_access_key,
      secretAccessKey: aws_govcloud_secret_access_key,
      region: aws_govcloud_region,
    };
  }
  else {
    throw new Error(`Profile '${profileName}' not found in AWS_CREDENTIALS.`);
  }
}

export async function assumeChildAccountRole(environment: 'commercial' | 'govcloud', accountId: string) {
  const cache = credentialCache[accountId]
  if (cache && cache.expiration && cache.expiration > new Date()) {
    console.log(`Using cached credentials for account ${accountId}`);
    return cache
  }

  if (!aws_commercial_access_key || !aws_commercial_secret_access_key || !aws_commercial_region || !aws_govcloud_access_key ||
    !aws_govcloud_secret_access_key || !aws_govcloud_region) {
    throw new Error("One or more AWS credential environment variables is not set.");
  }

  console.log(`No cached credentials found for ${accountId}. Retrieving credentials...`);

  const creds = getMasterAccountCredentials(environment);

  // If we are retrieving credentials for the deployment account, and this code is live, use the EC2 instance metadata
  const config = useRuntimeConfig();
  if (accountId === deploymentAccount && (config.public.environment === "dev" || config.public.environment === "prod")) {

    // Use ECS metadata credentials in deployed environment
    const { fromContainerMetadata } = await import("@aws-sdk/credential-providers");
    const credentialsProvider = fromContainerMetadata();

    const creds = await credentialsProvider();
    const credential: AwsCredentialIdentity = {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      sessionToken: creds.sessionToken,
      expiration: creds.expiration,
    };
    credentialCache[accountId] = credential;
    return credential;
  } else {

    const stsClient = new STSClient({
      region: aws_govcloud_region,
      credentials: creds
    });
    const roleArn = `arn:aws-us-gov:iam::${accountId}:role/GDMSOrganizationsRole`;
    const assumeRoleCommand = new AssumeRoleCommand({
      RoleArn: roleArn,
      RoleSessionName: "child-account-session",
      DurationSeconds: 3600,
    });
    const response = await stsClient.send(assumeRoleCommand);
    if (!response.Credentials) throw new Error("Failed to assume role. Make sure 'environment' lines up with 'accountId'.");

    const credential: AwsCredentialIdentity = {
      accessKeyId: response.Credentials.AccessKeyId!,
      secretAccessKey: response.Credentials.SecretAccessKey!,
      sessionToken: response.Credentials.SessionToken,
      expiration: response.Credentials.Expiration,
    };
    credentialCache.sharedservices = credential;
    return credential;
  }
}