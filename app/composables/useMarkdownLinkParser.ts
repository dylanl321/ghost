/**
 * Markdown Link Parser Composable
 * Handles parsing markdown and converting GHOST internal links to NuxtLink
 * while preserving external links with proper target attributes
 */

import { marked } from 'marked'
import { escapeHtml, normalizeSafeHref, sanitizeMarkdownHtml } from '~/utils/sanitizeHtml'

const logger = createLogger('Markdown Parser')

export function useMarkdownLinkParser() {
  /**
   * Patterns to identify GHOST internal URLs across different environments
   */
  const ghostUrlPatterns = [
    /^https?:\/\/localhost(:\d+)?/,           // localhost:3000
    /^https?:\/\/[^/]*dev[^/]*ghost/i,        // dev.ghost.com, ghost-dev.com, etc.
    /^https?:\/\/ghost\./i,                    // ghost.domain.com
    /^https?:\/\/[^/]*\.ghost\./i,             // subdomain.ghost.domain.com
    /^\/[^/]/,                                 // Relative paths like /accounts
  ]

  /**
   * Check if a URL is a GHOST internal URL
   */
  function isGhostUrl(url: string): boolean {
    if (!url) return false

    // Handle relative paths
    if (url.startsWith('/') && !url.startsWith('//')) {
      return true
    }

    // Check against all patterns
    return ghostUrlPatterns.some(pattern => pattern.test(url))
  }

  /**
   * Extract path from absolute URL or return as-is if relative
   */
  function extractPath(url: string): string {
    if (url.startsWith('/')) {
      return url
    }

    try {
      const urlObj = new URL(url)
      return urlObj.pathname + urlObj.search + urlObj.hash
    } catch {
      return url
    }
  }

  /**
   * Parse markdown content and convert internal links to data-nuxt-link markup
   * External links get target="_blank" and icon
   */
  function parseMarkdownWithLinks(content: string): string {
    if (!content) return ''

    const renderer = new marked.Renderer()

    // Override link rendering
    renderer.link = ({ href, title, text }) => {
      const safeHref = normalizeSafeHref(href)
      if (!safeHref) return text
      const isInternal = isGhostUrl(safeHref)

      if (isInternal) {
        // Convert to relative path for NuxtLink
        const path = extractPath(safeHref)
        const titleAttr = title ? ` title="${escapeHtml(title)}"` : ''

        // Use data-nuxt-link attribute for click handler identification
        return `<a href="${escapeHtml(path)}" data-nuxt-link class="text-blue-600 dark:text-blue-400 hover:underline"${titleAttr}>${text}</a>`
      } else {
        // External link with target="_blank" and external icon
        const titleAttr = title ? ` title="${escapeHtml(title)}"` : ''
        return `<a href="${escapeHtml(safeHref)}" target="_blank" rel="noopener noreferrer" class="text-blue-600 dark:text-blue-400 hover:underline"${titleAttr}>${text}</a>`
      }
    }

    marked.setOptions({
      gfm: true,
      breaks: true,
      renderer
    })

    try {
      return sanitizeMarkdownHtml(marked.parse(content) as string)
    } catch (error) {
      logger.error('Error parsing markdown:', error)
      return sanitizeMarkdownHtml(escapeHtml(content).replace(/\n/g, '<br>'))
    }
  }

  /**
   * Handle click events on elements with data-nuxt-link
   * Converts regular link clicks to Vue Router navigation
   */
  function handleLinkClick(event: MouseEvent) {
    const target = event.target as HTMLElement
    const link = target.closest('a[data-nuxt-link]') as HTMLAnchorElement

    if (link && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      event.preventDefault()
      const href = link.getAttribute('href')

      if (href) {
        navigateTo(href)
      }
    }
  }

  return {
    isGhostUrl,
    extractPath,
    parseMarkdownWithLinks,
    handleLinkClick
  }
}
