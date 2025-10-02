/**
 * Converts a user principal name (email) to a URL-safe username slug
 * @param userPrincipalName - The user's email address
 * @returns Username slug for use in URLs
 * @example convertToUsernameSlug('John.Doe@gd-ms.com') => 'john-doe'
 * @example convertToUsernameSlug('dylan.lewis.ms@gd-ms.com') => 'dylan-lewis-ms'
 */
export function convertToUsernameSlug(userPrincipalName: string): string {
  if (!userPrincipalName) return ''
  if (!userPrincipalName.includes('@')) {
    // If no @ sign, just convert dots to hyphens
    return userPrincipalName.replace(/\./g, '-').toLowerCase()
  }
  
  // Extract the part before @ and replace dots with hyphens to create URL-safe slug
  return userPrincipalName.split('@')[0]!.replace(/\./g, '-').toLowerCase()
}

/**
 * Parse group description to extract owners and clean description
 * Expected format: "Description text. Owners: user1, user2, user3"
 */
export function parseGroupDescription(description: string): { owners: string[]; description: string } {
  if (!description) return { owners: [], description: '' }

  // Look for "Owners:" pattern at the end of the description
  const ownersMatch = description.match(/(.+?)[\s.]*Owners?\s*:\s*(.+?)$/i)
  
  if (ownersMatch) {
    const cleanDescription = ownersMatch[1].trim()
    const ownersText = ownersMatch[2].trim()
    
    // Parse owners list - split by comma, semicolon, or "and"
    const owners = ownersText
      .split(/[,;]|\s+and\s+/i)
      .map(owner => owner.trim())
      .filter(owner => owner.length > 0)
      .map(owner => {
        // Remove email domain if present, keep just username
        const atIndex = owner.indexOf('@')
        return atIndex > 0 ? owner.substring(0, atIndex) : owner
      })
    
    return { owners, description: cleanDescription }
  }
  
  // No owners pattern found, return original description
  return { owners: [], description: description.trim() }
}

/**
 * Get possible email patterns from a username slug
 * @example getEmailPatternsFromSlug('dylan-lewis') => ['dylan.lewis@gd-ms.com', 'dylan.lewis']
 * @example getEmailPatternsFromSlug('dylan-lewis-ms') => ['dylan.lewis.ms@gd-ms.com', 'dylan.lewis.ms']
 */
export function getEmailPatternsFromSlug(slug: string): string[] {
  if (!slug) return []
  
  // Convert slug back to potential email formats
  const patterns: string[] = []
  
  // First, try with common email domains
  const withDots = slug.replace(/-/g, '.')
  
  // Add with @gd-ms.com domain (most common)
  patterns.push(`${withDots}@gd-ms.com`)
  
  // Add just the username part (for searching)
  patterns.push(withDots)
  
  // If the slug ends with known suffixes like -ms, -su, etc, keep them as part of the username
  // This ensures dylan-lewis-ms becomes dylan.lewis.ms not dylan.lewis
  const knownSuffixes = ['-ms', '-su']
  const hasKnownSuffix = knownSuffixes.some(suffix => slug.endsWith(suffix))
  
  if (!hasKnownSuffix && slug.includes('-')) {
    // For regular names without suffixes, also try the original hyphenated format
    patterns.push(slug)
    patterns.push(`${slug}@gd-ms.com`)
  }
  
  // Remove duplicates
  return [...new Set(patterns)]
}

/**
 * Get search terms from a username slug for user search
 */
export function getSearchTermsFromSlug(slug: string): string[] {
  // Convert slug back to searchable terms
  const terms = slug.split(/[-._]/).filter(term => term.length > 0)
  
  // Add the full slug and individual terms
  return [slug, ...terms]
}

/**
 * Validate username slug format
 */
export function isValidUsername(slug: string): boolean {
  // Basic validation - alphanumeric with dots, hyphens, underscores
  return /^[a-z0-9._-]+$/i.test(slug) && slug.length > 0
}

/**
 * Convert first.last format to "First Last" display name
 * @param username - Username in first.last format
 * @returns Formatted display name
 * @example formatUsername('john.doe') => 'John Doe'
 * @example formatUsername('mary.jane.smith') => 'Mary Jane Smith'
 */
export function formatUsername(username: string): string {
  if (!username) return ''

  // Remove @domain if present
  const cleanUsername = username.includes('@') ? username.split('@')[0] : username

  // Split by dots and capitalize each part
  return cleanUsername
    .split('.')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}