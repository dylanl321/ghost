import { defineEventHandler, readBody } from 'h3'
import { sendSuccess, errors } from '../../utils/api-response'
import { queryConfigResources } from '../../utils/aws-config-data'
import { querySecurityHubFindings } from '../../utils/security-hub-data'
import { queryCloudTrailEvents } from '../../utils/cloudtrail-data'
import { queryEntraUsers } from '../../utils/entra-users-data'
import { logger } from '../../utils/logger'
import { buildAttributeSchema, flattenNestedData } from '../../utils/dataset-schema-builder'
import type { DatasetQueryResult, DatasetReportConfig, DatasetType } from '../../../shared/types/dataset-reports'
import { getDatasetReportConfigErrors } from '../../utils/dataset-report-validation'

const PREVIEW_LIMIT = 25

interface PreviewRequest {
  reportConfig: DatasetReportConfig
}

interface DatasetPreview {
  records: Record<string, any>[]
  attributeSchema: ReturnType<typeof buildAttributeSchema>
  sampleCount: number
  hasMore: boolean
  truncated: boolean
  /** Compatibility alias. This is a sample count, not an exact total. */
  totalCount: number
}

export default defineEventHandler(async (event) => {
  try {
    const auth = event.context.auth
    if (!auth?.isAuthenticated) return errors.unauthorized(event, 'Authentication required')

    const { reportConfig } = await readBody<PreviewRequest>(event)
    const validationErrors = getDatasetReportConfigErrors(reportConfig)
    if (validationErrors.length > 0) return errors.badRequest(event, validationErrors.join('; '))

    const config = reportConfig as DatasetReportConfig
    const accountIds = config.accountScope === 'all' ? [] : config.accounts
    const controller = new AbortController()
    event.node.req.once('aborted', () => controller.abort(new Error('Preview canceled')))
    const options = { mode: 'preview' as const, limit: PREVIEW_LIMIT, signal: controller.signal }

    const previews: Record<DatasetType, DatasetPreview | null> = {
      config: null,
      securityHub: null,
      cloudtrail: null,
      entraUsers: null
    }
    const datasetErrors: Partial<Record<DatasetType, string>> = {}

    const run = async <T extends object>(
      type: DatasetType,
      label: 'config' | 'securityHub' | 'cloudtrail' | 'entraUsers',
      query: () => Promise<DatasetQueryResult<T>>
    ) => {
      try {
        const result = await query()
        const records = result.records.slice(0, PREVIEW_LIMIT).map(record => flattenNestedData(record as Record<string, any>))
        previews[type] = {
          records,
          attributeSchema: buildAttributeSchema(records, label),
          sampleCount: records.length,
          hasMore: result.hasMore,
          truncated: result.truncated,
          totalCount: records.length
        }
      } catch (error: any) {
        logger.error(`[Dataset Preview] ${type} fetch failed`, { error: error.message })
        datasetErrors[type] = error.message || `${type} query failed`
      }
    }

    const tasks: Promise<void>[] = []
    if (config.datasets.config?.enabled) tasks.push(run('config', 'config', () => queryConfigResources(accountIds, config.datasets.config!.filters || {}, options)))
    if (config.datasets.securityHub?.enabled) {
      const filters = { ...(config.datasets.securityHub.filters || {}) }
      if (config.timeRange?.type === 'relative' && config.timeRange.relativeDays && !filters.lookbackDays) filters.lookbackDays = config.timeRange.relativeDays
      tasks.push(run('securityHub', 'securityHub', () => querySecurityHubFindings(accountIds, filters, options)))
    }
    if (config.datasets.cloudtrail?.enabled) {
      const filters = { ...(config.datasets.cloudtrail.filters || {}) }
      if (config.timeRange?.type === 'relative' && config.timeRange.relativeDays && !filters.lookbackDays) filters.lookbackDays = config.timeRange.relativeDays
      if (config.timeRange?.type === 'absolute') {
        filters.startTime ||= config.timeRange.startDate
        filters.endTime ||= config.timeRange.endDate
      }
      tasks.push(run('cloudtrail', 'cloudtrail', () => queryCloudTrailEvents(accountIds, filters, options)))
    }
    if (config.datasets.entraUsers?.enabled) tasks.push(run('entraUsers', 'entraUsers', () => queryEntraUsers(event, accountIds, config.datasets.entraUsers!.filters || {}, options)))
    await Promise.all(tasks)

    const datasetLabels: Record<DatasetType, string> = {
      config: 'Config', securityHub: 'SecurityHub', cloudtrail: 'CloudTrail', entraUsers: 'EntraUsers'
    }
    const previewData = (Object.entries(previews) as Array<[DatasetType, DatasetPreview | null]>).flatMap(([type, preview]) =>
      (preview?.records || []).map(record => ({ ...record, dataset: datasetLabels[type] })))
    const sampleCount = previewData.length
    const hasMore = Object.values(previews).some(preview => preview?.hasMore)
    const failedCount = Object.keys(datasetErrors).length
    const successfulCount = Object.values(previews).filter(Boolean).length
    const status = failedCount > 0 ? (successfulCount > 0 ? 'partial' : 'error') : (sampleCount > 0 ? 'success' : 'empty')

    return sendSuccess(event, {
      status,
      datasets: previews,
      previewData,
      sampleCount,
      hasMore,
      truncated: hasMore,
      errors: datasetErrors,
      // Compatibility aliases intentionally contain sample values only.
      totalRecords: sampleCount,
      previewLimit: PREVIEW_LIMIT,
      estimatedSize: sampleCount * 2048,
      query: {
        accountCount: config.accountScope === 'all' || (!config.accountScope && accountIds.length === 0) ? 'all' : accountIds.length,
        datasetCount: tasks.length
      }
    })
  } catch (error: any) {
    logger.error('[Dataset Preview] Error', { error: error.message, stack: error.stack })
    return errors.serverError(event, error.message || 'Failed to run preview query')
  }
})
