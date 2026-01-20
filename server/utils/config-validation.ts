/**
 * Input validation utilities for AWS Config API endpoints
 * Prevents SQL injection, validates parameters, and enforces security policies
 */

import type { AWSEnvironmentType } from '../types'

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

/**
 * Validate environment parameter
 */
export function validateEnvironmentConfig(environment: any): ValidationResult {
  const errors: string[] = []

  if (environment && environment !== 'commercial' && environment !== 'govcloud') {
    errors.push('Environment must be either "commercial" or "govcloud"')
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Validate AWS account ID format
 */
export function validateAccountId(accountId: string): boolean {
  // AWS account IDs are exactly 12 digits
  return /^\d{12}$/.test(accountId)
}

/**
 * Validate comma-separated account IDs
 */
export function validateAccountIds(accountIds: string): ValidationResult {
  const errors: string[] = []

  if (!accountIds || accountIds.trim() === '') {
    return { valid: true, errors: [] } // Empty is valid (means all accounts)
  }

  const ids = accountIds.split(',').map(id => id.trim())

  // Limit to 50 accounts max to prevent abuse
  if (ids.length > 50) {
    errors.push('Maximum 50 account IDs allowed per request')
  }

  // Validate each account ID format
  const invalidIds = ids.filter(id => !validateAccountId(id))
  if (invalidIds.length > 0) {
    errors.push(`Invalid account ID format: ${invalidIds.join(', ')}. Account IDs must be 12 digits.`)
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Validate AWS region
 */
export function validateRegion(region: string, environment: AWSEnvironmentType = 'commercial'): ValidationResult {
  const errors: string[] = []

  const commercialRegions = [
    'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
    'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1',
    'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-northeast-2',
    'ap-south-1', 'sa-east-1', 'ca-central-1'
  ]

  const govCloudRegions = ['us-gov-west-1', 'us-gov-east-1']

  const validRegions = environment === 'govcloud' ? govCloudRegions : commercialRegions

  if (region && !validRegions.includes(region)) {
    errors.push(`Invalid region "${region}" for ${environment} environment. Valid regions: ${validRegions.join(', ')}`)
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Validate resource type
 */
export function validateResourceType(resourceType: string): ValidationResult {
  const errors: string[] = []

  // AWS resource types follow the format AWS::Service::ResourceType
  const resourceTypePattern = /^AWS::[A-Za-z0-9]+::[A-Za-z0-9]+$/

  if (resourceType && !resourceTypePattern.test(resourceType)) {
    errors.push(`Invalid resource type format: "${resourceType}". Expected format: AWS::Service::ResourceType`)
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Sanitize SQL input to prevent injection
 * Used for buildConfigQuery function
 */
export function sanitizeSqlInput(input: string): string {
  // Remove potentially dangerous characters
  // Allow alphanumeric, spaces, hyphens, underscores, colons, periods, and forward slashes
  return input.replace(/[^a-zA-Z0-9\s\-_:./]/g, '')
}

/**
 * Validate tag filters format
 */
export function validateTagFilters(tags: string): ValidationResult {
  const errors: string[] = []

  if (!tags || tags.trim() === '') {
    return { valid: true, errors: [] }
  }

  // Tags should be in format: key1=value1,key2=value2
  const tagPairs = tags.split(',').map(t => t.trim())

  // Limit to 10 tag filters max
  if (tagPairs.length > 10) {
    errors.push('Maximum 10 tag filters allowed per request')
  }

  for (const pair of tagPairs) {
    if (!pair.includes('=')) {
      errors.push(`Invalid tag format: "${pair}". Expected format: key=value`)
      continue
    }

    const [key, value] = pair.split('=')
    if (!key || !value) {
      errors.push(`Invalid tag pair: "${pair}". Both key and value are required`)
    }

    // Validate tag key/value lengths (AWS limits)
    if (key.length > 128) {
      errors.push(`Tag key too long: "${key}". Maximum 128 characters.`)
    }
    if (value.length > 256) {
      errors.push(`Tag value too long for key "${key}". Maximum 256 characters.`)
    }
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Validate response detail level
 */
export function validateResponseDetail(detail: string): ValidationResult {
  const errors: string[] = []
  const validLevels = ['simple', 'partial', 'full']

  if (detail && !validLevels.includes(detail)) {
    errors.push(`Invalid response detail level: "${detail}". Valid values: ${validLevels.join(', ')}`)
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Validate scan mode
 */
export function validateScanMode(mode: string): ValidationResult {
  const errors: string[] = []
  const validModes = ['quick', 'standard', 'full']

  if (mode && !validModes.includes(mode)) {
    errors.push(`Invalid scan mode: "${mode}". Valid values: ${validModes.join(', ')}`)
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Validate limit parameter
 */
export function validateLimit(limit: any, max: number = 1000): ValidationResult {
  const errors: string[] = []

  if (limit !== undefined && limit !== null) {
    const numLimit = Number(limit)

    if (isNaN(numLimit)) {
      errors.push('Limit must be a number')
    } else if (numLimit < 1) {
      errors.push('Limit must be at least 1')
    } else if (numLimit > max) {
      errors.push(`Limit cannot exceed ${max}`)
    }
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Validate pagination token
 * Tokens should be base64 encoded strings from AWS
 */
export function validateNextToken(token: string): ValidationResult {
  const errors: string[] = []

  if (token) {
    // Check if it's a valid base64 string
    const base64Pattern = /^[A-Za-z0-9+/=]+$/
    if (!base64Pattern.test(token)) {
      errors.push('Invalid pagination token format')
    }

    // Tokens shouldn't be unreasonably long (prevent abuse)
    if (token.length > 10000) {
      errors.push('Pagination token too long')
    }
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Comprehensive validation for config resources query
 */
export function validateConfigResourcesQuery(query: Record<string, any>): ValidationResult {
  const allErrors: string[] = []

  // Validate each parameter
  if (query.environment) {
    const result = validateEnvironmentConfig(query.environment)
    allErrors.push(...result.errors)
  }

  if (query.accountIds) {
    const result = validateAccountIds(query.accountIds)
    allErrors.push(...result.errors)
  }

  if (query.region) {
    const result = validateRegion(query.region, query.environment || 'commercial')
    allErrors.push(...result.errors)
  }

  if (query.resourceType) {
    const result = validateResourceType(query.resourceType)
    allErrors.push(...result.errors)
  }

  if (query.tags) {
    const result = validateTagFilters(query.tags)
    allErrors.push(...result.errors)
  }

  if (query.responseDetail) {
    const result = validateResponseDetail(query.responseDetail)
    allErrors.push(...result.errors)
  }

  if (query.limit) {
    const result = validateLimit(query.limit)
    allErrors.push(...result.errors)
  }

  if (query.nextToken) {
    const result = validateNextToken(query.nextToken)
    allErrors.push(...result.errors)
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors
  }
}

/**
 * Comprehensive validation for config summary query
 */
export function validateConfigSummaryQuery(query: Record<string, any>): ValidationResult {
  const allErrors: string[] = []

  // Validate each parameter
  if (query.environment) {
    const result = validateEnvironmentConfig(query.environment)
    allErrors.push(...result.errors)
  }

  if (query.accountIds) {
    const result = validateAccountIds(query.accountIds)
    allErrors.push(...result.errors)
  }

  if (query.region) {
    const result = validateRegion(query.region, query.environment || 'commercial')
    allErrors.push(...result.errors)
  }

  if (query.scanMode) {
    const result = validateScanMode(query.scanMode)
    allErrors.push(...result.errors)
  }

  if (query.maxResourcesPerType) {
    const result = validateLimit(query.maxResourcesPerType, 10000)
    allErrors.push(...result.errors)
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors
  }
}
