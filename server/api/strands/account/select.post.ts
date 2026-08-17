/**
 * POST /api/strands/account/select
 * Select account after disambiguation
 */

import { defineEventHandler, readBody } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../../utils/api-response'
import { registerEndpoint } from '../../../plugins/swagger'
import { logger } from '../../../utils/logger'
import type { AccountSelectionResponse } from '../../../types/strands'
import {
  getAccountSelectionPayloads,
  normalizeAccountSelectionRequest,
  normalizeAccountSelectionResponse
} from '../../../utils/strands-disambiguation'

// Register OpenAPI documentation
registerEndpoint('/api/strands/account/select', 'POST', {
  summary: 'Select Account After Disambiguation',
  description: 'Submit user\'s account selection after receiving multiple account matches from a query. The selected account will be used for the session.',
  tags: ['Strands', 'AI'],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['sessionId', 'requestId'],
          properties: {
            sessionId: {
              type: 'string',
              description: 'Session identifier from disambiguation response'
            },
            requestId: {
              type: 'string',
              description: 'Selected account\'s request_id from disambiguation matches'
            }
          }
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Account selected successfully',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['success'] },
              message: { type: 'string' },
              account: {
                type: 'object',
                properties: {
                  request_id: { type: 'string' },
                  account_alias: { type: 'string' },
                  govcloud_account_id: { type: 'string' },
                  commercial_account_id: { type: 'string' },
                  display_name: { type: 'string' },
                  match_score: { type: 'number' },
                  match_reason: { type: 'string' }
                }
              }
            }
          }
        }
      }
    },
    400: { $ref: '#/components/schemas/Error' },
    401: { $ref: '#/components/schemas/Error' },
    500: { $ref: '#/components/schemas/Error' },
    503: { $ref: '#/components/schemas/Error' }
  }
})

/**
 * Account selection handler
 *
 * Note: The actual account selection is handled by the Strands agent server.
 * This endpoint proxies the request to the Strands /account/select endpoint.
 */
export default defineEventHandler(handleAsync(async (event) => {
  // Check if Strands chat is enabled
  const { getConfigValue } = await import('../../../utils/site-config')
  const strandsEnabled = await getConfigValue<boolean>('features.strandsChat.enabled', true)

  if (!strandsEnabled) {
    logger.warn('[Strands Account Select API] Feature is disabled')
    return errors.badRequest(event, 'Strands chat is currently disabled. Please contact an administrator.')
  }

  // Parse request body (camelCase from GHOST UI)
  const body = await readBody(event)
  const selection = normalizeAccountSelectionRequest(body)

  logger.info('[Strands Account Select API] Request received', {
    sessionId: selection?.sessionId,
    requestId: selection?.requestId
  })

  // Validate input
  if (!selection) {
    logger.error('[Strands Account Select API] Invalid selection request')
    return errors.badRequest(event, 'sessionId and requestId are required')
  }

  // Get Strands server configuration
  const { getStrandsConfig } = await import('../../../utils/strands-client')

  try {
    const config = await getStrandsConfig()
    const url = `${config.serverUrl}/account/select`

    logger.debug('[Strands Account Select API] Sending request to:', url)

    // Forward request to Strands server (camelCase format as per Strands team update)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), config.timeout)

    let response: Response | undefined
    let errorMessage = ''
    for (const payload of getAccountSelectionPayloads(selection)) {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      })

      if (response.ok || ![400, 422].includes(response.status)) break
      try {
        const errorData = await response.clone().json()
        errorMessage = errorData.error?.message || errorData.detail || errorData.message || ''
      } catch {
        // Try the alternate field naming contract.
      }
    }

    clearTimeout(timeoutId)

    if (!response?.ok) {
      errorMessage ||= response ? `HTTP ${response.status}: ${response.statusText}` : 'No response from Strands'
      try {
        const errorData = await response?.json()
        errorMessage = errorData?.error?.message || errorData?.detail || errorData?.message || errorMessage
      } catch {
        // Ignore JSON parse errors
      }

      logger.error('[Strands Account Select API] Server error:', errorMessage)

      // Service unavailable for 5xx errors
      if (response && response.status >= 500) {
        return errors.serverError(
          event,
          'Strands server is temporarily unavailable. Please try again later.',
          503
        )
      }

      // Client errors
      return errors.badRequest(event, errorMessage)
    }

    const data = normalizeAccountSelectionResponse(await response.json()) as AccountSelectionResponse

    logger.info('[Strands Account Select API] Account selected successfully', {
      sessionId: selection.sessionId,
      accountAlias: data.account?.account_alias
    })

    return sendSuccess(event, data)

  } catch (error: any) {
    logger.error('[Strands Account Select API] Error:', error)

    // Handle timeout
    if (error.name === 'AbortError') {
      return errors.serverError(
        event,
        'Request timed out. Please try again.',
        408
      )
    }

    // Generic error
    return errors.serverError(event, error.message || 'Error communicating with Strands server')
  }
}))
