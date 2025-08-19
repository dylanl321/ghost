import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';
import type { AwsCredentialIdentity } from '@aws-sdk/types';

type CredentialCache = {
  sharedservices: AwsCredentialIdentity | null;
  securitylake: AwsCredentialIdentity | null;
};

// Just caching this one account for now but could potentially be expanded
const credentialCache: CredentialCache = {
  sharedservices: null,
  securitylake: null,
};

const aws_commercial_access_key = process.env.AWS_COMMERCIAL_ACCESS_KEY;
const aws_commercial_secret_access_key = process.env.AWS_COMMERCIAL_SECRET_ACCESS_KEY;
const aws_commercial_region = process.env.AWS_COMMERCIAL_REGION;
const aws_govcloud_access_key = process.env.AWS_GOVCLOUD_ACCESS_KEY;
const aws_govcloud_secret_access_key = process.env.AWS_GOVCLOUD_SECRET_ACCESS_KEY;
const aws_govcloud_region = process.env.AWS_GOVCLOUD_REGION;

export default function awsCredentials(profileName: 'commercial' | 'govcloud') {


  if (!aws_commercial_access_key || !aws_commercial_secret_access_key || !aws_commercial_region || !aws_govcloud_access_key ||
    !aws_govcloud_secret_access_key || !aws_govcloud_region) {
    throw new Error('One or more AWS credential environment variables is not set.');
  }

  if (profileName === 'commercial') {
    return {
      accessKeyId: aws_commercial_access_key,
      secretAccessKey: aws_commercial_secret_access_key,
      region: aws_commercial_region,
    };
  }
  else if (profileName === 'govcloud') {
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

export async function awsDeploymentAccountCredentials() {
  if (
    credentialCache.sharedservices &&
    credentialCache.sharedservices.expiration &&
    credentialCache.sharedservices.expiration > new Date()
  ) {
    console.log('Using cached credentials for sharedservices');
    return credentialCache.sharedservices;
  }

  console.log('No cached credentials found for sharedservices. Retrieving credentials...');

  const config = useRuntimeConfig();
  console.log('Current environment:', config.public.environment);
  if (config.public.environment === 'dev' || config.public.environment === 'prod') {

    // Use ECS metadata credentials in deployed environment
    const { fromContainerMetadata } = await import('@aws-sdk/credential-providers');
    const credentialsProvider = fromContainerMetadata();

    const creds = await credentialsProvider();
    const credential: AwsCredentialIdentity = {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      sessionToken: creds.sessionToken,
      expiration: creds.expiration,
    };
    credentialCache.sharedservices = credential;
    return credential;
  } else {

    // Local environment - assume role via STS
    const stsClient = new STSClient({
      region: aws_govcloud_region,
      credentials: {
        accessKeyId: aws_govcloud_access_key!,
        secretAccessKey: aws_govcloud_secret_access_key!,
      },
    });
    const roleArn = 'arn:aws-us-gov:iam::461760157232:role/GDMSOrganizationsRole'; // Replace with actual role ARN
    const assumeRoleCommand = new AssumeRoleCommand({
      RoleArn: roleArn,
      RoleSessionName: 'sharedservices-session',
      DurationSeconds: 3600,
    });
    const response = await stsClient.send(assumeRoleCommand);
    if (!response.Credentials) throw new Error('Failed to assume role');

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

export async function awsSecurityLakeCredentials() {
  if (
    credentialCache.securitylake &&
    credentialCache.securitylake.expiration &&
    credentialCache.securitylake.expiration > new Date()
  ) {
    console.log('Using cached credentials for Security Lake');
    return credentialCache.securitylake;
  }

  console.log('No cached credentials found for Security Lake. Retrieving credentials...');

  const config = useRuntimeConfig();
  console.log('Current environment:', config.public.environment);
  
  if (config.public.environment === 'dev' || config.public.environment === 'prod') {
    // Use ECS metadata credentials in deployed environment
    const { fromContainerMetadata } = await import('@aws-sdk/credential-providers');
    const credentialsProvider = fromContainerMetadata();

    const creds = await credentialsProvider();
    const credential: AwsCredentialIdentity = {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      sessionToken: creds.sessionToken,
      expiration: creds.expiration,
    };
    credentialCache.securitylake = credential;
    return credential;
  } else {
    // Local environment - assume role via STS
    if (!aws_govcloud_access_key || !aws_govcloud_secret_access_key || !aws_govcloud_region) {
      throw new Error('GovCloud AWS credentials not configured for local development');
    }

    const stsClient = new STSClient({
      region: aws_govcloud_region,
      credentials: {
        accessKeyId: aws_govcloud_access_key,
        secretAccessKey: aws_govcloud_secret_access_key,
      },
    });
    
    // Security Lake specific role ARN in account 083876038518
    const roleArn = 'arn:aws-us-gov:iam::083876038518:role/GDMSOrganizationsRole';
    const assumeRoleCommand = new AssumeRoleCommand({
      RoleArn: roleArn,
      RoleSessionName: 'security-lake-session',
      DurationSeconds: 3600,
    });
    
    const response = await stsClient.send(assumeRoleCommand);
    if (!response.Credentials) throw new Error('Failed to assume Security Lake role');

    const credential: AwsCredentialIdentity = {
      accessKeyId: response.Credentials.AccessKeyId!,
      secretAccessKey: response.Credentials.SecretAccessKey!,
      sessionToken: response.Credentials.SessionToken,
      expiration: response.Credentials.Expiration,
    };
    
    credentialCache.securitylake = credential;
    return credential;
  }
}