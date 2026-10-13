import { defineEventHandler, readBody, setHeader } from 'h3'
import { publishKiroCrewRevision, redactRevision } from '../../../kirocrew/service'
import { getUserEmail, requireAdmin } from '../../../utils/user-roles'

export default defineEventHandler(async event => {
  await requireAdmin(event)
  const revision = await publishKiroCrewRevision(
    await readBody(event),
    getUserEmail(event) || 'unknown-admin'
  )
  setHeader(event, 'Cache-Control', 'no-store')
  return redactRevision(revision)
})
