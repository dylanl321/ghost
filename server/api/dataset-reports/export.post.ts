/**
 * API Endpoint: POST /api/dataset-reports/export
 *
 * Generates and downloads a dataset report in the requested format
 */

import { defineEventHandler, readBody, setHeader } from 'h3'
import { generateDatasetReport } from '../../utils/dataset-report-generator'
import { errors } from '../../utils/api-response'
import { logger } from '../../utils/logger'
import type { DatasetReportConfig } from '#shared/types/dataset-reports'

interface ExportRequest {
  accountIds: string[]
  reportConfig: DatasetReportConfig
}

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<ExportRequest>(event)
    const { reportConfig } = body

    if (!reportConfig || !reportConfig.datasets) {
      return errors.badRequest(event, 'Missing report configuration')
    }

    logger.info('[Dataset Export] Starting export', {
      accountIds: reportConfig.accounts?.length || 'all',
      format: reportConfig.format,
      datasets: Object.keys(reportConfig.datasets).filter(k => reportConfig.datasets[k as keyof typeof reportConfig.datasets]?.enabled)
    })

    // Generate the report
    const result = await generateDatasetReport(reportConfig)

    if (!result.success || !result.buffer) {
      logger.error('[Dataset Export] Generation failed', { error: result.error })
      return errors.serverError(event, result.error || 'Failed to generate report')
    }

    // Set appropriate headers for file download
    setHeader(event, 'Content-Type', result.mimeType)
    setHeader(event, 'Content-Disposition', `attachment; filename="${result.filename}"`)
    setHeader(event, 'Content-Length', result.buffer.length.toString())

    logger.info('[Dataset Export] Export complete', {
      filename: result.filename,
      sizeBytes: result.buffer.length
    })

    // Return the binary buffer
    return result.buffer

  } catch (error: any) {
    logger.error('[Dataset Export] Error', { error: error.message, stack: error.stack })
    return errors.serverError(event, error.message || 'Failed to export dataset report')
  }
})
