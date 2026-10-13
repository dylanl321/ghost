import { defineEventHandler } from 'h3'
import { listInvestigations } from '../../../../../../../kirocrew/collaboration/api-handlers'
import { runCollaborationRoute } from '../../../../../../../kirocrew/collaboration/nitro-adapter'

// GET /api/kirocrew/v1/collaboration/spaces/{space}/investigations
export default defineEventHandler(event => runCollaborationRoute(event, listInvestigations))
