import { defineEventHandler } from 'h3'
import { listSpaces } from '../../../../kirocrew/collaboration/api-handlers'
import { runCollaborationRoute } from '../../../../kirocrew/collaboration/nitro-adapter'

// GET /api/kirocrew/v1/collaboration/spaces
export default defineEventHandler(event => runCollaborationRoute(event, listSpaces))
