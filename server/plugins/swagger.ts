/**
 * Swagger/OpenAPI Plugin for Nitro
 * Provides automatic API documentation
 */

import { defineNitroPlugin } from 'nitropack/runtime/plugin'
import { version } from '../../package.json'
import { standardParameters } from '../utils/swagger-parameters'
import { loadDocumentedRoutes } from '../generated/swagger-routes'

// OpenAPI specification base
const openApiSpec = {
  openapi: '3.0.0',
  info: {
    title: 'GHOST API',
    description: 'GHOST APIs for AWS account data across Commercial and GovCloud. The supported integration contract is under /api/v1 and accepts API keys only through the x-api-key header. Other documented routes are internal and use an authenticated Entra ID browser session.',
    version,
    contact: {
      name: 'GHOST Dashboard',
      url: '/settings/api-access'
    }
  },
  servers: [
    {
      url: '/',
      description: 'API Server'
    }
  ],
  security: [
    { OIDCAuth: [] }
  ],
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'x-api-key',
        description: 'Personal API key from Settings > API Access. Read-only; valid only on /api/v1 endpoints.'
      },
      OIDCAuth: {
        type: 'openIdConnect',
        openIdConnectUrl: '/.well-known/openid-configuration',
        description: 'Your signed-in GHOST browser session (Entra ID). Swagger UI sends it automatically when you are signed in; scripts should use ApiKeyAuth.'
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
              code: {
                type: 'string',
                description: 'BAD_REQUEST, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, UPSTREAM_ERROR, SERVICE_UNAVAILABLE (retry; honor Retry-After when present), or INTERNAL_ERROR.',
                example: 'FORBIDDEN'
              },
              message: { type: 'string' },
              details: { type: 'object' }
            }
          },
          metadata: {
            type: 'object',
            properties: {
              timestamp: { type: 'string', format: 'date-time' },
              requestID: { type: 'string', description: 'Matches the x-request-id response header; quote it when reporting a problem.' }
            }
          }
        }
      },
      PaginationInfo: {
        type: 'object',
        properties: {
          limit: { type: 'integer' },
          returned: { type: 'integer' },
          hasMore: { type: 'boolean' },
          nextCursor: { type: 'string', nullable: true },
          total: { type: 'integer', nullable: true },
          totalIsExact: { type: 'boolean' }
        },
        required: ['limit', 'returned', 'hasMore', 'nextCursor', 'total', 'totalIsExact']
      },
      NormalizedSecurityHubFinding: {
        type: 'object',
        properties: {
          accountId: { type: 'string' },
          accountName: { type: 'string' },
          region: { type: 'string' },
          findingId: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          severity: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL'] },
          severityScore: { type: 'number' },
          workflowStatus: { type: 'string', enum: ['NEW', 'NOTIFIED', 'RESOLVED', 'SUPPRESSED'] },
          productName: { type: 'string' },
          resourceType: { type: 'string' },
          resourceId: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          firstObservedAt: { type: 'string', format: 'date-time' },
          lastObservedAt: { type: 'string', format: 'date-time' }
        },
        required: ['accountId', 'accountName', 'region', 'findingId', 'title', 'severity', 'workflowStatus', 'productName', 'resourceType', 'resourceId']
      },
      NormalizedInspectorFinding: {
        type: 'object',
        properties: {
          findingArn: { type: 'string' },
          accountId: { type: 'string' },
          region: { type: 'string' },
          severity: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL', 'UNTRIAGED'] },
          title: { type: 'string' },
          type: { type: 'string' },
          status: { type: 'string', enum: ['ACTIVE', 'SUPPRESSED', 'CLOSED'] },
          vulnerabilityId: { type: 'string' },
          cveIds: { type: 'array', items: { type: 'string' } },
          inspectorScore: { type: 'number' },
          resourceType: { type: 'string' },
          resourceArn: { type: 'string' },
          packageName: { type: 'string' },
          packageVersion: { type: 'string' },
          fixedVersion: { type: 'string' },
          fixAvailable: { type: 'string', enum: ['YES', 'NO', 'PARTIAL'] },
          exploitAvailable: { type: 'string', enum: ['YES', 'NO'] },
          firstObservedAt: { type: 'string', format: 'date-time' },
          lastObservedAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' }
        },
        required: ['findingArn', 'accountId', 'region', 'severity', 'title', 'type', 'status', 'cveIds']
      },
      SecurityAccountError: {
        type: 'object',
        description: 'A selected account that could not be queried in the requested AWS partition.',
        properties: {
          code: { type: 'string', enum: ['MISSING_ENVIRONMENT_ACCOUNT_ID'] },
          environment: { type: 'string', enum: ['commercial', 'govcloud'] },
          account: {
            type: 'object',
            properties: {
              accountId: { type: 'string' },
              govCloudAccountId: { type: 'string' },
              requestId: { oneOf: [{ type: 'string' }, { type: 'number' }] },
              accountName: { type: 'string' }
            }
          },
          message: { type: 'string' }
        },
        required: ['code', 'environment', 'account', 'message']
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
      },
      ParsedAWSGroup: { type: 'object', additionalProperties: true },
      AccountGroups: { type: 'object', additionalProperties: true },
      GroupOwner: { type: 'object', additionalProperties: true },
      EntraUser: { type: 'object', additionalProperties: true }
    },
    parameters: {
      ...standardParameters,
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
      },
      AccountId: { name: 'accountId', in: 'path', required: true, schema: { type: 'string' } },
      GroupId: { name: 'groupId', in: 'path', required: true, schema: { type: 'string' } },
      IncludeMembers: { name: 'includeMembers', in: 'query', required: false, schema: { type: 'boolean' } },
      SortByRole: { name: 'sortByRole', in: 'query', required: false, schema: { type: 'boolean' } },
      EntraEnvironment: { name: 'environment', in: 'query', required: false, schema: { type: 'string' } },
      Role: { name: 'role', in: 'query', required: false, schema: { type: 'string' } },
      Search: { name: 'search', in: 'query', required: false, schema: { type: 'string' } }
    }
  },
  paths: {} as Record<string, any>
}

export const supportedV1Paths = [
  '/api/v1/accounts',
  '/api/v1/accounts/{identifier}',
  '/api/v1/organization',
  '/api/v1/costs/summary',
  '/api/v1/costs/tags',
  '/api/v1/costs/tag-keys',
  '/api/v1/forecasts/aws',
  '/api/v1/forecasts/financial',
  '/api/v1/security/summary',
  '/api/v1/security/findings',
  '/api/v1/security/inspector/findings'
] as const

const supportedV1PathSet = new Set<string>(supportedV1Paths)
const v1Tags = [
  { name: 'Accounts', description: 'AWS account and organization data' },
  { name: 'Costs', description: 'AWS cost reporting' },
  { name: 'Forecasts', description: 'AWS and GHOST financial forecasts' },
  { name: 'Security', description: 'Security summaries and findings' }
]

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
    operationId?: string
  }
) {
  const normalizedPath = path.replace(/\[([^\]]+)\]/g, '{$1}') // Convert [id] to {id}
  const normalizedMethod = method.toLowerCase()
  const operationId = spec.operationId || `${normalizedMethod}_${normalizedPath
    .replace(/^\/api\//, '')
    .replace(/[{}]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')}`
  const parameters = [...(spec.parameters || [])]

  for (const name of normalizedPath.matchAll(/\{([^}]+)\}/g)) {
    if (!parameters.some(parameter => parameter?.in === 'path' && parameter?.name === name[1])) {
      parameters.push({
        name: name[1],
        in: 'path',
        required: true,
        schema: { type: 'string' }
      })
    }
  }
  
  if (!openApiSpec.paths[normalizedPath]) {
    openApiSpec.paths[normalizedPath] = {}
  }
  
  openApiSpec.paths[normalizedPath][normalizedMethod] = {
    ...spec,
    operationId,
    ...(parameters.length > 0 ? { parameters } : {})
  }
  apiRegistry.set(`${method.toUpperCase()} ${path}`, spec)
}

/**
 * Get the current OpenAPI specification
 */
function createOpenApiSpec(includePath: (path: string) => boolean, internal = false) {
  const paths = Object.fromEntries(
    Object.entries(openApiSpec.paths)
      .filter(([path]) => includePath(path))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([path, operations]) => [
        path,
        Object.fromEntries(Object.entries(operations).sort(([left], [right]) => left.localeCompare(right)))
      ])
  )
  return {
    ...openApiSpec,
    info: {
      ...openApiSpec.info,
      title: internal ? 'GHOST Internal API' : 'GHOST Integration API',
      description: internal
        ? 'Authenticated browser-session APIs used by the GHOST application.'
        : 'The supported GHOST integration contract. API keys are accepted only through the x-api-key header on these /api/v1 endpoints.'
    },
    ...(internal ? {} : { tags: v1Tags }),
    security: internal ? [{ OIDCAuth: [] }] : [{ ApiKeyAuth: [] }, { OIDCAuth: [] }],
    paths
  }
}

/** Return only the supported public integration contract. */
export function getOpenApiSpec() {
  return createOpenApiSpec(path => supportedV1PathSet.has(path))
}

/** Return authenticated application APIs, excluding the public v1 contract. */
export function getInternalOpenApiSpec() {
  return createOpenApiSpec(path => !path.startsWith('/api/v1/'), true)
}

/**
 * Note: Swagger UI is now served via dedicated API endpoints:
 * - /api/docs - Swagger UI HTML  
 * - /api/swagger.json - OpenAPI specification
 * 
 * This plugin is kept for the OpenAPI spec management functions
 */
export default defineNitroPlugin(async () => {
  await loadDocumentedRoutes()
})
