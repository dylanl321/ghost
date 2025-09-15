/**
 * GET /api/ai/mcp-test
 * Test MCP Tools Integration
 */

import { defineEventHandler, getQuery } from 'h3'
import { getAuthContext } from '../../middleware/entra-auth'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { getPricingServices, getPricing, executePricingMCPTool } from '../../utils/aws-pricing-mcp'

// Register OpenAPI documentation
registerEndpoint('/api/ai/mcp-test', 'GET', {
  summary: 'Test MCP tools integration',
  description: 'Test endpoint to verify AWS Pricing MCP tools are working correctly',
  tags: ['AI', 'MCP', 'Testing'],
  parameters: [
    {
      name: 'environment',
      in: 'query',
      required: false,
      schema: {
        type: 'string',
        enum: ['commercial', 'govcloud'],
        default: 'commercial'
      },
      description: 'AWS environment to test'
    },
    {
      name: 'testType',
      in: 'query',
      required: false,
      schema: {
        type: 'string',
        enum: ['services', 'pricing', 'all'],
        default: 'all'
      },
      description: 'Type of test to run'
    }
  ],
  responses: {
    200: {
      description: 'MCP test results',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  environment: { type: 'string' },
                  testResults: { type: 'object' },
                  summary: { type: 'string' }
                }
              }
            }
          }
        }
      }
    },
    401: { $ref: '#/components/schemas/Error' },
    500: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  // Skip authentication for testing purposes
  console.log('[MCP Test] Running MCP tools test...')

  // Get query parameters
  const query = getQuery(event)
  const environment = (query.environment as 'commercial' | 'govcloud') || 'commercial'
  const testType = (query.testType as 'services' | 'pricing' | 'all') || 'all'

  const testResults: any = {
    environment,
    timestamp: new Date().toISOString(),
    tests: {}
  }

  let summary = 'MCP Tools Test Results:\n'

  try {
    // Test 1: Get Services
    if (testType === 'services' || testType === 'all') {
      try {
        console.log('[MCP Test] Testing get_services...')
        const services = await executePricingMCPTool('get_services', {}, environment)
        testResults.tests.get_services = {
          success: true,
          result: services,
          count: Array.isArray(services) ? services.length : 'unknown'
        }
        summary += `✅ get_services: Success (${Array.isArray(services) ? services.length : 'unknown'} services)\n`
      } catch (error: any) {
        testResults.tests.get_services = {
          success: false,
          error: error.message
        }
        summary += `❌ get_services: Failed - ${error.message}\n`
      }
    }

    // Test 2: Get Pricing for EC2
    if (testType === 'pricing' || testType === 'all') {
      try {
        console.log('[MCP Test] Testing get_pricing for EC2...')
        const pricing = await executePricingMCPTool('get_pricing', {
          serviceCode: 'AmazonEC2',
          maxResults: 3
        }, environment)
        testResults.tests.get_pricing_ec2 = {
          success: true,
          result: pricing,
          count: pricing?.priceList?.length || 0
        }
        summary += `✅ get_pricing (EC2): Success (${pricing?.priceList?.length || 0} pricing entries)\n`
      } catch (error: any) {
        testResults.tests.get_pricing_ec2 = {
          success: false,
          error: error.message
        }
        summary += `❌ get_pricing (EC2): Failed - ${error.message}\n`
      }
    }

    // Test 3: Get Dimensions for EC2
    if (testType === 'all') {
      try {
        console.log('[MCP Test] Testing get_dimensions for EC2...')
        const dimensions = await executePricingMCPTool('get_dimensions', {
          serviceCode: 'AmazonEC2'
        }, environment)
        testResults.tests.get_dimensions_ec2 = {
          success: true,
          result: dimensions,
          count: Array.isArray(dimensions) ? dimensions.length : 'unknown'
        }
        summary += `✅ get_dimensions (EC2): Success (${Array.isArray(dimensions) ? dimensions.length : 'unknown'} dimensions)\n`
      } catch (error: any) {
        testResults.tests.get_dimensions_ec2 = {
          success: false,
          error: error.message
        }
        summary += `❌ get_dimensions (EC2): Failed - ${error.message}\n`
      }
    }

    // Calculate overall success
    const testKeys = Object.keys(testResults.tests)
    const successfulTests = testKeys.filter(key => testResults.tests[key].success).length
    const totalTests = testKeys.length
    
    testResults.summary = {
      totalTests,
      successfulTests,
      failedTests: totalTests - successfulTests,
      successRate: totalTests > 0 ? (successfulTests / totalTests * 100).toFixed(1) + '%' : '0%'
    }

    summary += `\nOverall: ${successfulTests}/${totalTests} tests passed (${testResults.summary.successRate} success rate)`

    return sendSuccess(event, {
      environment,
      testResults,
      summary
    })

  } catch (error: any) {
    console.error('[MCP Test] Unexpected error:', error)
    
    return sendSuccess(event, {
      environment,
      testResults,
      summary: `❌ Test failed with unexpected error: ${error.message}`,
      error: {
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    })
  }
}))
