#!/usr/bin/env tsx
/**
 * Fix logger import paths
 * Changes ~/server/utils/logger to correct relative paths
 */

import * as fs from 'fs'
import * as path from 'path'

/**
 * Calculate the correct relative path from source file to logger
 */
function getRelativePath(fromFile: string): string {
  const fromDir = path.dirname(fromFile)
  const loggerPath = path.join(process.cwd(), 'server/utils/logger.ts')

  let relativePath = path.relative(fromDir, loggerPath)

  // Remove .ts extension
  relativePath = relativePath.replace(/\.ts$/, '')

  // Ensure it starts with ./  or ../
  if (!relativePath.startsWith('.')) {
    relativePath = './' + relativePath
  }

  return relativePath
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
 * Fix imports in a single file
 */
async function fixFileImports(filePath: string): Promise<boolean> {
  let content = await fs.promises.readFile(filePath, 'utf-8')

  // Skip if no logger import
  if (!content.includes("from '~/server/utils/logger'") &&
      !content.includes('from "~/server/utils/logger"')) {
    return false
  }

  // Calculate correct relative path
  const correctPath = getRelativePath(filePath)

  // Replace the import
  content = content.replace(
    /import\s+\{([^}]+)\}\s+from\s+['"]~\/server\/utils\/logger['"]/g,
    `import {$1} from '${correctPath}'`
  )

  await fs.promises.writeFile(filePath, content, 'utf-8')
  return true
}

async function main() {
  console.log('🔧 Fixing logger import paths...\n')

  const serverDir = path.join(process.cwd(), 'server')
  const files = await findTypeScriptFiles(serverDir)

  let fixed = 0

  for (const file of files) {
    if (await fixFileImports(file)) {
      const relativePath = path.relative(process.cwd(), file)
      console.log(`✅ Fixed: ${relativePath}`)
      fixed++
    }
  }

  console.log(`\n✅ Fixed ${fixed} files`)
  console.log('📝 All logger imports now use correct relative paths')
}

main().catch(console.error)
