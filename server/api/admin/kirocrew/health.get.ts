import { defineEventHandler, setHeader } from 'h3'
import { requireAdmin } from '../../../utils/user-roles'
import { DynamoKiroCrewRepository, getKiroCrewRepository } from '../../../kirocrew/repository'
import { getKiroCrewPayloadStore, getKiroCrewPayloadSizeCap, S3KiroCrewPayloadStore } from '../../../kirocrew/payload'
import { getCollaborationRuntime } from '../../../kirocrew/collaboration/api-runtime'
import { createKiroCrewHealthReader } from '../../../kirocrew/health'
import { registerEndpoint } from '../../../plugins/swagger'

registerEndpoint('/api/admin/kirocrew/health', 'GET', {
  summary: 'Inspect Kiro Crew configuration and collaboration readiness',
  description: 'Admin-only, read-only checks. Returns safe status metadata with no configuration values. A 200 response may describe unavailable dependencies; installed runtime wiring does not prove end-to-end health or pilot acceptance.',
  tags: ['Admin'],
  responses: {
    200: {
      description: 'Current observations; response is never cached',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              checkedAt: { type: 'string', format: 'date-time' },
              configuration: { type: 'string', enum: ['healthy', 'attention', 'unavailable'] },
              collaboration: { type: 'string', enum: ['disabled', 'not-ready', 'unverified', 'unknown'] },
              revision: { type: 'integer', nullable: true },
              publishedAt: { type: 'string', format: 'date-time', nullable: true },
              profile: {
                type: 'object', nullable: true,
                properties: {
                  enabled: { type: 'boolean' },
                  spaces: { type: 'integer' },
                  enabledSpaces: { type: 'integer' },
                  sourceBindings: { type: 'integer' },
                  evidencePolicies: { type: 'integer' },
                  workflowVersions: { type: 'integer' }
                }
              },
              checks: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' }, label: { type: 'string' },
                    state: { type: 'string', enum: ['ok', 'disabled', 'missing', 'unavailable', 'unverified'] },
                    detail: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      }
    },
    401: { description: 'Authentication required' },
    403: { description: 'Administrator access required' }
  }
})

const readHealth = createKiroCrewHealthReader({
  current: () => getKiroCrewRepository().current(),
  durableConfiguration: () => getKiroCrewRepository() instanceof DynamoKiroCrewRepository,
  payloadHead: revision => getKiroCrewPayloadStore().head(revision),
  durablePayload: () => getKiroCrewPayloadStore() instanceof S3KiroCrewPayloadStore,
  payloadSizeCap: getKiroCrewPayloadSizeCap,
  runtimeInstalled: () => getCollaborationRuntime() !== null
})

export default defineEventHandler(async event => {
  setHeader(event, 'Cache-Control', 'no-store')
  await requireAdmin(event)
  return readHealth()
})
