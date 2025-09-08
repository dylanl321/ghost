/**
 * Converts a user principal name (email) to a URL-safe username slug
 * @param userPrincipalName - The user's email address
 * @returns Username slug for use in URLs
 * @example convertToUsernameSlug('John.Doe@gd-ms.com') => 'john-doe'
 */
export function convertToUsernameSlug(userPrincipalName: string): string {
  if (!userPrincipalName) return ''
  if (!userPrincipalName.includes('@')) return userPrincipalName
  
  // Extract the part before @ and replace dots with hyphens to create URL-safe slug
  return userPrincipalName.split('@')[0]!.replace(/\./g, '-').toLowerCase()
}