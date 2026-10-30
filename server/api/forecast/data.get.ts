/**
 * GET /api/forecast/data
 * Retrieve forecast data with filtering options
 */

import { defineEventHandler, getQuery } from 'h3'
import { scanItems, queryItems } from '../../utils/dynamodb'
import { sendPaginated, parseQueryParams, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { logger } from '../../utils/logger'

// Register OpenAPI documentation
registerEndpoint('/api/forecast/data', 'GET', {
  summary: 'Get forecast data',
  description: 'Retrieve forecast data with optional filtering',
  tags: ['Forecast'],
  parameters: [
    { $ref: '#/components/parameters/Environment' },
    { $ref: '#/components/parameters/Limit' },
    { $ref: '#/components/parameters/NextToken' },
    {
      name: 'accountId',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Filter by account ID'
    },
    {
      name: 'period',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Filter by period (YYYY-MM format)'
    },
    {
      name: 'status',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Filter by status'
    }
  ],
  responses: {
    200: {
      description: 'Forecast data retrieved successfully',
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
                    id: { type: 'string' },
                    accountId: { type: 'string' },
                    accountName: { type: 'string' },
                    enclaveId: { type: 'string' },
                    projectType: { type: 'string' },
                    lob: { type: 'string' },
                    deptNumber: { type: 'string' },
                    projNumber: { type: 'string' },
                    taskNumber: { type: 'string' },
                    govAccountId: { type: 'string' },
                    comAccountId: { type: 'string' },
                    forecasts: { 
                      type: 'object',
                      description: 'Monthly forecast amounts keyed by period (YYYY-MM)'
                    },
                    totalAmount: { type: 'number' },
                    status: { type: 'string' },
                    source: { type: 'string' },
                    uploadedAt: { type: 'string' },
                    createdAt: { type: 'string' },
                    updatedAt: { type: 'string' }
                  }
                }
              },
              pagination: { $ref: '#/components/schemas/PaginationInfo' }
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
  const { limit, nextToken } = parseQueryParams(event)
  // Forecast table is in GovCloud
  const environment = 'govcloud'
  
  const accountId = query.accountId as string | undefined
  const accountIds = typeof query.accountIds === 'string'
    ? query.accountIds.split(',').map(id => id.trim()).filter(Boolean)
    : []
  const period = query.period as string | undefined
  const status = query.status as string | undefined

  try {
    let result

    if (accountIds.length > 0) {
      const accountResults = await Promise.all(accountIds.map(id => queryItems(
        {
          tableName: 'ghost-dashboard-forecast-data',
          queryExpression: 'PK = :pk',
          expressionAttributeValues: { ':pk': `FORECAST#${id}` },
          limit
        },
        environment
      )))
      const items = accountResults.flatMap(accountResult => accountResult.items).slice(0, limit)
      result = {
        items,
        count: accountResults.reduce((count, accountResult) => count + accountResult.count, 0),
        nextToken: undefined
      }
    } else if (accountId) {
      // Query by account ID using PK
      result = await queryItems(
        {
          tableName: 'ghost-dashboard-forecast-data',
          queryExpression: 'PK = :pk',
          expressionAttributeValues: {
            ':pk': `FORECAST#${accountId}`
          },
          limit,
          nextToken
        },
        environment
      )
    } else if (status) {
      // Uploads index status on GSI1 (GSI1PK = STATUS#<status>); GSI2 is the enclave index.
      result = await queryItems(
        {
          tableName: 'ghost-dashboard-forecast-data',
          indexName: 'GSI1',
          queryExpression: 'GSI1PK = :gsi1pk',
          expressionAttributeValues: {
            ':gsi1pk': `STATUS#${status}`
          },
          limit,
          nextToken
        },
        environment
      )
    } else {
      // Scan all items - fetch ALL records if no limit specified or limit is >= 1000
      const fetchAll = !limit || limit >= 1000
      
      if (fetchAll) {
        // Fetch all records by handling pagination internally
        const allItems: any[] = []
        let currentNextToken: string | undefined = nextToken
        let hasMore = true
        
        while (hasMore) {
          const scanResult = await scanItems(
            'ghost-dashboard-forecast-data',
            undefined, // no filter for now
            1000, // fetch in batches of 1000
            currentNextToken,
            environment
          )
          
          allItems.push(...scanResult.items)
          
          if (scanResult.nextToken) {
            currentNextToken = scanResult.nextToken
          } else {
            hasMore = false
          }
          
          // Safety limit to prevent infinite loops
          if (allItems.length > 10000) {
            logger.warn('Reached safety limit of 10000 items')
            hasMore = false
          }
        }
        
        const items = period
          ? allItems.filter(item => item.forecasts && Object.hasOwn(item.forecasts, period))
          : allItems
        result = {
          items,
          count: items.length,
          nextToken: undefined
        }
      } else {
        // Original logic for paginated results
        let filterExpression: string | undefined
        const expressionAttributeNames: Record<string, string> = {}
        if (period) {
          // Forecast months are keys of the forecasts map (YYYY-MM).
          filterExpression = 'attribute_exists(#forecasts.#period)'
          expressionAttributeNames['#forecasts'] = 'forecasts'
          expressionAttributeNames['#period'] = period
        }

        result = await scanItems(
          'ghost-dashboard-forecast-data',
          filterExpression,
          limit,
          nextToken,
          environment,
          filterExpression ? expressionAttributeNames : undefined
        )
      }
    }

    // Calculate pagination
    const page = nextToken ? 2 : 1

    return sendPaginated(
      event,
      result.items,
      {
        page,
        limit,
        total: result.count
      },
      {
        nextToken: result.nextToken
      }
    )

  } catch (err: any) {
    logger.error('Forecast data fetch error:', err)
    return errors.serverError(event, `Failed to fetch forecast data: ${err.message}`)
  }
}))
