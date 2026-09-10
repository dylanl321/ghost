import { createHash } from 'node:crypto'
import { createError } from 'h3'
import { getKiroCrewRepository, KiroCrewRevisionConflict } from './repository'
import { bootstrapValueSchema, parseKiroCrewPublishInput, validateKiroCrewRecords } from './schema'
import type { KiroCrewPublishInput, KiroCrewRecord, KiroCrewRevision } from './types'

export function revisionEtag(revision: KiroCrewRevision, kind: 'bootstrap' | 'config'): string {
  const hash = createHash('sha256')
    .update(JSON.stringify(kind === 'config' ? revision.records : bootstrapFromRevision(revision)))
    .digest('hex')
    .slice(0, 16)
  return `"kirocrew-${kind}-r${revision.revision}-${hash}"`
}

export function bootstrapFromRevision(revision: KiroCrewRevision) {
  const record = revision.records.find(candidate => candidate.name === 'kirocrew.bootstrap')
  if (!record || record.type !== 'setting') throw new Error('published revision has no bootstrap record')
  const value = bootstrapValueSchema.parse(record.value)
  return {
    schemaVersion: 1 as const,
    revision: revision.revision,
    updatedAt: revision.updatedAt,
    ...value
  }
}

export function redactRevision(revision: KiroCrewRevision) {
  return {
    ...revision,
    records: revision.records.map(record => record.type === 'secret'
      ? {
          name: record.name,
          type: record.type,
          ...(record.mediaType ? { mediaType: record.mediaType } : {}),
          configured: true
        }
      : record)
  }
}

export async function publishKiroCrewRevision(raw: unknown, publishedBy: string) {
  const input = parseKiroCrewPublishInput(raw)
  const repository = getKiroCrewRepository()
  const current = await repository.current()
  const records = resolvePreservedSecrets(input, current)
  const validated = validateKiroCrewRecords(records)
  try {
    return await repository.publish({
      expectedRevision: input.expectedRevision,
      records: validated,
      publishedBy
    })
  } catch (error) {
    if (error instanceof KiroCrewRevisionConflict) {
      throw createError({
        statusCode: 409,
        statusMessage: error.message,
        data: { actualRevision: error.actualRevision }
      })
    }
    throw error
  }
}

function resolvePreservedSecrets(
  input: KiroCrewPublishInput,
  current: KiroCrewRevision | null
): KiroCrewRecord[] {
  const existing = new Map(
    (current?.records || [])
      .filter((record): record is Extract<KiroCrewRecord, { type: 'secret' }> => record.type === 'secret')
      .map(record => [record.name, record])
  )
  return input.records.map(record => {
    if ('preserve' in record) {
      const value = existing.get(record.name)
      if (!value) throw createError({ statusCode: 400, statusMessage: `secret ${record.name} cannot be preserved because it does not exist` })
      return { ...value, ...(record.mediaType ? { mediaType: record.mediaType } : {}) }
    }
    return record
  }) as KiroCrewRecord[]
}
