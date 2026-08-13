import { BedrockAgentRuntimeClient, RetrieveCommand } from '@aws-sdk/client-bedrock-agent-runtime'
import { getClient } from '../lib/aws-client-factory'

export interface SupportKnowledgeBaseConfig {
  name: string
  knowledgeBaseId: string
  accountId: string
  region: string
  environment: 'commercial' | 'govcloud'
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
