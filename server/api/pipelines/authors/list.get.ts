/**
 * GET /api/pipelines/authors/list
 * Get list of all pipeline authors with their aggregate metrics
 */

import { getAllPipelineAuthors, clampIntParam } from '../../../utils/athena-pipeline-queries'
import { parseAuthorField } from '../../../../shared/utils/author-parser'
import { sendSuccess, handleAsync } from '../../../utils/api-response'
import { requirePermission } from '../../../utils/user-roles'

export default defineEventHandler(handleAsync(async (event) => {
  await requirePermission(event, 'admin.logs')

  const query = getQuery(event)
  const days = clampIntParam(query.days, 30, 1, 90)
  // Pipeline data is ALWAYS stored in GovCloud
  const environment = 'govcloud' as const

  // Fetch author data from Athena
  const authors = await getAllPipelineAuthors(days, environment)

  // Parse author fields and enrich with structured data
  const enrichedAuthors = authors.map(author => {
    const parsedAuthor = parseAuthorField(author.commit_author)

    return {
      ...author,
      author_name: parsedAuthor.name,
      author_email: parsedAuthor.email,
      author_display: parsedAuthor.displayName,
      author_raw: parsedAuthor.raw
    }
  })

  return sendSuccess(event, {
    authors: enrichedAuthors,
    timeRangeDays: days,
    environment,
    totalAuthors: enrichedAuthors.length
  })
}))
