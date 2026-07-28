/**
 * API Endpoint: POST /api/dataset-reports/export
 *
 * Generates and downloads a dataset report in the requested format
 */

import { defineEventHandler, readBody, setHeader } from 'h3'
import { generateDatasetReport } from '../../utils/dataset-report-generator'
import { errors } from '../../utils/api-response'
import { logger } from '../../utils/logger'
import type { DatasetReportConfig } from '../../../shared/types/dataset-reports'
import { getDatasetReportConfigErrors } from '../../utils/dataset-report-validation'

interface ExportRequest {
  accountIds: string[]
  reportConfig: DatasetReportConfig
}

export default defineEventHandler(async (event) => {
  try {
    // Verify authentication
    const auth = event.context.auth
    if (!auth || !auth.isAuthenticated) {
      return errors.unauthorized(event, 'Authentication required')
    }

    const body = await readBody<ExportRequest>(event)
    const reportConfig = body?.reportConfig

    const validationErrors = getDatasetReportConfigErrors(reportConfig)
    if (validationErrors.length > 0) {
      return errors.badRequest(event, validationErrors.join('; '))
    }
    const validatedConfig = reportConfig as DatasetReportConfig

    logger.info('[Dataset Export] Starting export', {
      accountIds: validatedConfig.accounts?.length || 'all',
      format: validatedConfig.format,
      datasets: Object.keys(validatedConfig.datasets).filter(k => validatedConfig.datasets[k as keyof typeof validatedConfig.datasets]?.enabled)
    })

    // Generate the report (pass event for Entra Users Graph API access)
    const result = await generateDatasetReport(validatedConfig, event)

    if (!result.success || !result.buffer) {
      logger.error('[Dataset Export] Generation failed', { error: result.error })
      return errors.serverError(event, result.error || 'Failed to generate report')
    }

    // Set appropriate headers for file download
    setHeader(event, 'Content-Type', result.mimeType)
    setHeader(event, 'Content-Disposition', `attachment; filename="${result.filename}"`)
    setHeader(event, 'Content-Length', result.buffer.length)

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
