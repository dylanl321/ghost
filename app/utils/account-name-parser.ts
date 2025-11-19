/**
 * Account Name Parser
 * Utilities for parsing and formatting AWS account names
 *
 * Common patterns:
 * - "Commercial-ProjectName-123456" -> "ProjectName"
 * - "GovCloud-ProjectName-123456" -> "ProjectName"
 * - "ProjectName-Commercial" -> "ProjectName"
 * - Long hyphenated names -> shortened version
 */

export interface ParsedAccountName {
  full: string          // Original full name
  short: string         // Shortened/cleaned name
  prefix?: string       // Environment prefix (Commercial/GovCloud)
  accountId?: string    // Account ID if present
  projectName?: string  // Extracted project name
}

/**
 * Parse and clean an AWS account name
 * Removes common prefixes and suffixes to get the core project name
 */
export function parseAccountName(accountName: string | null | undefined): ParsedAccountName {
  if (!accountName) {
    return {
      full: '',
      short: 'Unknown',
      projectName: 'Unknown'
    }
  }

  const full = accountName.trim()
  let short = full
  let prefix: string | undefined
  let accountId: string | undefined
  let projectName = full

  // Remove "Commercial-" or "GovCloud-" prefix
  const commercialMatch = full.match(/^Commercial-(.+)$/)
  const govcloudMatch = full.match(/^GovCloud-(.+)$/)

  if (commercialMatch) {
    prefix = 'Commercial'
    short = commercialMatch[1]
    projectName = commercialMatch[1]
  } else if (govcloudMatch) {
    prefix = 'GovCloud'
    short = govcloudMatch[1]
    projectName = govcloudMatch[1]
  }

  // Remove trailing account ID (12-digit number)
  const accountIdMatch = short.match(/^(.+)-(\d{12})$/)
  if (accountIdMatch) {
    projectName = accountIdMatch[1]
    short = accountIdMatch[1]
    accountId = accountIdMatch[2]
  }

  // Remove "-Commercial" or "-GovCloud" suffix if present
  short = short.replace(/-(Commercial|GovCloud)$/i, '')
  projectName = projectName.replace(/-(Commercial|GovCloud)$/i, '')

  // If still too long, try to intelligently truncate
  if (short.length > 30) {
    // Try to keep the most important parts
    const parts = short.split('-')
    if (parts.length > 3) {
      // Keep first and last parts
      short = `${parts[0]}-...-${parts[parts.length - 1]}`
    } else {
      short = short.substring(0, 27) + '...'
    }
  }

  return {
    full,
    short,
    prefix,
    accountId,
    projectName: projectName || short
  }
}

/**
 * Get a short display name for an account
 * @param accountName - Full account name
 * @param maxLength - Maximum length (default: 30)
 * @returns Shortened name suitable for display
 */
export function getShortAccountName(accountName: string | null | undefined, maxLength = 30): string {
  const parsed = parseAccountName(accountName)

  if (parsed.short.length <= maxLength) {
    return parsed.short
  }

  // Truncate with ellipsis if still too long
  return parsed.short.substring(0, maxLength - 3) + '...'
}

/**
 * Get the project name from an account name
 * Strips environment prefixes and account IDs
 */
export function getProjectName(accountName: string | null | undefined): string {
  const parsed = parseAccountName(accountName)
  return parsed.projectName || 'Unknown'
}

/**
 * Format account name with environment badge
 * Example: "ProjectName (Commercial)"
 */
export function formatAccountNameWithEnv(accountName: string | null | undefined): string {
  const parsed = parseAccountName(accountName)

  if (parsed.prefix) {
    return `${parsed.short} (${parsed.prefix})`
  }

  return parsed.short
}

/**
 * Batch parse multiple account names
 * Useful for charts and tables
 */
export function parseAccountNames(accountNames: (string | null | undefined)[]): ParsedAccountName[] {
  return accountNames.map(name => parseAccountName(name))
}

/**
 * Get short names for display in charts
 * Ensures consistent length across all names
 */
export function getChartAccountNames(accountNames: (string | null | undefined)[], maxLength = 25): string[] {
  return accountNames.map(name => getShortAccountName(name, maxLength))
}
