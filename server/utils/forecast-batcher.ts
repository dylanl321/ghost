/**
 * Forecast Batcher Utility
 * Handles batched forecast API calls to avoid rate limits
 */

import { getCostForecast } from './cost-explorer'
import { logger } from './logger'

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
  } = {}
): Promise<ForecastResult[]> {
  const {
    batchSize = 15,
    delayBetweenBatches = 200, // milliseconds
    maxRetries = 2,
    retryDelay = 1000 // milliseconds
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
    const batch = batches[batchIndex]
    logger.info(`[ForecastBatcher] Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} accounts)`)

    // Process batch in parallel
    const batchResults = await Promise.allSettled(
      batch.map(async (request) => {
        try {
          // Create filter for specific account
          const filter = {
            Dimensions: {
              Key: 'LINKED_ACCOUNT',
              Values: [request.accountId]
            }
          }

          const forecast = await getCostForecast(
            request.startDate,
            request.endDate,
            request.metric,
            request.granularity,
            filter,
            request.environment
          )

          return {
            accountId: request.accountId,
            success: true,
            data: forecast
          } as ForecastResult
        } catch (error: any) {
          logger.warn(`[ForecastBatcher] Failed to fetch forecast for account ${request.accountId}:`, error.message)
          return {
            accountId: request.accountId,
            success: false,
            error: error.message
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
        } else {
          // Queue for retry
          failedRequests.push({
            request: batch[index],
            retries: 0
          })
        }
      } else {
        // Promise rejected
        failedRequests.push({
          request: batch[index],
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
        const filter = {
          Dimensions: {
            Key: 'LINKED_ACCOUNT',
            Values: [request.accountId]
          }
        }

        const forecast = await getCostForecast(
          request.startDate,
          request.endDate,
          request.metric,
          request.granularity,
          filter,
          request.environment
        )

        results.push({
          accountId: request.accountId,
          success: true,
          data: forecast
        })

        logger.info(`[ForecastBatcher] Retry successful for account ${request.accountId}`)
      } catch (error: any) {
        logger.warn(`[ForecastBatcher] Retry ${retries + 1} failed for account ${request.accountId}:`, error.message)
        results.push({
          accountId: request.accountId,
          success: false,
          error: error.message
        })
      }
    }
  }

  const successCount = results.filter(r => r.success).length
  const failureCount = results.filter(r => !r.success).length

  logger.info(`[ForecastBatcher] Completed: ${successCount} successful, ${failureCount} failed`)

  return results
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
