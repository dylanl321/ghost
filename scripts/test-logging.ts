#!/usr/bin/env tsx
/**
 * Test script to demonstrate the new logging system
 * Shows how different LOG_LEVEL values affect output
 */

// Simulate different log levels
async function testLogLevel(level: string) {
  console.log(`\n${'='.repeat(80)}`)
  console.log(`Testing with LOG_LEVEL=${level}`)
  console.log('='.repeat(80))

  // Set the environment variable
  process.env.LOG_LEVEL = level

  // Clear the module cache to reload the logger with new config
  delete require.cache[require.resolve('../server/utils/logger.ts')]

  // Import logger fresh
  const { logger } = await import('../server/utils/logger.ts')

  // Test different log levels
  console.log('\nLog statements being emitted:')
  logger.debug('🔍 DEBUG: getUserSession called - checking all sources...')
  logger.debug('🔍 DEBUG: Checking for OIDC session...')
  logger.debug('🔍 DEBUG: API auth check for: /api/accounts/list')
  logger.info('ℹ️  INFO: Logger initialized')
  logger.info('ℹ️  INFO: Processing account data')
  logger.warn('⚠️  WARN: Security token expired. Refreshing...')
  logger.error('❌ ERROR: Failed to connect to database')

  console.log('\n' + '─'.repeat(80) + '\n')
}

async function main() {
  console.log('🧪 Logging System Test')
  console.log('This demonstrates how different LOG_LEVEL values filter output\n')

  // Test each level
  await testLogLevel('error')   // Only errors
  await testLogLevel('warn')    // Warnings and errors
  await testLogLevel('info')    // Info, warnings, and errors (default production)
  await testLogLevel('debug')   // Everything including debug (default development)

  console.log('\n✅ Test complete!')
  console.log('\n💡 TIP: Set LOG_LEVEL in your .env file or pass it when starting:')
  console.log('   LOG_LEVEL=info npm run dev')
}

main().catch(console.error)
