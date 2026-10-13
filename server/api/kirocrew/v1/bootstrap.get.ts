import { createError, defineEventHandler, getHeader, setHeader, setResponseStatus } from 'h3'
import { requireKiroCrewToken } from '../../../kirocrew/auth'
import { getKiroCrewRepository } from '../../../kirocrew/repository'
import { bootstrapFromRevision, revisionEtag } from '../../../kirocrew/service'

export default defineEventHandler(async event => {
  await requireKiroCrewToken(event, ['kirocrew.bootstrap.read'])
  const revision = await getKiroCrewRepository().current()
  if (!revision) throw createError({ statusCode: 503, statusMessage: 'Kiro Crew configuration has not been published' })
  const etag = revisionEtag(revision, 'bootstrap')
  setHeader(event, 'ETag', etag)
  setHeader(event, 'Cache-Control', 'no-store')
  if (getHeader(event, 'if-none-match') === etag) {
    setResponseStatus(event, 304)
    return null
  }
  return bootstrapFromRevision(revision)
})
