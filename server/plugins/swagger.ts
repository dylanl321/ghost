/**
 * Swagger/OpenAPI Plugin for Nitro
 * Provides automatic API documentation
 */

import { defineNitroPlugin } from 'nitropack/runtime/plugin'

// OpenAPI specification base
const openApiSpec = {
  openapi: '3.0.0',
  info: {
    title: 'AWS Dashboard API',
    description: 'API for managing AWS resources across Commercial and GovCloud environments',
    version: '1.0.0'
  },
  servers: [
    {
      url: '/',
      description: 'API Server'
    }
  ],
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key'
      }
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
              details: { type: 'object' }
            }
          }
        }
      },
      PaginationInfo: {
        type: 'object',
        properties: {
          page: { type: 'integer' },
          limit: { type: 'integer' },
          total: { type: 'integer' },
          hasMore: { type: 'boolean' }
        }
      },
      AWSEnvironment: {
        type: 'string',
        enum: ['commercial', 'govcloud'],
        default: 'commercial'
      },
      PolicyInfo: {
        type: 'object',
        description: 'AWS Organizations Service Control Policy information',
        properties: {
          id: { 
            type: 'string', 
            description: 'Policy ID (e.g., p-FullAWSAccess)' 
          },
          name: { 
            type: 'string', 
            description: 'Policy name' 
          },
          description: { 
            type: 'string', 
            description: 'Policy description' 
          },
          type: { 
            type: 'string', 
            description: 'Policy type (e.g., SERVICE_CONTROL_POLICY)' 
          },
          source: { 
            type: 'string', 
            enum: ['direct', 'inherited'],
            description: 'Whether policy is attached directly to account or inherited from parent OU' 
          },
          attachedAt: { 
            type: 'string', 
            description: 'Name of OU or account where policy is attached' 
          }
        },
        required: ['id', 'name', 'type', 'source']
      }
    },
    parameters: {
      Environment: {
        name: 'environment',
        in: 'query',
        description: 'AWS environment to use',
        required: false,
        schema: {
          $ref: '#/components/schemas/AWSEnvironment'
        }
      },
      Limit: {
        name: 'limit',
        in: 'query',
        description: 'Number of items to return',
        required: false,
        schema: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          default: 20
        }
      },
      NextToken: {
        name: 'nextToken',
        in: 'query',
        description: 'Token for pagination',
        required: false,
        schema: {
          type: 'string'
        }
      }
    }
  },
  paths: {} as Record<string, any>
}

// Registry for API endpoints
export const apiRegistry = new Map<string, any>()

/**
 * Register an API endpoint with OpenAPI documentation
 */
export function registerEndpoint(
  path: string,
  method: string,
  spec: {
    summary: string
    description?: string
    tags?: string[]
    parameters?: any[]
    requestBody?: any
    responses: Record<string, any>
    security?: any[]
  }
) {
  const normalizedPath = path.replace(/\[([^\]]+)\]/g, '{$1}') // Convert [id] to {id}
  
  if (!openApiSpec.paths[normalizedPath]) {
    openApiSpec.paths[normalizedPath] = {}
  }
  
  openApiSpec.paths[normalizedPath][method.toLowerCase()] = spec
  apiRegistry.set(`${method.toUpperCase()} ${path}`, spec)
}

/**
 * Get the current OpenAPI specification
 */
export function getOpenApiSpec() {
  return openApiSpec
}

/**
 * Note: Swagger UI is now served via dedicated API endpoints:
 * - /api/docs - Swagger UI HTML  
 * - /api/swagger.json - OpenAPI specification
 * 
 * This plugin is kept for the OpenAPI spec management functions
 */
export default defineNitroPlugin(() => {
  // Plugin initialization (no routes needed since we use API endpoints)
})