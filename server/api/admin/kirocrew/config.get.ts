import { defineEventHandler, setHeader } from 'h3'
import { getKiroCrewRepository } from '../../../kirocrew/repository'
import { redactRevision } from '../../../kirocrew/service'

export default defineEventHandler(async event => {
  const revision = await getKiroCrewRepository().current()
  setHeader(event, 'Cache-Control', 'no-store')
  return revision ? redactRevision(revision) : {
    schemaVersion: 1,
    revision: 0,
    updatedAt: null,
    publishedBy: null,
    records: []
  }
})
