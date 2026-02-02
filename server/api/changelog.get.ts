import { readFile } from 'fs/promises'
import { join } from 'path'

interface ChangelogEntry {
  version: string
  date: string
  highlights: string[]
  content: string
}

export default defineEventHandler(async (): Promise<ChangelogEntry[]> => {
  try {
    const changelogPath = join(process.cwd(), 'CHANGELOG.md')
    const content = await readFile(changelogPath, 'utf-8')

    return parseChangelog(content)
  } catch (error) {
    console.error('Error reading changelog:', error)
    return []
  }
})

function parseChangelog(content: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = []

  // Split by version headers (## [x.x.x] - YYYY-MM-DD)
  const versionRegex = /^## \[(\d+\.\d+\.\d+(?:-[\w.]+)?)\](?: - (\d{4}-\d{2}-\d{2}))?(.*)$/gm
  const parts = content.split(versionRegex)

  // Skip the header part (everything before first version)
  // parts[0] = header, then groups of: version, date, suffix (e.g. " (Beta)"), content
  for (let i = 1; i < parts.length; i += 4) {
    const version = parts[i]
    const date = parts[i + 1] || ''
    const sectionContent = parts[i + 3]?.trim() || ''

    if (!version) continue

    // Extract highlights from HTML comment: <!-- highlights: Feature1, Feature2 -->
    const highlightsMatch = sectionContent.match(/<!--\s*highlights:\s*(.+?)\s*-->/)
    const highlights = highlightsMatch
      ? highlightsMatch[1].split(',').map(h => h.trim())
      : []

    // Remove the highlights comment and horizontal rules from content
    const cleanContent = sectionContent
      .replace(/<!--\s*highlights:.+?-->\n?/g, '')
      .replace(/^---\s*$/gm, '')
      .trim()

    if (version && cleanContent) {
      entries.push({
        version,
        date,
        highlights,
        content: cleanContent
      })
    }
  }

  return entries
}
