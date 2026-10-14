/**
 * Nitro plugin to validate AWS configuration on startup
 */

import { getRequestURL } from 'h3'
import { validateAWSConfiguration } from '../lib/aws-client-factory'
import { logger } from '../utils/logger'
import { buildRequestErrorRecord } from '../utils/request-error-record'

// Resolve an HTTP status code for the error record. Prefer an explicit numeric
// code carried on the error (h3/Nitro set either `statusCode` or `status`),
// falling back to the response's status. Non-numeric values are ignored so a
// forged string cannot land in the record.
function resolveErrorStatusCode(error: any, event: any): number | undefined {
  if (typeof error?.statusCode === 'number') {
    return error.statusCode
  }
  if (typeof error?.status === 'number') {
    return error.status
  }
  if (typeof event?.node?.res?.statusCode === 'number') {
    return event.node.res.statusCode
  }
  return undefined
}

// Emit exactly one bounded, structured JSON record for an API request outcome
// so generic (non-AWS) failures are observable in CloudWatch alongside the
// request-timing entries. Expected client/auth rejections (status < 500) are
// classified as `request_rejection` without exception-class/stack fields so
// routine session polling does not match the error query; true server errors
// (status >= 500 or no trustworthy status) stay `request_error` with error
// name and a bounded stack. Only safe, non-PII fields are included: no headers,
// cookies, tokens, user identity, query strings, request body, or raw error
// objects. Mirrors the direct-stdout JSON pattern used by request timing.
function logRequestError(error: any, event: any): void {
  try {
    if (!event) {
      return
    }

    const pathname = getRequestURL(event).pathname
    // Only observe API routes, matching the request-timing middleware scope.
    if (!pathname.startsWith('/api/') || pathname === '/api/health') {
      return
    }

    const entry = buildRequestErrorRecord({
      requestId: event.context?.requestId,
      method: event.method,
      pathname,
      statusCode: resolveErrorStatusCode(error, event),
      errorName: error?.name,
      errorMessage: error?.message,
      errorStack: error?.stack,
    })

    process.stdout.write(JSON.stringify(entry) + '\n')
  } catch {
    // Never throw from the error hook.
  }
}

export default defineNitroPlugin((nitroApp) => {
  // Validate AWS configuration on startup
  logger.debug('[AWS Validation] Checking AWS configuration...')
  validateAWSConfiguration()

  // Set up error handling for AWS credential issues
  nitroApp.hooks.hook('error', async (error, { event }) => {
    // Emit a single structured record for every API request error so non-AWS
    // failures are observable, not just AWS credential errors below.
    logRequestError(error, event)

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