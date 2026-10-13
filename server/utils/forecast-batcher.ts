/**
 * Forecast Batcher Utility
 * Handles batched forecast API calls to avoid rate limits
 */

import { getCostForecast } from './cost-explorer'
import { logger } from './logger'
import type { Expression } from '@aws-sdk/client-cost-explorer'

interface ForecastRequest {
  accountId: string
  startDate: string
  endDate: string
  metric: string
  granularity: 'DAILY' | 'MONTHLY'
  proforma: boolean
  environment: 'commercial' | 'govcloud'
}

interface ForecastResult {
  accountId: string
  success: boolean
  data?: {
    total: any
    forecastResultsByTime: any[]
  }
  error?: string
  errorName?: string
  retryable?: boolean
}

/** Cost Explorer cannot create a forecast without enough historical data. */
export function isNonRetryableForecastError(error: unknown): boolean {
  const candidate = error as { name?: string, message?: string } | null
  return candidate?.name === 'DataUnavailableException' ||
    candidate?.message?.includes('Insufficient amount of historical data') === true
}

function boundedErrorName(error: unknown): string {
  const name = (error as { name?: unknown } | null)?.name
  return typeof name === 'string' && name.length > 0 ? name.slice(0, 80) : 'UnknownError'
}

function summarizeErrorNames(results: ForecastResult[]): Record<string, number> {
  const counts = new Map<string, number>()
  for (const result of results) {
    if (!result.success) {
      const name = (result.errorName || 'UnknownError').slice(0, 80)
      counts.set(name, (counts.get(name) || 0) + 1)
    }
  }
  return Object.fromEntries(
    [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
  )
}

/**
 * Batch forecast calls with rate limiting and retry logic
 */
export async function batchForecastCalls(
  requests: ForecastRequest[],
  options: {
    batchSize?: number
    delayBetweenBatches?: number
    maxRetries?: number
    retryDelay?: number
    forecastFn?: typeof getCostForecast
  } = {}
): Promise<ForecastResult[]> {
  const {
    batchSize = 15,
    delayBetweenBatches = 200, // milliseconds
    maxRetries = 2,
    retryDelay = 1000, // milliseconds
    forecastFn = getCostForecast
  } = options

  const results: ForecastResult[] = []
  const failedRequests: { request: ForecastRequest; retries: number }[] = []

  // Split requests into batches
  const batches: ForecastRequest[][] = []
  for (let i = 0; i < requests.length; i += batchSize) {
    batches.push(requests.slice(i, i + batchSize))
  }

  logger.info(`[ForecastBatcher] Processing ${requests.length} requests in ${batches.length} batches`)

  // Process each batch
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex]!
    logger.info(`[ForecastBatcher] Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} accounts)`)

    // Process batch in parallel
    const batchResults = await Promise.allSettled(
      batch.map(async (request) => {
        try {
          // Create filter for specific account
          const filter: Expression = {
            Dimensions: {
              Key: 'LINKED_ACCOUNT',
              Values: [request.accountId]
            }
          }

          const forecast = await forecastFn(
            request.startDate,
            request.endDate,
            request.metric,
            request.granularity,
            filter,
            request.environment,
            request.proforma ? process.env.AWS_PROFORMA_ACCOUNT_ID || '253821132832' : undefined
          )

          return {
            accountId: request.accountId,
            success: true,
            data: forecast
          } as ForecastResult
        } catch (error: any) {
          const retryable = !isNonRetryableForecastError(error)
          if (retryable) {
            logger.warn('[ForecastBatcher] Forecast request failed and will be retried', {
              errorName: boundedErrorName(error)
            })
          }
          return {
            accountId: request.accountId,
            success: false,
            error: error.message,
            errorName: boundedErrorName(error),
            retryable
          } as ForecastResult
        }
      })
    )

    // Process results
    batchResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const forecastResult = result.value
        if (forecastResult.success) {
          results.push(forecastResult)
        } else if (forecastResult.retryable === false) {
          // Deterministic no-history failures cannot succeed on retry.
          results.push(forecastResult)
        } else {
          // Queue for retry
          failedRequests.push({
            request: batch[index]!,
            retries: 0
          })
        }
      } else {
        // Promise rejected
        failedRequests.push({
          request: batch[index]!,
          retries: 0
        })
      }
    })

    // Delay between batches (except for last batch)
    if (batchIndex < batches.length - 1) {
      await sleep(delayBetweenBatches)
    }
  }

  // Retry failed requests
  if (failedRequests.length > 0 && maxRetries > 0) {
    logger.info(`[ForecastBatcher] Retrying ${failedRequests.length} failed requests`)

    for (const { request, retries } of failedRequests) {
      if (retries >= maxRetries) {
        results.push({
          accountId: request.accountId,
          success: false,
          error: 'Max retries exceeded'
        })
        continue
      }

      // Wait before retry
      await sleep(retryDelay * (retries + 1))

      try {
        const filter: Expression = {
          Dimensions: {
            Key: 'LINKED_ACCOUNT',
            Values: [request.accountId]
          }
        }

        const forecast = await forecastFn(
          request.startDate,
          request.endDate,
          request.metric,
          request.granularity,
          filter,
          request.environment,
          request.proforma ? process.env.AWS_PROFORMA_ACCOUNT_ID || '253821132832' : undefined
        )

        results.push({
          accountId: request.accountId,
          success: true,
          data: forecast
        })

        logger.info('[ForecastBatcher] Forecast retry succeeded')
      } catch (error: any) {
        logger.warn('[ForecastBatcher] Forecast retry failed', {
          retry: retries + 1,
          errorName: boundedErrorName(error)
        })
        results.push({
          accountId: request.accountId,
          success: false,
          error: error.message,
          errorName: boundedErrorName(error),
          retryable: !isNonRetryableForecastError(error)
        })
      }
    }
  }

  const successCount = results.filter(r => r.success).length
  const failureCount = results.filter(r => !r.success).length
  const nonRetryableCount = results.filter(r => !r.success && r.retryable === false).length

  logger.info('forecast_batch_summary', {
    signature: 'forecast_batch_summary',
    attemptedCount: requests.length,
    successCount,
    failureCount,
    nonRetryableCount,
    errorNames: summarizeErrorNames(results)
  })

  return results
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
