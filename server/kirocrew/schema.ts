import { z } from 'zod'
import type { KiroCrewPublishInput, KiroCrewRecord } from './types'

const namePattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
const mediaType = z.enum(['text/plain', 'application/json', 'application/yaml'])

const settingRecord = z.object({
  name: z.string().regex(namePattern),
  type: z.literal('setting'),
  value: z.unknown()
}).strict()

const fileRecord = z.object({
  name: z.string().regex(namePattern),
  type: z.literal('file'),
  mediaType,
  value: z.string().max(64 * 1024)
}).strict()

const secretRecord = z.object({
  name: z.string().regex(namePattern),
  type: z.literal('secret'),
  mediaType: mediaType.optional(),
  value: z.string().min(1).max(64 * 1024)
}).strict()

const preservedSecretRecord = z.object({
  name: z.string().regex(namePattern),
  type: z.literal('secret'),
  mediaType: mediaType.optional(),
  preserve: z.literal(true)
}).strict()

const productSelection = z.union([
  z.string(),
  z.array(z.string()),
  z.boolean()
])

const policyFlags = {
  locked: z.boolean().optional(),
  auto_remediate: z.boolean().optional(),
  require_operator_confirm: z.boolean().optional()
}

const jiraTeamStandardSchema = z.object({
  schemaVersion: z.literal(1),
  voice: z.literal('first-person-plural'),
  doneWhenPrefixes: z.tuple([
    z.literal('Done when we have'),
    z.literal("Done when we've")
  ]),
  storyPoints: z.object({
    allowed: z.tuple([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5)
    ]),
    splitAbove: z.literal(5)
  }).strict()
}).strict()

export const bootstrapValueSchema = z.object({
  schemaVersion: z.literal(1).optional(),
  install: z.object({
    products: productSelection.optional(),
    channel: z.enum(['stable', 'insider', 'nightly']).optional(),
    login: z.boolean().optional(),
    setup: z.boolean().optional(),
    deviceFlow: z.boolean().optional(),
    identityProvider: z.string().url().optional(),
    region: z.string().min(1).optional(),
    minimumCrewVersion: z.string().regex(/^\d+\.\d+\.\d+$/).optional(),
    license: z.enum(['pro', 'free']).optional()
  }).strict().optional(),
  identityCenter: z.object({
    startUrl: z.string().url(),
    ssoRegion: z.string().min(1),
    lockStartUrl: z.boolean().optional(),
    lockSsoRegion: z.boolean().optional()
  }).strict().optional(),
  crew: z.object({
    port: z.number().int().min(1).max(65535).optional(),
    registries: z.array(z.object({
      name: z.string().min(1),
      repo: z.string().optional(),
      gitUrl: z.string().url().optional(),
      branch: z.string().optional(),
      trust: z.string().optional()
    }).strict()).optional(),
    apps: z.array(z.string().min(1)).optional(),
    appsTrusted: z.boolean().optional(),
    allowThirdPartyApps: z.boolean().optional(),
    injectCertifi: z.boolean().optional(),
    sandboxAllowUnsandboxedExec: z.boolean().optional(),
    agentEnv: z.record(z.string(), z.string()).optional()
  }).strict().optional(),
  tls: z.object({
    gitHosts: z.array(z.string()).optional(),
    caCertPem: z.string().optional(),
    caCerts: z.array(z.string()).optional(),
    caSha256: z.string().regex(/^[A-Fa-f0-9]{64}$/).optional(),
    httpProxy: z.string().optional(),
    httpsProxy: z.string().optional(),
    noProxy: z.string().optional()
  }).strict().optional(),
  provisioning_controls: z.object({
    skills_sync: z.object({
      ...policyFlags,
      repo_url: z.string().url().optional(),
      repo_subpath: z.string().min(1).optional(),
      ref: z.string().min(1).optional(),
      secret_ref: z.string().regex(namePattern).optional()
    }).strict().optional(),
    config_hardening: z.object({
      ...policyFlags,
      keys: z.record(z.string(), z.unknown()).optional()
    }).strict().optional(),
    channel_lockout: z.object({
      ...policyFlags,
      lock_channels: z.array(z.string()).optional(),
      allow_channels: z.array(z.string()).optional()
    }).strict().optional()
  }).strict().optional(),
  payload: z.object({
    revision: z.number().int().min(1),
    uri: z.string().min(1),
    sha256: z.string().regex(/^[A-Fa-f0-9]{64}$/),
    sizeBytes: z.number().int().min(1)
  }).strict().optional()
}).strict()

const forbiddenAlways = /(^|[._-])(aws[_-]?(access[_-]?key|secret|session)|access[_-]?key[_-]?id|secret[_-]?access[_-]?key|session[_-]?token|ghost[._-]?oauth|registration[_-]?access[_-]?token|refresh[_-]?token|authorization[_-]?code)($|[._-])/i
const secretShapedName = /(^|[._-])(password|passwd|api[_-]?key|token|client[_-]?secret|external[_-]?id|private[_-]?key)($|[._-])/i
const pemBody = /-----BEGIN [A-Z0-9 ]+-----/

function inspectValue(value: unknown, path: string, visit: (path: string, value: unknown) => void): void {
  visit(path, value)
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectValue(item, `${path}[${index}]`, visit))
  } else if (value && typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
      inspectValue(child, path ? `${path}.${key}` : key, visit)
    })
  }
}

function validateRecordSafety(record: KiroCrewRecord): void {
  if (forbiddenAlways.test(record.name)) {
    throw new Error(`record ${record.name} uses a prohibited credential name`)
  }
  inspectValue(record.value, record.name, (path, value) => {
    if (forbiddenAlways.test(path)) {
      throw new Error(`record ${record.name} contains prohibited credential field ${path}`)
    }
    if (typeof value === 'string' && pemBody.test(value) && record.name !== 'kirocrew.bootstrap') {
      throw new Error(`record ${record.name} contains a PEM outside the bootstrap trust record`)
    }
    if (record.type !== 'secret' && secretShapedName.test(path)) {
      throw new Error(`record ${record.name} contains secret-shaped field ${path}; publish it as a secret record`)
    }
  })
}

export function validateKiroCrewRecords(input: unknown): KiroCrewRecord[] {
  const records = z.array(z.discriminatedUnion('type', [
    settingRecord,
    fileRecord,
    secretRecord
  ])).max(100).parse(input) as KiroCrewRecord[]
  const names = new Set<string>()
  for (const record of records) {
    if (names.has(record.name)) throw new Error(`duplicate record name: ${record.name}`)
    names.add(record.name)
    validateRecordSafety(record)
  }
  const bootstrap = records.find(record => record.name === 'kirocrew.bootstrap')
  if (!bootstrap || bootstrap.type !== 'setting') {
    throw new Error('kirocrew.bootstrap setting is required')
  }
  bootstrapValueSchema.parse(bootstrap.value)
  const organization = records.find(record => record.name === 'kirocrew.organization')
  if (organization?.type === 'setting') {
    const value = organization.value as Record<string, unknown> | null
    const apps = value && typeof value === 'object'
      ? value.apps as Record<string, unknown> | undefined
      : undefined
    const jira = apps && typeof apps === 'object'
      ? apps['jira-crew'] as Record<string, unknown> | undefined
      : undefined
    const values = jira && typeof jira === 'object'
      ? jira.values as Record<string, unknown> | undefined
      : undefined
    if (values && Object.prototype.hasOwnProperty.call(values, 'teamStandard')) {
      jiraTeamStandardSchema.parse(values.teamStandard)
    }
  }
  if (Buffer.byteLength(JSON.stringify(records), 'utf8') > 256 * 1024) {
    throw new Error('configuration revision exceeds 256 KiB')
  }
  return records.sort((left, right) => left.name.localeCompare(right.name))
}

export function parseKiroCrewPublishInput(input: unknown): KiroCrewPublishInput {
  return z.object({
    expectedRevision: z.number().int().min(0),
    records: z.array(z.union([
      settingRecord,
      fileRecord,
      secretRecord,
      preservedSecretRecord
    ])).max(100)
  }).strict().parse(input) as KiroCrewPublishInput
}
