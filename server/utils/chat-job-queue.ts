import {
  ChangeMessageVisibilityCommand,
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
  type Message
} from '@aws-sdk/client-sqs'

const queueUrl = process.env.CHAT_JOBS_QUEUE_URL
const client = new SQSClient({
  region: process.env.AWS_GOVCLOUD_REGION || 'us-gov-west-1',
  useFipsEndpoint: true
})

export function isChatQueueConfigured(): boolean {
  return !!queueUrl
}

export async function enqueueChatJob(jobId: string): Promise<void> {
  if (!queueUrl) throw new Error('CHAT_JOBS_QUEUE_URL is not configured')
  await client.send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: JSON.stringify({ jobId }) }))
}

export async function receiveChatJobs(signal?: AbortSignal): Promise<Message[]> {
  if (!queueUrl) return []
  const response = await client.send(new ReceiveMessageCommand({
    QueueUrl: queueUrl,
    MaxNumberOfMessages: 2,
    WaitTimeSeconds: 20,
    VisibilityTimeout: 900,
    AttributeNames: ['ApproximateReceiveCount']
  }), { abortSignal: signal })
  return response.Messages || []
}

export async function deleteChatJobMessage(receiptHandle: string): Promise<void> {
  if (!queueUrl) return
  await client.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: receiptHandle }))
}

export async function extendChatJobVisibility(receiptHandle: string): Promise<void> {
  if (!queueUrl) return
  await client.send(new ChangeMessageVisibilityCommand({
    QueueUrl: queueUrl,
    ReceiptHandle: receiptHandle,
    VisibilityTimeout: 900
  }))
}

export async function releaseChatJobMessage(receiptHandle: string): Promise<void> {
  if (!queueUrl) return
  await client.send(new ChangeMessageVisibilityCommand({
    QueueUrl: queueUrl,
    ReceiptHandle: receiptHandle,
    VisibilityTimeout: 0
  }))
}
