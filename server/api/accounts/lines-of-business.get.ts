/**
 * GET /api/accounts/lines-of-business
 * Get unique lines of business with account counts and budgets
 */

import { defineEventHandler, getQuery } from 'h3'
import { getUniqueBusinessLines } from '../../utils/account-filters'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'

// Register OpenAPI documentation
registerEndpoint('/api/accounts/lines-of-business', 'GET', {
  summary: 'Get lines of business',
  description: 'Retrieve unique lines of business with account counts and total budgets',
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
      description: 'Lines of business data',
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
                    linesOfBusiness: { 
                      type: 'string',
                      description: 'Line of business name'
                    },
                    accountCount: { 
                      type: 'integer',
                      description: 'Number of accounts in this LOB'
                    },
                    totalBudget: { 
                      type: 'number',
                      description: 'Total monthly budget for this LOB (if available)'
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
  
  const linesOfBusiness = await getUniqueBusinessLines(includeDecommissioned)
  
  // Check if any lines of business were found
  if (!linesOfBusiness || linesOfBusiness.length === 0) {
    return errors.notFound(event, 'No lines of business found')
  }
  
  return sendSuccess(event, linesOfBusiness)
}))