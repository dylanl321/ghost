/**
 * Entra ID Configuration
 * Centralized configuration for all Entra ID related settings
 */

import type { EntraConfig } from '../../types/entra'

/**
 * Get Entra configuration from environment variables
 */
export function getEntraConfig(): EntraConfig {
  return {
    tenant: {
      commercial: process.env.ENTRA_COMMERCIAL_TENANT_ID,
      govcloud: process.env.ENTRA_GOVCLOUD_TENANT_ID,
      default: process.env.ENTRA_TENANT_ID || ''
    },
    search: {
      ou: process.env.ENTRA_AWS_GROUPS_OU,
      groupPrefix: process.env.ENTRA_AWS_GROUP_PREFIX || 'AWS-',
      distributionSuffix: process.env.ENTRA_DISTRIBUTION_GROUP_SUFFIX || '.aws',
      batchSize: parseInt(process.env.ENTRA_BATCH_SIZE || '999', 10),
      maxRetries: parseInt(process.env.ENTRA_MAX_RETRIES || '3', 10)
    },
    parsing: {
      ownerDelimiter: process.env.ENTRA_OWNER_DELIMITER || ' \\\\ ',
      ownerPattern: /^(.+?)\s\\+\s/  // Regex to extract owner section before any number of backslashes
    },
    cache: {
      ttl: parseInt(process.env.ENTRA_CACHE_TTL || '3600', 10),
      prefix: 'entra:'
    },
    domain: {
      default: process.env.ENTRA_DEFAULT_DOMAIN || 'gd-ms.com'
    },
    endpoints: {
      loginBase: process.env.ENTRA_LOGIN_BASE_URL || 'https://login.microsoftonline.us',
      graphBase: process.env.ENTRA_GRAPH_BASE_URL || 'https://graph.microsoft.us',
      graphVersion: process.env.ENTRA_GRAPH_VERSION || 'v1.0'
    }
  }
}

/**
 * Get tenant ID for a specific environment
 */
export function getTenantId(environment?: 'commercial' | 'govcloud'): string {
  const config = getEntraConfig()
  
  if (environment === 'commercial' && config.tenant.commercial) {
    return config.tenant.commercial
  }
  
  if (environment === 'govcloud' && config.tenant.govcloud) {
    return config.tenant.govcloud
  }
  
  return config.tenant.default
}

/**
 * Build Graph API filter for AWS groups
 * Pattern: AWS-[ACCOUNT-ID]_[ROLE]
 */
export function buildGroupFilter(accountId?: string, _environment?: 'commercial' | 'govcloud'): string {
  // Note: Environment is not encoded in group names, so we ignore it for filtering
  // Both AWS- and legacy AWS_ prefixes exist, as do _ and - role separators.
  
  // If accountId is specified, look for all groups for that account
  if (accountId) {
    return `(${[
      `startsWith(displayName, ${odataString(`AWS-${accountId}_`)})`,
      `startsWith(displayName, ${odataString(`AWS-${accountId}-`)})`,
      `startsWith(displayName, ${odataString(`AWS_${accountId}_`)})`,
      `startsWith(displayName, ${odataString(`AWS_${accountId}-`)})`
    ].join(' or ')})`
  }
  
  // Otherwise, get all AWS groups
  return "(startsWith(displayName, 'AWS-') or startsWith(displayName, 'AWS_'))"
}

export function isAwsAuthorizationGroupName(displayName: string): boolean {
  return /^AWS[-_]\d{12}[_-].+$/i.test(displayName)
}

/**
 * Quote a value for an OData string literal. A single quote ends the literal,
 * so values taken from requests or account records must have it doubled.
 */
export function odataString(value: string): string {
  return `'${String(value).replace(/'/g, "''")}'`
}

/**
 * Build filter for distribution groups
 */
export function buildDistributionGroupFilter(accountName?: string): string {
  const config = getEntraConfig()
  const suffix = config.search.distributionSuffix
  
  if (accountName) {
    return `displayName eq ${odataString(`${accountName}${suffix}`)}`
  }
  
  return `endsWith(displayName, '${suffix}')`
}

/**
 * Get cache key for different entity types
 */
export function getCacheKey(type: 'groups' | 'members' | 'user' | 'owners', identifier?: string): string {
  const config = getEntraConfig()
  const prefix = config.cache.prefix
  
  if (identifier) {
    return `${prefix}${type}:${identifier}`
  }
  
  return `${prefix}${type}:all`
}

/**
 * Get Graph API base URL from configuration
 */
export function getGraphBaseUrl(): string {
  const config = getEntraConfig()
  return `${config.endpoints.graphBase}/${config.endpoints.graphVersion}`
}

/**
 * Graph API endpoints configuration
 */
export const GRAPH_ENDPOINTS = {
  groups: '/groups',
  users: '/users',
  members: (groupId: string) => `/groups/${groupId}/members`,
  owners: (groupId: string) => `/groups/${groupId}/owners`,
  user: (userId: string) => `/users/${userId}`,
  groupsByUser: (userId: string) => `/users/${userId}/memberOf`
} as const

/**
 * Graph API select fields for different queries
 */
export const GRAPH_SELECT_FIELDS = {
  group: ['id', 'displayName', 'description', 'mailEnabled', 'securityEnabled', 'mail', 'createdDateTime'],
  user: ['id', 'displayName', 'userPrincipalName', 'mail', 'givenName', 'surname', 'jobTitle', 'department'],
  member: ['id', 'displayName', 'userPrincipalName', 'mail']
} as const

/**
 * Check if Entra ID is properly configured
 */
export function isEntraConfigured(): boolean {
  const config = getEntraConfig()
  return !!(config.tenant.default || (config.tenant.commercial && config.tenant.govcloud))
}

/**
 * Validate Entra configuration
 */
export function validateEntraConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  const config = getEntraConfig()
  
  if (!config.tenant.default && !config.tenant.commercial && !config.tenant.govcloud) {
    errors.push('No Entra tenant ID configured. Set ENTRA_TENANT_ID or environment-specific tenant IDs.')
  }
  
  if (config.search.batchSize > 999) {
    errors.push('ENTRA_BATCH_SIZE cannot exceed 999 (Graph API limit)')
  }
  
  if (config.cache.ttl < 60) {
    errors.push('ENTRA_CACHE_TTL should be at least 60 seconds')
  }
  
  return {
    valid: errors.length === 0,
    errors
  }
}

// Export a singleton instance
export const entraConfig = getEntraConfig()
