import { createError, defineEventHandler, getHeader, setHeader, setResponseStatus } from 'h3'
import { ZodError } from 'zod'
import { requireKiroCrewToken } from '../../../kirocrew/auth'
import { getKiroCrewRepository } from '../../../kirocrew/repository'
import { bootstrapFromRevision, revisionEtag } from '../../../kirocrew/service'
import { logger } from '../../../utils/logger'

const ROUTE = '/api/kirocrew/v1/bootstrap'

export default defineEventHandler(async event => {
  await requireKiroCrewToken(event, ['kirocrew.bootstrap.read'])
  const revision = await getKiroCrewRepository().current()
  if (!revision) throw createError({ statusCode: 503, statusMessage: 'Kiro Crew configuration has not been published' })

  // Rendering a published revision can fail if its stored bootstrap value no
  // longer satisfies the current schema (e.g. a Zod validation error). Convert
  // that into a controlled 503 with one concise structured log line rather than
  // letting it surface as an unhandled multiline 500 with no route context. No
  // record or config values are logged — only error shape and Zod issue codes.
  try {
    const etag = revisionEtag(revision, 'bootstrap')
    setHeader(event, 'ETag', etag)
    setHeader(event, 'Cache-Control', 'no-store')
    if (getHeader(event, 'if-none-match') === etag) {
      setResponseStatus(event, 304)
      return null
    }
    return bootstrapFromRevision(revision)
  } catch (error: any) {
    logger.error('Failed to render Kiro Crew bootstrap revision', {
      route: ROUTE,
      revision: revision.revision,
      errorName: error?.name,
      errorMessage: error?.message,
      ...(error instanceof ZodError
        ? {
            zodIssues: error.issues.map(issue => ({
              code: issue.code,
              path: issue.path,
              ...('keys' in issue ? { keys: (issue as { keys: string[] }).keys } : {})
            }))
          }
        : {})
    })
    throw createError({ statusCode: 503, statusMessage: 'Kiro Crew configuration is currently unavailable' })
  }
})
