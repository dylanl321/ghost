#!/usr/bin/env tsx
/**
 * Automated Logging Refactoring Script
 *
 * This script refactors all console.* calls in server files to use the centralized logger utility.
 *
 * Usage:
 *   npx tsx scripts/refactor-logging.ts --dry-run  # Preview changes
 *   npx tsx scripts/refactor-logging.ts --apply    # Apply changes
 */

import * as fs from 'fs'
import * as path from 'path'

interface Change {
  file: string
  lineNumber: number
  original: string
  replacement: string
  logLevel: string
}

interface FileReport {
  file: string
  changes: Change[]
  addedImport: boolean
}

const LOGGER_IMPORT = "import { logger } from '~/server/utils/logger'"

// Keywords that indicate different log levels
const ERROR_KEYWORDS = ['error', 'failed', 'fail', 'exception', 'critical', 'fatal']
const WARN_KEYWORDS = ['warn', 'warning', 'deprecated', 'deprecat']
const DEBUG_KEYWORDS = ['debug', 'checking', 'found', 'extracted', 'session', 'auth', 'token', 'validate']

/**
 * Determine appropriate log level based on message content
 */
function determineLogLevel(consoleMethod: string, message: string): string {
  const lowerMessage = message.toLowerCase()

  // Respect original console method
  if (consoleMethod === 'error') return 'error'
  if (consoleMethod === 'warn') return 'warn'
  if (consoleMethod === 'debug') return 'debug'

  // For console.log, use intelligent mapping based on content
  for (const keyword of ERROR_KEYWORDS) {
    if (lowerMessage.includes(keyword)) return 'error'
  }

  for (const keyword of WARN_KEYWORDS) {
    if (lowerMessage.includes(keyword)) return 'warn'
  }

  for (const keyword of DEBUG_KEYWORDS) {
    if (lowerMessage.includes(keyword)) return 'debug'
  }

  // Default console.log to info
  return 'info'
}

/**
 * Check if file already has logger import
 */
function hasLoggerImport(content: string): boolean {
  return content.includes("from '~/server/utils/logger'") ||
         content.includes('from "~/server/utils/logger"') ||
         content.includes("from '../utils/logger'") ||
         content.includes('from "../utils/logger"')
}

/**
 * Add logger import to file
 */
function addLoggerImport(content: string): string {
  // Find the last import statement
  const lines = content.split('\n')
  let lastImportIndex = -1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line.startsWith('import ') || line.startsWith('export ') && line.includes('import')) {
      lastImportIndex = i
    }
  }

  // Insert after last import, or at the top after any initial comments
  if (lastImportIndex >= 0) {
    lines.splice(lastImportIndex + 1, 0, LOGGER_IMPORT)
  } else {
    // Find first non-comment, non-empty line
    let insertIndex = 0
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (line && !line.startsWith('//') && !line.startsWith('/*') && !line.startsWith('*')) {
        insertIndex = i
        break
      }
    }
    lines.splice(insertIndex, 0, LOGGER_IMPORT, '')
  }

  return lines.join('\n')
}

/**
 * Refactor console calls in content
 */
function refactorConsoleCalls(content: string, filePath: string): { content: string; changes: Change[] } {
  const changes: Change[] = []
  const lines = content.split('\n')

  // Match console.log(), console.error(), console.warn(), console.debug()
  // This regex handles multi-line calls and various argument formats
  const consoleRegex = /console\.(log|error|warn|debug)\s*\(([\s\S]*?)\)/g

  let match: RegExpExecArray | null
  const replacements: Array<{ start: number; end: number; replacement: string; original: string; logLevel: string }> = []

  while ((match = consoleRegex.exec(content)) !== null) {
    const [fullMatch, method, args] = match
    const matchStart = match.index
    const matchEnd = matchStart + fullMatch.length

    // Determine log level
    const logLevel = determineLogLevel(method, args)

    // Create replacement
    const replacement = `logger.${logLevel}(${args})`

    replacements.push({
      start: matchStart,
      end: matchEnd,
      replacement,
      original: fullMatch,
      logLevel,
    })
  }

  // Apply replacements in reverse order to maintain indices
  let modifiedContent = content
  for (let i = replacements.length - 1; i >= 0; i--) {
    const { start, end, replacement, original, logLevel } = replacements[i]

    // Calculate line number
    const lineNumber = modifiedContent.substring(0, start).split('\n').length

    changes.push({
      file: filePath,
      lineNumber,
      original,
      replacement,
      logLevel,
    })

    modifiedContent = modifiedContent.substring(0, start) + replacement + modifiedContent.substring(end)
  }

  return { content: modifiedContent, changes }
}

/**
 * Process a single file
 */
async function processFile(filePath: string, dryRun: boolean): Promise<FileReport> {
  const content = await fs.promises.readFile(filePath, 'utf-8')

  // Skip if file is the logger itself
  if (filePath.includes('server/utils/logger.ts')) {
    return { file: filePath, changes: [], addedImport: false }
  }

  // Refactor console calls
  const { content: modifiedContent, changes } = refactorConsoleCalls(content, filePath)

  // Skip if no changes
  if (changes.length === 0) {
    return { file: filePath, changes: [], addedImport: false }
  }

  // Add logger import if needed
  let finalContent = modifiedContent
  let addedImport = false

  if (!hasLoggerImport(modifiedContent)) {
    finalContent = addLoggerImport(modifiedContent)
    addedImport = true
  }

  // Write changes if not dry run
  if (!dryRun) {
    await fs.promises.writeFile(filePath, finalContent, 'utf-8')
  }

  return { file: filePath, changes, addedImport }
}

/**
 * Recursively find all TypeScript files in a directory
 */
async function findTypeScriptFiles(dir: string): Promise<string[]> {
  const files: string[] = []
  const entries = await fs.promises.readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      // Skip node_modules and build directories
      if (!['node_modules', '.nuxt', 'dist', '.output'].includes(entry.name)) {
        const subFiles = await findTypeScriptFiles(fullPath)
        files.push(...subFiles)
      }
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(fullPath)
    }
  }

  return files
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2)
  const dryRun = !args.includes('--apply')

  console.log('🔍 Scanning for server files...\n')

  // Find all TypeScript files in server directory
  const serverDir = path.join(process.cwd(), 'server')
  const files = await findTypeScriptFiles(serverDir)

  console.log(`Found ${files.length} files to process\n`)

  if (dryRun) {
    console.log('🔬 DRY RUN MODE - No files will be modified\n')
    console.log('Run with --apply to apply changes\n')
  } else {
    console.log('✍️  APPLY MODE - Files will be modified\n')
  }

  // Process all files
  const reports: FileReport[] = []
  let totalChanges = 0
  let filesWithChanges = 0

  for (const file of files) {
    const report = await processFile(file, dryRun)
    if (report.changes.length > 0) {
      reports.push(report)
      totalChanges += report.changes.length
      filesWithChanges++
    }
  }

  // Print report
  console.log('━'.repeat(80))
  console.log('📊 REFACTORING REPORT')
  console.log('━'.repeat(80))
  console.log(`Files processed: ${files.length}`)
  console.log(`Files with changes: ${filesWithChanges}`)
  console.log(`Total console.* calls replaced: ${totalChanges}`)
  console.log('━'.repeat(80))
  console.log()

  if (reports.length > 0) {
    console.log('📝 DETAILED CHANGES:\n')

    for (const report of reports) {
      const relativePath = path.relative(process.cwd(), report.file)
      console.log(`\n📄 ${relativePath}`)
      if (report.addedImport) {
        console.log(`   ✅ Added logger import`)
      }
      console.log(`   ${report.changes.length} console calls replaced:`)

      // Group by log level
      const byLevel = report.changes.reduce((acc, change) => {
        acc[change.logLevel] = (acc[change.logLevel] || 0) + 1
        return acc
      }, {} as Record<string, number>)

      for (const [level, count] of Object.entries(byLevel)) {
        console.log(`      - ${count}x logger.${level}()`)
      }
    }

    console.log('\n━'.repeat(80))
  }

  if (dryRun) {
    console.log('\n✅ Dry run complete! Review the changes above.')
    console.log('   Run with --apply to apply these changes.\n')
  } else {
    console.log('\n✅ Refactoring complete! All changes have been applied.\n')
    console.log('   Next steps:')
    console.log('   1. Review the changes with: git diff')
    console.log('   2. Test the server: npm run dev')
    console.log('   3. Configure LOG_LEVEL environment variable as needed\n')
  }
}

main().catch((error) => {
  console.error('❌ Error:', error)
  process.exit(1)
})
