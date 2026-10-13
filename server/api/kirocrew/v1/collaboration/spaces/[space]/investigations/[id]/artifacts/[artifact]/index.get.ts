import { defineEventHandler } from 'h3'
import { readArtifact } from '../../../../../../../../../../kirocrew/collaboration/api-handlers'
import { runCollaborationRoute } from '../../../../../../../../../../kirocrew/collaboration/nitro-adapter'

// GET /api/kirocrew/v1/collaboration/spaces/{space}/investigations/{id}/artifacts/{artifact}
export default defineEventHandler(event => runCollaborationRoute(event, readArtifact))
