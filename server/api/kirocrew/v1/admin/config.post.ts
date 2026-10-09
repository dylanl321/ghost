import { defineEventHandler, readBody, setHeader } from 'h3'
import { requireKiroCrewToken } from '../../../../kirocrew/auth'
import { publishKiroCrewRevision, redactRevision } from '../../../../kirocrew/service'

export default defineEventHandler(async event => {
  const { identity } = await requireKiroCrewToken(event, ['kirocrew.config.admin'])
  const revision = await publishKiroCrewRevision(await readBody(event), identity.email)
  setHeader(event, 'Cache-Control', 'no-store')
  return redactRevision(revision)
})
