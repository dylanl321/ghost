import { defineEventHandler } from 'h3'
import { queryPresence } from '../../../../../../../kirocrew/collaboration/api-handlers'
import { runCollaborationRoute } from '../../../../../../../kirocrew/collaboration/nitro-adapter'

// POST /api/kirocrew/v1/collaboration/spaces/{space}/presence/query
export default defineEventHandler(event => runCollaborationRoute(event, queryPresence))
