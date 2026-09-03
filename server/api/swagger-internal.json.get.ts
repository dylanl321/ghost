/**
 * GET /api/swagger-internal.json
 * Serve browser-session API documentation for application developers.
 */

import { defineEventHandler } from 'h3'
import { getInternalOpenApiSpec } from '../plugins/swagger'

export default defineEventHandler(() => getInternalOpenApiSpec())
