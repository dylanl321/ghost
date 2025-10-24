/**
 * POST /api/test-runner
 * Execute comprehensive API tests with various parameter combinations
 */

import { defineEventHandler, readBody, getHeader } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { logger } from '../../utils/logger'

registerEndpoint('/api/testing/runner', 'POST', {
  summary: 'Run comprehensive API tests',
  description: 'Execute tests on multiple endpoints with various parameter combinations',
  tags: ['Testing'],
  parameters: [],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            endpoints: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of endpoint paths to test (e.g., ["/api/accounts/list", "/api/accounts/attribute-names"])'
            },
            testScenarios: {
              type: 'object',
              additionalProperties: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    params: { type: 'object' },
                    expectedStatus: { type: 'number', default: 200 }
                  }
                }
              },
              description: 'Test scenarios keyed by endpoint path'
            },
            options: {
              type: 'object',
              properties: {
                maxConcurrency: { type: 'number', default: 3 },
                timeout: { type: 'number', default: 30000 },
                includeMetadata: { type: 'boolean', default: true },
                stopOnFailure: { type: 'boolean', default: false }
              }
            }
          }
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Test results',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  totalTests: { type: 'number' },
                  passedTests: { type: 'number' },
                  failedTests: { type: 'number' },
                  duration: { type: 'number' },
                  results: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        endpoint: { type: 'string' },
                        scenario: { type: 'string' },
                        status: { type: 'string', enum: ['passed', 'failed'] },
                        responseTime: { type: 'number' },
                        statusCode: { type: 'number' },
                        error: { type: 'string' },
                        data: { type: 'object' },
                        metadata: { type: 'object' }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  const body = await readBody(event)
  const { endpoints = [], testScenarios = {}, options = {} } = body

  const {
    maxConcurrency = 3,
    timeout = 30000,
    includeMetadata = true,
    stopOnFailure = false
  } = options

  const results = []
  let passedTests = 0
  let failedTests = 0
  const startTime = Date.now()

  try {
    // Test each endpoint with its scenarios
    for (const endpoint of endpoints) {
      const scenarios = testScenarios[endpoint] || []

      for (const scenario of scenarios) {
        const testStartTime = Date.now()

        try {
          // Construct the full URL
          const baseUrl = getServerURL(event)
          const params = new URLSearchParams()

          // Add scenario parameters
          Object.entries(scenario.params || {}).forEach(([key, value]) => {
            if (Array.isArray(value)) {
              value.forEach(v => params.append(key, String(v)))
            } else {
              params.append(key, String(value))
            }
          })

          const url = `${baseUrl}${endpoint}${params.toString() ? '?' + params.toString() : ''}`

          // Make the request with timeout
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), timeout)

          const response = await fetch(url, {
            signal: controller.signal,
            headers: {
              'Accept': 'application/json'
            }
          })

          clearTimeout(timeoutId)

          const responseTime = Date.now() - testStartTime
          const responseData = await response.json().catch(() => null)

          const expectedStatus = scenario.expectedStatus || 200
          const isSuccess = response.status === expectedStatus

          if (isSuccess) {
            passedTests++
          } else {
            failedTests++
          }

          results.push({
            endpoint,
            scenario: scenario.name,
            status: isSuccess ? 'passed' : 'failed',
            responseTime,
            statusCode: response.status,
            expectedStatus,
            url,
            data: includeMetadata ? responseData?.data : undefined,
            metadata: includeMetadata ? responseData?.metadata : undefined,
            error: isSuccess ? undefined : `Expected status ${expectedStatus}, got ${response.status}`
          })

          if (!isSuccess && stopOnFailure) {
            break
          }

        } catch (error) {
          const responseTime = Date.now() - testStartTime
          failedTests++

          results.push({
            endpoint,
            scenario: scenario.name,
            status: 'failed',
            responseTime,
            statusCode: 0,
            expectedStatus: scenario.expectedStatus || 200,
            url: '',
            error: error.message || 'Request failed'
          })

          if (stopOnFailure) {
            break
          }
        }
      }
    }

    const duration = Date.now() - startTime

    return sendSuccess(event, {
      totalTests: results.length,
      passedTests,
      failedTests,
      duration,
      results
    }, {
      endpointsTested: endpoints.length,
      scenariosExecuted: results.length,
      successRate: results.length > 0 ? Math.round((passedTests / results.length) * 100) : 0
    })

  } catch (error) {
    logger.error('Test runner error:', error)
    return errors.serverError(event, 'Test execution failed')
  }
}))

// Helper function to get server URL
function getServerURL(event: any): string {
  const host = getHeader(event, 'host') || 'localhost:3000'
  const protocol = host.includes('localhost') ? 'http' : 'https'
  return `${protocol}://${host}`
}
