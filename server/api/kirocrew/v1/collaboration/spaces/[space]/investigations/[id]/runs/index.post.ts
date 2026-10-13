import { defineEventHandler } from 'h3'
import { reserveRun } from '../../../../../../../../../kirocrew/collaboration/api-handlers'
import { runCollaborationRoute } from '../../../../../../../../../kirocrew/collaboration/nitro-adapter'

// POST /api/kirocrew/v1/collaboration/spaces/{space}/investigations/{id}/runs
export default defineEventHandler(event => runCollaborationRoute(event, reserveRun))
