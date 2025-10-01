/**
 * Entra ID Configuration Validation
 * Validates all environment variables and configuration
 */

/**
 * All Entra ID environment variables
 */
export const ENTRA_ENV_VARS = {
  // Core Configuration (Required)
  ENTRA_TENANT_ID: {
    required: true,
    description: 'Primary Entra ID tenant GUID',
    example: '12345678-1234-1234-1234-123456789012'
  },
  
  // Application Authentication (Only required for app-only auth, not for delegated auth)
  ENTRA_CLIENT_ID: {
    required: false,  // Not required when using user's OIDC token
    description: 'App registration client ID GUID (only for app-only auth)',
    example: '87654321-4321-4321-4321-210987654321'
  },
  ENTRA_CLIENT_SECRET: {
    required: false,  // Not required when using user's OIDC token
    description: 'App registration client secret (only for app-only auth)',
    example: 'your-client-secret-here'
  },
  
  // Optional Multi-Tenant Configuration
  ENTRA_COMMERCIAL_TENANT_ID: {
    required: false,
    description: 'Commercial environment tenant ID (if different)',
    example: '12345678-1234-1234-1234-123456789012'
  },
  ENTRA_GOVCLOUD_TENANT_ID: {
    required: false,
    description: 'GovCloud environment tenant ID (if different)',
    example: '87654321-4321-4321-4321-210987654321'
  },
  
  // Search Optimization
  ENTRA_AWS_GROUPS_OU: {
    required: false,
    description: 'Organizational Unit path for AWS groups',
    example: 'OU=AWSGroups,OU=Security,DC=domain,DC=com'
  },
  ENTRA_AWS_GROUP_PREFIX: {
    required: false,
    description: 'Prefix for AWS authentication groups',
    example: 'AWS_',
    default: 'AWS_'
  },
  ENTRA_DISTRIBUTION_GROUP_SUFFIX: {
    required: false,
    description: 'Suffix for distribution groups',
    example: '.aws',
    default: '.aws'
  },
  ENTRA_OWNER_DELIMITER: {
    required: false,
    description: 'Delimiter separating description from owners',
    example: ' // ',
    default: ' // '
  },
  ENTRA_DEFAULT_DOMAIN: {
    required: false,
    description: 'Default domain for user principal names',
    example: 'gd-ms.com',
    default: 'gd-ms.com'
  },
  
  // Azure Government Cloud Endpoints
  ENTRA_LOGIN_BASE_URL: {
    required: false,
    description: 'Base URL for Azure login (Azure Gov uses .us)',
    example: 'https://login.microsoftonline.us',
    default: 'https://login.microsoftonline.us'
  },
  ENTRA_GRAPH_BASE_URL: {
    required: false,
    description: 'Base URL for Microsoft Graph (Azure Gov uses .us)',
    example: 'https://graph.microsoft.us',
    default: 'https://graph.microsoft.us'
  },
  ENTRA_GRAPH_VERSION: {
    required: false,
    description: 'Microsoft Graph API version',
    example: 'v1.0',
    default: 'v1.0'
  },
  
  // Performance Settings
  ENTRA_CACHE_TTL: {
    required: false,
    description: 'Cache TTL in seconds',
    example: '3600',
    default: '3600'
  },
  ENTRA_BATCH_SIZE: {
    required: false,
    description: 'Graph API batch size (max 999)',
    example: '999',
    default: '999'
  },
  ENTRA_MAX_RETRIES: {
    required: false,
    description: 'Maximum retry attempts for Graph API',
    example: '3',
    default: '3'
  },
  
  // Development & Testing
  ENTRA_DEV_BYPASS: {
    required: false,
    description: 'Bypass authentication in development',
    example: 'true',
    devOnly: true
  },
  ENTRA_TEST_ACCESS_TOKEN: {
    required: false,
    description: 'Test access token for Graph API (development)',
    example: 'eyJ0eXAiOiJKV1Q...',
    devOnly: true
  },
  ENTRA_TEST_USER_EMAIL: {
    required: false,
    description: 'Test user email (development)',
    example: 'test@gd-ms.com',
    devOnly: true
  }
} as const

/**
 * API Keys environment variables
 */
export const API_KEYS_ENV_VARS = {
  DYNAMODB_API_KEYS_TABLE: {
    required: false,
    description: 'DynamoDB table name for API keys',
    example: 'ghost-api-keys',
    default: 'ghost-api-keys'
  },
  API_KEYS_STORAGE_ENV: {
    required: false,
    description: 'AWS environment for API key storage',
    example: 'commercial',
    default: 'commercial',
    allowedValues: ['commercial', 'govcloud']
  }
} as const

/**
 * Validate all Entra configuration
 */
export function validateAllEntraConfig(): {
  valid: boolean
  errors: string[]
  warnings: string[]
  missing: string[]
} {
  const errors: string[] = []
  const warnings: string[] = []
  const missing: string[] = []
  
  // Check required variables
  for (const [varName, config] of Object.entries(ENTRA_ENV_VARS)) {
    if (config.required && !process.env[varName]) {
      missing.push(varName)
      errors.push(`Missing required environment variable: ${varName} - ${config.description}`)
    }
  }
  
  // Validate GUID formats
  const guidVars = ['ENTRA_TENANT_ID', 'ENTRA_CLIENT_ID', 'ENTRA_COMMERCIAL_TENANT_ID', 'ENTRA_GOVCLOUD_TENANT_ID']
  for (const varName of guidVars) {
    const value = process.env[varName]
    if (value && !value.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      errors.push(`${varName} must be a valid GUID format`)
    }
  }
  
  // Validate numeric values
  const numericVars = ['ENTRA_CACHE_TTL', 'ENTRA_BATCH_SIZE', 'ENTRA_MAX_RETRIES']
  for (const varName of numericVars) {
    const value = process.env[varName]
    if (value && isNaN(parseInt(value, 10))) {
      errors.push(`${varName} must be a valid number`)
    }
  }
  
  // Check batch size limit
  const batchSize = parseInt(process.env.ENTRA_BATCH_SIZE || '999', 10)
  if (batchSize > 999) {
    errors.push('ENTRA_BATCH_SIZE cannot exceed 999 (Graph API limit)')
  }
  
  // Check for development-only variables in production
  if (process.env.NODE_ENV === 'production') {
    const devVars = Object.entries(ENTRA_ENV_VARS)
      .filter(([_, config]) => config.devOnly)
      .map(([varName]) => varName)
    
    for (const varName of devVars) {
      if (process.env[varName]) {
        warnings.push(`Development variable ${varName} is set in production environment`)
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    missing
  }
}

/**
 * Generate environment configuration summary
 */
export function getConfigSummary(): {
  configured: string[]
  missing: string[]
  development: string[]
  recommendations: string[]
} {
  const configured: string[] = []
  const missing: string[] = []
  const development: string[] = []
  const recommendations: string[] = []
  
  // Check Entra variables
  for (const [varName, config] of Object.entries(ENTRA_ENV_VARS)) {
    if (process.env[varName]) {
      if (config.devOnly) {
        development.push(varName)
      } else {
        configured.push(varName)
      }
    } else if (config.required) {
      missing.push(varName)
    }
  }
  
  // Check API key variables
  for (const [varName, config] of Object.entries(API_KEYS_ENV_VARS)) {
    if (process.env[varName]) {
      configured.push(varName)
    } else if (config.required) {
      missing.push(varName)
    }
  }
  
  // Generate recommendations
  if (!process.env.ENTRA_COMMERCIAL_TENANT_ID && !process.env.ENTRA_GOVCLOUD_TENANT_ID) {
    recommendations.push('Consider setting separate tenant IDs for commercial and govcloud if using multiple tenants')
  }
  
  if (!process.env.ENTRA_AWS_GROUPS_OU) {
    recommendations.push('Set ENTRA_AWS_GROUPS_OU to optimize group searches')
  }
  
  if (process.env.NODE_ENV === 'production' && process.env.ENTRA_DEV_BYPASS === 'true') {
    recommendations.push('Disable ENTRA_DEV_BYPASS in production')
  }
  
  return {
    configured,
    missing,
    development,
    recommendations
  }
}