/**
 * API Endpoint: POST /api/dataset-reports/preview
 *
 * Runs a dataset query and returns preview data (limited results)
 * Used for testing queries before saving/scheduling them
 *
 * Returns attributeSchema with each dataset for proper column rendering
 */

import { defineEventHandler, readBody } from 'h3'
import { sendSuccess, errors } from '../../utils/api-response'
import { getConfigResources } from '../../utils/aws-config-data'
import { getSecurityHubFindings } from '../../utils/security-hub-data'
import { getCloudTrailEvents } from '../../utils/cloudtrail-data'
import { getEntraUsers } from '../../utils/entra-users-data'
import { logger } from '../../utils/logger'
import { buildAttributeSchema, flattenNestedData } from '../../utils/dataset-schema-builder'
import type { DatasetReportConfig } from '../../../shared/types/dataset-reports'

interface PreviewRequest {
  accountIds: string[]
  reportConfig: DatasetReportConfig
}

/**
 * Dataset preview result with records and schema
 */
interface DatasetPreview {
  records: Record<string, any>[]
  attributeSchema: ReturnType<typeof buildAttributeSchema>
  totalCount: number
}

export default defineEventHandler(async (event) => {
  try {
    // Verify authentication
    const auth = event.context.auth
    if (!auth || !auth.isAuthenticated) {
      return errors.unauthorized(event, 'Authentication required')
    }

    const body = await readBody<PreviewRequest>(event)
    const { accountIds, reportConfig } = body

    if (!reportConfig || !reportConfig.datasets) {
      return errors.badRequest(event, 'Missing report configuration')
    }

    logger.info('[Dataset Preview] Starting query', {
      accountIds: accountIds?.length || 'all',
      datasets: Object.keys(reportConfig.datasets).filter(k => reportConfig.datasets[k as keyof typeof reportConfig.datasets].enabled)
    })

    // Track preview results by dataset type with schemas
    const datasetPreviews: {
      config: DatasetPreview | null
      securityHub: DatasetPreview | null
      cloudtrail: DatasetPreview | null
      entraUsers: DatasetPreview | null
    } = {
      config: null,
      securityHub: null,
      cloudtrail: null,
      entraUsers: null
    }

    let totalRecords = 0

    // Fetch Config data if enabled
    if (reportConfig.datasets.config?.enabled) {
      try {
        const configData = await getConfigResources(
          accountIds || [],
          reportConfig.datasets.config.filters || {}
        )
        // Limit preview to 100 records per dataset
        const previewRecords = configData.slice(0, 100).map(r => flattenNestedData(r))
        const attributeSchema = buildAttributeSchema(previewRecords, 'config')

        datasetPreviews.config = {
          records: previewRecords,
          attributeSchema,
          totalCount: configData.length
        }
        totalRecords += configData.length
      } catch (error: any) {
        logger.error('[Dataset Preview] Config fetch failed', { error: error.message })
      }
    }

    // Fetch Security Hub data if enabled
    if (reportConfig.datasets.securityHub?.enabled) {
      try {
        const securityHubData = await getSecurityHubFindings(
          accountIds || [],
          reportConfig.datasets.securityHub.filters || {}
        )
        // Limit preview to 100 records per dataset
        const previewRecords = securityHubData.slice(0, 100).map(r => flattenNestedData(r))
        const attributeSchema = buildAttributeSchema(previewRecords, 'securityHub')

        datasetPreviews.securityHub = {
          records: previewRecords,
          attributeSchema,
          totalCount: securityHubData.length
        }
        totalRecords += securityHubData.length
      } catch (error: any) {
        logger.error('[Dataset Preview] SecurityHub fetch failed', { error: error.message })
      }
    }

    // Fetch CloudTrail data if enabled
    if (reportConfig.datasets.cloudtrail?.enabled) {
      try {
        const cloudTrailData = await getCloudTrailEvents(
          accountIds || [],
          reportConfig.datasets.cloudtrail.filters || {}
        )
        // Limit preview to 100 records per dataset
        const previewRecords = cloudTrailData.slice(0, 100).map(r => flattenNestedData(r))
        const attributeSchema = buildAttributeSchema(previewRecords, 'cloudtrail')

        datasetPreviews.cloudtrail = {
          records: previewRecords,
          attributeSchema,
          totalCount: cloudTrailData.length
        }
        totalRecords += cloudTrailData.length
      } catch (error: any) {
        logger.error('[Dataset Preview] CloudTrail fetch failed', { error: error.message })
      }
    }

    // Fetch Entra Users data if enabled
    if (reportConfig.datasets.entraUsers?.enabled) {
      try {
        const entraUsersData = await getEntraUsers(
          event,  // Pass H3Event for session token (Graph API auth)
          accountIds || [],
          reportConfig.datasets.entraUsers.filters || {}
        )
        // Limit preview to 100 records per dataset
        const previewRecords = entraUsersData.slice(0, 100).map(r => flattenNestedData(r))
        const attributeSchema = buildAttributeSchema(previewRecords, 'entraUsers')

        datasetPreviews.entraUsers = {
          records: previewRecords,
          attributeSchema,
          totalCount: entraUsersData.length
        }
        totalRecords += entraUsersData.length
      } catch (error: any) {
        logger.error('[Dataset Preview] Entra Users fetch failed', { error: error.message })
        // Non-fatal - continue with other datasets
      }
    }

    // Calculate estimated size (rough estimate: 2KB per record)
    const estimatedSizeBytes = totalRecords * 2048
    const estimatedSizeMB = estimatedSizeBytes / (1024 * 1024)

    // Build combined preview data for backwards compatibility
    const previewData: any[] = []

    if (datasetPreviews.config) {
      previewData.push(...datasetPreviews.config.records.map(r => ({
        ...r,
        dataset: 'Config'
      })))
    }
    if (datasetPreviews.securityHub) {
      previewData.push(...datasetPreviews.securityHub.records.map(r => ({
        ...r,
        dataset: 'SecurityHub'
      })))
    }
    if (datasetPreviews.cloudtrail) {
      previewData.push(...datasetPreviews.cloudtrail.records.map(r => ({
        ...r,
        dataset: 'CloudTrail'
      })))
    }
    if (datasetPreviews.entraUsers) {
      previewData.push(...datasetPreviews.entraUsers.records.map(r => ({
        ...r,
        dataset: 'EntraUsers'
      })))
    }

    logger.info('[Dataset Preview] Query complete', {
      previewRecords: previewData.length,
      totalRecords,
      estimatedSizeMB: estimatedSizeMB.toFixed(2)
    })

    return sendSuccess(event, {
      // Primary response: dataset-specific previews with schemas
      datasets: datasetPreviews,
      // Backwards compatible combined data
      previewData,
      totalRecords,
      previewLimit: previewData.length,
      estimatedSize: estimatedSizeBytes,
      query: {
        accountCount: accountIds?.length || 'all',
        datasetCount: Object.values(reportConfig.datasets).filter((ds: any) => ds?.enabled).length
      }
    })

  } catch (error: any) {
    logger.error('[Dataset Preview] Error', { error: error.message, stack: error.stack })
    return errors.serverError(event, error.message || 'Failed to run preview query')
  }
})
