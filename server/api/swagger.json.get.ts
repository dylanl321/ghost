/**
 * GET /api/swagger.json
 * Serve OpenAPI specification
 */

import { defineEventHandler } from 'h3'
import { getOpenApiSpec } from '../plugins/swagger'

export default defineEventHandler(() => {
  return getOpenApiSpec()
})
