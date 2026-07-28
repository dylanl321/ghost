/**
 * Dataset Schema Builder
 * Generates attributeSchema from dataset records for preview UI
 *
 * Schema generation from dataset records:
 * - Analyzes record structure to extract columns
 * - Handles nested objects by flattening (config.instanceType)
 * - Infers column types (string, number, date, boolean)
 * - Returns AttributeSchema array with column definitions
 */

import type {
  ConfigResourceRecord
} from '../../shared/types/dataset-reports'

/**
 * Attribute schema entry for UI column definitions
 * Matches the format expected by datasets.vue preview
 */
export interface AttributeSchema {
  key: string
  label: string
  type?: 'string' | 'number' | 'date' | 'boolean'
  format?: string
  width?: number
}

/**
 * Dataset type identifier for schema generation
 */
export type DatasetSchemaType = 'config' | 'securityHub' | 'cloudtrail' | 'entraUsers'

/**
 * Maximum depth for nested object flattening
 * Prevents excessive columns from deeply nested structures
 */
const MAX_FLATTEN_DEPTH = 3

/**
 * Build attribute schema from an array of dataset records
 * Analyzes the structure of records to generate column definitions
 *
 * @param records - Array of dataset records to analyze
 * @param datasetType - Type of dataset for type-specific schema generation
 * @returns Array of AttributeSchema entries describing available columns
 */
export function buildAttributeSchema(
  records: Record<string, any>[],
  datasetType: DatasetSchemaType
): AttributeSchema[] {
  // Use predefined schemas for known dataset types
  const baseSchema = getBaseSchemaForType(datasetType)

  if (records.length === 0) {
    return baseSchema
  }

  // For known types, enhance base schema with discovered attributes
  const discoveredKeys = extractKeysFromRecords(records, datasetType)

  // Merge base schema with discovered keys (base schema takes precedence for ordering)
  const baseKeys = new Set(baseSchema.map(s => s.key))
  const additionalSchemas: AttributeSchema[] = []

  for (const key of discoveredKeys) {
    if (!baseKeys.has(key)) {
      const sampleValue = findSampleValue(records, key)
      additionalSchemas.push(buildColumnDefinition(key, sampleValue))
    }
  }

  return [...baseSchema, ...additionalSchemas]
}

/**
 * Flatten nested data in a record to a flat key-value structure
 * Handles nested objects by creating dot-notation keys (e.g., config.instanceType)
 *
 * @param record - Record with potentially nested data
 * @param maxDepth - Maximum nesting depth to flatten (default: 3)
 * @returns Flat record with dot-notation keys
 */
export function flattenNestedData(
  record: Record<string, any>,
  maxDepth: number = MAX_FLATTEN_DEPTH
): Record<string, any> {
  const result: Record<string, any> = {}

  function flatten(obj: any, prefix: string, depth: number): void {
    if (depth > maxDepth) {
      // Beyond max depth, stringify remaining nested objects
      result[prefix] = typeof obj === 'object' ? JSON.stringify(obj) : obj
      return
    }

    if (obj === null || obj === undefined) {
      result[prefix] = ''
      return
    }

    if (Array.isArray(obj)) {
      // Arrays: store count or stringify small arrays
      if (obj.length <= 3 && obj.every(item => typeof item !== 'object')) {
        result[prefix] = obj.join(', ')
      } else {
        result[prefix] = `[${obj.length} items]`
      }
      return
    }

    if (typeof obj === 'object' && !(obj instanceof Date)) {
      // Recurse into nested objects
      for (const key of Object.keys(obj)) {
        const newKey = prefix ? `${prefix}.${key}` : key
        flatten(obj[key], newKey, depth + 1)
      }
      return
    }

    // Primitive value
    result[prefix] = obj
  }

  flatten(record, '', 0)
  return result
}

/**
 * Get base schema for a known dataset type
 * Uses predefined column definitions with proper ordering
 */
function getBaseSchemaForType(datasetType: DatasetSchemaType): AttributeSchema[] {
  switch (datasetType) {
    case 'config':
      return getConfigSchema()
    case 'securityHub':
      return getSecurityHubSchema()
    case 'cloudtrail':
      return getCloudTrailSchema()
    case 'entraUsers':
      return getEntraUsersSchema()
    default:
      return []
  }
}

/**
 * AWS Config resource schema
 * Primary keys first, then common fields, then resource-specific
 */
function getConfigSchema(): AttributeSchema[] {
  return [
    // Primary keys
    { key: 'accountId', label: 'Account ID', type: 'string', width: 15 },
    { key: 'accountName', label: 'Account', type: 'string', width: 25 },
    { key: 'region', label: 'Region', type: 'string', width: 15 },
    { key: 'resourceType', label: 'Resource Type', type: 'string', width: 30 },
    // Common fields
    { key: 'resourceId', label: 'Resource ID', type: 'string', width: 40 },
    { key: 'resourceName', label: 'Resource Name', type: 'string', width: 30 },
    { key: 'complianceStatus', label: 'Compliance Status', type: 'string', width: 18 },
    { key: 'complianceType', label: 'Compliance Rule', type: 'string', width: 35 },
    { key: 'configurationItemCaptureTime', label: 'Last Updated', type: 'date', width: 20 },
    { key: 'arn', label: 'ARN', type: 'string', width: 60 }
  ]
}

/**
 * Security Hub findings schema
 * Severity and status fields prioritized for quick assessment
 */
function getSecurityHubSchema(): AttributeSchema[] {
  return [
    // Primary keys
    { key: 'accountId', label: 'Account ID', type: 'string', width: 15 },
    { key: 'accountName', label: 'Account', type: 'string', width: 25 },
    { key: 'region', label: 'Region', type: 'string', width: 15 },
    // Key assessment fields
    { key: 'severity', label: 'Severity', type: 'string', width: 12 },
    { key: 'severityScore', label: 'Score', type: 'number', width: 8 },
    { key: 'workflowStatus', label: 'Status', type: 'string', width: 15 },
    // Finding details
    { key: 'title', label: 'Finding Title', type: 'string', width: 50 },
    { key: 'productName', label: 'Product', type: 'string', width: 25 },
    { key: 'resourceType', label: 'Resource Type', type: 'string', width: 30 },
    { key: 'resourceId', label: 'Resource ID', type: 'string', width: 40 },
    // Compliance
    { key: 'complianceStatus', label: 'Compliance', type: 'string', width: 12 },
    { key: 'complianceStandard', label: 'Compliance Standard', type: 'string', width: 35 },
    { key: 'controlId', label: 'Control ID', type: 'string', width: 25 },
    // Timestamps
    { key: 'firstObservedAt', label: 'First Observed', type: 'date', width: 20 },
    { key: 'updatedAt', label: 'Last Updated', type: 'date', width: 20 }
  ]
}

/**
 * CloudTrail events schema
 * Event identification and user identity prioritized
 */
function getCloudTrailSchema(): AttributeSchema[] {
  return [
    // Primary keys
    { key: 'accountId', label: 'Account ID', type: 'string', width: 15 },
    { key: 'accountName', label: 'Account', type: 'string', width: 25 },
    { key: 'region', label: 'Region', type: 'string', width: 15 },
    // Event identification
    { key: 'eventTime', label: 'Event Time', type: 'date', width: 20 },
    { key: 'eventName', label: 'Event Name', type: 'string', width: 30 },
    { key: 'eventType', label: 'Event Type', type: 'string', width: 18 },
    { key: 'eventSource', label: 'Service', type: 'string', width: 25 },
    // User identity
    { key: 'userIdentityUserName', label: 'User/Role', type: 'string', width: 30 },
    { key: 'userIdentityType', label: 'Identity Type', type: 'string', width: 15 },
    { key: 'sourceIPAddress', label: 'Source IP', type: 'string', width: 18 },
    // Event details
    { key: 'readOnly', label: 'Read Only', type: 'boolean', width: 12 },
    { key: 'errorCode', label: 'Error Code', type: 'string', width: 20 },
    { key: 'errorMessage', label: 'Error Message', type: 'string', width: 40 }
  ]
}

/**
 * Entra Users schema
 * User properties, groups, and license information
 */
function getEntraUsersSchema(): AttributeSchema[] {
  return [
    // User identification
    { key: 'id', label: 'User ID', type: 'string', width: 40 },
    { key: 'userPrincipalName', label: 'UPN', type: 'string', width: 35 },
    { key: 'displayName', label: 'Display Name', type: 'string', width: 30 },
    { key: 'mail', label: 'Email', type: 'string', width: 35 },
    // Status
    { key: 'accountEnabled', label: 'Enabled', type: 'boolean', width: 10 },
    { key: 'jobTitle', label: 'Job Title', type: 'string', width: 25 },
    { key: 'department', label: 'Department', type: 'string', width: 20 },
    // Location
    { key: 'officeLocation', label: 'Office', type: 'string', width: 20 },
    { key: 'city', label: 'City', type: 'string', width: 15 },
    { key: 'country', label: 'Country', type: 'string', width: 15 },
    // Timestamps
    { key: 'createdDateTime', label: 'Created', type: 'date', width: 20 },
    { key: 'lastSignInDateTime', label: 'Last Sign In', type: 'date', width: 20 }
  ]
}

/**
 * Extract all unique keys from records, handling nested objects
 * Limited to MAX_FLATTEN_DEPTH to prevent excessive columns
 */
function extractKeysFromRecords(
  records: Record<string, any>[],
  _datasetType: DatasetSchemaType
): Set<string> {
  const keys = new Set<string>()

  // Sample first 10 records to discover keys (performance optimization)
  const sampleSize = Math.min(records.length, 10)

  for (let i = 0; i < sampleSize; i++) {
    const flatRecord = flattenNestedData(records[i]!, MAX_FLATTEN_DEPTH)
    for (const key of Object.keys(flatRecord)) {
      // Skip internal/private keys
      if (!key.startsWith('_') && !key.startsWith('$')) {
        keys.add(key)
      }
    }
  }

  return keys
}

/**
 * Find a non-null sample value for a key across records
 * Used for type inference
 */
function findSampleValue(records: Record<string, any>[], key: string): any {
  for (const record of records.slice(0, 10)) {
    const flat = flattenNestedData(record, MAX_FLATTEN_DEPTH)
    if (flat[key] !== undefined && flat[key] !== null && flat[key] !== '') {
      return flat[key]
    }
  }
  return undefined
}

/**
 * Build a column definition from a key and sample value
 * Infers type from sample value
 */
function buildColumnDefinition(key: string, sampleValue: any): AttributeSchema {
  const type = inferColumnType(sampleValue)
  const label = formatKeyAsLabel(key)

  return {
    key,
    label,
    type,
    width: estimateColumnWidth(key, type)
  }
}

/**
 * Infer column type from a sample value
 */
function inferColumnType(value: any): 'string' | 'number' | 'date' | 'boolean' {
  if (value === undefined || value === null) {
    return 'string'
  }

  if (typeof value === 'boolean') {
    return 'boolean'
  }

  if (typeof value === 'number') {
    return 'number'
  }

  if (value instanceof Date) {
    return 'date'
  }

  // Check for ISO date string patterns
  if (typeof value === 'string') {
    // ISO date format: 2024-01-15T10:30:00Z or 2024-01-15
    if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/.test(value)) {
      return 'date'
    }
  }

  return 'string'
}

/**
 * Format a key name as a human-readable label
 * Converts camelCase and dot.notation to Title Case
 */
function formatKeyAsLabel(key: string): string {
  // Handle dot notation (e.g., "config.instanceType" -> "Instance Type")
  const lastPart = key.includes('.') ? key.split('.').pop()! : key

  // Convert camelCase to spaces
  const withSpaces = lastPart.replace(/([A-Z])/g, ' $1')

  // Convert snake_case to spaces
  const normalized = withSpaces.replace(/_/g, ' ')

  // Title case and trim
  return normalized
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
    .trim()
}

/**
 * Estimate column width based on key name and type
 */
function estimateColumnWidth(key: string, type: 'string' | 'number' | 'date' | 'boolean'): number {
  // Type-based defaults
  const typeWidths: Record<string, number> = {
    boolean: 10,
    number: 12,
    date: 20,
    string: 20
  }

  // Key-based heuristics for common fields
  const keyWidths: Record<string, number> = {
    id: 40,
    arn: 60,
    name: 30,
    description: 50,
    email: 35,
    url: 60
  }

  // Check for key-based match
  const lowerKey = key.toLowerCase()
  for (const [pattern, width] of Object.entries(keyWidths)) {
    if (lowerKey.includes(pattern)) {
      return width
    }
  }

  return typeWidths[type] || 20
}

/**
 * Generate schema for a specific resource type within AWS Config
 * Returns extended schema with resource-type-specific fields
 */
export function getResourceTypeSchema(
  resourceType: string,
  _sampleRecords: ConfigResourceRecord[]
): AttributeSchema[] {
  const baseSchema = getConfigSchema()

  // Resource-type-specific extended schemas
  const typeSchemas: Record<string, AttributeSchema[]> = {
    'AWS::EC2::Instance': [
      { key: 'instanceType', label: 'Instance Type', type: 'string', width: 15 },
      { key: 'state', label: 'State', type: 'string', width: 12 },
      { key: 'publicIpAddress', label: 'Public IP', type: 'string', width: 18 },
      { key: 'privateIpAddress', label: 'Private IP', type: 'string', width: 18 },
      { key: 'vpcId', label: 'VPC ID', type: 'string', width: 25 },
      { key: 'subnetId', label: 'Subnet ID', type: 'string', width: 30 }
    ],
    'AWS::S3::Bucket': [
      { key: 'bucketName', label: 'Bucket Name', type: 'string', width: 35 },
      { key: 'publicAccessBlockConfiguration', label: 'Public Access Block', type: 'string', width: 20 },
      { key: 'versioningConfiguration', label: 'Versioning', type: 'string', width: 15 },
      { key: 'serverSideEncryptionConfiguration', label: 'Encryption', type: 'string', width: 15 }
    ],
    'AWS::RDS::DBInstance': [
      { key: 'dbInstanceClass', label: 'Instance Class', type: 'string', width: 20 },
      { key: 'engine', label: 'Engine', type: 'string', width: 15 },
      { key: 'engineVersion', label: 'Version', type: 'string', width: 12 },
      { key: 'storageEncrypted', label: 'Encrypted', type: 'boolean', width: 10 },
      { key: 'multiAZ', label: 'Multi-AZ', type: 'boolean', width: 10 }
    ],
    'AWS::IAM::User': [
      { key: 'userName', label: 'User Name', type: 'string', width: 25 },
      { key: 'createDate', label: 'Created', type: 'date', width: 20 },
      { key: 'passwordLastUsed', label: 'Password Last Used', type: 'date', width: 20 }
    ],
    'AWS::IAM::Role': [
      { key: 'roleName', label: 'Role Name', type: 'string', width: 30 },
      { key: 'createDate', label: 'Created', type: 'date', width: 20 },
      { key: 'maxSessionDuration', label: 'Max Session', type: 'number', width: 15 }
    ],
    'AWS::Lambda::Function': [
      { key: 'functionName', label: 'Function Name', type: 'string', width: 30 },
      { key: 'runtime', label: 'Runtime', type: 'string', width: 15 },
      { key: 'memorySize', label: 'Memory (MB)', type: 'number', width: 12 },
      { key: 'timeout', label: 'Timeout (s)', type: 'number', width: 12 }
    ]
  }

  const extendedSchema = typeSchemas[resourceType] || []
  return [...baseSchema, ...extendedSchema]
}
