/**
 * Client-side author utility functions
 * Handles author parsing, contact URLs, and clipboard operations
 */

import type { AuthorInfo } from '~/shared/types/pipelines'

const logger = createLogger('AuthorHelpers')

/**
 * Parse author field from GitLab format: "Name <email@domain.com>"
 * Client-side equivalent of server-side parseAuthorField
 */
export function parseAuthor(authorField: string | null | undefined): AuthorInfo {
  if (!authorField) {
    return {
      name: 'Unknown',
      email: 'unknown@unknown.com',
      displayName: 'Unknown',
      raw: '',
    }
  }

  const trimmed = authorField.trim()

  // Match pattern: "Name <email>"
  const match = trimmed.match(/^(.+?)\s*<([^>]+)>$/)

  if (match) {
    const [, name, email] = match
    return {
      name: name.trim(),
      email: email.trim(),
      displayName: name.trim(),
      raw: trimmed,
    }
  }

  // Fallback: assume it's just an email
  if (trimmed.includes('@')) {
    const emailUsername = trimmed.split('@')[0]
    return {
      name: emailUsername,
      email: trimmed,
      displayName: emailUsername,
      raw: trimmed,
    }
  }

  // Fallback: treat as plain name
  return {
    name: trimmed,
    email: 'unknown@unknown.com',
    displayName: trimmed,
    raw: trimmed,
  }
}

/**
 * Extract just the email address from author field
 */
export function extractEmail(authorField: string | null | undefined): string {
  return parseAuthor(authorField).email
}

/**
 * Extract just the display name from author field
 */
export function extractName(authorField: string | null | undefined): string {
  return parseAuthor(authorField).name
}

/**
 * Generate mailto: URL for email
 */
export function getMailtoUrl(email: string, subject?: string): string {
  const baseUrl = `mailto:${encodeURIComponent(email)}`
  if (subject) {
    return `${baseUrl}?subject=${encodeURIComponent(subject)}`
  }
  return baseUrl
}

/**
 * Generate Microsoft Teams chat URL
 * Uses the teams:// protocol to open Teams chat
 * Format: msteams:/l/chat/0/0?users=email@domain.com
 */
export function getTeamsUrl(email: string): string {
  return `msteams:/l/chat/0/0?users=${encodeURIComponent(email)}`
}

/**
 * Generate Teams web URL as fallback
 * Opens Teams in browser if desktop app not available
 */
export function getTeamsWebUrl(email: string): string {
  return `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(email)}`
}

/**
 * Copy text to clipboard with toast notification
 * Returns true if successful, false otherwise
 */
export async function copyToClipboard(text: string, successMessage?: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)

    // Show success toast using Nuxt UI toast
    const toast = useToast()
    toast.add({
      title: successMessage || 'Copied to clipboard',
      icon: 'i-heroicons-check-circle',
      color: 'green',
      timeout: 2000
    })

    return true
  } catch (error) {
    logger.error('Failed to copy to clipboard:', error)

    // Show error toast
    const toast = useToast()
    toast.add({
      title: 'Failed to copy',
      description: 'Unable to copy to clipboard',
      icon: 'i-heroicons-x-circle',
      color: 'red',
      timeout: 3000
    })

    return false
  }
}

/**
 * Format author display name consistently
 * Truncates long names with ellipsis
 */
export function formatAuthorName(author: AuthorInfo, maxLength: number = 30): string {
  const name = author.displayName || author.name

  if (name.length <= maxLength) {
    return name
  }

  return `${name.substring(0, maxLength - 3)}...`
}

/**
 * Get initials from author name for avatar fallback
 */
export function getAuthorInitials(author: AuthorInfo): string {
  const name = author.name || author.email

  const parts = name.split(/\s+/)

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  }

  return name.substring(0, 2).toUpperCase()
}

/**
 * Normalize email for comparison
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * Check if two author emails match (case-insensitive)
 */
export function isSameAuthor(email1: string, email2: string): boolean {
  return normalizeEmail(email1) === normalizeEmail(email2)
}
