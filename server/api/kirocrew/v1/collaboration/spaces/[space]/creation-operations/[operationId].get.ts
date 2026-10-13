import { defineEventHandler } from 'h3'
import { resolveCreationOperation } from '../../../../../../../kirocrew/collaboration/api-handlers'
import { runCollaborationRoute } from '../../../../../../../kirocrew/collaboration/nitro-adapter'

// GET /api/kirocrew/v1/collaboration/spaces/{space}/creation-operations/{operationId}
export default defineEventHandler(event => runCollaborationRoute(event, resolveCreationOperation))
