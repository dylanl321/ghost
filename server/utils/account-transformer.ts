/**
 * Account Data Transformation Utilities
 * 
 * Transforms raw AWS Organizations and DynamoDB data into the unified account schema.
 * Handles data mapping, field extraction, and metadata generation.
 */

import type { UnifiedAccount, EnrichmentLevel, DataSource } from '../schemas/account-schema'
import { logger } from './logger'

// Local type that matches the schema
type AccountType = 'commercial' | 'govcloud'

/**
 * Raw Organizations account data structure
 */
interface OrganizationsAccount {
  Id?: string
  Name?: string
  Email?: string
  Status?: string
  JoinedMethod?: string
  JoinedTimestamp?: Date | string
  Arn?: string
}

/**
 * Raw DynamoDB account data structure (from your accounts table)
 */
interface DynamoDBAccount {
  // Core identifiers (actual field names from your table)
  awsStandardAccountID?: string
  awsGovCloudAccountID?: string
  // Legacy field names (in case they exist)
  accountId?: string
  govCloudAccountId?: string
  
  // Project/Business info
  requestID?: number | string
  projectName?: string
  projectType?: string
  projectNumber?: string
  departmentNumber?: string
  taskNumber?: string
  intendedUse?: string
  dataType?: string
  approvedDataType?: string
  estimatedMonthlyCharge?: string
  platformType?: string
  linesOfBusiness?: string
  
  // Admin users
  primaryAccountAdminUsername?: string
  primaryAccountAdminName?: string
  delegateAccountAdminUsername?: string
  delegateAccountAdminName?: string
  costManagerUsername?: string
  costManagerName?: string
  authorizingManagerUsername?: string
  authorizingManagerName?: string
  IAUsername?: string
  IAName?: string
  laaSiteLeadUsername?: string
  laaSiteLeadName?: string
  BAUsername?: string
  BAName?: string
  
  // Infrastructure
  isAWSStdEnv?: boolean | string
  isDirectConnect?: boolean | string
  enclaveType?: string
  enclaveStatus?: string
  isolatedEnclave?: string
  region?: string
  accountAlias?: string
  dc_cidr?: string
  dc_region?: string
  
  // Organizations data (if stored in DynamoDB)
  organizationStatus?: string
  organizationalUnit?: string
  organizationalUnitId?: string
  organizationalPath?: string
  organizationalDepth?: number | string
  
  // Timestamps
  createdAt?: string
  modifiedDate?: string
  
  // Any other fields from your DynamoDB table
  [key: string]: any
}

/**
 * Convert string boolean values to actual booleans
 */
function parseBoolean(value: boolean | string | undefined): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const lower = value.toLowerCase()
    return lower === 'true' || lower === 'yes' || lower === '1'
  }
  return undefined
}

/**
 * Convert string numbers to actual numbers
 */
function parseNumber(value: number | string | undefined): number | undefined {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return isNaN(parsed) ? undefined : parsed
  }
  return undefined
}

/**
 * Normalize a name/username for comparison
 * Handles cases like "Jeremy.Gibson" vs "Jeremy Gibson"
 */
function normalizeAdminName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.\-_]/g, '') // Remove dots, dashes, underscores
    .replace(/\s+/g, '') // Remove all spaces
    .trim()
}

/**
 * Determine if a name looks like a username (has dots/underscores) vs formatted name (has spaces)
 */
function isUsername(name: string): boolean {
  return name.includes('.') || name.includes('_') || name.includes('-')
}

/**
 * Extract and deduplicate admin usernames from DynamoDB data
 * Handles both username formats (Jeremy.Gibson) and formatted names (Jeremy Gibson)
 */
function extractAdminUsers(dynamo: DynamoDBAccount): string[] {
  const admins: string[] = []
  
  // Collect all admin usernames
  const adminFields = [
    'primaryAccountAdminUsername',
    'delegateAccountAdminUsername', 
    'costManagerUsername',
    'authorizingManagerUsername',
    'IAUsername',
    'laaSiteLeadUsername',
    'BAUsername'
  ]
  
  adminFields.forEach(field => {
    const value = dynamo[field]
    if (value && typeof value === 'string' && value.trim() !== '') {
      admins.push(value.trim())
    }
  })
  
  // Also collect names (separate from usernames)
  const nameFields = [
    'primaryAccountAdminName',
    'delegateAccountAdminName',
    'costManagerName', 
    'authorizingManagerName',
    'IAName',
    'laaSiteLeadName',
    'BAName'
  ]
  
  nameFields.forEach(field => {
    const value = dynamo[field]
    if (value && typeof value === 'string' && value.trim() !== '') {
      admins.push(value.trim())
    }
  })
  
  // Smart deduplication: prefer usernames over formatted names
  const uniqueAdmins: string[] = []
  const seenNormalized = new Set<string>()
  const usernameMap = new Map<string, string>() // normalized -> preferred format
  
  // First pass: collect all usernames and map them
  for (const admin of admins) {
    const normalized = normalizeAdminName(admin)
    if (isUsername(admin)) {
      usernameMap.set(normalized, admin)
    }
  }
  
  // Second pass: deduplicate, preferring usernames over formatted names
  for (const admin of admins) {
    const normalized = normalizeAdminName(admin)
    
    if (!seenNormalized.has(normalized)) {
      // If we have a username format for this person, use that; otherwise use whatever we have
      const preferredFormat = usernameMap.get(normalized) || admin
      uniqueAdmins.push(preferredFormat)
      seenNormalized.add(normalized)
    }
  }
  
  return uniqueAdmins.sort() // Sort for consistent output
}

/**
 * Determine account type based on GovCloud ID presence
 * If account has a GovCloud ID, it's a govcloud account, otherwise it's commercial
 */
function determineAccountType(dynamoData?: DynamoDBAccount): AccountType {
  const govCloudId = dynamoData?.awsGovCloudAccountID || dynamoData?.govCloudAccountId
  if (govCloudId && govCloudId.trim() !== '') {
    return 'govcloud'
  }
  return 'commercial'
}

/**
 * Determine enrichment level based on available data
 */
function determineEnrichmentLevel(hasOrgData: boolean, hasDynamoData: boolean): EnrichmentLevel {
  if (hasOrgData && hasDynamoData) return 'full'
  if (hasOrgData || hasDynamoData) return 'basic'
  return 'minimal'
}

/**
 * Determine data sources
 */
function determineDataSources(hasOrgData: boolean, hasDynamoData: boolean): DataSource {
  if (hasOrgData && hasDynamoData) return 'both'
  if (hasOrgData) return 'organization'
  if (hasDynamoData) return 'dynamo'
  return 'organization' // Default fallback
}

/**
 * Transform Organizations data to unified account format
 */
export function transformOrganizationsData(orgAccount: OrganizationsAccount): Partial<UnifiedAccount> {
  return {
    id: orgAccount.Id || '',
    name: orgAccount.Name || undefined,
    email: orgAccount.Email || undefined,
    createdAt: orgAccount.JoinedTimestamp ? 
      (orgAccount.JoinedTimestamp instanceof Date ? 
        orgAccount.JoinedTimestamp.toISOString() : 
        orgAccount.JoinedTimestamp) : undefined,
    organizationStatus: orgAccount.Status || undefined,
    organizationEnvironment: 'commercial' // Organizations data is always commercial
  }
}

/**
 * Transform DynamoDB data to unified account format
 */
export function transformDynamoDBData(dynamoAccount: DynamoDBAccount): Partial<UnifiedAccount> {
  const accountAdmins = extractAdminUsers(dynamoAccount)
  
  // Use the correct field names from your DynamoDB table (with fallbacks)
  const commercialAccountId = dynamoAccount.awsStandardAccountID || dynamoAccount.accountId || ''
  const govCloudAccountId = dynamoAccount.awsGovCloudAccountID || dynamoAccount.govCloudAccountId
  
  return {
    id: commercialAccountId,
    govId: govCloudAccountId || undefined,
    
    // Project/Business info
    requestID: parseNumber(dynamoAccount.requestID),
    projectName: dynamoAccount.projectName || undefined,
    projectType: dynamoAccount.projectType || undefined,
    projectNumber: dynamoAccount.projectNumber || undefined,
    departmentNumber: dynamoAccount.pepDepartment || dynamoAccount.departmentNumber || undefined,
    taskNumber: dynamoAccount.taskNumber || undefined,
    intendedUse: dynamoAccount.intendedUse || undefined,
    dataType: dynamoAccount.dataType || undefined,
    approvedDataType: dynamoAccount.approvedDataType || undefined,
    estimatedMonthlyCharge: dynamoAccount.estimatedMonthlyCharge || undefined,
    platformType: dynamoAccount.platformType || undefined,
    linesOfBusiness: dynamoAccount.linesOfBusiness || undefined,
    
    // Admin users (individual fields)
    primaryAccountAdminUsername: dynamoAccount.primaryAccountAdminUsername || undefined,
    primaryAccountAdminName: dynamoAccount.primaryAccountAdminName || undefined,
    delegateAccountAdminUsername: dynamoAccount.delegateAccountAdminUsername || undefined,
    delegateAccountAdminName: dynamoAccount.delegateAccountAdminName || undefined,
    costManagerUsername: dynamoAccount.costManagerUsername || undefined,
    costManagerName: dynamoAccount.costManagerName || undefined,
    authorizingManagerUsername: dynamoAccount.authorizingManagerUsername || undefined,
    authorizingManagerName: dynamoAccount.authorizingManagerName || undefined,
    IAUsername: dynamoAccount.IAUsername || undefined,
    IAName: dynamoAccount.IAName || undefined,
    laaSiteLeadUsername: dynamoAccount.laaSiteLeadUsername || undefined,
    laaSiteLeadName: dynamoAccount.laaSiteLeadName || undefined,
    BAUsername: dynamoAccount.BAUsername || undefined,
    BAName: dynamoAccount.BAName || undefined,
    accountAdmins: accountAdmins.length > 0 ? accountAdmins : undefined,
    
    // Infrastructure
    isAWSStdEnv: parseBoolean(dynamoAccount.isAWSStdEnv),
    isDirectConnect: parseBoolean(dynamoAccount.isDirectConnect),
    enclaveType: dynamoAccount.enclaveType || undefined,
    enclaveStatus: dynamoAccount.enclaveStatus || undefined,
    isolatedEnclave: dynamoAccount.isolatedEnclave || undefined,
    region: dynamoAccount.region || undefined,
    accountAlias: dynamoAccount.accountAlias || undefined,
    dc_cidr: dynamoAccount.dc_cidr || undefined,
    dc_region: dynamoAccount.dc_region || undefined,
    
    // Organizations data (if available in DynamoDB)
    organizationStatus: dynamoAccount.organizationStatus || undefined,
    organizationalUnit: dynamoAccount.organizationalUnit || undefined,
    organizationalUnitId: dynamoAccount.organizationalUnitId || undefined,
    organizationalPath: dynamoAccount.organizationalPath || undefined,
    organizationalDepth: parseNumber(dynamoAccount.organizationalDepth),
    
    // Use DynamoDB createdAt if available, otherwise use modifiedDate
    createdAt: dynamoAccount.createdAt || dynamoAccount.modifiedDate || undefined
  }
}

/**
 * Combine Organizations and DynamoDB data into unified account format
 */
export function createUnifiedAccount(
  orgData?: OrganizationsAccount, 
  dynamoData?: DynamoDBAccount
): UnifiedAccount {
  const hasOrgData = !!orgData?.Id
  const hasDynamoData = !!(dynamoData?.awsStandardAccountID || dynamoData?.accountId)
  
  // Start with base account from Organizations (primary source)
  let account: Partial<UnifiedAccount> = {}
  
  if (hasOrgData && orgData) {
    account = { ...account, ...transformOrganizationsData(orgData) }
  }
  
  // Overlay DynamoDB data (metadata and enrichment)
  if (hasDynamoData && dynamoData) {
    const dynamoTransformed = transformDynamoDBData(dynamoData)
    account = { ...account, ...dynamoTransformed }
  }
  
  // Ensure we have at least an account ID
  const accountId = account.id || dynamoData?.awsStandardAccountID || dynamoData?.accountId || ''
  if (!accountId) {
    throw new Error('Account must have a valid ID')
  }
  
  // Determine account type and metadata
  const accountType = determineAccountType(dynamoData)
  const enrichmentLevel = determineEnrichmentLevel(hasOrgData, hasDynamoData)
  const dataSources = determineDataSources(hasOrgData, hasDynamoData)
  
  // Create final unified account
  const unifiedAccount: UnifiedAccount = {
    id: accountId,
    govId: account.govId,
    accountType,
    name: account.name,
    email: account.email,
    createdAt: account.createdAt,
    
    // Project/Business info
    requestID: account.requestID,
    projectName: account.projectName,
    projectType: account.projectType,
    projectNumber: account.projectNumber,
    departmentNumber: account.departmentNumber,
    taskNumber: account.taskNumber,
    intendedUse: account.intendedUse,
    dataType: account.dataType,
    approvedDataType: account.approvedDataType,
    estimatedMonthlyCharge: account.estimatedMonthlyCharge,
    platformType: account.platformType,
    linesOfBusiness: account.linesOfBusiness,
    
    // Admin users
    primaryAccountAdminUsername: account.primaryAccountAdminUsername,
    primaryAccountAdminName: account.primaryAccountAdminName,
    delegateAccountAdminUsername: account.delegateAccountAdminUsername,
    delegateAccountAdminName: account.delegateAccountAdminName,
    costManagerUsername: account.costManagerUsername,
    costManagerName: account.costManagerName,
    authorizingManagerUsername: account.authorizingManagerUsername,
    authorizingManagerName: account.authorizingManagerName,
    IAUsername: account.IAUsername,
    IAName: account.IAName,
    laaSiteLeadUsername: account.laaSiteLeadUsername,
    laaSiteLeadName: account.laaSiteLeadName,
    BAUsername: account.BAUsername,
    BAName: account.BAName,
    accountAdmins: account.accountAdmins,
    
    // Infrastructure
    isAWSStdEnv: account.isAWSStdEnv,
    isDirectConnect: account.isDirectConnect,
    enclaveType: account.enclaveType,
    enclaveStatus: account.enclaveStatus,
    isolatedEnclave: account.isolatedEnclave,
    region: account.region,
    accountAlias: account.accountAlias,
    dc_cidr: account.dc_cidr,
    dc_region: account.dc_region,
    
    // Organizations data
    organizationStatus: account.organizationStatus,
    organizationEnvironment: account.organizationEnvironment,
    organizationalUnit: account.organizationalUnit,
    organizationalUnitId: account.organizationalUnitId,
    organizationalPath: account.organizationalPath,
    organizationalDepth: account.organizationalDepth,
    
    // Cost and resource data (placeholder for future implementation)
    cost: undefined,
    resources: undefined,
    serviceControlPolicies: undefined,
    
    // Metadata
    _metadata: {
      enrichment_level: enrichmentLevel,
      data_sources: dataSources,
      has_organization_data: hasOrgData,
      has_dynamo_data: hasDynamoData,
      last_updated: new Date().toISOString()
    }
  }
  
  return unifiedAccount
}

/**
 * Transform array of raw data into unified accounts
 */
export function transformAccountList(
  orgAccounts: OrganizationsAccount[] = [],
  dynamoAccounts: DynamoDBAccount[] = []
): UnifiedAccount[] {
  // Create lookup map for DynamoDB accounts by commercial account ID
  const dynamoMap = new Map<string, DynamoDBAccount>()
  
  dynamoAccounts.forEach(account => {
    const commercialId = account.awsStandardAccountID || account.accountId
    if (commercialId) {
      dynamoMap.set(commercialId, account)
    }
  })
  
  const unifiedAccounts: UnifiedAccount[] = []
  
  // Process Organizations accounts (master source)
  orgAccounts.forEach(orgAccount => {
    if (orgAccount.Id) {
      const dynamoData = dynamoMap.get(orgAccount.Id)
      
      try {
        const unified = createUnifiedAccount(orgAccount, dynamoData)
        unifiedAccounts.push(unified)
        // Remove from map to track processed accounts
        dynamoMap.delete(orgAccount.Id)
      } catch (error) {
        logger.error(`Error creating unified account for ${orgAccount.Id}:`, error)
      }
    }
  })
  
  // Process remaining DynamoDB accounts (accounts not in Organizations)
  dynamoMap.forEach((dynamoAccount, commercialId) => {
    try {
      const unified = createUnifiedAccount(undefined, dynamoAccount)
      unifiedAccounts.push(unified)
    } catch (error) {
      logger.error(`Error creating unified account for DynamoDB-only account ${commercialId}:`, error)
    }
  })
  
  return unifiedAccounts
}