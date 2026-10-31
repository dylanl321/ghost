import { defineEventHandler, setHeader } from 'h3'
import { requireKiroCrewToken } from '../../../../kirocrew/auth'
import { currentRedactedRevision } from '../../../../kirocrew/service'

export default defineEventHandler(async event => {
  await requireKiroCrewToken(event, ['kirocrew.config.admin'])
  setHeader(event, 'Cache-Control', 'no-store')
  return currentRedactedRevision()
})
