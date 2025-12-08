/**
 * Strands Response Enricher
 *
 * Comprehensive system for processing and enriching Strands agent responses.
 * Detects entities (usernames, account IDs, resource IDs) and adds interactive
 * elements like popovers, tooltips, and deep links.
 *
 * Architecture:
 * 1. Parse markdown → HTML
 * 2. Detect entities using regex patterns
 * 3. Enrich entities with interactive components
 * 4. Return enriched HTML with data attributes for Vue components
 */

import { marked } from 'marked'
import { convertToUsernameSlug } from '~/utils/userUtils'

/**
 * Entity types that can be detected and enriched
 */
export type EntityType =
  | 'username'      // IAM username (e.g., john.doe)
  | 'account-id'    // AWS account ID (12 digits)
  | 'account-alias' // Account alias (e.g., prod-account)
  | 'instance-id'   // EC2 instance ID (i-xxxxx)
  | 'bucket-name'   // S3 bucket name
  | 'lambda-name'   // Lambda function name
  | 'rds-id'        // RDS instance ID
  | 'security-group-id' // Security group ID (sg-xxxxx)
  | 'vpc-id'        // VPC ID (vpc-xxxxx)

/**
 * Entity detection pattern with metadata
 */
export interface EntityPattern {
  type: EntityType
  regex: RegExp
  label: string
  icon?: string
  popoverEnabled: boolean
  linkBuilder?: (match: string) => string
  popoverDataFetcher?: (match: string) => Promise<any>
}

/**
 * Detected entity with context
 */
export interface DetectedEntity {
  type: EntityType
  value: string
  displayText: string
  startIndex: number
  endIndex: number
  link?: string
  popoverData?: any
}

/**
 * Configuration for response enrichment
 */
export interface EnricherConfig {
  enablePopovers: boolean
  enableDeepLinks: boolean
  enableIcons: boolean
  detectEntities: EntityType[]
}

export function useStrandsResponseEnricher() {
  /**
   * Entity detection patterns
   * Add new entity types here - they'll be automatically detected
   */
  const entityPatterns: EntityPattern[] = [
    // Username pattern - VERY CONSERVATIVE: only match email-like patterns or explicit user references
    // Pattern: "user:john.doe" or "john.doe@domain.com" only
    {
      type: 'username',
      regex: /(?:user[:\s]+)([a-zA-Z][a-zA-Z0-9._-]+)|([a-zA-Z][a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi,
      label: 'User',
      icon: 'i-heroicons-user',
      popoverEnabled: true,
      linkBuilder: (username: string) => {
        // Extract username from "user: john.doe" or email format
        const cleanUsername = username.replace(/^user[:\s]+/i, '')
        // Use convertToUsernameSlug to format properly (john.doe@gd-ms.com -> john-doe)
        const slug = convertToUsernameSlug(cleanUsername)
        return `/account/user/${slug}`
      },
      popoverDataFetcher: async (username: string) => {
        // Fetch user details for popover
        try {
          const cleanUsername = username.replace(/^user[:\s]+/i, '')
          return await $fetch(`/api/users/${encodeURIComponent(cleanUsername)}/summary`)
        } catch {
          return null
        }
      }
    },

    // AWS Account ID (12 digits)
    {
      type: 'account-id',
      regex: /\b(\d{12})\b/g,
      label: 'AWS Account',
      icon: 'i-heroicons-building-office',
      popoverEnabled: true,
      linkBuilder: (accountId: string) => `/account/${accountId}`,
      popoverDataFetcher: async (accountId: string) => {
        try {
          return await $fetch(`/api/accounts/${accountId}/summary`)
        } catch {
          return null
        }
      }
    },

    // Account alias - DISABLED for now (too broad, matches common words like "prod-account")
    // Re-enable only if you have a specific list of known account aliases
    // {
    //   type: 'account-alias',
    //   regex: /\b([a-z0-9][a-z0-9-]{0,62})-account\b/gi,
    //   label: 'Account',
    //   icon: 'i-heroicons-building-office-2',
    //   popoverEnabled: true,
    //   linkBuilder: (alias: string) => `/account?alias=${alias}`,
    //   popoverDataFetcher: async (alias: string) => {
    //     try {
    //       return await $fetch(`/api/accounts/by-alias/${alias}/summary`)
    //     } catch {
    //       return null
    //     }
    //   }
    // },

    // EC2 Instance ID
    {
      type: 'instance-id',
      regex: /\b(i-[a-f0-9]{8,17})\b/gi,
      label: 'EC2 Instance',
      icon: 'i-heroicons-server',
      popoverEnabled: true,
      linkBuilder: (instanceId: string) => `/account/explorer?resourceId=${instanceId}&type=ec2`,
      popoverDataFetcher: async (instanceId: string) => {
        try {
          return await $fetch(`/api/resources/ec2/${instanceId}/summary`)
        } catch {
          return null
        }
      }
    },

    // S3 Bucket Name (simplified pattern)
    {
      type: 'bucket-name',
      regex: /\bs3:\/\/([a-z0-9][a-z0-9.-]{1,61}[a-z0-9])\b/gi,
      label: 'S3 Bucket',
      icon: 'i-heroicons-archive-box',
      popoverEnabled: true,
      linkBuilder: (bucketName: string) => {
        const name = bucketName.replace('s3://', '')
        return `/account/explorer?resourceId=${name}&type=s3`
      }
    },

    // Lambda Function Name
    {
      type: 'lambda-name',
      regex: /\bfunction:([a-zA-Z0-9-_]+)\b/gi,
      label: 'Lambda Function',
      icon: 'i-heroicons-bolt',
      popoverEnabled: true,
      linkBuilder: (functionName: string) => {
        const name = functionName.replace('function:', '')
        return `/account/explorer?resourceId=${name}&type=lambda`
      }
    },

    // Security Group ID
    {
      type: 'security-group-id',
      regex: /\b(sg-[a-f0-9]{8,17})\b/gi,
      label: 'Security Group',
      icon: 'i-heroicons-shield-check',
      popoverEnabled: false,
      linkBuilder: (sgId: string) => `/account/explorer?resourceId=${sgId}&type=security-group`
    },

    // VPC ID
    {
      type: 'vpc-id',
      regex: /\b(vpc-[a-f0-9]{8,17})\b/gi,
      label: 'VPC',
      icon: 'i-heroicons-globe-alt',
      popoverEnabled: false,
      linkBuilder: (vpcId: string) => `/account/explorer?resourceId=${vpcId}&type=vpc`
    },

    // RDS Instance ID
    {
      type: 'rds-id',
      regex: /\bdb:([a-z0-9][a-z0-9-]{0,62})\b/gi,
      label: 'RDS Database',
      icon: 'i-heroicons-circle-stack',
      popoverEnabled: true,
      linkBuilder: (rdsId: string) => {
        const id = rdsId.replace('db:', '')
        return `/account/explorer?resourceId=${id}&type=rds`
      }
    }
  ]

  /**
   * Default configuration
   */
  const defaultConfig: EnricherConfig = {
    enablePopovers: true,
    enableDeepLinks: true,
    enableIcons: false, // Disabled - cannot render Vue components in raw HTML
    detectEntities: [
      'username',
      'account-id',
      // 'account-alias', // Disabled - too broad
      'instance-id',
      'bucket-name',
      'lambda-name',
      'security-group-id',
      'vpc-id',
      'rds-id'
    ]
  }

  /**
   * Find all markdown link URL ranges to exclude from entity detection
   * Matches [text](url) syntax and returns the URL portion ranges
   */
  function getMarkdownLinkUrlRanges(text: string): Array<{ start: number, end: number }> {
    const ranges: Array<{ start: number, end: number }> = []
    // Match [text](url) - capture the URL part
    const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g

    let match
    while ((match = markdownLinkRegex.exec(text)) !== null) {
      // match.index points to the '[' character
      // match[0] is the full match "[text](url)"
      // match[2] is the URL content

      // Find where the URL starts: after ']('
      const urlStart = match.index + match[1].length + 2 // +2 for ']('
      const urlEnd = urlStart + match[2].length

      ranges.push({ start: urlStart, end: urlEnd })
    }

    return ranges
  }

  /**
   * Check if a position is within any excluded range
   */
  function isInExcludedRange(startIndex: number, endIndex: number, excludedRanges: Array<{ start: number, end: number }>): boolean {
    for (const range of excludedRanges) {
      // Entity overlaps with excluded range if it starts before range ends AND ends after range starts
      if (startIndex < range.end && endIndex > range.start) {
        return true
      }
    }
    return false
  }

  /**
   * Detect entities in text, excluding those inside markdown link URLs
   */
  function detectEntities(text: string, config: EnricherConfig = defaultConfig): DetectedEntity[] {
    const entities: DetectedEntity[] = []
    const enabledPatterns = entityPatterns.filter(p =>
      config.detectEntities.includes(p.type)
    )

    // Get markdown link URL ranges to exclude from entity detection
    const excludedRanges = getMarkdownLinkUrlRanges(text)

    for (const pattern of enabledPatterns) {
      const matches = text.matchAll(pattern.regex)

      for (const match of matches) {
        const value = match[0]
        const startIndex = match.index || 0
        const endIndex = startIndex + value.length

        // Skip entities that are inside markdown link URLs
        if (isInExcludedRange(startIndex, endIndex, excludedRanges)) {
          continue
        }

        entities.push({
          type: pattern.type,
          value,
          displayText: value,
          startIndex,
          endIndex,
          link: pattern.linkBuilder ? pattern.linkBuilder(value) : undefined
        })
      }
    }

    // Sort by position (earliest first)
    return entities.sort((a, b) => a.startIndex - b.startIndex)
  }

  /**
   * Enrich entity with interactive HTML
   */
  function enrichEntity(entity: DetectedEntity, pattern: EntityPattern, config: EnricherConfig): string {
    // Use inline and inline-flex to prevent layout issues
    const classes = [
      'entity-link',
      'inline', // Critical: ensures proper inline flow
      'text-blue-600',
      'dark:text-blue-400',
      'hover:underline',
      'cursor-pointer',
      'whitespace-nowrap' // Prevent entity from wrapping mid-way
    ]
    const dataAttrs: string[] = [
      `data-entity-type="${entity.type}"`,
      `data-entity-value="${entity.value}"`
    ]

    // Icons disabled - cannot render Vue components in raw HTML strings
    // To enable icons, you'd need to use actual SVG strings or Unicode symbols
    const icon = ''

    // Add link if enabled
    const href = config.enableDeepLinks && entity.link
      ? entity.link
      : '#'

    // Add popover attributes if enabled
    if (config.enablePopovers && pattern.popoverEnabled) {
      dataAttrs.push('data-popover-enabled="true"')
      classes.push('entity-popover-trigger')
    }

    // Add link marker for Vue click handler
    dataAttrs.push('data-nuxt-link')

    // Add inline style to ensure proper text flow (critical fix for overlap issue)
    const inlineStyle = 'style="display: inline; vertical-align: baseline;"'

    return `<a href="${href}" class="${classes.join(' ')}" ${dataAttrs.join(' ')} ${inlineStyle} title="${pattern.label}: ${entity.value}">${icon}${entity.displayText}</a>`
  }

  /**
   * Replace entities in text with enriched HTML
   */
  function replaceEntitiesInText(text: string, config: EnricherConfig = defaultConfig): string {
    const entities = detectEntities(text, config)

    if (entities.length === 0) {
      return text
    }

    let result = ''
    let lastIndex = 0

    for (const entity of entities) {
      // Add text before entity
      result += text.substring(lastIndex, entity.startIndex)

      // Find pattern for this entity type
      const pattern = entityPatterns.find(p => p.type === entity.type)
      if (pattern) {
        // Add enriched entity
        result += enrichEntity(entity, pattern, config)
      } else {
        // Fallback to original text
        result += entity.value
      }

      lastIndex = entity.endIndex
    }

    // Add remaining text
    result += text.substring(lastIndex)

    return result
  }

  /**
   * Check if URL is a GHOST internal URL
   */
  function isGhostUrl(url: string): boolean {
    const ghostUrlPatterns = [
      /^https?:\/\/localhost(:\d+)?/,
      /^https?:\/\/[^/]*dev[^/]*ghost/i,
      /^https?:\/\/ghost\./i,
      /^https?:\/\/[^/]*\.ghost\./i,
      /^\/[^/]/,
    ]

    if (!url) return false
    if (url.startsWith('/') && !url.startsWith('//')) return true
    return ghostUrlPatterns.some(pattern => pattern.test(url))
  }

  /**
   * Extract path from absolute URL or return as-is if relative
   */
  function extractPath(url: string): string {
    if (url.startsWith('/')) return url

    try {
      const urlObj = new URL(url)
      return urlObj.pathname + urlObj.search + urlObj.hash
    } catch {
      return url
    }
  }

  /**
   * Replace entities in HTML (post-markdown processing)
   * This carefully replaces entities only in text nodes, not in HTML tags or attributes
   */
  function replaceEntitiesInHTML(html: string, config: EnricherConfig = defaultConfig): string {
    // Split HTML into segments: text and tags
    // Pattern: match HTML tags (including attributes) OR text between tags
    const segments: { type: 'tag' | 'text', content: string }[] = []
    const htmlRegex = /(<[^>]+>)/g
    let lastIndex = 0
    let match

    while ((match = htmlRegex.exec(html)) !== null) {
      // Add text before tag
      if (match.index > lastIndex) {
        segments.push({
          type: 'text',
          content: html.substring(lastIndex, match.index)
        })
      }
      // Add tag
      segments.push({
        type: 'tag',
        content: match[0]
      })
      lastIndex = match.index + match[0].length
    }

    // Add remaining text
    if (lastIndex < html.length) {
      segments.push({
        type: 'text',
        content: html.substring(lastIndex)
      })
    }

    // Replace entities only in text segments
    return segments.map(segment => {
      if (segment.type === 'text') {
        return replaceEntitiesInText(segment.content, config)
      }
      return segment.content
    }).join('')
  }

  /**
   * Main function: Parse markdown and enrich with entity detection
   */
  function enrichStrandsResponse(content: string, config: EnricherConfig = defaultConfig): string {
    if (!content) return ''

    // STEP 1: Replace entity values with unique placeholders BEFORE markdown processing
    // This prevents markdown from interfering with entity detection (e.g., bold around account IDs)
    const entityPlaceholders = new Map<string, { entity: DetectedEntity, pattern: EntityPattern }>()
    let placeholderIndex = 0

    // Detect all entities in the raw content
    const detectedEntities = detectEntities(content, config)

    // Replace entities with placeholders
    let contentWithPlaceholders = content
    for (let i = detectedEntities.length - 1; i >= 0; i--) {
      const entity = detectedEntities[i]
      const pattern = entityPatterns.find(p => p.type === entity.type)
      if (pattern) {
        // Use HTML comment format to prevent markdown interpretation
        const placeholder = `<!--ENTITY${placeholderIndex}-->`
        entityPlaceholders.set(placeholder, { entity, pattern })
        placeholderIndex++

        // Replace entity value with placeholder
        contentWithPlaceholders =
          contentWithPlaceholders.substring(0, entity.startIndex) +
          placeholder +
          contentWithPlaceholders.substring(entity.endIndex)
      }
    }

    const renderer = new marked.Renderer()

    // Override link rendering (preserve existing markdown links, but skip mailto: links)
    renderer.link = ({ href, title, text }) => {
      // Skip mailto: links - we'll handle emails as entities
      if (href.startsWith('mailto:')) {
        return text // Just return the text without the link
      }

      const isInternal = isGhostUrl(href)

      if (isInternal) {
        const path = extractPath(href)
        const titleAttr = title ? ` title="${title}"` : ''
        return `<a href="${path}" data-nuxt-link class="text-blue-600 dark:text-blue-400 hover:underline"${titleAttr}>${text}</a>`
      } else {
        const titleAttr = title ? ` title="${title}"` : ''
        return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"${titleAttr}>${text}<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg></a>`
      }
    }

    marked.setOptions({
      gfm: true,
      breaks: true,
      renderer,
      mangle: false, // Don't mangle email addresses (prevents auto mailto: conversion)
      headerIds: false // Disable header IDs for cleaner output
    })

    try {
      // STEP 2: Parse markdown with placeholders
      let result = marked.parse(contentWithPlaceholders) as string

      // STEP 3: Replace placeholders with enriched entity HTML
      entityPlaceholders.forEach(({ entity, pattern }, placeholder) => {
        const enrichedEntity = enrichEntity(entity, pattern, config)
        // Use replaceAll to ensure all instances are replaced
        result = result.replaceAll(placeholder, enrichedEntity)
      })

      return result
    } catch (error) {
      console.error('[Response Enricher] Error parsing content:', error)
      return content.replace(/\n/g, '<br>')
    }
  }

  /**
   * Handle click events on enriched entities and links
   */
  function handleEnrichedClick(event: MouseEvent) {
    const target = event.target as HTMLElement

    // Check for entity links
    const entityLink = target.closest('a[data-entity-type]') as HTMLAnchorElement
    if (entityLink && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      event.preventDefault()

      const entityType = entityLink.getAttribute('data-entity-type')
      const entityValue = entityLink.getAttribute('data-entity-value')
      const popoverEnabled = entityLink.getAttribute('data-popover-enabled') === 'true'

      // If popover enabled, show popover instead of navigating
      if (popoverEnabled) {
        showEntityPopover(entityType as EntityType, entityValue!, entityLink)
        return
      }

      // Otherwise navigate to link
      const href = entityLink.getAttribute('href')
      if (href && href !== '#') {
        navigateTo(href)
      }
      return
    }

    // Check for regular GHOST links
    const link = target.closest('a[data-nuxt-link]') as HTMLAnchorElement
    if (link && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      event.preventDefault()
      const href = link.getAttribute('href')
      if (href) {
        navigateTo(href)
      }
    }
  }

  /**
   * Show entity popover
   * (Implementation depends on your popover component)
   */
  function showEntityPopover(entityType: EntityType, entityValue: string, triggerElement: HTMLElement) {
    // This is a placeholder - you'll implement with your popover component
    console.log('Show popover:', { entityType, entityValue, triggerElement })

    // Example: Emit event that Vue component can listen to
    window.dispatchEvent(new CustomEvent('show-entity-popover', {
      detail: { entityType, entityValue, triggerElement }
    }))
  }

  /**
   * Fetch entity data for popover
   */
  async function fetchEntityData(entityType: EntityType, entityValue: string): Promise<any> {
    const pattern = entityPatterns.find(p => p.type === entityType)

    if (pattern?.popoverDataFetcher) {
      try {
        return await pattern.popoverDataFetcher(entityValue)
      } catch (error) {
        console.error(`Error fetching ${entityType} data:`, error)
        return null
      }
    }

    return null
  }

  return {
    // Main enrichment function
    enrichStrandsResponse,

    // Entity detection
    detectEntities,

    // Click handling
    handleEnrichedClick,

    // Popover support
    fetchEntityData,

    // Configuration
    defaultConfig,
    entityPatterns
  }
}
