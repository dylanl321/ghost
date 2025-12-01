/**
 * Resource Schema Detector
 *
 * Intelligently analyzes AWS resource configurations to detect and extract
 * the most relevant attributes without hardcoding specific resource types.
 * Uses metadata rules and patterns to identify key attributes dynamically.
 */

import { logger } from './logger'

/**
 * Attribute metadata for smart formatting and prioritization
 */
interface AttributeMetadata {
  key: string
  label: string
  priority: number // Higher = more important
  type: 'string' | 'number' | 'boolean' | 'datetime' | 'object' | 'array'
  category: 'identity' | 'state' | 'config' | 'network' | 'security' | 'performance' | 'metadata'
  format?: (value: any) => string
}

/**
 * Pattern-based rules for identifying important attributes
 * These patterns work across ANY AWS resource type
 */
const ATTRIBUTE_PATTERNS = [
  // Identity attributes (highest priority)
  {
    pattern: /^(.*Id|.*Identifier|.*Name|.*Arn)$/i,
    category: 'identity' as const,
    priority: 100,
    type: 'string' as const
  },
  // State attributes
  {
    pattern: /^(state|status|.*State|.*Status)$/i,
    category: 'state' as const,
    priority: 90,
    type: 'string' as const
  },
  // Size/capacity attributes
  {
    pattern: /^(size|.*Size|capacity|.*Capacity|storage|.*Storage|memory|.*Memory)$/i,
    category: 'performance' as const,
    priority: 80,
    type: 'number' as const,
    format: (v: number) => formatStorage(v)
  },
  // Type attributes
  {
    pattern: /^(type|.*Type|class|.*Class|family|.*Family)$/i,
    category: 'config' as const,
    priority: 85,
    type: 'string' as const
  },
  // Network attributes
  {
    pattern: /^(.*IpAddress|.*Ip|.*Address|.*Dns|vpcId|subnetId|securityGroup)$/i,
    category: 'network' as const,
    priority: 75,
    type: 'string' as const
  },
  // Security attributes
  {
    pattern: /^(encrypted|public.*|private.*|.*Security.*|.*Policy)$/i,
    category: 'security' as const,
    priority: 85,
    type: 'boolean' as const,
    format: (v: boolean) => v ? 'Yes' : 'No'
  },
  // Time attributes
  {
    pattern: /^(.*Time|.*Date|.*At|created|modified|updated|launched)$/i,
    category: 'metadata' as const,
    priority: 60,
    type: 'datetime' as const,
    format: (v: string) => formatDateTime(v)
  },
  // Version attributes
  {
    pattern: /^(version|.*Version|revision|.*Revision)$/i,
    category: 'config' as const,
    priority: 70,
    type: 'string' as const
  },
  // Region/AZ attributes
  {
    pattern: /^(region|.*Region|availabilityZone|.*Zone)$/i,
    category: 'metadata' as const,
    priority: 75,
    type: 'string' as const
  },
  // Performance attributes
  {
    pattern: /^(iops|throughput|.*Throughput|bandwidth|.*Bandwidth)$/i,
    category: 'performance' as const,
    priority: 70,
    type: 'number' as const
  },
  // Boolean flags
  {
    pattern: /^(enabled|disabled|is.*|has.*|multi.*|public.*|auto.*)$/i,
    category: 'config' as const,
    priority: 65,
    type: 'boolean' as const,
    format: (v: boolean) => v ? 'Yes' : 'No'
  }
]

/**
 * Keys to always exclude (too verbose or not useful)
 */
const EXCLUDED_KEYS = new Set([
  'tags',
  'metadata',
  'configuration',
  'rawConfiguration',
  'arn', // Shown separately
  'resourceArn',
  'owner',
  'ownerId',
  'requestId',
  'responseElements',
  'responseMetadata',
  'sdkResponseMetadata',
  'sdkHttpMetadata'
])

/**
 * Extract and analyze attributes from any AWS resource configuration
 */
export function extractResourceAttributes(
  resourceType: string,
  configuration: any,
  options: {
    maxAttributes?: number
    includeNested?: boolean
    priorityThreshold?: number
  } = {}
): {
  attributes: Record<string, any>
  schema: AttributeMetadata[]
} {
  const {
    maxAttributes = 10,
    includeNested = true,
    priorityThreshold = 50
  } = options

  try {
    // Parse configuration if it's a string
    const config = typeof configuration === 'string'
      ? JSON.parse(configuration)
      : configuration

    if (!config || typeof config !== 'object') {
      return { attributes: {}, schema: [] }
    }

    // Flatten nested objects to one level (optional)
    const flatConfig = includeNested
      ? flattenObject(config, 2) // Max 2 levels deep
      : config

    // Analyze each attribute and assign metadata
    const attributesWithMetadata: Array<{
      key: string
      value: any
      metadata: AttributeMetadata
    }> = []

    for (const [key, value] of Object.entries(flatConfig)) {
      // Skip excluded keys
      if (EXCLUDED_KEYS.has(key.toLowerCase())) continue

      // Skip null/undefined
      if (value === null || value === undefined) continue

      // Skip overly complex objects/arrays (unless they're small)
      if (typeof value === 'object') {
        if (Array.isArray(value) && value.length > 5) continue
        if (!Array.isArray(value) && Object.keys(value).length > 3) continue
      }

      // Detect attribute metadata using patterns
      const metadata = detectAttributeMetadata(key, value, resourceType)

      // Only include if priority meets threshold
      if (metadata.priority >= priorityThreshold) {
        attributesWithMetadata.push({ key, value, metadata })
      }
    }

    // Sort by priority (highest first)
    attributesWithMetadata.sort((a, b) => b.metadata.priority - a.metadata.priority)

    // Take top N attributes
    const topAttributes = attributesWithMetadata.slice(0, maxAttributes)

    // Build result
    const attributes: Record<string, any> = {}
    const schema: AttributeMetadata[] = []

    for (const { key, value, metadata } of topAttributes) {
      attributes[key] = value
      schema.push(metadata)
    }

    logger.debug('[Schema Detector] Extracted attributes', {
      resourceType,
      totalKeys: Object.keys(flatConfig).length,
      selectedKeys: schema.length,
      keys: schema.map(s => s.key)
    })

    return { attributes, schema }

  } catch (error: any) {
    logger.error('[Schema Detector] Extraction failed', {
      resourceType,
      error: error.message
    })
    return { attributes: {}, schema: [] }
  }
}

/**
 * Detect metadata for an attribute using pattern matching
 */
function detectAttributeMetadata(
  key: string,
  value: any,
  resourceType: string
): AttributeMetadata {
  // Try to match against patterns
  for (const pattern of ATTRIBUTE_PATTERNS) {
    if (pattern.pattern.test(key)) {
      return {
        key,
        label: formatAttributeLabel(key),
        priority: pattern.priority,
        type: pattern.type,
        category: pattern.category,
        format: pattern.format
      }
    }
  }

  // Default metadata based on value type
  const valueType = detectValueType(value)
  return {
    key,
    label: formatAttributeLabel(key),
    priority: 50, // Default priority
    type: valueType,
    category: 'config',
    format: getDefaultFormatter(valueType)
  }
}

/**
 * Detect the type of a value
 */
function detectValueType(value: any): AttributeMetadata['type'] {
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number') return 'number'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'object') return 'object'

  // Check if string looks like a datetime
  if (typeof value === 'string') {
    if (isDateTimeString(value)) return 'datetime'
  }

  return 'string'
}

/**
 * Check if a string looks like a datetime
 */
function isDateTimeString(value: string): boolean {
  if (!value) return false

  // ISO 8601 format
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) return true

  // Unix timestamp (10 digits)
  if (/^\d{10}$/.test(value)) return true

  // Try parsing as date
  const parsed = Date.parse(value)
  return !isNaN(parsed)
}

/**
 * Format attribute key as human-readable label
 */
function formatAttributeLabel(key: string): string {
  return key
    // Insert space before capitals
    .replace(/([A-Z])/g, ' $1')
    // Handle abbreviations
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    // Capitalize first letter
    .replace(/^./, str => str.toUpperCase())
    // Clean up
    .trim()
    // Handle common AWS abbreviations
    .replace(/\bIp\b/g, 'IP')
    .replace(/\bId\b/g, 'ID')
    .replace(/\bVpc\b/g, 'VPC')
    .replace(/\bDb\b/g, 'DB')
    .replace(/\bDns\b/g, 'DNS')
    .replace(/\bIops\b/g, 'IOPS')
    .replace(/\bAz\b/g, 'AZ')
    .replace(/\bArn\b/g, 'ARN')
}

/**
 * Get default formatter for a value type
 */
function getDefaultFormatter(type: AttributeMetadata['type']): ((value: any) => string) | undefined {
  switch (type) {
    case 'boolean':
      return (v: boolean) => v ? 'Yes' : 'No'
    case 'datetime':
      return (v: string) => formatDateTime(v)
    case 'array':
      return (v: any[]) => Array.isArray(v) ? `${v.length} items` : String(v)
    case 'object':
      return (v: any) => typeof v === 'object' ? JSON.stringify(v) : String(v)
    default:
      return undefined
  }
}

/**
 * Flatten nested objects to make them easier to display
 */
function flattenObject(obj: any, maxDepth: number = 2, prefix: string = '', depth: number = 0): Record<string, any> {
  if (depth >= maxDepth) return { [prefix]: obj }

  const flattened: Record<string, any> = {}

  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      // Recursively flatten nested objects
      Object.assign(flattened, flattenObject(value, maxDepth, newKey, depth + 1))
    } else {
      flattened[newKey] = value
    }
  }

  return flattened
}

/**
 * Format storage sizes intelligently
 */
function formatStorage(value: number): string {
  if (value < 1024) return `${value} GB`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} TB`
  return `${(value / (1024 * 1024)).toFixed(1)} PB`
}

/**
 * Format datetime values
 */
function formatDateTime(value?: string): string {
  if (!value) return '-'
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(value))
  } catch {
    return value
  }
}

/**
 * Batch extract attributes for multiple resources
 * Returns a unified schema based on common attributes
 */
export function extractBatchResourceAttributes(
  resources: Array<{ resourceType: string; configuration: any }>,
  options: {
    maxAttributes?: number
    unifySchema?: boolean
  } = {}
): {
  resources: Array<{ attributes: Record<string, any>; schema: AttributeMetadata[] }>
  unifiedSchema?: AttributeMetadata[]
} {
  const { maxAttributes = 10, unifySchema = true } = options

  // Extract attributes for each resource
  const extractedResources = resources.map(r =>
    extractResourceAttributes(r.resourceType, r.configuration, { maxAttributes })
  )

  if (!unifySchema) {
    return { resources: extractedResources }
  }

  // Build unified schema based on most common attributes
  const attributeFrequency = new Map<string, { count: number; metadata: AttributeMetadata }>()

  for (const extracted of extractedResources) {
    for (const metadata of extracted.schema) {
      const existing = attributeFrequency.get(metadata.key)
      if (existing) {
        existing.count++
      } else {
        attributeFrequency.set(metadata.key, { count: 1, metadata })
      }
    }
  }

  // Sort by frequency and priority
  const unifiedSchema = Array.from(attributeFrequency.values())
    .sort((a, b) => {
      if (a.count !== b.count) return b.count - a.count
      return b.metadata.priority - a.metadata.priority
    })
    .slice(0, maxAttributes)
    .map(v => v.metadata)

  return { resources: extractedResources, unifiedSchema }
}
