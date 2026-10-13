import { defineEventHandler } from 'h3'
import { readCollaborationSession } from '../../../../kirocrew/collaboration/api-handlers'
import { runCollaborationRoute } from '../../../../kirocrew/collaboration/nitro-adapter'

export default defineEventHandler(event => runCollaborationRoute(event, readCollaborationSession))
