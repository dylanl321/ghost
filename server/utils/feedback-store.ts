/**
 * Shared DynamoDB access for the feedback table (/api/feedback/*).
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { assumeChildAccountRole } from './credentials/awsAccountCredentials'

export const FEEDBACK_TABLE = process.env.FEEDBACK_TABLE || 'ghost_feedback'
export const FEEDBACK_TYPES = ['Issue', 'Feature Request', 'General Feedback'] as const
export const MAX_FEEDBACK_LENGTH = 5000

const REGION = process.env.AWS_GOVCLOUD_REGION || 'us-gov-west-1'
const DEPLOYMENT_ACCOUNT_ID = process.env.AWS_DEPLOYMENT_ACCOUNT_ID || '461760157232'

export async function getFeedbackClient(): Promise<DynamoDBDocumentClient> {
  const credentials = await assumeChildAccountRole('govcloud', DEPLOYMENT_ACCOUNT_ID)
  return DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION, credentials }))
}
