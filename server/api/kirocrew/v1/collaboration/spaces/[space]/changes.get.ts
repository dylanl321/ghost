import { defineEventHandler } from 'h3'
import { readChanges } from '../../../../../../kirocrew/collaboration/api-handlers'
import { runCollaborationRoute } from '../../../../../../kirocrew/collaboration/nitro-adapter'

// GET /api/kirocrew/v1/collaboration/spaces/{space}/changes
export default defineEventHandler(event => runCollaborationRoute(event, readChanges))
