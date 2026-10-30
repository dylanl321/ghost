import { defineEventHandler, setHeader } from 'h3'
import { currentRedactedRevision } from '../../../kirocrew/service'
import { requireAdmin } from '../../../utils/user-roles'

export default defineEventHandler(async event => {
  await requireAdmin(event)
  setHeader(event, 'Cache-Control', 'no-store')
  return currentRedactedRevision()
})
