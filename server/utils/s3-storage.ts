/**
 * Generic S3 Storage Service
 * Reusable S3 utilities for the entire application
 * Supports uploads, downloads, presigned URLs, and object management
 */

import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { getS3Client } from '../lib/aws-client-factory'
import { logger } from './logger'

/**
 * Upload options for S3
 */
export interface UploadOptions {
  key: string                         // Full S3 key path (e.g., "reports/shared/user@example.com/123/report.pdf")
  buffer: Buffer                      // File content as buffer
  contentType: string                 // MIME type (e.g., "application/pdf")
  metadata?: Record<string, string>   // Custom metadata
  expiresInDays?: number             // Optional: for lifecycle policies
  signal?: AbortSignal
}

/**
 * Presigned URL options
 */
export interface PresignedUrlOptions {
  key: string                         // S3 object key
  expiresInSeconds?: number          // Default: 30 days (from env)
}

/**
 * Upload result
 */
export interface S3UploadResult {
  success: boolean
  key: string
  bucket: string
  size: number
  etag?: string
  error?: string
}

/**
 * List objects result
 */
export interface S3ListResult {
  objects: Array<{
    key: string
    size: number
    lastModified: Date
  }>
  nextToken?: string
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  const bucket = getBucketName()
  const s3Client = await getS3Client('govcloud', getRegion(), deploymentAccountId)
  const response = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  if (!response.Body) throw new Error(`S3 object ${key} has no body`)
  return Buffer.from(await response.Body.transformToByteArray())
}

/**
 * Get S3 bucket name from environment
 */
function getBucketName(): string {
  const bucket = process.env.AWS_S3_STORAGE_BUCKET
  if (!bucket) {
    throw new Error('AWS_S3_STORAGE_BUCKET environment variable is not set')
  }
  return bucket
}

/**
 * Get S3 region from environment
 */
function getRegion(): string {
  return process.env.AWS_S3_STORAGE_REGION || 'us-gov-west-1'
}

/**
 * Get default presigned URL expiration in seconds
 * AWS Signature v4 presigned URLs have a maximum expiration of 7 days
 */
function getDefaultPresignedExpiration(): number {
  const days = parseInt(process.env.S3_PRESIGNED_URL_EXPIRES_DAYS || '7', 10)
  const maxDays = 7 // AWS SigV4 limit
  const actualDays = Math.min(days, maxDays)
  return actualDays * 24 * 60 * 60 // Convert to seconds
}

// Deployment account that owns the storage bucket (same default as site-config)
const deploymentAccountId = process.env.AWS_DEPLOYMENT_ACCOUNT_ID || '461760157232'

/**
 * Upload a file to S3
 */
export async function uploadToS3(options: UploadOptions): Promise<S3UploadResult> {
  try {
    const bucket = getBucketName()
    const region = getRegion()

    logger.info(`Uploading to S3: s3://${bucket}/${options.key}`)

    // Get S3 client for GovCloud with role assumption to deployment account
    const s3Client = await getS3Client('govcloud', region, deploymentAccountId)

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: options.key,
      Body: options.buffer,
      ContentType: options.contentType,
      Metadata: options.metadata || {},
      ServerSideEncryption: 'AES256'
    })

    const response = await s3Client.send(command, { abortSignal: options.signal })

    logger.info(`Successfully uploaded to S3: ${options.key}`)

    return {
      success: true,
      key: options.key,
      bucket,
      size: options.buffer.length,
      etag: response.ETag
    }
  } catch (error: any) {
    logger.error('S3 upload error:', error)
    return {
      success: false,
      key: options.key,
      bucket: process.env.AWS_S3_STORAGE_BUCKET || '',
      size: options.buffer.length,
      error: error.message || 'Unknown S3 upload error'
    }
  }
}

/**
 * Get a presigned download URL for an S3 object
 */
export async function getPresignedDownloadUrl(options: PresignedUrlOptions): Promise<string> {
  try {
    const bucket = getBucketName()
    const region = getRegion()
    const expiresIn = options.expiresInSeconds || getDefaultPresignedExpiration()

    logger.info(`Generating presigned URL for: s3://${bucket}/${options.key}`)

    // Get S3 client for GovCloud with role assumption to deployment account
    const s3Client = await getS3Client('govcloud', region, deploymentAccountId)

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: options.key
    })

    const url = await getSignedUrl(s3Client, command, { expiresIn })

    logger.info(`Generated presigned URL (expires in ${expiresIn}s)`)

    return url
  } catch (error: any) {
    logger.error('Error generating presigned URL:', error)
    throw new Error(`Failed to generate presigned URL: ${error.message}`)
  }
}

/**
 * Delete an object from S3
 */
export async function deleteFromS3(key: string): Promise<{ success: boolean; error?: string }> {
  try {
    const bucket = getBucketName()
    const region = getRegion()

    logger.info(`Deleting from S3: s3://${bucket}/${key}`)

    // Get S3 client for GovCloud with role assumption to deployment account
    const s3Client = await getS3Client('govcloud', region, deploymentAccountId)

    const command = new DeleteObjectCommand({
      Bucket: bucket,
      Key: key
    })

    await s3Client.send(command)

    logger.info(`Successfully deleted from S3: ${key}`)

    return { success: true }
  } catch (error: any) {
    logger.error('S3 delete error:', error)
    return {
      success: false,
      error: error.message || 'Unknown S3 delete error'
    }
  }
}

/**
 * List objects by prefix
 */
export async function listObjectsByPrefix(
  prefix: string,
  maxKeys: number = 100,
  continuationToken?: string
): Promise<S3ListResult> {
  try {
    const bucket = getBucketName()
    const region = getRegion()

    // Get S3 client for GovCloud with role assumption to deployment account
    const s3Client = await getS3Client('govcloud', region, deploymentAccountId)

    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      MaxKeys: maxKeys,
      ContinuationToken: continuationToken
    })

    const response = await s3Client.send(command)

    const objects = (response.Contents || []).map(obj => ({
      key: obj.Key || '',
      size: obj.Size || 0,
      lastModified: obj.LastModified || new Date()
    }))

    return {
      objects,
      nextToken: response.NextContinuationToken
    }
  } catch (error: any) {
    // An empty list would read as "no reports stored"
    logger.error('Error listing S3 objects:', error)
    throw new Error(`Failed to list S3 objects under ${prefix}: ${error.message}`)
  }
}
