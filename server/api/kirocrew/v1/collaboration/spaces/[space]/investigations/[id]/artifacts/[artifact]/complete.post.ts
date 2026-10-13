import { defineEventHandler } from 'h3'
import { completeArtifact } from '../../../../../../../../../../kirocrew/collaboration/api-handlers'
import { runCollaborationRoute } from '../../../../../../../../../../kirocrew/collaboration/nitro-adapter'

// POST /api/kirocrew/v1/collaboration/spaces/{space}/investigations/{id}/artifacts/{artifact}/complete
export default defineEventHandler(event => runCollaborationRoute(event, completeArtifact))
