export type GhostOutputFormat = 'json' | 'markdown' | 'csv' | 'text'

export interface RenderedGhostOutput {
  format: GhostOutputFormat
  mimeType: string
  content: string
}

function scalar(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value) || ''
}

function flatten(value: Record<string, unknown>, prefix = '', output: Record<string, string> = {}) {
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (child && typeof child === 'object' && !Array.isArray(child)) flatten(child as Record<string, unknown>, path, output)
    else output[path] = scalar(child)
  }
  return output
}

function rows(value: unknown): Record<string, string>[] {
  const input = Array.isArray(value) ? value : [value]
  return input.map(item => item && typeof item === 'object' && !Array.isArray(item)
    ? flatten(item as Record<string, unknown>)
    : { value: scalar(item) })
}

function escapeCsv(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

function toCsv(value: unknown): string {
  const data = rows(value)
  const headers = Array.from(new Set(data.flatMap(row => Object.keys(row))))
  return [headers, ...data.map(row => headers.map(header => row[header] || ''))]
    .map(row => row.map(escapeCsv).join(','))
    .join('\n')
}

function escapeMarkdown(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>')
}

function toMarkdown(value: unknown): string {
  const data = rows(value)
  const headers = Array.from(new Set(data.flatMap(row => Object.keys(row))))
  if (!headers.length) return ''
  return [
    `| ${headers.map(escapeMarkdown).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...data.map(row => `| ${headers.map(header => escapeMarkdown(row[header] || '')).join(' | ')} |`)
  ].join('\n')
}

export function renderGhostOutput(value: unknown, format: GhostOutputFormat): RenderedGhostOutput {
  switch (format) {
    case 'csv':
      return { format, mimeType: 'text/csv', content: toCsv(value) }
    case 'markdown':
      return { format, mimeType: 'text/markdown', content: toMarkdown(value) }
    case 'text':
      return { format, mimeType: 'text/plain', content: typeof value === 'string' ? value : JSON.stringify(value, null, 2) || '' }
    default:
      return { format: 'json', mimeType: 'application/json', content: JSON.stringify(value, null, 2) || '' }
  }
}
