/**
 * GET /api/pipelines/authors/[authorEmail]/timeline
 * Get pipeline runs for a specific author
 */

import { getPipelineRunsByAuthor, getAuthorSummary, clampIntParam } from '../../../../utils/athena-pipeline-queries'
import { parseAuthorField } from '../../../../../shared/utils/author-parser'
import { sendSuccess, errors, handleAsync } from '../../../../utils/api-response'
import { requirePermission } from '../../../../utils/user-roles'

export default defineEventHandler(handleAsync(async (event) => {
  await requirePermission(event, 'admin.logs')

  // getRouterParam decodes the segment; decoding it again threw URIError on
  // emails containing '%'
  const authorEmail = getRouterParam(event, 'authorEmail', { decode: true })?.trim()

  if (!authorEmail) {
    return errors.badRequest(event, 'Author email is required')
  }
  if (authorEmail.length > 320) {
    return errors.badRequest(event, 'Author email is too long')
  }

  const query = getQuery(event)
  const days = clampIntParam(query.days, 30, 1, 90)
  const limit = clampIntParam(query.limit, 200, 1, 1000)
  // Pipeline data is ALWAYS stored in GovCloud
  const environment = 'govcloud' as const

  const [runs, summary] = await Promise.all([
    getPipelineRunsByAuthor(authorEmail, days, limit, environment),
    getAuthorSummary(authorEmail, days, environment)
  ])

  // Parse author information from first run if available
  let authorInfo = {
    name: authorEmail,
    email: authorEmail,
    displayName: authorEmail
  }

  if (runs.length > 0 && runs[0].commit_author) {
    const parsed = parseAuthorField(runs[0].commit_author)
    authorInfo = {
      name: parsed.name,
      email: parsed.email,
      displayName: parsed.displayName
    }
  }

  return sendSuccess(event, {
    author: authorInfo,
    runs,
    summary,
    timeRangeDays: days,
    environment,
    totalRuns: runs.length
  })
}))
