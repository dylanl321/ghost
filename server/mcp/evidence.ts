import { createHash, randomUUID } from 'node:crypto'
import { deleteItem, getItem, putItem, queryItems } from '../utils/dynamodb'
import { deleteFromS3, getObjectBuffer, getPresignedDownloadUrl, uploadToS3 } from '../utils/s3-storage'
import { getMcpEvidenceTableConfig } from './config'
import { buildAccountHealth } from './account-health'

const RETENTION_SECONDS = 90 * 24 * 60 * 60

export const EVIDENCE_DOMAINS = [
  'vulnerabilityPosture', 'securityHubControls', 'configCompliance', 'patchCompliance',
  'proformaBudgetVariance', 'ownershipMetadata', 'pipelineHealth'
] as const
export type EvidenceDomain = typeof EVIDENCE_DOMAINS[number]

export interface EvidenceBundleRecord {
  bundleId: string
  ownerSubject: string
  accountIdentifier: string
  title: string
  domains: EvidenceDomain[]
  createdAt: string
  expiresAt: string
  ttl: number
  hash: string
  jsonKey: string
  markdownKey: string
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>).sort().map(key => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function hashEvidence(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}

function markdown(title: string, evidence: any, hash: string): string {
  const lines = [`# ${title}`, '', `Evidence SHA-256: \`${hash}\``, '', `Generated: ${evidence.generatedAt}`, '', `Account: ${evidence.account.name || evidence.account.commercialAccountId}`, '']
  for (const [name, domain] of Object.entries(evidence.domains)) {
    lines.push(`## ${name}`, '', `Status: ${(domain as any).status}`, '', '```json', JSON.stringify(domain, null, 2), '```', '')
  }
  return lines.join('\n')
}

export async function createEvidenceBundle(input: { ownerSubject: string; accountIdentifier: string; title: string; selectedDomains: EvidenceDomain[]; lookbackDays: number; account: any; environment: 'commercial' | 'govcloud' }) {
  const health = await buildAccountHealth(input.account, input.environment, { lookbackDays: input.lookbackDays })
  const domains = Object.fromEntries(input.selectedDomains.map(domain => [domain, health.domains[domain]]))
  const evidence = { generatedAt: new Date().toISOString(), account: health.account, environment: input.environment, requestedLookbackDays: input.lookbackDays, domains }
  const hash = hashEvidence(evidence)
  const bundleId = randomUUID()
  const prefix = `reports/evidence/${encodeURIComponent(input.ownerSubject)}/${bundleId}`
  const jsonKey = `${prefix}/evidence.json`
  const markdownKey = `${prefix}/evidence.md`
  const [jsonUpload, markdownUpload] = await Promise.all([
    uploadToS3({ key: jsonKey, buffer: Buffer.from(JSON.stringify({ ...evidence, hash }, null, 2)), contentType: 'application/json', metadata: { bundleId, owner: input.ownerSubject, hash } }),
    uploadToS3({ key: markdownKey, buffer: Buffer.from(markdown(input.title, evidence, hash)), contentType: 'text/markdown', metadata: { bundleId, owner: input.ownerSubject, hash } })
  ])
  if (!jsonUpload.success || !markdownUpload.success) {
    await Promise.all([jsonUpload.success ? deleteFromS3(jsonKey) : undefined, markdownUpload.success ? deleteFromS3(markdownKey) : undefined])
    throw new Error(jsonUpload.error || markdownUpload.error || 'Failed to store evidence bundle.')
  }
  const createdAt = new Date().toISOString()
  const record: EvidenceBundleRecord = { bundleId, ownerSubject: input.ownerSubject, accountIdentifier: input.accountIdentifier, title: input.title, domains: input.selectedDomains, createdAt, expiresAt: new Date(Date.now() + RETENTION_SECONDS * 1000).toISOString(), ttl: Math.floor(Date.now() / 1000) + RETENTION_SECONDS, hash, jsonKey, markdownKey }
  const config = getMcpEvidenceTableConfig()
  try {
    await putItem(config.tableName, record, config.environment, config.accountId)
  } catch (error) {
    await Promise.all([deleteFromS3(jsonKey), deleteFromS3(markdownKey)])
    throw error
  }
  return record
}

export async function getEvidenceBundle(bundleId: string, ownerSubject: string, includeContent = false) {
  const config = getMcpEvidenceTableConfig()
  const record = await getItem(config.tableName, { bundleId }, config.environment, config.accountId) as EvidenceBundleRecord | null
  if (!record || record.ownerSubject !== ownerSubject) return null
  if (!includeContent) return record
  return { ...record, evidence: JSON.parse((await getObjectBuffer(record.jsonKey)).toString('utf8')) }
}

export async function listEvidenceBundles(ownerSubject: string, limit = 50) {
  const config = getMcpEvidenceTableConfig()
  const result = await queryItems({ tableName: config.tableName, indexName: 'OwnerCreatedAtIndex', queryExpression: 'ownerSubject = :owner', expressionAttributeValues: { ':owner': ownerSubject }, limit, scanIndexForward: false }, config.environment, config.accountId)
  return result.items as EvidenceBundleRecord[]
}

export async function evidenceDownloadUrl(bundleId: string, ownerSubject: string, format: 'json' | 'markdown') {
  const record = await getEvidenceBundle(bundleId, ownerSubject)
  if (!record) return null
  return { url: await getPresignedDownloadUrl({ key: format === 'json' ? record.jsonKey : record.markdownKey, expiresInSeconds: 300 }), expiresInSeconds: 300 }
}

export async function deleteEvidenceBundle(bundleId: string, ownerSubject: string): Promise<boolean> {
  const record = await getEvidenceBundle(bundleId, ownerSubject)
  if (!record) return false
  await Promise.all([deleteFromS3(record.jsonKey), deleteFromS3(record.markdownKey)])
  const config = getMcpEvidenceTableConfig()
  await deleteItem(config.tableName, { bundleId }, config.environment, config.accountId)
  return true
}
