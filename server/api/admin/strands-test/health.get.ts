/**
 * GET /api/admin/strands-test/health
 * Simple health check for Strands agent connectivity
 */

import { defineEventHandler, createError } from 'h3'
import { logger } from '../../../utils/logger'
import { getStrandsConfig } from '../../../utils/strands-client'
import got from 'got'

export default defineEventHandler(async (event) => {
  const startTime = Date.now()
  const testId = `health-${Date.now()}`

  logger.info('[Strands Test] Health check started', { testId })

  try {
    const config = await getStrandsConfig()

    // Simple health check with minimal query
    const testPayload = {
      message: 'ping'
    }

    logger.info('[Strands Test] Sending health check request', {
      testId,
      url: `${config.serverUrl}/query/stream`,
      payload: testPayload
    })

    const response = await got.post(`${config.serverUrl}/query/stream`, {
      json: testPayload,
      timeout: {
        request: 30000 // 30 seconds for health check
      },
      responseType: 'text',
      throwHttpErrors: false
    })

    const duration = Date.now() - startTime

    logger.info('[Strands Test] Health check response received', {
      testId,
      status: response.statusCode,
      duration,
      bodyLength: response.body?.length
    })

    return {
      success: response.statusCode === 200,
      status: response.statusCode,
      duration,
      timestamp: new Date().toISOString(),
      endpoint: config.serverUrl,
      details: {
        responseReceived: !!response.body,
        bodyLength: response.body?.length || 0,
        headers: response.headers
      }
    }
  } catch (error: any) {
    const duration = Date.now() - startTime

    logger.error('[Strands Test] Health check failed', {
      testId,
      error: error.message,
      duration
    })

    throw createError({
      statusCode: 500,
      statusMessage: 'Health check failed',
      data: {
        error: error.message,
        code: error.code,
        duration
      }
    })
  }
})
