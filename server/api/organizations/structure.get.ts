/**
 * GET /api/organizations/structure
 * Get organizational unit structure
 */

import { defineEventHandler } from 'h3'
import { 
  getOrganizationInfo, 
  getOrganizationalUnitTree 
} from '../../utils/organizations'
import { sendSuccess, parseQueryParams, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'

// Register OpenAPI documentation
registerEndpoint('/api/organizations/structure', 'GET', {
  summary: 'Get organizational structure',
  description: 'Retrieve the organizational unit hierarchy and structure',
  tags: ['Organizations'],
  parameters: [
    { $ref: '#/components/parameters/Environment' }
  ],
  responses: {
    200: {
      description: 'Organizational structure',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  organization: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      arn: { type: 'string' },
                      featureSet: { type: 'string' },
                      masterAccountId: { type: 'string' }
                    }
                  },
                  tree: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      name: { type: 'string' },
                      children: { type: 'array' },
                      accounts: { type: 'array' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    404: { $ref: '#/components/schemas/Error' },
    500: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  const { environment } = parseQueryParams(event)
  
  // Get both organization info and OU tree
  const [orgInfo, ouTree] = await Promise.all([
    getOrganizationInfo(environment),
    getOrganizationalUnitTree(environment)
  ])
  
  if (!orgInfo) {
    return errors.serverError(event, 'Unable to access Organizations service')
  }
  
  if (!ouTree) {
    return errors.notFound(event, 'Organizational unit tree not found')
  }
  
  return sendSuccess(event, {
    organization: orgInfo,
    tree: ouTree
  }, {
    environment
  })
}))