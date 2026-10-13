import { defineEventHandler } from 'h3'
import { patchRun } from '../../../../../../../../../kirocrew/collaboration/api-handlers'
import { runCollaborationRoute } from '../../../../../../../../../kirocrew/collaboration/nitro-adapter'

// PATCH /api/kirocrew/v1/collaboration/spaces/{space}/investigations/{id}/runs/{run}
export default defineEventHandler(event => runCollaborationRoute(event, patchRun))
