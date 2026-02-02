/**
 * AI-Powered Changelog Generation Script
 *
 * Generates user-friendly changelog entries from git commits using AI.
 * Usage: npm run changelog:generate <version>
 * Example: npm run changelog:generate 1.1.0
 *
 * The AI transforms technical commit messages into descriptions focused on
 * end-user impact rather than developer details.
 */

import { execSync } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { config } from 'dotenv'
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'

// Load environment variables
config()

interface CommitInfo {
  hash: string
  message: string
  type: string | null
  scope: string | null
}

interface ChangelogSection {
  title: string
  items: string[]
}

// User-friendly section titles (order matters for display)
const SECTION_ORDER = [
  'New Features',
  'Improvements',
  'Bug Fixes',
  'Other Updates'
]

function getLastTag(): string | null {
  try {
    const tag = execSync('git describe --tags --abbrev=0 2>/dev/null', { encoding: 'utf-8' }).trim()
    return tag || null
  } catch {
    return null
  }
}

function getCommitsSinceTag(tag: string | null): string {
  const range = tag ? `${tag}..HEAD` : 'HEAD~50..HEAD' // Limit to last 50 commits if no tag
  try {
    return execSync(`git log ${range} --pretty=format:"%H|%s" --no-merges`, { encoding: 'utf-8' })
  } catch {
    return ''
  }
}

function parseCommits(commitLog: string): CommitInfo[] {
  const commits: CommitInfo[] = []
  const lines = commitLog.split('\n').filter(Boolean)

  for (const line of lines) {
    const [hash, ...messageParts] = line.split('|')
    const message = messageParts.join('|')

    if (!hash || !message) continue

    // Try to parse conventional commit format
    const conventionalRegex = /^(\w+)(?:\(([^)]+)\))?!?:\s*(.+)$/
    const match = message.match(conventionalRegex)

    commits.push({
      hash: hash.substring(0, 7),
      message: match ? match[3] : message,
      type: match ? match[1].toLowerCase() : null,
      scope: match ? match[2] || null : null
    })
  }

  return commits
}

async function getBedrockClient(): Promise<BedrockRuntimeClient> {
  const region = process.env.BEDROCK_REGION || process.env.AWS_COMMERCIAL_REGION || 'us-east-1'

  return new BedrockRuntimeClient({
    region,
    credentials: {
      accessKeyId: process.env.AWS_COMMERCIAL_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_COMMERCIAL_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || ''
    }
  })
}

async function generateUserFriendlyChangelog(commits: CommitInfo[], version: string): Promise<ChangelogSection[]> {
  const client = await getBedrockClient()

  // Prepare commit data for AI
  const commitSummary = commits.map(c => ({
    type: c.type,
    scope: c.scope,
    message: c.message
  }))

  const prompt = `You are writing a changelog for GHOST, an AWS dashboard application used by non-technical business users to view their AWS accounts, costs, and resources.

Transform these git commits into a user-friendly changelog. Focus on what the user can now do or what's improved, NOT on technical implementation details.

Guidelines:
- Write from the user's perspective ("You can now..." or "Added ability to...")
- Use simple, non-technical language
- Group related changes together into single entries when possible
- Ignore purely technical/developer changes (refactoring, code cleanup, dependencies) unless they have user impact
- Each entry should be 1-2 sentences max
- Don't mention file names, code, APIs, or technical terms

Git commits to transform:
${JSON.stringify(commitSummary, null, 2)}

Respond with a JSON object containing these sections (only include sections that have items):
{
  "New Features": ["list of new capabilities users can now use"],
  "Improvements": ["list of enhanced existing features or better user experience"],
  "Bug Fixes": ["list of issues that were resolved, written as 'Fixed...'"],
  "Other Updates": ["any other notable changes that affect users"]
}

Only include entries that matter to end users. If a commit is purely internal/technical with no user impact, exclude it.
Return ONLY the JSON object, no other text.`

  try {
    const command = new InvokeModelCommand({
      modelId: process.env.BEDROCK_CLAUDE_MODEL_ID || 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 2000,
        temperature: 0.3,
        system: 'You are a technical writer creating user-friendly changelogs. Always respond with valid JSON only.',
        messages: [{ role: 'user', content: prompt }]
      })
    })

    const response = await client.send(command)
    const responseBody = JSON.parse(new TextDecoder().decode(response.body))
    const content = responseBody.content?.[0]?.text || '{}'

    // Parse AI response
    const sections = JSON.parse(content) as Record<string, string[]>

    // Convert to ordered sections
    const result: ChangelogSection[] = []
    for (const title of SECTION_ORDER) {
      if (sections[title] && sections[title].length > 0) {
        result.push({ title, items: sections[title] })
      }
    }

    return result

  } catch (error: any) {
    console.error('AI generation failed:', error.message)
    console.log('Falling back to basic changelog generation...')
    return generateBasicChangelog(commits)
  }
}

function generateBasicChangelog(commits: CommitInfo[]): ChangelogSection[] {
  // Fallback: Group commits by type without AI
  const sections: Record<string, string[]> = {
    'New Features': [],
    'Improvements': [],
    'Bug Fixes': [],
    'Other Updates': []
  }

  for (const commit of commits) {
    const entry = commit.scope
      ? `${commit.scope}: ${commit.message}`
      : commit.message

    switch (commit.type) {
      case 'feat':
        sections['New Features'].push(entry)
        break
      case 'fix':
        sections['Bug Fixes'].push(`Fixed ${entry.toLowerCase()}`)
        break
      case 'perf':
      case 'refactor':
        sections['Improvements'].push(entry)
        break
      default:
        // Skip technical commits in basic mode
        break
    }
  }

  return SECTION_ORDER
    .filter(title => sections[title].length > 0)
    .map(title => ({ title, items: sections[title] }))
}

function formatChangelogEntry(version: string, sections: ChangelogSection[]): string {
  const date = new Date().toISOString().split('T')[0]
  const lines: string[] = [`## [${version}] - ${date}`, '']

  for (const section of sections) {
    lines.push(`### ${section.title}`)
    for (const item of section.items) {
      lines.push(`- ${item}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

function prependToChangelog(newEntry: string): void {
  const changelogPath = join(process.cwd(), 'CHANGELOG.md')

  let existingContent = ''
  try {
    existingContent = readFileSync(changelogPath, 'utf-8')
  } catch {
    existingContent = `# Changelog

All notable changes to GHOST are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

`
  }

  // Find the position after the header (before the first ## entry)
  const firstVersionIndex = existingContent.indexOf('\n## ')

  let updatedContent: string
  if (firstVersionIndex === -1) {
    updatedContent = existingContent.trimEnd() + '\n\n' + newEntry
  } else {
    const header = existingContent.substring(0, firstVersionIndex)
    const rest = existingContent.substring(firstVersionIndex)
    updatedContent = header + '\n' + newEntry + rest
  }

  writeFileSync(changelogPath, updatedContent)
}

async function main(): Promise<void> {
  const version = process.argv[2]

  if (!version) {
    console.error('Usage: npm run changelog:generate <version>')
    console.error('Example: npm run changelog:generate 1.1.0')
    process.exit(1)
  }

  if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
    console.error('Invalid version format. Use semantic versioning (e.g., 1.0.0, 1.1.0-beta.1)')
    process.exit(1)
  }

  console.log(`Generating changelog for version ${version}...`)

  const lastTag = getLastTag()
  console.log(lastTag ? `Collecting commits since ${lastTag}` : 'Collecting recent commits (no previous tag found)')

  const commitLog = getCommitsSinceTag(lastTag)

  if (!commitLog.trim()) {
    console.log('No commits found.')
    process.exit(0)
  }

  const commits = parseCommits(commitLog)
  console.log(`Found ${commits.length} commits`)

  console.log('Generating user-friendly descriptions with AI...')
  const sections = await generateUserFriendlyChangelog(commits, version)

  if (sections.length === 0) {
    console.log('No user-facing changes found in commits.')
    process.exit(0)
  }

  const entry = formatChangelogEntry(version, sections)

  console.log('\nGenerated changelog entry:')
  console.log('─'.repeat(50))
  console.log(entry)
  console.log('─'.repeat(50))

  prependToChangelog(entry)
  console.log('\nChangelog updated successfully!')
  console.log('Next steps:')
  console.log(`  1. Review and edit CHANGELOG.md if needed`)
  console.log(`  2. Update version in package.json to ${version}`)
  console.log(`  3. Commit the changes`)
  console.log(`  4. Create a git tag: git tag -a v${version} -m "Release ${version}"`)
}

main().catch(console.error)
