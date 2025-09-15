/**
 * POST /api/ai/mcp-tools
 * MCP Tools Execution Endpoint - Execute AWS Pricing MCP tools
 */

import { defineEventHandler, readBody } from 'h3'
import { getAuthContext } from '../../middleware/entra-auth'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { executePricingMCPTool, awsPricingMCPTools } from '../../utils/aws-pricing-mcp'

export interface MCPToolRequest {
  toolName: string
  parameters: any
  environment?: 'commercial' | 'govcloud'
}

export interface MCPToolResponse {
  success: boolean
  toolName: string
  result?: any
  error?: {
    code: string
    message: string
    details?: string
  }
}

// Register OpenAPI documentation
registerEndpoint('/api/ai/mcp-tools', 'POST', {
  summary: 'Execute MCP tools for AWS pricing',
  description: 'Execute Model Context Protocol tools to get AWS pricing information',
  tags: ['AI', 'MCP'],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['toolName', 'parameters'],
          properties: {
            toolName: {
              type: 'string',
              enum: ['get_services', 'get_dimensions', 'get_attribute_values', 'get_pricing'],
              description: 'Name of the MCP tool to execute'
            },
            parameters: {
              type: 'object',
              description: 'Parameters for the MCP tool'
            },
            environment: {
              type: 'string',
              enum: ['commercial', 'govcloud'],
              description: 'AWS environment to query',
              default: 'commercial'
            }
          }
        }
      }
    }
  },
  responses: {
    200: {
      description: 'MCP tool execution result',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  toolName: { type: 'string' },
                  result: { type: 'object' }
                }
              }
            }
          }
        }
      }
    },
    400: { $ref: '#/components/schemas/Error' },
    401: { $ref: '#/components/schemas/Error' },
    500: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  // Get authentication context
  const authContext = getAuthContext(event)
  
  // Check if user is authenticated
  if (!authContext || !authContext.isAuthenticated) {
    return errors.unauthorized(event, 'Authentication required')
  }

  // Parse request body
  const body = await readBody(event) as MCPToolRequest
  const { toolName, parameters, environment = 'commercial' } = body

  // Validate input
  if (!toolName || typeof toolName !== 'string') {
    return errors.badRequest(event, 'Tool name is required and must be a string')
  }

  if (!parameters || typeof parameters !== 'object') {
    return errors.badRequest(event, 'Parameters are required and must be an object')
  }

  // Validate tool name
  const validTools = Object.keys(awsPricingMCPTools)
  if (!validTools.includes(toolName)) {
    return errors.badRequest(
      event, 
      `Invalid tool name. Valid tools are: ${validTools.join(', ')}`
    )
  }

  try {
    // Execute the MCP tool
    const result = await executePricingMCPTool(toolName, parameters, environment)
    
    const response: MCPToolResponse = {
      success: true,
      toolName,
      result
    }

    return sendSuccess(event, response)

  } catch (error: any) {
    console.error(`[MCP Tools] Error executing tool ${toolName}:`, error)
    
    const response: MCPToolResponse = {
      success: false,
      toolName,
      error: {
        code: 'TOOL_EXECUTION_ERROR',
        message: error.message || 'Failed to execute MCP tool',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    }

    return sendSuccess(event, response)
  }
}))
