import type { KiroCrewHealth, KiroCrewHealthCheck } from '../../shared/types/kirocrew-health'
import type { KiroCrewRevision } from './types'
import type { KiroCrewPayloadHead } from './payload'
import { bootstrapFromRevision } from './service'
import { validateKiroCrewRecords } from './schema'
import { validateCollaborationSection } from './collaboration/profile'

export interface KiroCrewHealthDependencies {
  current(): Promise<KiroCrewRevision | null>
  durableConfiguration(): boolean
  payloadHead(revision: number): Promise<KiroCrewPayloadHead | null>
  durablePayload(): boolean
  payloadSizeCap(): number
  runtimeInstalled(): boolean
}

// Coalesce concurrent admin refreshes so an unavailable provider cannot build up
// new requests after each HTTP timeout. Underlying SDK calls keep their own limits.
export function createKiroCrewHealthReader(
  dependencies: KiroCrewHealthDependencies,
  timeoutMs = 5000
): () => Promise<KiroCrewHealth> {
  let inFlight: Promise<KiroCrewHealth> | undefined
  return async () => {
    if (!inFlight) {
      inFlight = inspectHealth(dependencies).catch(() => unavailableHealth()).finally(() => { inFlight = undefined })
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        inFlight,
        new Promise<KiroCrewHealth>(resolve => {
          timer = setTimeout(() => resolve(unavailableHealth()), timeoutMs)
        })
      ])
    } finally {
      clearTimeout(timer)
    }
  }
}

function initialHealth(): KiroCrewHealth {
  return {
    checkedAt: new Date().toISOString(),
    configuration: 'attention',
    collaboration: 'unknown',
    revision: null,
    publishedAt: null,
    profile: null,
    checks: []
  }
}

function unavailableHealth(): KiroCrewHealth {
  const health = initialHealth()
  health.configuration = 'unavailable'
  health.checks.push({
    id: 'health-observation', label: 'Health observation', state: 'unavailable',
    detail: 'The health check could not finish. Retry after checking service connectivity and permissions.'
  })
  return health
}

async function inspectHealth(dependencies: KiroCrewHealthDependencies): Promise<KiroCrewHealth> {
  const health = initialHealth()
  const check = (id: KiroCrewHealthCheck['id'], label: string, state: KiroCrewHealthCheck['state'], detail: string) => {
    health.checks.push({ id, label, state, detail })
  }
  let revision: KiroCrewRevision | null
  try {
    revision = await dependencies.current()
    check('configuration-store', 'Configuration storage', dependencies.durableConfiguration() ? 'ok' : 'unverified',
      dependencies.durableConfiguration()
        ? 'The current revision was read from persistent storage.'
        : 'This process uses development memory storage. Persistence across restarts is not established.')
  } catch {
    return unavailableHealth()
  }

  let bootstrap: ReturnType<typeof bootstrapFromRevision> | undefined
  if (!revision) {
    check('published-profile', 'Published profile', 'missing', 'No revision is published. An administrator must publish the organization document.')
  } else {
    try {
      if (!Number.isSafeInteger(revision.revision) || revision.revision < 1) throw new Error('Invalid revision')
      validateKiroCrewRecords(revision.records)
      bootstrap = bootstrapFromRevision(revision)
      const organization = revision.records.find(record => record.name === 'kirocrew.organization')
      const profile = validateCollaborationSection(organization?.type === 'setting' ? organization.value : undefined)
      health.revision = revision.revision
      health.publishedAt = Number.isFinite(Date.parse(revision.updatedAt)) ? new Date(revision.updatedAt).toISOString() : null
      health.profile = {
        enabled: profile.enabled,
        spaces: profile.teamSpaces.length,
        enabledSpaces: profile.enabled ? profile.teamSpaces.filter(space => space.enabled).length : 0,
        sourceBindings: profile.sourceBindings.length,
        evidencePolicies: profile.evidencePolicies.length,
        workflowVersions: profile.workflowProfiles.length
      }
      check('published-profile', 'Published profile', 'ok', 'The current bootstrap and collaboration definitions passed validation.')
    } catch {
      bootstrap = undefined
      check('published-profile', 'Published profile', 'unavailable', 'The current revision is invalid. Publish a corrected organization document.')
    }
  }

  if (!bootstrap?.payload) {
    check('installer-payload', 'Installer payload', 'missing', 'No validated installer payload descriptor is published.')
  } else {
    try {
      const expected = bootstrap.payload
      const head = await dependencies.payloadHead(expected.revision)
      const matches = head && head.revision === expected.revision &&
        head.sizeBytes === expected.sizeBytes &&
        head.sizeBytes <= dependencies.payloadSizeCap() &&
        head.sha256.toLowerCase() === expected.sha256.toLowerCase()
      check('installer-payload', 'Installer payload',
        !matches ? 'unavailable' : dependencies.durablePayload() ? 'ok' : 'unverified',
        !matches
          ? 'The published payload is missing or its stored metadata does not match the descriptor.'
          : dependencies.durablePayload()
            ? 'Stored size and checksum metadata match the descriptor. Payload contents were not downloaded or verified.'
            : 'Payload metadata matches in development memory storage. Durable delivery is not verified.')
    } catch {
      check('installer-payload', 'Installer payload', 'unavailable', 'Payload metadata could not be read. Check storage permissions and connectivity.')
    }
  }

  const enabled = health.profile?.enabled === true && health.profile.enabledSpaces > 0
  const runtimeInstalled = dependencies.runtimeInstalled()
  health.collaboration = !health.profile ? 'not-ready' : !enabled ? 'disabled' : runtimeInstalled ? 'unverified' : 'not-ready'
  check('collaboration-runtime', 'Collaboration API runtime',
    runtimeInstalled ? 'unverified' : 'missing',
    runtimeInstalled
        ? 'A runtime is installed. Live storage, current membership authorization and end-to-end operations have not been verified by this check.'
        : 'Routes exist, but this process has no connected collaboration runtime. Publishing enablement alone cannot make them ready.')
  check('lifecycle-workers', 'Artifact cleanup and deletion workers', 'unverified',
    'No durable worker heartbeat or completion telemetry is connected to this health check.')
  check('pilot-acceptance', 'Pilot acceptance', 'unverified',
    'No verified workstation acceptance evidence is connected. This health check does not authorize enablement.')

  const configurationChecks = health.checks.slice(0, 3)
  health.configuration = configurationChecks.every(row => row.state === 'ok') ? 'healthy' : 'attention'
  health.checkedAt = new Date().toISOString()
  return health
}
