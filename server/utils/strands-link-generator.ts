/**
 * Strands Link Generator Utility
 * Parses Strands responses and generates smart links to GHOST pages with pre-filled filters
 * Uses AI analysis + site schema for intelligent link generation
 */

import { findMatchingPages, GHOST_SITE_SCHEMA, type PageSchema } from './ghost-site-schema'

export interface SuggestedLink {
  label: string
  url: string
  description: string
  icon: string
  type: 'cost' | 'explorer' | 'users' | 'org-chart' | 'reports' | 'security' | 'admin' | 'organization' | 'accounts'
}

interface ParsedEntities {
  accountIds: string[]
  dateRange?: { start: string; end: string; label: string }
  services?: string[]
  resourceTypes?: string[]
  usernames?: string[]
  severity?: string[]
}

/**
 * Extract account IDs from text (12-digit AWS account numbers)
 * NOTE: This may include both commercial and GovCloud IDs
 */
function extractAccountIds(text: string): string[] {
  const accountRegex = /\b\d{12}\b/g
  const matches = text.match(accountRegex) || []
  return [...new Set(matches)] // Remove duplicates
}

/**
 * Get account data to filter commercial vs GovCloud IDs
 * Returns a map of accountId -> account data
 */
async function getAccountDataMap(): Promise<Map<string, any>> {
  try {
    const { getAllAccounts } = await import('./accounts-consolidated')
    const accounts = await getAllAccounts()

    const accountMap = new Map()
    for (const account of accounts) {
      // Map both commercial and GovCloud IDs to the account
      if (account.accountId) {
        accountMap.set(account.accountId, account)
      }
      if (account.awsStandardAccountID) {
        accountMap.set(account.awsStandardAccountID, account)
      }
      if (account.awsGovCloudAccountID) {
        accountMap.set(account.awsGovCloudAccountID, account)
      }
    }

    return accountMap
  } catch (error) {
    console.error('[Link Generator] Error loading account data:', error)
    return new Map()
  }
}

/**
 * Filter account IDs to prefer commercial IDs over GovCloud
 * If an extracted ID is a GovCloud ID, replace it with the corresponding commercial ID
 */
async function filterToCommercialAccountIds(accountIds: string[]): Promise<string[]> {
  if (accountIds.length === 0) return []

  const accountMap = await getAccountDataMap()
  const commercialIds = new Set<string>()

  for (const id of accountIds) {
    const account = accountMap.get(id)
    if (account) {
      // Prefer commercial ID (accountId or awsStandardAccountID)
      const commercialId = account.accountId || account.awsStandardAccountID
      if (commercialId) {
        commercialIds.add(commercialId)
      } else {
        // No commercial ID found, keep the original
        commercialIds.add(id)
      }
    } else {
      // Account not found in our data, keep the original
      commercialIds.add(id)
    }
  }

  return Array.from(commercialIds)
}

/**
 * Parse date/time references and convert to start/end dates
 */
function parseDateRange(text: string): ParsedEntities['dateRange'] | undefined {
  const lowerText = text.toLowerCase()
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()

  // Month to date
  if (lowerText.includes('this month') || lowerText.includes('mtd')) {
    return {
      start: `${year}-${String(month + 1).padStart(2, '0')}-01`,
      end: now.toISOString().split('T')[0],
      label: 'Month to Date'
    }
  }

  // Last month
  if (lowerText.includes('last month')) {
    const lastMonth = new Date(year, month - 1, 1)
    const lastMonthEnd = new Date(year, month, 0)
    return {
      start: lastMonth.toISOString().split('T')[0],
      end: lastMonthEnd.toISOString().split('T')[0],
      label: 'Last Month'
    }
  }

  // Year to date
  if (lowerText.includes('this year') || lowerText.includes('ytd')) {
    return {
      start: `${year}-01-01`,
      end: now.toISOString().split('T')[0],
      label: 'Year to Date'
    }
  }

  // Last 30 days
  if (lowerText.includes('last 30 days') || lowerText.includes('past 30 days')) {
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    return {
      start: thirtyDaysAgo.toISOString().split('T')[0],
      end: now.toISOString().split('T')[0],
      label: 'Last 30 Days'
    }
  }

  // Last 90 days
  if (lowerText.includes('last 90 days') || lowerText.includes('past 90 days') || lowerText.includes('quarter')) {
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
    return {
      start: ninetyDaysAgo.toISOString().split('T')[0],
      end: now.toISOString().split('T')[0],
      label: 'Last 90 Days'
    }
  }

  // Default to last 30 days for cost queries
  if (lowerText.includes('cost') || lowerText.includes('spend') || lowerText.includes('billing')) {
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    return {
      start: thirtyDaysAgo.toISOString().split('T')[0],
      end: now.toISOString().split('T')[0],
      label: 'Last 30 Days'
    }
  }

  return undefined
}

/**
 * Extract AWS service names from text
 */
function extractServices(text: string): string[] {
  const services: string[] = []
  const lowerText = text.toLowerCase()

  const serviceMap: Record<string, string> = {
    'ec2': 'Amazon Elastic Compute Cloud - Compute',
    's3': 'Amazon Simple Storage Service',
    'rds': 'Amazon Relational Database Service',
    'lambda': 'AWS Lambda',
    'dynamodb': 'Amazon DynamoDB',
    'cloudfront': 'Amazon CloudFront',
    'route 53': 'Amazon Route 53',
    'vpc': 'Amazon Virtual Private Cloud',
    'ebs': 'Amazon Elastic Block Store',
    'elb': 'Elastic Load Balancing',
    'cloudwatch': 'AmazonCloudWatch',
    'sns': 'Amazon Simple Notification Service',
    'sqs': 'Amazon Simple Queue Service',
    'ecs': 'Amazon EC2 Container Service',
    'eks': 'Amazon Elastic Kubernetes Service'
  }

  for (const [key, value] of Object.entries(serviceMap)) {
    if (lowerText.includes(key)) {
      services.push(value)
    }
  }

  return services
}

/**
 * Extract resource types from text
 */
function extractResourceTypes(text: string): string[] {
  const types: string[] = []
  const lowerText = text.toLowerCase()

  const typeMap: Record<string, string> = {
    'instance': 'AWS::EC2::Instance',
    'ec2': 'AWS::EC2::Instance',
    'bucket': 'AWS::S3::Bucket',
    's3': 'AWS::S3::Bucket',
    'security group': 'AWS::EC2::SecurityGroup',
    'vpc': 'AWS::EC2::VPC',
    'subnet': 'AWS::EC2::Subnet',
    'iam role': 'AWS::IAM::Role',
    'iam user': 'AWS::IAM::User',
    'lambda': 'AWS::Lambda::Function',
    'rds': 'AWS::RDS::DBInstance'
  }

  for (const [key, value] of Object.entries(typeMap)) {
    if (lowerText.includes(key)) {
      types.push(value)
    }
  }

  return types
}

/**
 * Parse query and response to extract entities
 * @param query - User query
 * @param response - Strands response
 * @param metadata - Optional metadata with pre-identified account ID
 */
async function parseEntities(
  query: string,
  response: string,
  metadata?: { accountId?: string }
): Promise<ParsedEntities> {
  const combinedText = `${query} ${response}`

  // Extract account IDs from text
  let accountIds = extractAccountIds(combinedText)

  // Filter to use commercial IDs only
  accountIds = await filterToCommercialAccountIds(accountIds)

  // If metadata provides an account ID, prioritize it (add to front if not already present)
  if (metadata?.accountId && !accountIds.includes(metadata.accountId)) {
    accountIds.unshift(metadata.accountId)
  }

  return {
    accountIds,
    dateRange: parseDateRange(query),
    services: extractServices(combinedText),
    resourceTypes: extractResourceTypes(combinedText),
    usernames: [], // TODO: Extract usernames if needed
    severity: [] // TODO: Extract severity levels for security findings
  }
}

/**
 * Generate Cost Dashboard link with pre-filled filters
 */
function generateCostLink(entities: ParsedEntities): SuggestedLink | null {
  if (entities.accountIds.length === 0) {
    return null
  }

  const params = new URLSearchParams()
  params.set('accounts', entities.accountIds.join(','))

  if (entities.dateRange) {
    params.set('start', entities.dateRange.start)
    params.set('end', entities.dateRange.end)
    params.set('range', 'custom')
  }

  params.set('granularity', 'DAILY')
  params.set('metric', 'Billable')

  if (entities.services && entities.services.length > 0) {
    params.set('groupBy', 'SERVICE')
    params.set('services', entities.services.join(','))
  } else {
    params.set('groupBy', 'SERVICE')
  }

  const dateLabel = entities.dateRange?.label || 'specified period'
  const accountLabel = entities.accountIds.length === 1
    ? `account ${entities.accountIds[0]}`
    : `${entities.accountIds.length} accounts`

  return {
    label: 'View Cost Dashboard',
    url: `/account/costs?${params.toString()}`,
    description: `Detailed cost analysis for ${accountLabel} (${dateLabel})`,
    icon: 'i-heroicons-currency-dollar',
    type: 'cost'
  }
}

/**
 * Generate Account Explorer link with resource filters
 */
function generateExplorerLink(entities: ParsedEntities): SuggestedLink | null {
  if (entities.accountIds.length === 0) {
    return null
  }

  const params = new URLSearchParams()
  params.set('accounts', entities.accountIds.join(','))

  if (entities.resourceTypes && entities.resourceTypes.length > 0) {
    params.set('resourceTypes', entities.resourceTypes.join(','))
  }

  const resourceLabel = entities.resourceTypes && entities.resourceTypes.length > 0
    ? entities.resourceTypes.map(t => t.split('::')[2] || t).join(', ')
    : 'resources'

  return {
    label: 'Open Account Explorer',
    url: `/account/explorer?${params.toString()}`,
    description: `Browse ${resourceLabel} in selected accounts`,
    icon: 'i-heroicons-magnifying-glass',
    type: 'explorer'
  }
}

/**
 * Generate Users page link
 */
function generateUsersLink(entities: ParsedEntities): SuggestedLink | null {
  if (entities.accountIds.length === 0) {
    return null
  }

  // For now, just link to the users page - could be enhanced with specific user filters
  return {
    label: 'View Users & Access',
    url: '/account/user',
    description: 'Explore user access and permissions',
    icon: 'i-heroicons-users',
    type: 'users'
  }
}

/**
 * Generate Organization Chart link
 */
function generateOrgChartLink(entities: ParsedEntities): SuggestedLink | null {
  if (entities.accountIds.length === 0) {
    return null
  }

  const params = new URLSearchParams()
  if (entities.accountIds.length === 1) {
    params.set('highlight', entities.accountIds[0])
  }

  return {
    label: 'View Organization Chart',
    url: `/account/org-chart${params.toString() ? '?' + params.toString() : ''}`,
    description: 'See account structure and relationships',
    icon: 'i-heroicons-building-library',
    type: 'org-chart'
  }
}

/**
 * Generate Dataset Reports link
 */
function generateReportsLink(entities: ParsedEntities): SuggestedLink | null {
  if (entities.accountIds.length === 0) {
    return null
  }

  return {
    label: 'Generate Dataset Report',
    url: '/reports/datasets',
    description: 'Create custom reports with CloudTrail, Config, and Security Hub data',
    icon: 'i-heroicons-server-stack',
    type: 'reports'
  }
}

/**
 * Detect query intent and generate appropriate links
 */
function detectIntent(query: string): Array<'cost' | 'explorer' | 'users' | 'org' | 'reports' | 'security'> {
  const lowerQuery = query.toLowerCase()
  const intents: Array<'cost' | 'explorer' | 'users' | 'org' | 'reports' | 'security'> = []

  // Cost-related
  if (lowerQuery.match(/\b(cost|spend|billing|charges|budget|expense|price|pricing)\b/)) {
    intents.push('cost')
  }

  // Resource-related
  if (lowerQuery.match(/\b(ec2|s3|rds|lambda|instance|bucket|resource|list|show|what)\b/)) {
    intents.push('explorer')
  }

  // User/access-related
  if (lowerQuery.match(/\b(user|access|permission|iam|role|policy)\b/)) {
    intents.push('users')
  }

  // Organization-related
  if (lowerQuery.match(/\b(org|organization|structure|hierarchy|account structure)\b/)) {
    intents.push('org')
  }

  // Reports-related
  if (lowerQuery.match(/\b(report|cloudtrail|config|security hub|compliance|audit)\b/)) {
    intents.push('reports')
  }

  // Security-related
  if (lowerQuery.match(/\b(security|vulnerability|finding|compliance|threat)\b/)) {
    intents.push('security')
    intents.push('reports')
  }

  return intents
}

/**
 * Build URL with parameters from a page schema and extracted entities
 */
function buildUrlFromSchema(page: PageSchema, entities: ParsedEntities): string {
  let url = page.path
  const params = new URLSearchParams()

  // Check for dynamic path parameters (e.g., [accountId])
  const pathParams = url.match(/\[(\w+)\]/g)
  if (pathParams) {
    // Replace [accountId] with actual account ID if available
    if (pathParams.includes('[accountId]') && entities.accountIds.length > 0) {
      url = url.replace('[accountId]', entities.accountIds[0])
    }
    // Replace [username] if extracting usernames in future
    // url = url.replace('[username]', entities.usernames?.[0] || '')
  }

  // Add query parameters based on page schema
  if (page.parameters) {
    for (const param of page.parameters) {
      // Skip if it's a required path parameter we already handled
      if (param.required && pathParams?.includes(`[${param.name}]`)) {
        continue
      }

      // Map entities to parameters
      if (param.name === 'accounts' && entities.accountIds.length > 0) {
        params.set('accounts', entities.accountIds.join(','))
      } else if (param.name === 'start' && entities.dateRange) {
        params.set('start', entities.dateRange.start)
        if (entities.dateRange.end) {
          params.set('end', entities.dateRange.end)
        }
        params.set('range', 'custom')
      } else if (param.name === 'services' && entities.services && entities.services.length > 0) {
        params.set('services', entities.services.join(','))
      } else if (param.name === 'resourceTypes' && entities.resourceTypes && entities.resourceTypes.length > 0) {
        params.set('resourceTypes', entities.resourceTypes.join(','))
      } else if (param.name === 'granularity' && page.id === 'cost-dashboard') {
        params.set('granularity', 'DAILY')
      } else if (param.name === 'metric' && page.id === 'cost-dashboard') {
        params.set('metric', 'Billable')
      } else if (param.name === 'groupBy' && page.id === 'cost-dashboard') {
        params.set('groupBy', 'SERVICE')
      }
    }
  }

  return params.toString() ? `${url}?${params.toString()}` : url
}

/**
 * Schema-based smart link generation (NEW APPROACH)
 * Uses page schema and keyword matching to generate intelligent links
 * @param metadata - Optional metadata with account ID from Strands response
 */
export async function generateSmartLinksFromSchema(
  query: string,
  response: string,
  metadata?: { accountId?: string }
): Promise<SuggestedLink[]> {
  const entities = await parseEntities(query, response, metadata)
  const combinedText = `${query} ${response}`.toLowerCase()

  // Find matching pages from schema
  const matchingPages = findMatchingPages(query, 5)

  const links: SuggestedLink[] = []

  for (const page of matchingPages) {
    // Skip admin pages if user doesn't have permission (check would go here)
    // For now, we'll include them but they'll be filtered in the frontend

    const url = buildUrlFromSchema(page, entities)

    // Generate description based on entities
    let description = page.description
    if (entities.accountIds.length > 0) {
      const accountText = entities.accountIds.length === 1
        ? `account ${entities.accountIds[0]}`
        : `${entities.accountIds.length} accounts`
      description = `${page.description} (${accountText})`
    }

    links.push({
      label: page.name,
      url,
      description: description.substring(0, 100), // Limit description length
      icon: page.icon,
      type: page.category as any
    })
  }

  // Limit to top 3 most relevant links
  return links.slice(0, 3)
}

/**
 * Main function to generate smart links based on query and response
 * UPDATED: Now uses schema-based approach by default and filters to commercial account IDs
 * @param metadata - Optional metadata with account ID from Strands response
 */
export async function generateSmartLinks(
  query: string,
  response: string,
  metadata?: { accountId?: string }
): Promise<SuggestedLink[]> {
  // Use new schema-based approach
  const schemaLinks = await generateSmartLinksFromSchema(query, response, metadata)

  // If we get good results from schema, return those
  if (schemaLinks.length > 0) {
    return schemaLinks
  }

  // Fallback to old hardcoded approach if needed
  const entities = await parseEntities(query, response, metadata)
  const intents = detectIntent(query)
  const links: SuggestedLink[] = []

  if (intents.includes('cost')) {
    const costLink = generateCostLink(entities)
    if (costLink) links.push(costLink)
  }

  if (intents.includes('explorer')) {
    const explorerLink = generateExplorerLink(entities)
    if (explorerLink) links.push(explorerLink)
  }

  if (intents.includes('users')) {
    const usersLink = generateUsersLink(entities)
    if (usersLink) links.push(usersLink)
  }

  if (intents.includes('org')) {
    const orgLink = generateOrgChartLink(entities)
    if (orgLink) links.push(orgLink)
  }

  if (intents.includes('reports')) {
    const reportsLink = generateReportsLink(entities)
    if (reportsLink) links.push(reportsLink)
  }

  return links.slice(0, 3)
}
