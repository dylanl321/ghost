/**
 * Nitro plugin to validate AWS configuration on startup
 */

import { getRequestURL } from 'h3'
import { validateAWSConfiguration } from '../lib/aws-client-factory'
import { logger } from '../utils/logger'
import { boundedLogField } from '../utils/log-sanitize'
import { normalizePath } from '../utils/request-telemetry'

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

// Collapse the HTTP status into a single low-cardinality class so expected
// client rejections (e.g. the 401s on unauthenticated VMaaS cost reads) can be
// filtered apart from genuine server failures without widening cardinality or
// feeding the level-based error alarms. Values are a closed set.
function classifyErrorStatus(statusCode: number | undefined): string {
  if (typeof statusCode !== 'number') {
    return 'unknown'
  }
  if (statusCode >= 500) {
    return 'server_error'
  }
  if (statusCode >= 400) {
    return 'client_error'
  }
  return 'ok'
}

// Emit exactly one bounded, structured JSON record for an API request error so
// generic (non-AWS) failures are observable in CloudWatch alongside the
// request-timing entries. Only safe, non-PII fields are included: no headers,
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

    // Every string field is passed through boundedLogField so control
    // characters (forged newlines) are stripped and length is capped, keeping
    // the record a single, bounded, log-injection-safe JSON line.
    const statusCode = resolveErrorStatusCode(error, event)
    const entry: Record<string, unknown> = {
      type: 'request_error',
      // Low-cardinality class so expected 4xx client rejections can be
      // separated from 5xx server failures in Log Insights and alarms.
      errorClass: classifyErrorStatus(statusCode),
      timestamp: new Date().toISOString(),
      requestId: boundedLogField(event.context?.requestId, 128),
      method: boundedLogField(event.method, 16),
      // Normalize dynamic segments (instance IDs, UUIDs, numeric ids) before
      // bounding so recurring errors collapse into one route instead of
      // exploding per-resource cardinality or leaking resource identifiers.
      path: boundedLogField(normalizePath(pathname), 256),
      statusCode,
      errorName: boundedLogField(error?.name, 128),
      errorMessage: boundedLogField(error?.message, 512),
    }

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