/**
 * POST /api/admin/strands-test/stream
 * Full streaming test for Strands agent with detailed logging
 */

import { defineEventHandler, readBody, createError } from 'h3'
import { logger } from '../../../utils/logger'
import { getStrandsConfig } from '../../../utils/strands-client'
import got from 'got'

interface StreamTestRequest {
  query: string
  accountIdentifier?: string
}

interface StreamTestLog {
  timestamp: string
  level: 'info' | 'warn' | 'error'
  message: string
  data?: any
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event) as StreamTestRequest
  const { query = 'List AWS accounts', accountIdentifier } = body

  const testId = `stream-test-${Date.now()}`
  const startTime = Date.now()
  const logs: StreamTestLog[] = []
  const events: any[] = []

  const log = (level: 'info' | 'warn' | 'error', message: string, data?: any) => {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data
    }
    logs.push(logEntry)
    logger[level](`[Strands Test] ${message}`, { testId, ...data })
  }

  log('info', 'Stream test started', { query, accountIdentifier })

  try {
    const config = await getStrandsConfig()

    const testPayload: any = {
      message: query
    }

    if (accountIdentifier) {
      testPayload.account_identifier = accountIdentifier
    }

    log('info', 'Sending streaming request', {
      url: `${config.serverUrl}/query/stream`,
      payloadSize: JSON.stringify(testPayload).length
    })

    const strandsStream = got.stream.post(`${config.serverUrl}/query/stream`, {
      json: testPayload,
      headers: {
        'Accept': 'text/event-stream'
      },
      timeout: {
        request: config.timeout
      },
      followRedirect: false,
      decompress: false,
      throwHttpErrors: false
    })

    // Track stream metadata
    let responseStatus: number | undefined
    let responseHeaders: any
    let firstChunkTime: number | undefined
    let lastChunkTime: number | undefined
    let chunkCount = 0
    let totalBytes = 0

    // Wait for response headers
    await new Promise<void>((resolve, reject) => {
      strandsStream.once('response', (response) => {
        responseStatus = response.statusCode
        responseHeaders = response.headers
        log('info', 'Response headers received', {
          status: responseStatus,
          headers: responseHeaders,
          duration: Date.now() - startTime
        })

        if (responseStatus !== 200) {
          reject(new Error(`Unexpected status code: ${responseStatus}`))
        } else {
          resolve()
        }
      })

      strandsStream.once('error', (error) => {
        log('error', 'Stream error during connection', { error: error.message })
        reject(error)
      })

      // Timeout for response headers
      setTimeout(() => {
        reject(new Error('Timeout waiting for response headers'))
      }, 10000)
    })

    // Parse SSE stream
    let buffer = ''
    let currentEvent: string | null = null
    let currentDataLines: string[] = []

    await new Promise<void>((resolve, reject) => {
      strandsStream.on('data', (chunk: Buffer) => {
        if (!firstChunkTime) {
          firstChunkTime = Date.now()
          log('info', 'First chunk received', {
            duration: firstChunkTime - startTime,
            chunkSize: chunk.length
          })
        }

        lastChunkTime = Date.now()
        chunkCount++
        totalBytes += chunk.length

        // Decode and parse SSE
        const decodedChunk = chunk.toString('utf-8')
        buffer += decodedChunk

        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('event:')) {
            currentEvent = line.substring(6).trim()
          } else if (line.startsWith('data:')) {
            currentDataLines.push(line.substring(5).trim())
          } else if (line === '' && currentEvent) {
            try {
              const data = JSON.parse(currentDataLines.join('\n'))
              events.push({
                type: currentEvent,
                data,
                timestamp: new Date().toISOString()
              })

              log('info', `Event received: ${currentEvent}`, {
                eventType: currentEvent,
                dataKeys: Object.keys(data),
                eventCount: events.length
              })

              currentEvent = null
              currentDataLines = []
            } catch (error: any) {
              log('error', 'Failed to parse SSE event', {
                eventType: currentEvent,
                error: error.message
              })
              currentEvent = null
              currentDataLines = []
            }
          }
        }
      })

      strandsStream.on('end', () => {
        log('info', 'Stream ended', {
          duration: Date.now() - startTime,
          chunkCount,
          totalBytes,
          eventCount: events.length
        })
        resolve()
      })

      strandsStream.on('error', (error) => {
        log('error', 'Stream error', { error: error.message })
        reject(error)
      })
    })

    const duration = Date.now() - startTime

    // Analyze results
    const eventTypes = events.reduce((acc, evt) => {
      acc[evt.type] = (acc[evt.type] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    const hasCompleteEvent = events.some(e => e.type === 'complete')
    const hasErrorEvent = events.some(e => e.type === 'error')

    log('info', 'Stream test completed', {
      duration,
      success: hasCompleteEvent && !hasErrorEvent,
      eventTypes
    })

    return {
      success: hasCompleteEvent && !hasErrorEvent,
      testId,
      duration,
      timestamp: new Date().toISOString(),
      query,
      stats: {
        chunkCount,
        totalBytes,
        eventCount: events.length,
        eventTypes,
        firstChunkDelay: firstChunkTime ? firstChunkTime - startTime : null,
        averageChunkInterval: chunkCount > 1 && firstChunkTime && lastChunkTime
          ? (lastChunkTime - firstChunkTime) / (chunkCount - 1)
          : null
      },
      events: events.map(e => ({
        type: e.type,
        timestamp: e.timestamp,
        dataPreview: e.type === 'response'
          ? e.data.delta?.substring(0, 100)
          : e.type === 'status'
          ? e.data.message
          : null
      })),
      logs,
      warnings: [
        !hasCompleteEvent && 'No complete event received',
        hasErrorEvent && 'Error event received',
        chunkCount === 1 && 'Only received 1 chunk (possible timeout issue)'
      ].filter(Boolean)
    }
  } catch (error: any) {
    const duration = Date.now() - startTime

    log('error', 'Stream test failed', {
      error: error.message,
      duration
    })

    throw createError({
      statusCode: 500,
      statusMessage: 'Stream test failed',
      data: {
        testId,
        error: error.message,
        code: error.code,
        duration,
        logs,
        events
      }
    })
  }
})
