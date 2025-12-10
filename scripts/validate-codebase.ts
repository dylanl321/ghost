#!/usr/bin/env tsx
/**
 * Comprehensive Codebase Validation
 * 
 * Runs multiple validation checks:
 * 1. TypeScript type checking
 * 2. ESLint
 * 3. Unused exports detection
 * 4. Unused dependencies
 * 5. Code quality metrics
 * 
 * Usage: npx tsx scripts/validate-codebase.ts [--fix]
 */

import { execSync } from 'child_process'
import { readFileSync, existsSync } from 'fs'

const args = process.argv.slice(2)
const shouldFix = args.includes('--fix')

interface ValidationResult {
  name: string
  passed: boolean
  output: string
  errors?: number
  warnings?: number
}

const results: ValidationResult[] = []

function runCommand(command: string, description: string): ValidationResult {
  console.log(`\n${'='.repeat(80)}`)
  console.log(`🔍 ${description}`)
  console.log('='.repeat(80))

  try {
    const output = execSync(command, {
      encoding: 'utf-8',
      stdio: 'pipe',
      cwd: process.cwd()
    })

    console.log(output)
    
    return {
      name: description,
      passed: true,
      output
    }
  } catch (error: any) {
    const output = error.stdout?.toString() || error.message || ''
    const stderr = error.stderr?.toString() || ''
    
    console.log(output)
    if (stderr) console.log(stderr)

    // Try to extract error count
    const errorMatch = output.match(/(\d+)\s+error/i) || stderr.match(/(\d+)\s+error/i)
    const warningMatch = output.match(/(\d+)\s+warning/i) || stderr.match(/(\d+)\s+warning/i)

    return {
      name: description,
      passed: false,
      output: output + stderr,
      errors: errorMatch ? parseInt(errorMatch[1]) : undefined,
      warnings: warningMatch ? parseInt(warningMatch[1]) : undefined
    }
  }
}

async function main() {
  console.log('🚀 Starting Comprehensive Codebase Validation\n')
  console.log('This may take a few minutes...\n')

  // 1. TypeScript Type Checking
  console.log('\n📘 Step 1: TypeScript Type Checking')
  const typeCheck = runCommand(
    'npx nuxi typecheck',
    'TypeScript Type Checking'
  )
  results.push(typeCheck)

  // 2. ESLint
  console.log('\n📋 Step 2: ESLint')
  const eslintCommand = shouldFix 
    ? 'npx eslint . --fix --ext .ts,.vue,.js'
    : 'npx eslint . --ext .ts,.vue,.js'
  const eslint = runCommand(eslintCommand, 'ESLint Code Quality')
  results.push(eslint)

  // 3. Find Unused Exports (ts-prune)
  console.log('\n🔎 Step 3: Finding Unused Exports')
  if (existsSync('node_modules/.bin/ts-prune')) {
    const tsPrune = runCommand(
      'npx ts-prune --project tsconfig.json',
      'Unused Exports Detection (ts-prune)'
    )
    results.push(tsPrune)
  } else {
    console.log('⚠️  ts-prune not found, skipping...')
  }

  // 4. Find Unused Dependencies
  console.log('\n📦 Step 4: Checking Unused Dependencies')
  if (existsSync('node_modules/.bin/depcheck')) {
    const depcheck = runCommand(
      'npx depcheck --ignores="@nuxt/*,nuxt-*,@types/*,eslint,typescript"',
      'Unused Dependencies (depcheck)'
    )
    results.push(depcheck)
  } else {
    console.log('⚠️  depcheck not found, skipping...')
  }

  // 5. Find Unused Files
  console.log('\n📁 Step 5: Finding Unused Files')
  if (existsSync('node_modules/.bin/unimported')) {
    const unimported = runCommand(
      'npx unimported',
      'Unused Files Detection (unimported)'
    )
    results.push(unimported)
  } else {
    console.log('⚠️  unimported not found, skipping...')
  }

  // Summary
  console.log('\n' + '='.repeat(80))
  console.log('📊 VALIDATION SUMMARY')
  console.log('='.repeat(80))

  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length

  console.log(`\n✅ Passed: ${passed}/${results.length}`)
  console.log(`❌ Failed: ${failed}/${results.length}`)

  if (failed > 0) {
    console.log('\n❌ Failed Checks:')
    results.filter(r => !r.passed).forEach(result => {
      console.log(`   - ${result.name}`)
      if (result.errors) console.log(`     Errors: ${result.errors}`)
      if (result.warnings) console.log(`     Warnings: ${result.warnings}`)
    })
  }

  console.log('\n' + '='.repeat(80))
  
  if (failed === 0) {
    console.log('🎉 All validations passed!')
    process.exit(0)
  } else {
    console.log('⚠️  Some validations failed. Please review the output above.')
    process.exit(1)
  }
}

main().catch(error => {
  console.error('❌ Validation script failed:', error)
  process.exit(1)
})


