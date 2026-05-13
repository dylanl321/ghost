/**
 * POST /api/security-lake/dry-run
 * 
 * Test dry run execution without Athena
 */

import { defineEventHandler, readBody } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { executeStoredQuery } from '../../utils/security-lake'
import type { QueryExecutionRequest } from '../../utils/security-lake'

export default defineEventHandler(handleAsync(async (event) => {
  const body = await readBody(event) as QueryExecutionRequest
  
  if (!body.queryId || !body.parameters) {
    return errors.badRequest(event, 'queryId and parameters required')
  }
  
  try {
    // Force dry run
    const result = await executeStoredQuery({
      ...body,
      dryRun: true
    })
    
    return sendSuccess(event, {
      sql: result.sql,
      success: result.success,
      error: result.error,
      metadata: result.metadata
    })
    
  } catch (error) {
    return errors.serverError(event, (error instanceof Error ? error.message : String(error)))
  }
}))