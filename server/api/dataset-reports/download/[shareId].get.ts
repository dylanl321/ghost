/**
 * Download a shared dataset report
 * GET /api/dataset-reports/download/:shareId
 * Returns a presigned S3 URL for the frontend to download
 */

import { resolveSharedReportDownload } from '../../../utils/shared-report-download'

export default defineEventHandler(event =>
  resolveSharedReportDownload(getRouterParam(event, 'shareId'), { datasetOnly: true })
)
