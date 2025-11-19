/**
 * Centralized Schema Definitions for Account API
 *
 * This file serves as the single source of truth for all data structures
 * used across the Account API. It ensures consistency and type safety.
 * 
 * Also generates OpenAPI documentation from these Zod schemas.
 */

import { z } from 'zod'
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi'

// Extend Zod with OpenAPI support
extendZodWithOpenApi(z)

// ==========================================
// CORE DATA TYPES
// ==========================================

/**
 * AWS Environment type
 */
export type AwsEnvironment = 'commercial' | 'govcloud'

/**
 * Enrichment levels for organizational data
 */
export type EnrichmentLevel = 'minimal' | 'basic' | 'full'

/**
 * Data source indicators
 */
export type DataSource = 'organization' | 'dynamo' | 'both'

// ==========================================
// BASE SCHEMAS
// ==========================================

/**
 * Core account identifier schema
 */
export const AccountIdentifierSchema = z.object({
  id: z.string().describe('Primary AWS account ID (12 digits)'),
  govId: z.string().optional().describe('GovCloud AWS account ID (12 digits)'),
  accountType: z.enum(['commercial', 'govcloud']).describe('Account type - commercial if no GovCloud ID, govcloud if has GovCloud ID')
})

/**
 * Account metadata schema
 */
export const AccountMetadataSchema = z.object({
  enrichment_level: z.enum(['minimal', 'basic', 'full']),
  data_sources: z.enum(['organization', 'dynamo', 'both']),
  has_organization_data: z.boolean(),
  has_dynamo_data: z.boolean(),
  last_updated: z.string().optional()
})

/**
 * Administrative users schema
 */
export const AdminUsersSchema = z.object({
  primaryAccountAdminUsername: z.string().optional(),
  primaryAccountAdminName: z.string().optional(),
  delegateAccountAdminUsername: z.string().optional(),
  delegateAccountAdminName: z.string().optional(),
  costManagerUsername: z.string().optional(),
  costManagerName: z.string().optional(),
  authorizingManagerUsername: z.string().optional(),
  authorizingManagerName: z.string().optional(),
  IAUsername: z.string().optional(),
  IAName: z.string().optional(),
  laaSiteLeadUsername: z.string().optional(),
  laaSiteLeadName: z.string().optional(),
  BAUsername: z.string().optional(),
  BAName: z.string().optional(),
  accountAdmins: z.array(z.string()).optional().describe('Meta field: all admin users combined')
})

/**
 * Project/Business information schema
 */
export const ProjectInfoSchema = z.object({
  requestID: z.number().optional(),
  projectName: z.string().optional(),
  projectType: z.string().optional(),
  projectNumber: z.string().optional(),
  departmentNumber: z.string().optional(),
  taskNumber: z.string().optional(),
  intendedUse: z.string().optional(),
  dataType: z.string().optional(),
  approvedDataType: z.string().optional(),
  estimatedMonthlyCharge: z.string().optional(),
  platformType: z.string().optional(),
  linesOfBusiness: z.string().optional()
})

/**
 * Infrastructure information schema
 */
export const InfrastructureSchema = z.object({
  isAWSStdEnv: z.boolean().optional(),
  isDirectConnect: z.boolean().optional(),
  enclaveType: z.string().optional(),
  enclaveStatus: z.string().optional(),
  isolatedEnclave: z.string().optional(),
  region: z.string().optional(),
  accountAlias: z.string().optional(),
  dc_cidr: z.string().optional(),
  dc_region: z.string().optional()
})

/**
 * Organizations data schema
 */
export const OrganizationsDataSchema = z.object({
  organizationStatus: z.string().optional(),
  organizationEnvironment: z.enum(['commercial', 'govcloud']).optional(),
  organizationalUnit: z.string().optional(),
  organizationalUnitId: z.string().optional(),
  organizationalPath: z.string().optional(),
  organizationalDepth: z.number().optional(),
  serviceControlPolicies: z.object({
    total_count: z.number(),
    policies: z.array(z.object({
      id: z.string(),
      name: z.string()
    })),
    inheritance_summary: z.object({
      direct_count: z.number(),
      inherited_count: z.number()
    }).optional()
  }).optional()
})

/**
 * Cost and resource data schema
 */
export const CostResourceSchema = z.object({
  cost: z.object({
    totalCost: z.number(),
    currency: z.string().default('USD'),
    period: z.string()
  }).optional(),
  resources: z.object({
    totalResources: z.number(),
    resourceTypes: z.record(z.string(), z.number())
  }).optional()
})

// ==========================================
// MAIN ACCOUNT SCHEMAS
// ==========================================

/**
 * Complete unified account schema
 * This is the main data structure returned by the API
 */
export const UnifiedAccountSchema = AccountIdentifierSchema
  .merge(z.object({
    name: z.string().optional(),
    email: z.string().optional(),
    createdAt: z.string().optional()
  }))
  .merge(ProjectInfoSchema)
  .merge(AdminUsersSchema)
  .merge(InfrastructureSchema)
  .merge(OrganizationsDataSchema)
  .merge(CostResourceSchema)
  .merge(z.object({
    _metadata: AccountMetadataSchema
  }))
  .openapi('UnifiedAccount', {
    title: 'Unified Account',
    description: 'Complete account information combining AWS Organizations and DynamoDB data',
    example: {
      id: '123456789012',
      govId: '987654321098',
      name: 'Example AWS Account',
      email: 'example@company.com',
      env: 'both',
      createdAt: '2023-01-01T00:00:00.000Z',
      requestID: 123,
      projectName: 'Example Project',
      projectType: 'Contract',
      accountAdmins: ['admin.user', 'John Doe'],
      isAWSStdEnv: true,
      organizationStatus: 'ACTIVE',
      organizationEnvironment: 'govcloud',
      _metadata: {
        enrichment_level: 'basic',
        data_sources: 'both',
        has_organization_data: true,
        has_dynamo_data: true,
        last_updated: '2023-01-01T00:00:00.000Z'
      }
    }
  })

/**
 * TypeScript type derived from schema
 */
export type UnifiedAccount = z.infer<typeof UnifiedAccountSchema>

// ==========================================
// API REQUEST/RESPONSE SCHEMAS
// ==========================================

/**
 * Search parameters schema
 * Note: Query parameters come as strings, so we use z.coerce to convert to numbers
 */
export const SearchParamsSchema = z.object({
  search: z.string().optional().describe('General search across multiple fields'),
  accountId: z.string().optional().describe('Filter by account ID'),
  email: z.string().optional().describe('Filter by email'),
  appianId: z.string().optional().describe('Filter by Appian/request ID'),
  minCost: z.coerce.number().optional().describe('Minimum cost filter'),
  maxCost: z.coerce.number().optional().describe('Maximum cost filter'),
  limit: z.coerce.number().min(1).max(200).optional().describe('Results per page (max 200)'),
  page: z.coerce.number().min(1).optional().describe('Page number'),
  pageSize: z.coerce.number().min(1).max(200).optional().describe('Alias for limit'),
  sortBy: z.enum(['name', 'id', 'cost', 'value']).optional().describe('Sort field'),
  order: z.enum(['asc', 'desc']).optional().describe('Sort order'),
  enrichment: z.enum(['minimal', 'basic', 'full']).optional().describe('Level of organizational data to include')
}).openapi('SearchParams', {
  title: 'Search Parameters',
  description: 'Query parameters for filtering and searching accounts',
  example: {
    search: 'MUOS',
    page: 1,
    limit: 50,
    sortBy: 'name',
    order: 'asc',
    enrichment: 'basic'
  }
})

export type SearchParams = z.infer<typeof SearchParamsSchema>

/**
 * DynamoDB filter schema
 */
export const DynamoFilterSchema = z.object({
  key: z.union([z.string(), z.array(z.string())]).describe('Field name(s) to filter'),
  value: z.union([z.string(), z.array(z.string())]).describe('Value(s) to match'),
  operator: z.union([z.string(), z.array(z.string())]).optional().describe('Comparison operator(s)')
})

/**
 * List response schema
 */
export const AccountListResponseSchema = z.object({
  items: z.array(UnifiedAccountSchema),
  count: z.number().describe('Total number of items matching filters'),
  pagination: z.object({
    page: z.number(),
    pageSize: z.number(),
    totalCount: z.number(),
    hasMore: z.boolean()
  }).optional()
}).openapi('AccountListResponse', {
  title: 'Account List Response',
  description: 'Paginated list of unified accounts with metadata',
  example: {
    items: [], // Filled with UnifiedAccount examples
    count: 235,
    pagination: {
      page: 1,
      pageSize: 50,
      totalCount: 235,
      hasMore: true
    }
  }
})

export type AccountListResponse = z.infer<typeof AccountListResponseSchema>

/**
 * Single account response schema
 */
export const SingleAccountResponseSchema = UnifiedAccountSchema

export type SingleAccountResponse = z.infer<typeof SingleAccountResponseSchema>

// ==========================================
// API ERROR SCHEMAS
// ==========================================

/**
 * Standard error response schema
 */
export const ErrorResponseSchema = z.object({
  status: z.literal('error'),
  error: z.string().describe('Error message'),
  code: z.string().optional().describe('Error code'),
  requestID: z.string().optional().describe('Request ID for debugging'),
  timestamp: z.string().optional().describe('Error timestamp')
})

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>

/**
 * Validation error schema
 */
export const ValidationErrorSchema = z.object({
  status: z.literal('error'),
  error: z.literal('Validation failed'),
  details: z.array(z.object({
    field: z.string(),
    message: z.string(),
    code: z.string()
  })),
  requestID: z.string().optional()
})

export type ValidationError = z.infer<typeof ValidationErrorSchema>

// ==========================================
// SUCCESS RESPONSE WRAPPER
// ==========================================

/**
 * Generic success response wrapper
 */
export const SuccessResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    status: z.literal('success'),
    data: dataSchema,
    requestID: z.string().optional(),
    timestamp: z.string().optional()
  })

// ==========================================
// SCHEMA VALIDATION HELPERS
// ==========================================

/**
 * Validate account data against schema
 */
export const validateAccount = (data: unknown): UnifiedAccount => {
  return UnifiedAccountSchema.parse(data)
}

/**
 * Validate search parameters
 */
export const validateSearchParams = (data: unknown): SearchParams => {
  return SearchParamsSchema.parse(data)
}

/**
 * Safe validation with error handling
 */
export const safeValidateAccount = (data: unknown) => {
  return UnifiedAccountSchema.safeParse(data)
}

// ==========================================
// SCHEMA DOCUMENTATION
// ==========================================

/**
 * Generate OpenAPI schema for documentation
 */
export const getOpenAPISchemas = () => {
  return {
    UnifiedAccount: UnifiedAccountSchema,
    AccountListResponse: AccountListResponseSchema,
    SearchParams: SearchParamsSchema,
    ErrorResponse: ErrorResponseSchema,
    ValidationError: ValidationErrorSchema
  }
}