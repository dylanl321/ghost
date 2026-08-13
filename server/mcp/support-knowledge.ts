import { BedrockAgentRuntimeClient, RetrieveAndGenerateCommand, RetrieveCommand } from '@aws-sdk/client-bedrock-agent-runtime'
import { getClient } from '../lib/aws-client-factory'

export interface SupportKnowledgeBaseConfig {
  name: string
  knowledgeBaseId: string
  accountId: string
  region: string
  environment: 'commercial' | 'govcloud'
}

export interface SupportKnowledgeAnswer {
  answer: string
  citations: Array<{ text?: string; sources: Array<{ content: string; source?: string; metadata?: Record<string, unknown> }> }>
  retrievedPassages: Array<{ content: string; score?: number; source?: string; documentId?: string; metadata?: Record<string, unknown> }>
  sessionId?: string
  guardrailAction?: string
}

function normalizeAccountId(value: string): string {
  return value.replace(/\D/g, '')
}

export function getSupportKnowledgeBaseConfig(): SupportKnowledgeBaseConfig {
  const accountId = normalizeAccountId(process.env.GHOST_SUPPORT_KNOWLEDGE_BASE_ACCOUNT_ID || '9261-8219-4632')
  const isGovCloudDocs = accountId === '926182194632'
  const environment = isGovCloudDocs
    ? 'govcloud'
    : process.env.GHOST_SUPPORT_KNOWLEDGE_BASE_ENVIRONMENT === 'commercial' ? 'commercial' : 'govcloud'
  return {
    name: process.env.GHOST_SUPPORT_KNOWLEDGE_BASE_NAME || 'isgddocs-knowledge-base',
    knowledgeBaseId: process.env.GHOST_SUPPORT_KNOWLEDGE_BASE_ID || 'MWEQITO53C',
    accountId,
    region: isGovCloudDocs ? 'us-gov-west-1' : process.env.GHOST_SUPPORT_KNOWLEDGE_BASE_REGION || (environment === 'govcloud' ? 'us-gov-west-1' : 'us-east-1'),
    environment
  }
}

function sourceLocation(location: any): string | undefined {
  return location?.s3Location?.uri || location?.webLocation?.url || location?.confluenceLocation?.url ||
    location?.sharePointLocation?.url || location?.oneDriveLocation?.url || location?.googleDriveLocation?.url ||
    location?.kendraDocumentLocation?.uri || location?.customDocumentLocation?.id
}

function retrievedReference(reference: any) {
  return {
    content: reference?.content?.text || '',
    source: sourceLocation(reference?.location),
    metadata: reference?.metadata as Record<string, unknown> | undefined
  }
}

export async function searchSupportKnowledgeBase(query: string, maxResults = 5, nextToken?: string) {
  const config = getSupportKnowledgeBaseConfig()
  const client = await getClient<BedrockAgentRuntimeClient>(
    config.environment,
    'bedrock-agent-runtime',
    config.region,
    config.accountId
  )
  const response = await client.send(new RetrieveCommand({
    knowledgeBaseId: config.knowledgeBaseId,
    retrievalQuery: { text: query },
    retrievalConfiguration: { vectorSearchConfiguration: { numberOfResults: maxResults } },
    nextToken
  }))

  return {
    knowledgeBase: { name: config.name, id: config.knowledgeBaseId },
    guardrailAction: response.guardrailAction,
    results: (response.retrievalResults || []).map(result => ({
      content: result.content?.text || '',
      score: result.score,
      source: sourceLocation(result.location),
      documentId: result.documentId,
      metadata: result.metadata
    })),
    nextToken: response.nextToken
  }
}

/**
 * Keeps answer generation inside the same GovCloud knowledge-base boundary as raw retrieval.
 * Retrieve is intentionally performed as well because Bedrock citations do not include scores.
 */
export async function answerSupportKnowledgeBase(query: string, maxResults = 5, sessionId?: string): Promise<SupportKnowledgeAnswer> {
  const config = getSupportKnowledgeBaseConfig()
  const modelArn = process.env.GHOST_SUPPORT_KNOWLEDGE_BASE_MODEL_ARN
  if (!modelArn) {
    const error = new Error('GHOST_SUPPORT_KNOWLEDGE_BASE_MODEL_ARN must be configured for ghost.docs.answer.')
    error.name = 'KNOWLEDGE_BASE_MODEL_NOT_CONFIGURED'
    throw error
  }

  const client = await getClient<BedrockAgentRuntimeClient>(
    config.environment,
    'bedrock-agent-runtime',
    config.region,
    config.accountId
  )
  const [retrieval, generated] = await Promise.all([
    client.send(new RetrieveCommand({
      knowledgeBaseId: config.knowledgeBaseId,
      retrievalQuery: { text: query },
      retrievalConfiguration: { vectorSearchConfiguration: { numberOfResults: maxResults } }
    })),
    client.send(new RetrieveAndGenerateCommand({
      ...(sessionId ? { sessionId } : {}),
      input: { text: query },
      retrieveAndGenerateConfiguration: {
        type: 'KNOWLEDGE_BASE',
        knowledgeBaseConfiguration: {
          knowledgeBaseId: config.knowledgeBaseId,
          modelArn,
          retrievalConfiguration: { vectorSearchConfiguration: { numberOfResults: maxResults } }
        }
      }
    }))
  ])

  return {
    answer: generated.output?.text || '',
    citations: (generated.citations || []).map(citation => ({
      text: citation.generatedResponsePart?.textResponsePart?.text,
      sources: (citation.retrievedReferences || []).map(retrievedReference)
    })),
    retrievedPassages: (retrieval.retrievalResults || []).map(result => ({
      content: result.content?.text || '',
      score: result.score,
      source: sourceLocation(result.location),
      documentId: result.documentId,
      metadata: result.metadata as Record<string, unknown> | undefined
    })),
    sessionId: generated.sessionId,
    guardrailAction: generated.guardrailAction
  }
}
