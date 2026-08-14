import DOMPurify from 'isomorphic-dompurify'

const CHAT_TAGS = [
  'a', 'blockquote', 'br', 'code', 'del', 'div', 'em', 'h1', 'h2', 'h3', 'h4',
  'h5', 'h6', 'hr', 'img', 'li', 'ol', 'p', 'pre', 'span', 'strong', 'table',
  'tbody', 'td', 'th', 'thead', 'tr', 'ul'
]

const CHAT_ATTRIBUTES = [
  'alt', 'class', 'data-entity-type', 'data-entity-value', 'data-nuxt-link',
  'data-popover-enabled', 'data-rendered', 'height', 'href', 'id', 'rel', 'src',
  'target', 'title', 'width'
]

const SAFE_URI = /^(?:(?:https?|mailto):|\/(?!\/)|#)/i

export function sanitizeChatHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: CHAT_TAGS,
    ALLOWED_ATTR: CHAT_ATTRIBUTES,
    ALLOWED_URI_REGEXP: SAFE_URI,
    ADD_URI_SAFE_ATTR: ['data-entity-type', 'data-entity-value', 'data-popover-enabled', 'data-rendered'],
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ['iframe', 'object', 'embed', 'form', 'input', 'button', 'style', 'script'],
    FORBID_ATTR: ['style']
  })
}

export function sanitizeMermaidSvg(svg: string): string {
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['foreignObject', 'script', 'style', 'iframe', 'object', 'embed'],
    ALLOW_DATA_ATTR: false
  })
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function normalizeSafeHref(value: string): string | null {
  const href = value.trim()
  if (href.startsWith('/') && !href.startsWith('//')) return href

  try {
    const url = new URL(href)
    return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:'
      ? url.toString()
      : null
  } catch {
    return null
  }
}
