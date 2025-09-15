/**
 * GET /api/ai/bedrock
 * Get Bedrock Model Information and Service Status
 * 
 * Returns available models, their configurations, and system status
 */

import { defineEventHandler, getQuery } from 'h3'
import { sendSuccess, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { getAvailableModels, testBedrockConnection } from '../../utils/bedrock-client'

// Register OpenAPI documentation
registerEndpoint('/api/ai/bedrock', 'GET', {
  summary: 'Get Bedrock Model Information',
  description: 'Returns available models and their configurations, plus optional connectivity test',
  tags: ['AI', 'Analysis'],
  parameters: [
    {
      name: 'test',
      in: 'query',
      required: false,
      schema: { 
        type: 'boolean',
        default: false
      },
      description: 'Test connectivity to Bedrock service'
    },
    {
      name: 'model',
      in: 'query',
      required: false,
      schema: { 
        type: 'string',
        enum: ['nova-pro', 'claude-sonnet'],
        default: 'claude-sonnet'
      },
      description: 'Model to test (only used when test=true)'
    }
  ],
  responses: {
    200: {
      description: 'Available models information and service status',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  models: {
                    type: 'object',
                    description: 'Available AI models and their configurations',
                    properties: {
                      'nova-pro': {
                        type: 'object',
                        properties: {
                          modelId: { type: 'string', example: 'amazon.nova-pro-v1:0' },
                          maxTokens: { type: 'integer', example: 4096 },
                          temperature: { type: 'number', example: 0.7 },
                          topP: { type: 'number', example: 0.9 }
                        }
                      },
                      'claude-sonnet': {
                        type: 'object',
                        properties: {
                          modelId: { type: 'string', example: 'anthropic.claude-3-5-sonnet-20241022-v2:0' },
                          maxTokens: { type: 'integer', example: 4096 },
                          temperature: { type: 'number', example: 0.3 },
                          topP: { type: 'number', example: 0.95 }
                        }
                      }
                    }
                  },
                  environment: { 
                    type: 'string', 
                    example: 'GovCloud',
                    description: 'AWS environment where Bedrock is configured' 
                  },
                  region: { 
                    type: 'string', 
                    example: 'us-gov-west-1',
                    description: 'AWS region for Bedrock operations' 
                  },
                  connectivity: {
                    type: 'object',
                    nullable: true,
                    description: 'Connectivity test results (only included when test=true)',
                    properties: {
                      tested: { type: 'boolean', description: 'Whether connectivity test was performed' },
                      model: { type: 'string', description: 'Model used for testing' },
                      success: { type: 'boolean', description: 'Whether test succeeded' },
                      responseTime: { type: 'integer', description: 'Test response time in milliseconds' },
                      tokenUsage: {
                        type: 'object',
                        properties: {
                          input: { type: 'integer' },
                          output: { type: 'integer' }
                        }
                      },
                      testResponse: { type: 'string', description: 'Truncated test response content' },
                      error: { 
                        type: 'object',
                        nullable: true,
                        description: 'Error details if test failed'
                      },
                      testedAt: { type: 'string', format: 'date-time' }
                    }
                  },
                  note: { 
                    type: 'string',
                    description: 'Information about the AI analysis capabilities' 
                  },
                  usage: {
                    type: 'object',
                    description: 'API usage information and constraints',
                    properties: {
                      endpoint: { type: 'string', example: 'POST /api/ai/bedrock' },
                      requiredFields: { 
                        type: 'array', 
                        items: { type: 'string' },
                        example: ['prompt']
                      },
                      optionalFields: {
                        type: 'array',
                        items: { type: 'string' },
                        example: ['model', 'systemPrompt', 'maxTokens', 'temperature', 'context']
                      },
                      models: {
                        type: 'array',
                        items: { type: 'string' },
                        example: ['nova-pro', 'claude-sonnet']
                      },
                      maxPromptLength: { type: 'integer', example: 20000 },
                      maxSystemPromptLength: { type: 'integer', example: 5000 }
                    }
                  },
                  examples: {
                    type: 'object',
                    description: 'Usage examples for different scenarios',
                    properties: {
                      basicUsage: {
                        type: 'object',
                        properties: {
                          url: { type: 'string' },
                          body: { type: 'object' }
                        }
                      },
                      costAnalysis: {
                        type: 'object',
                        properties: {
                          url: { type: 'string' },
                          body: { type: 'object' }
                        }
                      },
                      testConnection: {
                        type: 'object',
                        properties: {
                          url: { type: 'string' }
                        }
                      }
                    }
                  }
                },
                required: ['models', 'environment', 'region', 'note', 'usage', 'examples']
              },
              metadata: {
                type: 'object',
                properties: {
                  timestamp: { type: 'string', format: 'date-time' }
                }
              }
            },
            required: ['success', 'data']
          }
        }
      }
    },
    500: {
      description: 'Internal server error during model information retrieval',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: false },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                  details: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  },
  security: [{ bearerAuth: [] }]
})

export default defineEventHandler(handleAsync(async (event) => {
  const query = getQuery(event)
  const testConnection = query.test === 'true'
  const testModel = (query.model as string) || 'claude-sonnet'
  
  // Get available models
  const models = getAvailableModels()
  
  let connectivity = null
  if (testConnection) {
    console.log('[Bedrock Info] Testing connectivity...')
    
    // Validate test model
    if (!['nova-pro', 'claude-sonnet'].includes(testModel)) {
      return sendSuccess(event, {
        models,
        environment: 'GovCloud',
        region: 'us-gov-west-1',
        connectivity: {
          tested: false,
          error: 'Invalid test model. Must be "nova-pro" or "claude-sonnet"'
        },
        note: 'This endpoint provides AI analysis capabilities using AWS Bedrock models in GovCloud.',
        usage: {
          endpoint: 'POST /api/ai/bedrock',
          requiredFields: ['prompt'],
          optionalFields: ['model', 'systemPrompt', 'maxTokens', 'temperature', 'context'],
          models: Object.keys(models),
          maxPromptLength: 20000,
          maxSystemPromptLength: 5000
        }
      })
    }
    
    try {
      const testResult = await testBedrockConnection(testModel as any)
      
      connectivity = {
        tested: true,
        model: testModel,
        success: testResult.success,
        responseTime: testResult.processingTime,
        tokenUsage: {
          input: testResult.inputTokens,
          output: testResult.outputTokens
        },
        testResponse: testResult.content?.substring(0, 100) + (testResult.content && testResult.content.length > 100 ? '...' : ''),
        error: testResult.success ? null : testResult.error,
        testedAt: new Date().toISOString()
      }
      
      console.log(`[Bedrock Info] Connectivity test completed: ${testResult.success ? 'SUCCESS' : 'FAILED'}`)
      
    } catch (error: any) {
      console.error('[Bedrock Info] Connectivity test failed:', error)
      connectivity = {
        tested: true,
        model: testModel,
        success: false,
        error: error.message || 'Connectivity test failed',
        details: 'Failed to establish connection with Bedrock service',
        resolution: 'Check your AWS credentials and network connectivity. Ensure Bedrock is available in us-gov-west-1.',
        testedAt: new Date().toISOString()
      }
    }
  }
  
  return sendSuccess(event, {
    models,
    environment: 'GovCloud',
    region: 'us-gov-west-1',
    connectivity,
    note: 'This endpoint provides AI analysis capabilities using AWS Bedrock models in GovCloud.',
    usage: {
      endpoint: 'POST /api/ai/bedrock',
      requiredFields: ['prompt'],
      optionalFields: ['model', 'systemPrompt', 'maxTokens', 'temperature', 'context'],
      models: Object.keys(models),
      maxPromptLength: 20000,
      maxSystemPromptLength: 5000
    },
    examples: {
      basicUsageClaude: {
        url: 'POST /api/ai/bedrock',
        body: {
          prompt: 'Analyze this cost data and provide optimization recommendations',
          model: 'claude-sonnet'
        }
      },
      basicUsageNova: {
        url: 'POST /api/ai/bedrock',
        body: {
          prompt: 'Analyze this cost data and provide optimization recommendations',
          model: 'nova-pro'
        }
      },
      costAnalysisNova: {
        url: 'POST /api/ai/bedrock', 
        body: {
          prompt: 'Review the attached AWS cost breakdown and identify cost-saving opportunities',
          model: 'nova-pro',
          systemPrompt: 'You are an AWS cost optimization expert. Focus on actionable recommendations.',
          temperature: 0.7,
          context: { timeframe: 'monthly', totalCost: 50000 }
        }
      },
      costAnalysisClaude: {
        url: 'POST /api/ai/bedrock', 
        body: {
          prompt: 'Review the attached AWS cost breakdown and identify cost-saving opportunities',
          model: 'claude-sonnet',
          systemPrompt: 'You are an AWS cost optimization expert. Focus on actionable recommendations.',
          temperature: 0.3,
          context: { timeframe: 'monthly', totalCost: 50000 }
        }
      },
      testConnectionClaude: {
        url: 'GET /api/ai/bedrock?test=true&model=claude-sonnet'
      },
      testConnectionNova: {
        url: 'GET /api/ai/bedrock?test=true&model=nova-pro'
      },
      getModelInfo: {
        url: 'GET /api/ai/bedrock'
      }
    }
  })
}))