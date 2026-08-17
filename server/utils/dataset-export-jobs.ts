import { v4 as uuidv4 } from 'uuid'
import type { DatasetExportJob, DatasetReportConfig } from '../../shared/types/dataset-reports'
import { getItem, putItem, queryItems, updateItem } from './dynamodb'
import { getTableAccountId, getTableEnvironment, getTableName } from '../lib/dynamodb-config'
import { enqueueDatasetExportJob } from './dataset-export-job-queue'
import { StopQueryExecutionCommand } from '@aws-sdk/client-athena'
import { getAthenaClient } from '../lib/aws-client-factory'
import { getEnvironmentConfig } from './security-lake-consolidated'
import { deleteFromS3 } from './s3-storage'

const TTL_HOURS = 24

async function table() {
  return {
    tableName: await getTableName('datasetExportJobs'),
    environment: await getTableEnvironment('datasetExportJobs'),
    accountId: await getTableAccountId('datasetExportJobs')
  }
}

export async function createDatasetExportJob(userId: string, reportConfig: DatasetReportConfig): Promise<DatasetExportJob> {
  const now = new Date().toISOString()
  const job: DatasetExportJob = {
    jobId: uuidv4(), userId, status: 'queued', phase: 'Queued', progressPercent: 0,
    reportConfig, datasetCounts: {}, cancelRequested: false, activeAthenaQueryIds: [],
    createdAt: now, lastUpdated: now, ttl: Math.floor(Date.now() / 1000) + TTL_HOURS * 3600
  }
  const config = await table()
  await putItem(config.tableName, job, config.environment, config.accountId)
  try {
    await enqueueDatasetExportJob(job.jobId)
  } catch (error: any) {
    await updateDatasetExportJob(job.jobId, { status: 'error', phase: 'Queue failed', errorMessage: error.message, completedAt: new Date().toISOString() })
    throw error
  }
  return job
}

export async function getDatasetExportJob(jobId: string, userId?: string): Promise<DatasetExportJob | null> {
  const config = await table()
  const job = await getItem(config.tableName, { jobId }, config.environment, config.accountId) as DatasetExportJob | null
  return !job || (userId && job.userId !== userId) ? null : job
}

export async function updateDatasetExportJob(jobId: string, updates: Partial<DatasetExportJob>): Promise<DatasetExportJob | null> {
  const config = await table()
  return await updateItem(config.tableName, { jobId }, { ...updates, lastUpdated: new Date().toISOString() }, config.environment, config.accountId) as DatasetExportJob | null
}

export async function listDatasetExportJobs(userId: string): Promise<DatasetExportJob[]> {
  const config = await table()
  const result = await queryItems({
    tableName: config.tableName, indexName: 'UserIdIndex', queryExpression: 'userId = :userId',
    expressionAttributeValues: { ':userId': userId }, limit: 50, scanIndexForward: false
  }, config.environment, config.accountId)
  return result.items as DatasetExportJob[]
}

export async function cancelDatasetExportJob(jobId: string, userId: string): Promise<boolean> {
  const job = await getDatasetExportJob(jobId, userId)
  if (!job || ['complete', 'error', 'canceled'].includes(job.status)) return false
  await updateDatasetExportJob(jobId, {
    cancelRequested: true, status: 'canceled', phase: 'Canceled', progressPercent: job.progressPercent,
    errorMessage: 'Canceled by user', completedAt: new Date().toISOString()
  })
  return true
}

export async function failStaleDatasetExportJobs(maxAgeMinutes = 20): Promise<number> {
  const config = await table()
  const result = await queryItems({
    tableName: config.tableName, indexName: 'StatusIndex', queryExpression: '#status = :status',
    expressionAttributeNames: { '#status': 'status' }, expressionAttributeValues: { ':status': 'running' }, limit: 100
  }, config.environment, config.accountId)
  const cutoff = Date.now() - maxAgeMinutes * 60_000
  let failed = 0
  for (const job of result.items as DatasetExportJob[]) {
    if (Date.parse(job.heartbeatAt || job.lastUpdated) < cutoff) {
      const environment = (process.env.AWS_CLOUDTRAIL_ENVIRONMENT as 'commercial' | 'govcloud') || 'govcloud'
      if (job.activeAthenaQueryIds?.length) {
        const lake = getEnvironmentConfig(environment)
        const region = environment === 'govcloud' ? 'us-gov-west-1' : 'us-east-1'
        const client = await getAthenaClient(environment, region, lake.monitoringAccountId)
        await Promise.all(job.activeAthenaQueryIds.map(queryExecutionId =>
          client.send(new StopQueryExecutionCommand({ QueryExecutionId: queryExecutionId })).catch(() => undefined)))
      }
      if (job.s3Key) await deleteFromS3(job.s3Key)
      await updateDatasetExportJob(job.jobId, { status: 'error', phase: 'Worker interrupted', errorMessage: 'The export worker stopped before completion.', completedAt: new Date().toISOString() })
      failed++
    }
  }
  return failed
}
