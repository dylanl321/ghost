/**
 * POST /api/accounts/lookup
 * Lookup account with correct architecture
 */

import { defineEventHandler, readBody, getQuery } from 'h3'
import { lookupAccountUnified } from '../../utils/accounts-consolidated'
import { applyEnrichmentLevel, validateEnrichmentLevel, getEnrichmentDescription } from '../../utils/account-enrichment'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'

// Register OpenAPI documentation
registerEndpoint('/api/accounts/lookup', 'POST', {
  summary: 'Lookup account',
  description: 'Find account by various criteria using Organizations + DynamoDB data',
  tags: ['Accounts'],
  parameters: [
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
    }
  ],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            accountId: { 
              type: 'string', 
              description: 'Commercial account ID (primary identifier)' 
            },
            govCloudAccountId: { 
              type: 'string', 
              description: 'GovCloud account ID' 
            },
            requestID: { 
              type: 'string', 
              description: 'Request/ticket ID' 
            },
            accountEmail: { 
              type: 'string', 
              description: 'Account email address (partial match)' 
            },
            accountName: { 
              type: 'string', 
              description: 'Account name (partial match)' 
            },
            projectCode: { 
              type: 'string', 
              description: 'Project code' 
            }
          },
          minProperties: 1
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Account information',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  accountId: { type: 'string', description: 'Commercial account ID' },
                  accountName: { type: 'string' },
                  accountEmail: { type: 'string' },
                  accountType: { type: 'string', enum: ['commercial-only', 'govcloud-paired'] },
                  hasGovCloud: { type: 'boolean' },
                  govCloudAccountId: { type: 'string' },
                  requestID: { type: 'string' },
                  projectCode: { type: 'string' },
                  environment: { type: 'string' },
                  organizationArn: { type: 'string' },
                  joinedTimestamp: { type: 'string' }
                }
              }
            }
          }
        }
      }
    },
    400: { $ref: '#/components/schemas/Error' },
    404: { $ref: '#/components/schemas/Error' },
    500: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  const query = getQuery(event)
  const enrichmentLevel = validateEnrichmentLevel(query.enrichment as string)
  const body = await readBody(event)
  
  if (!body || typeof body !== 'object') {
    return errors.badRequest(event, 'Request body must be a valid object')
  }
  
  // Extract lookup criteria
  const criteria = {
    accountId: body.accountId,
    govCloudAccountId: body.govCloudAccountId,
    requestID: body.requestID,
    accountEmail: body.accountEmail,
    accountName: body.accountName,
    projectCode: body.projectCode
  }
  
  // Check if at least one criterion is provided
  if (!Object.values(criteria).some(v => v)) {
    return errors.badRequest(event, 'At least one lookup criterion must be provided')
  }
  
  try {
    console.log('Looking up account with criteria:', criteria)
    const account = await lookupAccountUnified(criteria)
    
    if (!account) {
      return errors.notFound(event, 'Account')
    }
    
    // Apply enrichment level filtering
    const enrichedAccount = enrichmentLevel !== 'full' 
      ? applyEnrichmentLevel(account, enrichmentLevel)
      : account
    
    return sendSuccess(event, enrichedAccount, {
      lookupCriteria: Object.fromEntries(
        Object.entries(criteria).filter(([_, value]) => value)
      ),
      enrichment: enrichmentLevel,
      enrichmentDescription: getEnrichmentDescription(enrichmentLevel)
    })
  } catch (error) {
    console.error('Error looking up account:', error)
    return errors.serverError(event, 'Failed to lookup account')
  }
}))