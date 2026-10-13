import { defineEventHandler } from 'h3'
import { patchInvestigation } from '../../../../../../../../kirocrew/collaboration/api-handlers'
import { runCollaborationRoute } from '../../../../../../../../kirocrew/collaboration/nitro-adapter'

// PATCH /api/kirocrew/v1/collaboration/spaces/{space}/investigations/{id}
export default defineEventHandler(event => runCollaborationRoute(event, patchInvestigation))
