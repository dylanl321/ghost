/**
 * GET /api/pipelines/authors/[authorEmail]/timeline
 * Get pipeline runs for a specific author
 */

import { getPipelineRunsByAuthor, getAuthorSummary } from '../../../../utils/athena-pipeline-queries'
import { parseAuthorField } from '../../../../utils/author-parser'
import { sendSuccess, errors } from '../../../../utils/api-response'

export default defineEventHandler(async (event) => {
  try {
    const authorEmail = getRouterParam(event, 'authorEmail')

    if (!authorEmail) {
      return errors.badRequest(event, 'Author email is required')
    }

    const query = getQuery(event)
    const days = query.days ? Number(query.days) : 30
    const limit = query.limit ? Number(query.limit) : 200
    const environment = (query.environment as 'commercial' | 'govcloud') || 'govcloud'

    // Decode URL-encoded email
    const decodedEmail = decodeURIComponent(authorEmail)

    // Fetch data in parallel
    const [runs, summary] = await Promise.all([
      getPipelineRunsByAuthor(decodedEmail, days, limit, environment),
      getAuthorSummary(decodedEmail, days, environment)
    ])

    // Parse author information from first run if available
    let authorInfo = {
      name: decodedEmail,
      email: decodedEmail,
      displayName: decodedEmail
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
  } catch (error: any) {
    return errors.serverError(event, error.message)
  }
})
