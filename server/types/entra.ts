/**
 * Entra ID (Azure AD) Type Definitions
 * Types for Microsoft Graph API and Entra ID integration
 */

/**
 * AWS Environment Types
 */
export type AWSEnvironmentType = 'commercial' | 'govcloud'

/**
 * Raw Entra ID Group from Graph API
 */
export interface EntraGroup {
  id: string
  displayName: string
  description?: string
  mailEnabled?: boolean
  securityEnabled?: boolean
  mail?: string
  createdDateTime?: string
  membershipRule?: string
  membershipRuleProcessingState?: string
}

/**
 * Raw Entra ID User from Graph API
 */
export interface EntraUser {
  id: string
  displayName: string
  userPrincipalName: string
  mail?: string
  givenName?: string
  surname?: string
  jobTitle?: string
  department?: string
  officeLocation?: string
  mobilePhone?: string
  businessPhones?: string[]
}

/**
 * Parsed AWS Group with extracted metadata
 */
export interface ParsedAWSGroup {
  id: string
  displayName: string
  accountId: string
  environment: AWSEnvironmentType
  role: string
  description: string
  purpose: string
  owners: string[]
  isDistributionGroup: boolean
  mailEnabled?: boolean
  securityEnabled?: boolean
  memberCount?: number
}

/**
 * Distribution Group specific type
 */
export interface DistributionGroup {
  id: string
  displayName: string
  accountName: string
  description: string
  owners: string[]
  mail?: string
  memberCount?: number
}

/**
 * Group owner information
 */
export interface GroupOwner {
  identifier: string  // Could be username or group name
  type: 'user' | 'group' | 'unknown'
  details?: EntraUser | EntraGroup
}

/**
 * Account groups organized by environment
 */
export interface AccountGroups {
  accountId: string
  commercial: ParsedAWSGroup[]
  govcloud: ParsedAWSGroup[]
  distribution: DistributionGroup | null
  uniqueOwners: GroupOwner[]
}

/**
 * Group members response
 */
export interface GroupMembersResponse {
  groupId: string
  displayName: string
  members: EntraUser[]
  totalCount: number
  nextLink?: string
}

/**
 * Entra configuration settings
 */
export interface EntraConfig {
  tenant: {
    commercial?: string
    govcloud?: string
    default: string
  }
  search: {
    ou?: string
    groupPrefix: string
    distributionSuffix: string
    batchSize: number
    maxRetries: number
  }
  parsing: {
    ownerDelimiter: string
    ownerPattern: RegExp
  }
  cache: {
    ttl: number
    prefix: string
  }
  domain: {
    default: string
  }
  endpoints: {
    loginBase: string
    graphBase: string
    graphVersion: string
  }
}

/**
 * Graph API Error Response
 */
export interface GraphAPIError {
  error: {
    code: string
    message: string
    innerError?: {
      code?: string
      message?: string
      requestId?: string
      date?: string
    }
  }
}

/**
 * Entra API Response wrapper
 */
export interface EntraAPIResponse<T> {
  success: boolean
  data?: T
  error?: string
  cached?: boolean
  timestamp?: string
}

/**
 * Search filters for groups
 */
export interface GroupSearchFilters {
  accountId?: string
  environment?: AWSEnvironmentType
  role?: string
  includeDistribution?: boolean
  searchTerm?: string
}

/**
 * Cache tags specific to Entra
 */
export enum EntraCacheTags {
  ENTRA = 'ENTRA',
  ENTRA_GROUPS = 'ENTRA_GROUPS',
  ENTRA_USERS = 'ENTRA_USERS',
  ENTRA_OWNERS = 'ENTRA_OWNERS'
}

/**
 * Token information from OIDC session
 */
export interface EntraTokenInfo {
  accessToken: string
  refreshToken?: string
  expiresAt: number
  scopes: string[]
}

/**
 * API Key management types
 */
export interface CreateApiKeyRequest {
  name: string
  scopes: string[]
  expiresInDays?: number
  metadata?: Record<string, any>
}

export interface CreateApiKeyResponse {
  id: string
  name: string
  key: string
  scopes: string[]
  expiresAt?: Date
}

export interface ApiKey {
  id: string
  name: string
  keyHash: string
  salt: string
  scopes: string[]
  createdAt: Date
  expiresAt?: Date
  lastUsedAt?: Date
  isActive: boolean
  createdBy: string
  metadata?: Record<string, any>
}