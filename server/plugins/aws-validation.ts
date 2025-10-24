/**
 * Nitro plugin to validate AWS configuration on startup
 */

import { validateAWSConfiguration } from '../lib/aws-client-factory'
import { logger } from '../utils/logger'

export default defineNitroPlugin((nitroApp) => {
  // Validate AWS configuration on startup
  logger.debug('[AWS Validation] Checking AWS configuration...')
  validateAWSConfiguration()
  
  // Set up error handling for AWS credential issues
  nitroApp.hooks.hook('error', async (error, { event }) => {
    // Check if this is an AWS authentication error
    if (error.message?.includes('UnrecognizedClientException') ||
        error.message?.includes('InvalidUserException') ||
        error.message?.includes('TokenRefreshRequired') ||
        error.message?.includes('ExpiredToken') ||
        error.message?.includes('InvalidClientTokenId') ||
        error.message?.includes('SignatureDoesNotMatch') ||
        error.message?.includes('CredentialsError')) {
      
      logger.error('[AWS Validation] AWS Authentication Error Detected!')
      logger.error('This is likely due to one of the following issues:')
      logger.error('1. Using wrong partition credentials (e.g., commercial keys with GovCloud region)')
      logger.error('2. Expired AWS credentials')
      logger.error('3. Invalid AWS credentials')
      logger.error('4. Region/partition mismatch')
      
      // Re-validate configuration to help diagnose
      validateAWSConfiguration()
      
      // Add diagnostic information to the error
      error.statusMessage = 'AWS Authentication Failed - Check server logs for region/partition configuration issues'
    }
  })
})