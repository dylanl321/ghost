/**
 * Standardized OpenAPI parameter definitions for consistent API documentation
 * Use these components to ensure terminology consistency across all endpoints
 */

export const standardParameters = {
  // Account identifier parameters
  AccountIdentifier: {
    name: 'identifier',
    in: 'path' as const,
    required: true,
    schema: { type: 'string' },
    description: 'Account identifier - can be 12-digit account ID, email, or numeric request ID'
  },

  AccountIdentifierQuery: {
    name: 'accountId',
    in: 'query' as const,
    required: false,
    schema: { type: 'string' },
    description: 'Account identifier - can be 12-digit account ID, email, or numeric request ID (improves performance)'
  },

  AccountIdentifiersList: {
    name: 'accountIds',
    in: 'query' as const,
    required: false,
    schema: { type: 'string' },
    description: 'Comma-separated list of account identifiers (12-digit ID, email, or request ID)'
  },

  // Instance/Resource identifiers
  InstanceId: {
    name: 'instanceId',
    in: 'path' as const,
    required: true,
    schema: { type: 'string' },
    description: 'EC2 instance ID (e.g., i-1234567890abcdef0)'
  },

  // Special account IDs for cost analysis
  ProformaAccountId: {
    name: 'proformaAccountId',
    in: 'query' as const,
    required: false,
    schema: { 
      type: 'string',
      default: '253821132832'
    },
    description: 'Proforma account ID for cost analysis'
  },

  MasterAccountId: {
    name: 'masterAccountId',
    in: 'query' as const,
    required: false,
    schema: { 
      type: 'string',
      default: '205950196477'
    },
    description: 'Master account ID for cost analysis'
  },

  // Environment parameter
  Environment: {
    name: 'environment',
    in: 'query' as const,
    required: false,
    schema: { 
      type: 'string',
      enum: ['commercial', 'govcloud'],
      default: 'commercial'
    },
    description: 'AWS environment to query'
  },

  // Common filtering parameters
  IncludeDecommissioned: {
    name: 'includeDecommissioned',
    in: 'query' as const,
    required: false,
    schema: { 
      type: 'boolean',
      default: false
    },
    description: 'Include decommissioned accounts in results (default: false)'
  },

  LinesOfBusiness: {
    name: 'linesOfBusiness',
    in: 'query' as const,
    required: false,
    schema: { type: 'string' },
    description: 'Comma-separated list of lines of business to filter accounts'
  },

  Departments: {
    name: 'departments',
    in: 'query' as const,
    required: false,
    schema: { type: 'string' },
    description: 'Comma-separated list of department numbers to filter accounts'
  },

  // Date parameters
  StartDate: {
    name: 'startDate',
    in: 'query' as const,
    required: false,
    schema: { type: 'string', format: 'date' },
    description: 'Start date (YYYY-MM-DD). Required if period is not specified.'
  },

  EndDate: {
    name: 'endDate',
    in: 'query' as const,
    required: false,
    schema: { type: 'string', format: 'date' },
    description: 'End date (YYYY-MM-DD). Required if period is not specified.'
  },

  RelativePeriod: {
    name: 'period',
    in: 'query' as const,
    required: false,
    schema: { 
      type: 'string',
      enum: ['last7days', 'last30days', 'last90days', 'thisMonth', 'lastMonth', 'thisQuarter', 'lastQuarter', 'thisYear', 'lastYear']
    },
    description: 'Relative date period. Cannot be used with startDate/endDate.'
  },

  // Cost analysis parameters
  Granularity: {
    name: 'granularity',
    in: 'query' as const,
    required: false,
    schema: { 
      type: 'string',
      enum: ['DAILY', 'MONTHLY'],
      default: 'MONTHLY'
    },
    description: 'Cost data granularity (auto-selected based on date range if not specified)'
  },

  GroupBy: {
    name: 'groupBy',
    in: 'query' as const,
    required: false,
    schema: { 
      type: 'string',
      enum: ['SERVICE', 'LINKED_ACCOUNT', 'REGION'],
      default: 'SERVICE'
    },
    description: 'Group cost data by dimension'
  },

  Proforma: {
    name: 'proforma',
    in: 'query' as const,
    required: false,
    schema: { 
      type: 'boolean',
      default: false
    },
    description: 'Include proforma data analysis with validation (commercial environment only)'
  },

  Enhanced: {
    name: 'enhanced',
    in: 'query' as const,
    required: false,
    schema: { 
      type: 'boolean',
      default: true
    },
    description: 'Return enhanced format with account names and summaries (default: true)'
  }
}

// Helper function to reference standard parameters
export function getStandardParameter(name: keyof typeof standardParameters) {
  return { $ref: `#/components/parameters/${name}` }
}

// Export for Swagger components
export const swaggerComponents = {
  parameters: standardParameters
}