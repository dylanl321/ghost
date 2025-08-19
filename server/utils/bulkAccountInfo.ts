import {
  OrganizationsClient,
  ListAccountsCommand,
} from '@aws-sdk/client-organizations';
import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import awsCredentials from './awsCredentials';

// AWS clients will be initialized lazily to handle async credentials
let organizationsCommercial: OrganizationsClient | null = null;
let organizationsGov: OrganizationsClient | null = null;
let dynamoDBClient: DynamoDBClient | null = null;

// Initialize AWS clients with proper async credential handling
const initializeClients = async () => {
  try {
    if (!organizationsCommercial) {
      const commercialCreds = await awsCredentials('commercial');
      organizationsCommercial = new OrganizationsClient({
        region: 'us-east-1',
        credentials: commercialCreds,
      });
    }

    if (!organizationsGov) {
      const govCreds = await awsCredentials('govcloud');
      organizationsGov = new OrganizationsClient({
        region: 'us-gov-west-1',
        credentials: govCreds,
      });
    }

    if (!dynamoDBClient) {
      const govCreds = await awsCredentials('govcloud');
      dynamoDBClient = new DynamoDBClient({
        region: 'us-gov-west-1',
        credentials: govCreds,
      });
    }
  } catch (error) {
    console.error('Failed to initialize AWS clients:', error);
    throw new Error(`Failed to initialize AWS clients: ${error.message}`);
  }
};

// Cache configuration
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
let cachedAccountInfo: Record<string, object> | null = null;
let cacheTimestamp = 0;

// Rate limiting helpers
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const withRetry = async (fn: Function, maxRetries = 3, baseDelay = 1000) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (error.message?.includes('too many requests') && attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
        console.log(`Rate limited, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`);
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }
};

const listAccountsFromProvider = async (organizations) => {
  return withRetry(async () => {
    const accounts = [];
    let nextToken = null;

    do {
      const command: ListAccountsCommand = new ListAccountsCommand({ NextToken: nextToken });
      const response = await organizations.send(command);
      accounts.push(...response.Accounts);
      nextToken = response.NextToken;
      
      // Add small delay between requests to avoid rate limiting
      if (nextToken) {
        await sleep(100);
      }
    } while (nextToken);

    return accounts;
  });
};

const getAllDynamoDBAccounts = async () => {
  return withRetry(async () => {
    const scanCommand = new ScanCommand({
      TableName: 'gdms_aws_accounts-master',
    });
    const response = await dynamoDBClient.send(scanCommand);
    return response.Items.map((item) => unmarshall(item));
  });
};

const prefixObjectKeys = (obj, prefix) => {
  return Object.keys(obj).reduce((acc, key) => {
    acc[`${prefix}${key}`] = obj[key];
    return acc;
  }, {});
};

export const getBulkAccountInfo = async () => {
  // Check cache first
  const now = Date.now();
  if (cachedAccountInfo && (now - cacheTimestamp) < CACHE_DURATION) {
    console.log('Returning cached account info');
    return cachedAccountInfo;
  }

  try {
    console.log('Fetching fresh account info from AWS...');
    
    // Initialize AWS clients
    await initializeClients();
    
    // Fetch all data in parallel with rate limiting
    const [commercialAccounts, govAccounts, dynamoAccounts] = await Promise.all([
      listAccountsFromProvider(organizationsCommercial),
      listAccountsFromProvider(organizationsGov),
      getAllDynamoDBAccounts()
    ]);

    // Combine organization accounts
    const allOrgAccounts = [
      ...commercialAccounts.map((account) => ({ ...account, source: 'org-commercial' })),
      ...govAccounts.map((account) => ({ ...account, source: 'org-gov' })),
    ];

    // Create lookup maps for efficient matching
    const orgAccountMap = new Map();
    allOrgAccounts.forEach(account => {
      orgAccountMap.set(account.Id, account);
    });

    // Create dynamo account map for lookup by both standard and gov account IDs
    const dynamoAccountMap = new Map();
    dynamoAccounts.forEach(account => {
      if (account.awsStandardAccountID) {
        dynamoAccountMap.set(account.awsStandardAccountID, account);
      }
      if (account.awsGovCloudAccountID) {
        dynamoAccountMap.set(account.awsGovCloudAccountID, account);
      }
    });

    // Build the final account info map
    const accountInfoMap = {};
    
    // Process all unique account IDs from both sources
    const allAccountIds = new Set([
      ...orgAccountMap.keys(),
      ...dynamoAccountMap.keys()
    ]);

    allAccountIds.forEach(accountId => {
      try {
        const orgAccount = orgAccountMap.get(accountId);
        const dynamoAccount = dynamoAccountMap.get(accountId);

        if (orgAccount && dynamoAccount) {
          // Complete information available
          accountInfoMap[accountId] = {
            ...prefixObjectKeys(orgAccount, 'org_'),
            ...prefixObjectKeys(dynamoAccount, 'dynamo_'),
            _hasCompleteInfo: true
          };
        } else if (orgAccount) {
          // Only organization info available
          accountInfoMap[accountId] = {
            ...prefixObjectKeys(orgAccount, 'org_'),
            _hasCompleteInfo: false,
            _missingData: 'dynamo'
          };
        } else if (dynamoAccount) {
          // Only dynamo info available
          accountInfoMap[accountId] = {
            ...prefixObjectKeys(dynamoAccount, 'dynamo_'),
            _hasCompleteInfo: false,
            _missingData: 'organization'
          };
        }
      } catch (error) {
        console.error(`Error processing account ${accountId}:`, error);
        // Still include partial info for debugging
        accountInfoMap[accountId] = {
          _error: error.message,
          _hasCompleteInfo: false
        };
      }
    });

    // Update cache
    cachedAccountInfo = accountInfoMap;
    cacheTimestamp = now;

    console.log(`Successfully cached ${Object.keys(accountInfoMap).length} accounts`);
    return accountInfoMap;

  } catch (error) {
    console.error('Error fetching bulk account info:', error);
    
    // Return cached data if available, even if stale
    if (cachedAccountInfo) {
      console.warn('Returning stale cached data due to error');
      return cachedAccountInfo;
    }
    
    throw new Error(`Could not fetch bulk account info: ${error.message}`);
  }
};

// Helper function to get specific account info from cache or fetch if needed
export const getAccountInfoById = async (accountId) => {
  const bulkInfo = await getBulkAccountInfo();
  return bulkInfo[accountId] || null;
};

// Helper to clear cache (useful for testing or forced refresh)
export const clearAccountInfoCache = () => {
  cachedAccountInfo = null;
  cacheTimestamp = 0;
  // Reset clients to force re-initialization
  organizationsCommercial = null;
  organizationsGov = null;
  dynamoDBClient = null;
  console.log('Account info cache cleared');
}; 