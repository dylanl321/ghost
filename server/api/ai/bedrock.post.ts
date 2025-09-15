/**
 * POST /api/ai/bedrock
 * Simple Bedrock AI Analysis Endpoint
 * 
 * Provides a straightforward interface for sending prompts to AWS Bedrock models
 * and receiving AI-generated responses. Supports both Nova Pro and Claude 3.5 Sonnet.
 */

import { defineEventHandler, readBody, setResponseStatus } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { invokeBedrock, testBedrockConnection, type BedrockModel } from '../../utils/bedrock-client'

// Register OpenAPI documentation
registerEndpoint('/api/ai/bedrock', 'POST', {
  summary: 'AI Analysis via AWS Bedrock',
  description: 'Send prompts to AWS Bedrock models (Nova Pro or Claude 3.5 Sonnet) for AI analysis',
  tags: ['AI', 'Analysis'],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['prompt'],
          properties: {
            prompt: {
              type: 'string',
              description: 'The prompt/question to send to the AI model',
              minLength: 1,
              maxLength: 20000
            },
            model: {
              type: 'string',
              enum: ['nova-pro', 'claude-sonnet'],
              description: 'AI model to use (default: claude-sonnet)',
              default: 'claude-sonnet'
            },
            systemPrompt: {
              type: 'string',
              description: 'Optional system prompt to guide the AI behavior',
              maxLength: 5000
            },
            maxTokens: {
              type: 'integer',
              description: 'Maximum tokens to generate (default: model-specific)',
              minimum: 1,
              maximum: 8192
            },
            temperature: {
              type: 'number',
              description: 'Temperature for randomness (0.0-1.0, default: model-specific)',
              minimum: 0,
              maximum: 1
            },
            context: {
              oneOf: [
                {
                  type: 'string',
                  description: 'Context as a text string',
                  example: 'This analysis is for Q4 budget review with focus on cost optimization'
                },
                {
                  type: 'object',
                  description: 'Context as structured data',
                  additionalProperties: true,
                  example: { timeframe: 'monthly', totalCost: 50000, accountCount: 25 }
                }
              ],
              description: 'Optional context data to inform the analysis - can be a string or structured object'
            }
          },
          examples: {
            basicPromptClaude: {
              summary: 'Simple text analysis - Claude Sonnet',
              value: {
                prompt: 'Analyze this cost data and provide optimization recommendations',
                model: 'claude-sonnet'
              }
            },
            basicPromptNova: {
              summary: 'Simple text analysis - Nova Pro',
              value: {
                prompt: 'Analyze this cost data and provide optimization recommendations',
                model: 'nova-pro'
              }
            },
            detailedAnalysisNova: {
              summary: 'Comprehensive cost analysis - Nova Pro',
              value: {
                prompt: 'Review the attached AWS cost breakdown and identify cost-saving opportunities. Focus on EC2 instances and storage optimization.',
                model: 'nova-pro',
                systemPrompt: 'You are an AWS cost optimization expert. Focus on actionable recommendations with quantified savings potential.',
                maxTokens: 2000,
                temperature: 0.7,
                context: {
                  timeframe: 'monthly',
                  totalCost: 75000,
                  primaryServices: ['EC2', 'S3', 'RDS'],
                  accountCount: 15
                }
              }
            },
            detailedAnalysisClaude: {
              summary: 'Comprehensive cost analysis - Claude Sonnet',
              value: {
                prompt: 'Review the attached AWS cost breakdown and identify cost-saving opportunities. Focus on EC2 instances and storage optimization.',
                model: 'claude-sonnet',
                systemPrompt: 'You are an AWS cost optimization expert. Focus on actionable recommendations with quantified savings potential.',
                maxTokens: 2000,
                temperature: 0.3,
                context: {
                  timeframe: 'monthly',
                  totalCost: 75000,
                  primaryServices: ['EC2', 'S3', 'RDS'],
                  accountCount: 15
                }
              }
            },
            structuredOutputClaude: {
              summary: 'JSON structured output - Claude Sonnet',
              value: {
                prompt: 'Analyze this cost data and return a JSON object with executive_summary, top_concerns, and recommendations fields. Respond only with valid JSON.',
                model: 'claude-sonnet',
                systemPrompt: 'You are a cloud financial analyst. Return only valid JSON responses with no additional text.',
                temperature: 0.1,
                maxTokens: 1500
              }
            },
            structuredOutputNova: {
              summary: 'JSON structured output - Nova Pro',
              value: {
                prompt: 'Analyze this cost data and return a JSON object with executive_summary, top_concerns, and recommendations fields. Respond only with valid JSON.',
                model: 'nova-pro',
                systemPrompt: 'You are a cloud financial analyst. Return only valid JSON responses with no additional text.',
                temperature: 0.2,
                maxTokens: 1500
              }
            },
            testConnectionClaude: {
              summary: 'Test connectivity - Claude Sonnet',
              value: {
                prompt: 'test bedrock connection',
                model: 'claude-sonnet'
              }
            },
            testConnectionNova: {
              summary: 'Test connectivity - Nova Pro',
              value: {
                prompt: 'test bedrock connection',
                model: 'nova-pro'
              }
            },
            budgetOptimization: {
              summary: 'Budget optimization analysis - Claude Sonnet',
              value: {
                prompt: 'Analyze budget performance and provide optimization recommendations. Current spend is $89,500 against a $95,000 budget with 12 days remaining this month.',
                model: 'claude-sonnet',
                systemPrompt: 'You are a financial analyst specializing in cloud budget optimization. Provide actionable recommendations.',
                maxTokens: 2500,
                temperature: 0.2,
                context: {
                  budgetPeriod: 'monthly',
                  currentSpend: 89500,
                  totalBudget: 95000,
                  daysRemaining: 12,
                  utilizationRate: 94.2
                }
              }
            },
            conversationalAnalysis: {
              summary: 'Conversational cost analysis - Nova Pro',
              value: {
                prompt: 'Our AWS costs have increased 25% this month. Can you help me understand what might be causing this and suggest some quick wins to reduce costs?',
                model: 'nova-pro',
                systemPrompt: 'You are a helpful AWS cost advisor. Provide clear, actionable advice in a conversational tone.',
                maxTokens: 1800,
                temperature: 0.6,
                context: {
                  costIncrease: 25,
                  timeframe: 'current_month',
                  urgency: 'high'
                }
              }
            },
            stringContext: {
              summary: 'Analysis with string context - Claude Sonnet',
              value: {
                prompt: 'Analyze our cloud spending and recommend optimizations.',
                model: 'claude-sonnet',
                systemPrompt: 'You are a cloud financial analyst. Focus on practical recommendations.',
                temperature: 0.2,
                context: 'This analysis is for the Q4 budget review. We are looking to reduce costs by 15% before year-end while maintaining service quality. Focus on quick wins and low-risk optimizations.'
              }
            },
            mixedContextUsage: {
              summary: 'Object context for detailed analysis - Nova Pro',
              value: {
                prompt: 'Provide a comprehensive cost optimization report.',
                model: 'nova-pro',
                temperature: 0.4,
                context: {
                  organization: 'TechCorp',
                  currentQuarter: 'Q4 2024',
                  goals: ['reduce costs by 15%', 'improve efficiency', 'maintain SLA'],
                  constraints: ['no service downtime', 'preserve security'],
                  timeline: '45 days',
                  stakeholders: ['CFO', 'CTO', 'DevOps Team']
                }
              }
            }
          }
        }
      }
    }
  },
  responses: {
    200: {
      description: 'AI analysis response',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  content: { 
                    type: 'string',
                    description: 'AI-generated response content' 
                  },
                  model: { 
                    type: 'string',
                    description: 'Actual model used for generation (may differ from requested due to fallbacks)',
                    examples: ['amazon.nova-pro-v1:0', 'anthropic.claude-3-5-sonnet-20240620-v1:0']
                  },
                  inputTokens: { 
                    type: 'integer',
                    description: 'Number of input tokens processed',
                    minimum: 0
                  },
                  outputTokens: { 
                    type: 'integer',
                    description: 'Number of output tokens generated',
                    minimum: 0
                  },
                  processingTime: { 
                    type: 'integer',
                    description: 'Processing time in milliseconds',
                    minimum: 0
                  },
                  testMode: {
                    type: 'boolean',
                    description: 'Whether this was a test connection request'
                  }
                },
                required: ['content', 'model', 'processingTime']
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
    400: {
      description: 'Bad Request - Invalid parameters',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: false },
              error: {
                type: 'object',
                properties: {
                  code: { 
                    type: 'string',
                    enum: ['INVALID_MODEL', 'VALIDATION_ERROR'],
                    description: 'Error code for programmatic handling'
                  },
                  message: { type: 'string', description: 'Human-readable error message' },
                  details: { type: 'string', description: 'Additional error details' },
                  resolution: { type: 'string', description: 'Suggested resolution steps' },
                  retryable: { type: 'boolean', description: 'Whether the request can be retried' },
                  model: { type: 'string', description: 'Model that was attempted' },
                  timestamp: { type: 'string', format: 'date-time' }
                },
                required: ['code', 'message', 'retryable']
              }
            },
            required: ['success', 'error']
          }
        }
      }
    },
    401: {
      description: 'Unauthorized - AWS credentials issue',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: false },
              error: {
                type: 'object',
                properties: {
                  code: { 
                    type: 'string',
                    enum: ['ACCESS_DENIED', 'CREDENTIALS_ERROR'],
                    description: 'Error code indicating authentication problem'
                  },
                  message: { type: 'string' },
                  resolution: { type: 'string' },
                  retryable: { type: 'boolean', example: false }
                }
              }
            }
          }
        }
      }
    },
    404: {
      description: 'Not Found - Model not available',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: false },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string', example: 'MODEL_NOT_FOUND' },
                  message: { type: 'string' },
                  details: { type: 'string' },
                  resolution: { type: 'string' }
                }
              }
            }
          }
        }
      }
    },
    429: {
      description: 'Too Many Requests - Rate limited',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: false },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string', example: 'RATE_LIMITED' },
                  message: { type: 'string' },
                  retryable: { type: 'boolean', example: true },
                  resolution: { type: 'string' }
                }
              }
            }
          }
        }
      }
    },
    500: {
      description: 'Internal Server Error - System or AWS service issue',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: false },
              error: {
                type: 'object',
                properties: {
                  code: { 
                    type: 'string',
                    enum: ['UNKNOWN_ERROR', 'SERVICE_UNAVAILABLE', 'NETWORK_ERROR', 'CONNECTION_ERROR'],
                    description: 'Error code for system issues'
                  },
                  message: { type: 'string' },
                  details: { type: 'string' },
                  resolution: { type: 'string' },
                  retryable: { type: 'boolean' },
                  timestamp: { type: 'string', format: 'date-time' }
                }
              }
            }
          }
        }
      }
    },
    503: {
      description: 'Service Unavailable - AWS Bedrock temporarily unavailable',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: false },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string', example: 'SERVICE_UNAVAILABLE' },
                  message: { type: 'string' },
                  retryable: { type: 'boolean', example: true }
                }
              }
            }
          }
        }
      }
    },
    504: {
      description: 'Gateway Timeout - Request timed out',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: false },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string', example: 'MODEL_TIMEOUT' },
                  message: { type: 'string' },
                  retryable: { type: 'boolean', example: true },
                  resolution: { type: 'string' }
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

interface BedrockRequest {
  prompt: string
  model?: BedrockModel
  systemPrompt?: string
  maxTokens?: number
  temperature?: number
  context?: string | Record<string, any>
}

/**
 * Map Bedrock error codes to appropriate HTTP status codes
 */
function getHttpStatusFromBedrockError(errorCode: string): number {
  switch (errorCode) {
    case 'INVALID_MODEL':
    case 'VALIDATION_ERROR':
      return 400 // Bad Request
    case 'ACCESS_DENIED':
    case 'CREDENTIALS_ERROR':
      return 401 // Unauthorized
    case 'MODEL_NOT_FOUND':
      return 404 // Not Found
    case 'RATE_LIMITED':
      return 429 // Too Many Requests
    case 'SERVICE_UNAVAILABLE':
    case 'NETWORK_ERROR':
    case 'CONNECTION_ERROR':
      return 503 // Service Unavailable
    case 'MODEL_TIMEOUT':
      return 504 // Gateway Timeout
    default:
      return 500 // Internal Server Error
  }
}

export default defineEventHandler(handleAsync(async (event) => {
  const body = await readBody(event) as BedrockRequest
  
  // ================================
  // INPUT VALIDATION
  // ================================
  
  if (!body || typeof body !== 'object') {
    return errors.badRequest(event, 'Request body must be a valid JSON object')
  }
  
  if (!body.prompt) {
    return errors.badRequest(event, 'prompt is required')
  }
  
  if (typeof body.prompt !== 'string') {
    return errors.badRequest(event, 'prompt must be a string')
  }
  
  if (body.prompt.trim().length === 0) {
    return errors.badRequest(event, 'prompt cannot be empty')
  }
  
  if (body.prompt.length > 20000) {
    return errors.badRequest(event, 'prompt cannot exceed 20,000 characters')
  }
  
  // Validate model if specified
  if (body.model && !['nova-pro', 'claude-sonnet'].includes(body.model)) {
    return errors.badRequest(event, 'model must be either "nova-pro" or "claude-sonnet"')
  }
  
  // Validate system prompt length
  if (body.systemPrompt && body.systemPrompt.length > 5000) {
    return errors.badRequest(event, 'systemPrompt cannot exceed 5,000 characters')
  }
  
  // Validate maxTokens
  if (body.maxTokens !== undefined) {
    if (!Number.isInteger(body.maxTokens) || body.maxTokens < 1 || body.maxTokens > 8192) {
      return errors.badRequest(event, 'maxTokens must be an integer between 1 and 8192')
    }
  }
  
  // Validate temperature
  if (body.temperature !== undefined) {
    if (typeof body.temperature !== 'number' || body.temperature < 0 || body.temperature > 1) {
      return errors.badRequest(event, 'temperature must be a number between 0.0 and 1.0')
    }
  }
  
  // Validate context
  if (body.context !== undefined) {
    if (typeof body.context !== 'string' && (typeof body.context !== 'object' || body.context === null || Array.isArray(body.context))) {
      return errors.badRequest(event, 'context must be a string or a valid object')
    }
  }
  
  // Special handling for test requests
  if (body.prompt.toLowerCase().includes('test connection') || 
      body.prompt.toLowerCase().includes('test bedrock')) {
    console.log('[Bedrock API] Testing connection as requested')
    
    const testResult = await testBedrockConnection(body.model || 'claude-sonnet')
    
    return sendSuccess(event, {
      content: testResult.content || testResult.error || 'Test completed',
      model: testResult.model,
      inputTokens: testResult.inputTokens,
      outputTokens: testResult.outputTokens,
      processingTime: testResult.processingTime,
      testMode: true,
      success: testResult.success
    })
  }
  
  // ================================
  // BEDROCK INVOCATION
  // ================================
  
  console.log(`[Bedrock API] Processing prompt with model: ${body.model || 'claude-sonnet'}`)
  console.log(`[Bedrock API] Prompt length: ${body.prompt.length} characters`)
  
  try {
    const result = await invokeBedrock({
      prompt: body.prompt.trim(),
      model: body.model || 'claude-sonnet',
      systemPrompt: body.systemPrompt,
      maxTokens: body.maxTokens,
      temperature: body.temperature,
      context: body.context
    })
    
    if (!result.success) {
      console.error('[Bedrock API] Error:', result.error)
      
      const error = result.error
      if (error) {
        // Return structured error response with user guidance
        const httpStatus = getHttpStatusFromBedrockError(error.code)
        setResponseStatus(event, httpStatus)
        
        return {
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
            resolution: error.resolution,
            retryable: error.retryable,
            model: result.model,
            timestamp: new Date().toISOString()
          }
        }
      }
      
      return errors.serverError(event, 'Failed to generate AI response')
    }
    
    console.log(`[Bedrock API] Success: Generated ${result.content?.length || 0} characters`)
    console.log(`[Bedrock API] Tokens: ${result.inputTokens} → ${result.outputTokens}`)
    console.log(`[Bedrock API] Processing time: ${result.processingTime}ms`)
    
    return sendSuccess(event, {
      content: result.content,
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      processingTime: result.processingTime
    })
    
  } catch (error: any) {
    console.error('[Bedrock API] Unexpected error:', error)
    
    // Return structured error response for unexpected errors
    setResponseStatus(event, 500)
    
    return {
      success: false,
      error: {
        code: 'UNEXPECTED_ERROR',
        message: 'An unexpected error occurred while processing your request',
        details: error.message || 'Unknown error',
        resolution: 'This appears to be a system error. Please try again, and if the problem persists, contact support.',
        retryable: true,
        timestamp: new Date().toISOString()
      }
    }
  }
}))