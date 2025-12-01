/**
 * Author field parsing utilities
 * Handles "Name <email@domain.com>" format from GitLab commit authors
 */

import type { AuthorInfo } from '../../shared/types/pipelines'

/**
 * Parse author field from GitLab format: "Name <email@domain.com>"
 * Falls back gracefully if format is unexpected
 *
 * @param authorField - Raw author string from pipeline data
 * @returns Parsed author information with name, email, and display name
 *
 * @example
 * parseAuthorField("Jesse Anderson <jesse.anderson@gd-ms.com>")
 * // Returns: { name: "Jesse Anderson", email: "jesse.anderson@gd-ms.com", displayName: "Jesse Anderson", raw: "..." }
 *
 * parseAuthorField("john.doe@example.com")
 * // Returns: { name: "john.doe", email: "john.doe@example.com", displayName: "john.doe", raw: "..." }
 */
export function parseAuthorField(authorField: string | null | undefined): AuthorInfo {
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
  return parseAuthorField(authorField).email
}

/**
 * Extract just the display name from author field
 */
export function extractName(authorField: string | null | undefined): string {
  return parseAuthorField(authorField).name
}

/**
 * Normalize author email for comparison and filtering
 * Converts to lowercase for case-insensitive matching
 */
export function normalizeAuthorEmail(email: string): string {
  return email.trim().toLowerCase()
}
