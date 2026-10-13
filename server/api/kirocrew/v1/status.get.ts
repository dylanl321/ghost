import { defineEventHandler, setHeader } from 'h3'
import { requireKiroCrewToken } from '../../../kirocrew/auth'
import { getKiroCrewRepository } from '../../../kirocrew/repository'

export default defineEventHandler(async event => {
  await requireKiroCrewToken(event, [
    'kirocrew.bootstrap.read',
    'kirocrew.config.read'
  ])
  const revision = await getKiroCrewRepository().current()
  setHeader(event, 'Cache-Control', 'no-store')
  return {
    serviceVersion: '1.0.0',
    schemaVersion: 1,
    revision: revision?.revision ?? null,
    updatedAt: revision?.updatedAt ?? null
  }
})
