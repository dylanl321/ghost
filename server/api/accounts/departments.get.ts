/**
 * GET /api/accounts/departments
 * Get unique departments with account counts and budgets
 */

import { defineEventHandler, getQuery } from 'h3'
import { getUniqueDepartments } from '../../utils/account-filters'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'

// Register OpenAPI documentation
registerEndpoint('/api/accounts/departments', 'GET', {
  summary: 'Get departments',
  description: 'Retrieve unique department numbers with account counts and total budgets',
  tags: ['Accounts'],
  parameters: [
    {
      name: 'includeDecommissioned',
      in: 'query',
      required: false,
      schema: { 
        type: 'boolean',
        default: false
      },
      description: 'Include decommissioned accounts in the count (default: false)'
    }
  ],
  responses: {
    200: {
      description: 'Department data',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    departmentNumber: { 
                      type: 'string',
                      description: 'Department number/identifier'
                    },
                    accountCount: { 
                      type: 'integer',
                      description: 'Number of accounts in this department'
                    },
                    totalBudget: { 
                      type: 'number',
                      description: 'Total monthly budget for this department (if available)'
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
  const query = getQuery(event)
  const includeDecommissioned = query.includeDecommissioned === 'true' || query.includeDecommissioned === true
  
  const departments = await getUniqueDepartments(includeDecommissioned)
  
  // Check if any departments were found
  if (!departments || departments.length === 0) {
    return errors.notFound(event, 'No departments found')
  }
  
  return sendSuccess(event, departments)
}))