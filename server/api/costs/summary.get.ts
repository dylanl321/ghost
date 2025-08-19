/**
 * GET /api/costs/summary
 * Get cost summary for specified date range
 */

import { defineEventHandler, getQuery } from 'h3'
import { getCostAndUsage, getProformaCosts, enhanceCostData } from '../../utils/cost-explorer'
import { sendSuccess, parseQueryParams, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { parseAndValidateAccountFilters, getAccountIdsFromCriteria } from '../../utils/account-filters'

// Register OpenAPI documentation
registerEndpoint('/api/costs/summary', 'GET', {
  summary: 'Get cost summary',
  description: 'Retrieve AWS cost summary for a specified date range',
  tags: ['Costs'],
  parameters: [
    { $ref: '#/components/parameters/Environment' },
    {
      name: 'startDate',
      in: 'query',
      required: true,
      schema: { type: 'string', format: 'date' },
      description: 'Start date (YYYY-MM-DD)'
    },
    {
      name: 'endDate',
      in: 'query',
      required: true,
      schema: { type: 'string', format: 'date' },
      description: 'End date (YYYY-MM-DD)'
    },
    {
      name: 'granularity',
      in: 'query',
      required: false,
      schema: { 
        type: 'string',
        enum: ['DAILY', 'MONTHLY'],
        default: 'MONTHLY'
      }
    },
    {
      name: 'groupBy',
      in: 'query',
      required: false,
      schema: { 
        type: 'string',
        enum: ['SERVICE', 'LINKED_ACCOUNT', 'REGION'],
        default: 'SERVICE'
      }
    },
    {
      name: 'proforma',
      in: 'query',
      required: false,
      schema: { 
        type: 'boolean',
        default: false
      },
      description: 'Include proforma data analysis (commercial environment only)'
    },
    {
      name: 'proformaAccountId',
      in: 'query',
      required: false,
      schema: { 
        type: 'string',
        default: '253821132832'
      },
      description: 'Proforma account ID for cost analysis'
    },
    {
      name: 'masterAccountId',
      in: 'query',
      required: false,
      schema: { 
        type: 'string',
        default: '205950196477'
      },
      description: 'Master account ID for cost analysis'
    },
    {
      name: 'accountIds',
      in: 'query',
      required: false,
      schema: { 
        type: 'string'
      },
      description: 'Comma-separated list of account IDs to filter (if not provided, returns all accounts)'
    },
    {
      name: 'linesOfBusiness',
      in: 'query',
      required: false,
      schema: { 
        type: 'string'
      },
      description: 'Comma-separated list of lines of business to filter accounts'
    },
    {
      name: 'departments',
      in: 'query',
      required: false,
      schema: { 
        type: 'string'
      },
      description: 'Comma-separated list of department numbers to filter accounts'
    },
    {
      name: 'includeDecommissioned',
      in: 'query',
      required: false,
      schema: { 
        type: 'boolean',
        default: false
      },
      description: 'Include decommissioned accounts in results (default: false)'
    },
    {
      name: 'enhanced',
      in: 'query',
      required: false,
      schema: { 
        type: 'boolean',
        default: true
      },
      description: 'Return enhanced format with account names and summaries (default: true)'
    }
  ],
  responses: {
    200: {
      description: 'Cost summary data',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  resultsByTime: { type: 'array' },
                  total: { type: 'object' },
                  proformaBreakdown: {
                    type: 'object',
                    description: 'Only included when proforma=true',
                    properties: {
                      masterAccount: {
                        type: 'object',
                        properties: {
                          accountId: { type: 'string' },
                          costs: { type: 'object' }
                        }
                      },
                      proformaAccount: {
                        type: 'object',
                        properties: {
                          accountId: { type: 'string' },
                          costs: { type: 'object' }
                        }
                      },
                      totals: {
                        type: 'object',
                        properties: {
                          master: { type: 'number' },
                          proforma: { type: 'number' },
                          masterOnly: { type: 'number' },
                          grandTotal: { type: 'number' }
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
    },
    400: { $ref: '#/components/schemas/Error' },
    500: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  const query = getQuery(event)
  const { environment } = parseQueryParams(event)
  
  // Validate required parameters
  if (!query.startDate || !query.endDate) {
    return errors.badRequest(event, 'startDate and endDate are required')
  }
  
  const startDate = query.startDate as string
  const endDate = query.endDate as string
  const granularity = (query.granularity as 'DAILY' | 'MONTHLY') || 'MONTHLY'
  const groupByDimension = (query.groupBy as string) || 'SERVICE'
  const proforma = query.proforma === 'true' || query.proforma === true
  const proformaAccountId = (query.proformaAccountId as string) || '253821132832'
  const masterAccountId = (query.masterAccountId as string) || '205950196477'
  const includeDecommissioned = query.includeDecommissioned === 'true' || query.includeDecommissioned === true
  const enhanced = query.enhanced !== 'false' && query.enhanced !== false // Default to true
  
  // Parse and validate account filtering criteria
  const { criteria: accountFilters, errors: filterErrors } = parseAndValidateAccountFilters(query)
  
  // Check for validation errors
  if (filterErrors.length > 0) {
    return errors.badRequest(event, `Invalid account filters: ${filterErrors.join('; ')}`)
  }
  
  // Ensure includeDecommissioned is consistent
  accountFilters.includeDecommissioned = includeDecommissioned
  
  // Validate date format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/
  if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
    return errors.badRequest(event, 'Dates must be in YYYY-MM-DD format')
  }
  
  // Validate date range
  const startDateObj = new Date(startDate)
  const endDateObj = new Date(endDate)
  const today = new Date()
  
  if (startDateObj > endDateObj) {
    return errors.badRequest(event, 'Start date must be before or equal to end date')
  }
  
  if (startDateObj > today) {
    return errors.badRequest(event, 'Start date cannot be in the future')
  }
  
  // Validate date range isn't too large (more than 2 years)
  const daysDiff = Math.ceil((endDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24))
  if (daysDiff > 730) {
    return errors.badRequest(event, 'Date range cannot exceed 2 years (730 days)')
  }
  
  // Validate proforma requirements
  if (proforma && environment !== 'commercial') {
    return errors.badRequest(event, 'Proforma data analysis is only available for commercial environment')
  }
  
  // Validate proforma account IDs
  if (proforma) {
    if (!/^\d{12}$/.test(proformaAccountId)) {
      return errors.badRequest(event, 'Invalid proforma account ID format. Must be 12 digits.')
    }
    if (!/^\d{12}$/.test(masterAccountId)) {
      return errors.badRequest(event, 'Invalid master account ID format. Must be 12 digits.')
    }
    if (proformaAccountId === masterAccountId) {
      return errors.badRequest(event, 'Proforma and master account IDs cannot be the same')
    }
  }
  
  // Get filtered account IDs if any filters are specified
  const filteredAccountIds = (accountFilters.accountIds || accountFilters.linesOfBusiness || accountFilters.departments || !accountFilters.includeDecommissioned)
    ? await getAccountIdsFromCriteria(accountFilters)
    : undefined
  
  // Check if any accounts were found when filters are applied
  if (filteredAccountIds && filteredAccountIds.length === 0) {
    return errors.notFound(event, 'No accounts found matching the specified filters')
  }
  
  // Build cost parameters
  const costParams = {
    startDate,
    endDate,
    granularity,
    metrics: ['UnblendedCost', 'UsageQuantity'],
    groupBy: [{
      type: 'DIMENSION' as const,
      key: groupByDimension
    }],
    // Add account filter for Cost Explorer if specific accounts are requested
    filter: filteredAccountIds && filteredAccountIds.length > 0 ? {
      Dimensions: {
        Key: 'LINKED_ACCOUNT',
        Values: filteredAccountIds,
        MatchOptions: ['EQUALS']
      }
    } : undefined
  }
  
  // Get cost data
  if (proforma) {
    const proformaData = await getProformaCosts(
      costParams,
      proformaAccountId,
      masterAccountId
    )
    
    // Prepare result based on enhanced flag
    if (enhanced) {
      const enhancedData = await enhanceCostData(proformaData.masterAccount.costs, includeDecommissioned)
      const result = {
        ...enhancedData,
        proformaBreakdown: {
          masterAccount: proformaData.masterAccount,
          proformaAccount: proformaData.proformaAccount,
          totals: proformaData.totals
        }
      }
      return sendSuccess(event, result)
    } else {
      // Return standard format with proforma breakdown
      const result = {
        resultsByTime: proformaData.masterAccount.costs.resultsByTime,
        total: proformaData.masterAccount.costs.total,
        proformaBreakdown: {
          masterAccount: proformaData.masterAccount,
          proformaAccount: proformaData.proformaAccount,
          totals: proformaData.totals
        }
      }
      return sendSuccess(event, result)
    }
  } else {
    const costData = await getCostAndUsage(costParams, environment)
    
    if (enhanced) {
      const enhancedData = await enhanceCostData(costData, includeDecommissioned)
      return sendSuccess(event, enhancedData)
    } else {
      return sendSuccess(event, costData)
    }
  }
}))