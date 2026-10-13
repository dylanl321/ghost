import { defineEventHandler } from 'h3'
import { renewPresence } from '../../../../../../../kirocrew/collaboration/api-handlers'
import { runCollaborationRoute } from '../../../../../../../kirocrew/collaboration/nitro-adapter'

// PUT /api/kirocrew/v1/collaboration/spaces/{space}/presence
export default defineEventHandler(event => runCollaborationRoute(event, renewPresence))
