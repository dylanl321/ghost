/**
 * API Endpoint: POST /api/dataset-reports/preview
 *
 * Runs a dataset query and returns preview data (limited results)
 * Used for testing queries before saving/scheduling them
 */

import { defineEventHandler, readBody } from 'h3'
import { sendSuccess, errors } from '../../utils/api-response'
import { getConfigResources } from '../../utils/aws-config-data'
import { getSecurityHubFindings } from '../../utils/security-hub-data'
import { getCloudTrailEvents } from '../../utils/cloudtrail-data'
import { logger } from '../../utils/logger'
import type { DatasetReportConfig } from '../../../shared/types/dataset-reports'

interface PreviewRequest {
  accountIds: string[]
  reportConfig: DatasetReportConfig
}

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<PreviewRequest>(event)
    const { accountIds, reportConfig } = body

    if (!reportConfig || !reportConfig.datasets) {
      return errors.badRequest(event, 'Missing report configuration')
    }

    logger.info('[Dataset Preview] Starting query', {
      accountIds: accountIds?.length || 'all',
      datasets: Object.keys(reportConfig.datasets).filter(k => reportConfig.datasets[k as keyof typeof reportConfig.datasets].enabled)
    })

    const results: any[] = []
    let totalRecords = 0

    // Fetch Config data if enabled
    if (reportConfig.datasets.config?.enabled) {
      try {
        const configData = await getConfigResources(
          accountIds || [],
          reportConfig.datasets.config.filters || {}
        )
        // Limit preview to 100 records per dataset
        const previewData = configData.slice(0, 100)
        results.push(...previewData.map(item => ({
          dataset: 'Config',
          accountId: item.accountId,
          accountName: item.accountName,
          resource: `${item.resourceType}: ${item.resourceName || item.resourceId}`,
          details: item.complianceStatus
            ? `Compliance: ${item.complianceStatus}${item.configRuleName ? ` (${item.configRuleName})` : ''}`
            : item.resourceType,
          timestamp: item.configurationItemCaptureTime || '',
          resourceType: item.resourceType,
          region: item.region
        })))
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
        const previewData = securityHubData.slice(0, 100)
        results.push(...previewData.map(item => ({
          dataset: 'SecurityHub',
          accountId: item.accountId,
          accountName: item.accountName,
          resource: item.title,
          details: `${item.severity} - ${item.productName}`,
          timestamp: item.createdAt || '',
          resourceType: item.resourceType,
          region: item.region,
          severity: item.severity
        })))
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
        const previewData = cloudTrailData.slice(0, 100)
        results.push(...previewData.map(item => ({
          dataset: 'CloudTrail',
          accountId: item.accountId,
          accountName: item.accountName,
          resource: `${item.eventName} by ${item.userIdentityUserName || item.userIdentityType}`,
          details: item.errorCode ? `Error: ${item.errorCode}` : item.eventSource,
          timestamp: item.eventTime || '',
          resourceType: item.eventType,
          region: item.region
        })))
        totalRecords += cloudTrailData.length
      } catch (error: any) {
        logger.error('[Dataset Preview] CloudTrail fetch failed', { error: error.message })
      }
    }

    // Sort by timestamp descending
    results.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime()
      const timeB = new Date(b.timestamp).getTime()
      return timeB - timeA
    })

    // Calculate estimated size (rough estimate: 2KB per record)
    const estimatedSizeBytes = totalRecords * 2048
    const estimatedSizeMB = estimatedSizeBytes / (1024 * 1024)

    logger.info('[Dataset Preview] Query complete', {
      previewRecords: results.length,
      totalRecords,
      estimatedSizeMB: estimatedSizeMB.toFixed(2)
    })

    return sendSuccess(event, {
      previewData: results,
      totalRecords,
      previewLimit: results.length,
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
