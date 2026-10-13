import { defineEventHandler } from 'h3'
import { deleteInvestigation } from '../../../../../../../../kirocrew/collaboration/api-handlers'
import { runCollaborationRoute } from '../../../../../../../../kirocrew/collaboration/nitro-adapter'

// DELETE /api/kirocrew/v1/collaboration/spaces/{space}/investigations/{id}
//
// GHOST_Admin_Service permanent-deletion boundary. Authorizes the target as a
// collaboration object write AND requires separate current Administrator
// authorization before handing the deletion to the admin surface; every denial
// is non-disclosing (Requirement 4.10, 24.2).
export default defineEventHandler(event => runCollaborationRoute(event, deleteInvestigation))
