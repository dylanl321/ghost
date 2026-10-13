import {
  ChangeMessageVisibilityCommand,
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
  type Message
} from '@aws-sdk/client-sqs'

const queueUrl = process.env.DATASET_EXPORT_JOBS_QUEUE_URL
const client = new SQSClient({ region: process.env.AWS_GOVCLOUD_REGION || 'us-gov-west-1', useFipsEndpoint: true })

export const isDatasetExportQueueConfigured = () => Boolean(queueUrl)

export async function enqueueDatasetExportJob(jobId: string) {
  if (!queueUrl) throw new Error('DATASET_EXPORT_JOBS_QUEUE_URL is not configured')
  await client.send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: JSON.stringify({ jobId }) }))
}

export async function receiveDatasetExportJobs(signal?: AbortSignal): Promise<Message[]> {
  if (!queueUrl) return []
  const result = await client.send(new ReceiveMessageCommand({
    QueueUrl: queueUrl,
    MaxNumberOfMessages: 2,
    WaitTimeSeconds: 20,
    VisibilityTimeout: 900,
    MessageSystemAttributeNames: ['ApproximateReceiveCount']
  }), { abortSignal: signal })
  return result.Messages || []
}

export async function deleteDatasetExportMessage(receiptHandle: string) {
  if (queueUrl) await client.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: receiptHandle }))
}

export async function extendDatasetExportVisibility(receiptHandle: string) {
  if (queueUrl) await client.send(new ChangeMessageVisibilityCommand({ QueueUrl: queueUrl, ReceiptHandle: receiptHandle, VisibilityTimeout: 900 }))
}

export async function releaseDatasetExportMessage(receiptHandle: string) {
  if (queueUrl) await client.send(new ChangeMessageVisibilityCommand({ QueueUrl: queueUrl, ReceiptHandle: receiptHandle, VisibilityTimeout: 0 }))
}
