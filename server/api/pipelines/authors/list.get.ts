/**
 * GET /api/pipelines/authors/list
 * Get list of all pipeline authors with their aggregate metrics
 */

import { getAllPipelineAuthors } from '../../../utils/athena-pipeline-queries'
import { parseAuthorField } from '../../../utils/author-parser'
import { sendSuccess, errors } from '../../../utils/api-response'

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    const days = query.days ? Number(query.days) : 30
    const environment = (query.environment as 'commercial' | 'govcloud') || 'govcloud'

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
  } catch (error: any) {
    return errors.serverError(event, error.message)
  }
})
