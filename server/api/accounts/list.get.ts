/**
 * GET /api/accounts/list
 * List accounts with correct architecture (Organizations + DynamoDB metadata)
 */

import { defineEventHandler, getQuery } from 'h3'
import { 
  getAllAccountsFromOrganizations,
  getAllAccountsUnified,
  searchAccountsUnified,
  getAccountStatistics
} from '../../utils/accounts-consolidated'
import { 
  applyEnrichmentToList, 
  validateEnrichmentLevel
} from '../../utils/account-enrichment'
import {
  parseAndValidateAccountFilters,
  filterAccounts,
  hasActiveFilters
} from '../../utils/account-filters'
import { sendSuccess, sendApiError, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { logger } from '../../utils/logger'

// Register OpenAPI documentation
registerEndpoint('/api/accounts/list', 'GET', {
  summary: 'List all accounts',
  description: 'Get accounts from Organizations (master) enriched with DynamoDB metadata',
  tags: ['Accounts'],
  parameters: [
    {
      name: 'source',
      in: 'query',
      required: false,
      schema: { 
        type: 'string',
        enum: ['full', 'organizations-only', 'statistics'],
        default: 'full'
      },
      description: 'Data source: full (Organizations + metadata), organizations-only, or statistics'
    },
    {
      name: 'enrichment',
      in: 'query',
      required: false,
      schema: { 
        type: 'string',
        enum: ['simple', 'basic', 'full'],
        default: 'full'
      },
      description: 'Level of data enrichment: simple (IDs, names, status), basic (+ key project info), full (everything)'
    },
    {
      name: 'search',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Search term to filter accounts'
    },
    {
      name: 'accountType',
      in: 'query',
      required: false,
      schema: { 
        type: 'string',
        enum: ['commercial-only', 'govcloud-paired']
      },
      description: 'Filter by account type'
    },
    {
      name: 'key',
      in: 'query',
      required: false,
      schema: { 
        type: 'array',
        items: { type: 'string' }
      },
      description: 'Filter key(s) - can be any DynamoDB field (supports multiple)'
    },
    {
      name: 'value',
      in: 'query',
      required: false,
      schema: { 
        type: 'array',
        items: { type: 'string' }
      },
      description: 'Filter value(s) corresponding to key(s) (supports multiple)'
    },
    {
      name: 'operator',
      in: 'query',
      required: false,
      schema: { 
        type: 'array',
        items: { 
          type: 'string',
          enum: ['eq', 'ne', 'contains', 'not_contains', 'begins_with', 'not_begins_with', 'gt', 'gte', 'lt', 'lte', 'in', 'not_in']
        }
      },
      description: 'Filter operator(s) (default: eq) - eq, ne, contains, not_contains, begins_with, not_begins_with, gt, gte, lt, lte, in, not_in'
    },
    {
      name: 'sortBy',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Sort by field name (any account field)'
    },
    {
      name: 'order',
      in: 'query',
      required: false,
      schema: { 
        type: 'string',
        enum: ['asc', 'desc'],
        default: 'asc'
      },
      description: 'Sort order'
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
    }
  ],
  responses: {
    200: {
      description: 'List of accounts',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                oneOf: [
                  {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        accountId: { type: 'string' },
                        accountName: { type: 'string' },
                        accountEmail: { type: 'string' },
                        accountType: { type: 'string', enum: ['commercial-only', 'govcloud-paired'] },
                        hasGovCloud: { type: 'boolean' },
                        govCloudAccountId: { type: 'string' },
                        requestID: { type: 'string' },
                        environment: { type: 'string' }
                      }
                    }
                  },
                  {
                    type: 'object',
                    description: 'Statistics when source=statistics'
                  }
                ]
              },
              metadata: {
                type: 'object',
                properties: {
                  source: { type: 'string' },
                  count: { type: 'number' },
                  searchTerm: { type: 'string' }
                }
              }
            }
          }
        }
      }
    },
    500: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  const query = getQuery(event)
  const source = (query.source as string) || 'full'
  const enrichmentLevel = validateEnrichmentLevel(query.enrichment as string)
  const searchTerm = query.search as string | undefined
  const accountType = query.accountType as 'commercial-only' | 'govcloud-paired' | undefined
  const sortBy = query.sortBy as string | undefined
  const order = (query.order as 'asc' | 'desc') || 'asc'
  const includeDecommissioned = query.includeDecommissioned === 'true' || query.includeDecommissioned === true
  
  // Parse and validate account filtering criteria
  const { criteria: accountFilters, errors: filterErrors } = parseAndValidateAccountFilters(query)
  
  // Check for validation errors
  if (filterErrors.length > 0) {
    return errors.badRequest(event, `Invalid account filters: ${filterErrors.join('; ')}`)
  }
  
  // Ensure includeDecommissioned is consistent
  accountFilters.includeDecommissioned = includeDecommissioned
  
  let accounts = []
  const metadata: any = { 
    source,
    enrichment: enrichmentLevel,
    filtersApplied: hasActiveFilters(accountFilters),
    sortBy,
    order
  }
  
  try {
    // Handle statistics request early
    if (source === 'statistics') {
      const stats = await getAccountStatistics()
      return sendSuccess(event, stats, { source: 'statistics' })
    }
    
    // Get initial account list
    switch (source) {
      case 'full':
        accounts = await getAllAccountsUnified(includeDecommissioned)
        break
        
      case 'organizations-only':
        accounts = await getAllAccountsFromOrganizations()
        break
        
      default:
        return errors.badRequest(event, 'Invalid source parameter')
    }
    
    // Nothing is filtered yet, so an empty list means neither DynamoDB nor
    // Organizations answered (both log the cause), not an empty organization.
    if (!accounts || accounts.length === 0) {
      return sendApiError(event, 'SERVICE_UNAVAILABLE', 'Account data is unavailable: the account registry and AWS Organizations returned no accounts', 503)
    }
    
    // Only apply advanced filtering to unified accounts
    if (source === 'full') {
      // Apply new filtering system
      // Filter the list already fetched above rather than reading every
      // account again. includeDecommissioned is always set, so only report
      // filters when an actual filter was given.
      accounts = await filterAccounts(accountFilters, accounts)
      if (hasActiveFilters(accountFilters)) {
        metadata.filters = accountFilters
      }
      
      // Apply search if provided
      if (searchTerm) {
        accounts = accounts.filter(acc => 
          acc.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          acc.id?.includes(searchTerm) ||
          acc.email?.toLowerCase().includes(searchTerm.toLowerCase())
        )
        metadata.searchTerm = searchTerm
      }
      
      // Apply account type filter
      if (accountType) {
        const envFilter = accountType === 'govcloud-paired' ? 'both' : 'commercial'
        accounts = accounts.filter(acc => acc.env === envFilter)
        metadata.accountType = accountType
      }
      
      // Apply basic sorting (simplified)
      if (sortBy && sortBy === 'name') {
        accounts = accounts.sort((a, b) => {
          const aName = a.name || ''
          const bName = b.name || ''
          return order === 'desc' ? bName.localeCompare(aName) : aName.localeCompare(bName)
        })
      }
      
      // Apply enrichment level filtering
      if (enrichmentLevel !== 'full') {
        accounts = applyEnrichmentToList(accounts, enrichmentLevel)
      }
    } else {
      // For organizations-only, use legacy filtering
      if (searchTerm) {
        accounts = await searchAccountsUnified(searchTerm)
        metadata.searchTerm = searchTerm
      }
      
      if (accountType) {
        accounts = accounts.filter(acc => acc.accountType === accountType)
        metadata.accountType = accountType
      }
    }
    
    // Return empty array with proper message if no results
    if (accounts.length === 0) {
      metadata.message = 'No accounts found matching the specified criteria'
    }
    
    metadata.count = accounts.length
    
    return sendSuccess(event, accounts, metadata)
  } catch (error) {
    logger.error('Error listing accounts:', error)
    return errors.serverError(event, 'Failed to retrieve accounts')
  }
}))