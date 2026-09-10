import { getGhostBaseUrl, isProductionEnvironment } from '../mcp/config'

export function getKiroCrewResourceUrl(): URL {
  const configured = process.env.GHOST_KIROCREW_RESOURCE_URL?.trim()
  if (configured) return new URL(configured)
  return new URL('/api/kirocrew', getGhostBaseUrl())
}

export function getKiroCrewTableName(): string {
  const configured = process.env.GHOST_KIROCREW_CONFIG_TABLE_NAME?.trim()
  if (configured) return configured
  if (isProductionEnvironment()) {
    throw new Error('GHOST_KIROCREW_CONFIG_TABLE_NAME is required in production')
  }
  return ''
}

export function getKiroCrewPayloadBucketName(): string {
  const configured = process.env.GHOST_KIROCREW_PAYLOAD_BUCKET_NAME?.trim()
  if (configured) return configured
  if (isProductionEnvironment()) {
    throw new Error('GHOST_KIROCREW_PAYLOAD_BUCKET_NAME is required in production')
  }
  return ''
}

// Hard ceiling on the artifact bytes Ghost is willing to stream. Mirrors the
// packaging tool's PAYLOAD_SIZE_CEILING (4 MiB) so a served artifact can never
// be larger than one the publisher was allowed to upload. Overridable for tests
// / tuning via GHOST_KIROCREW_PAYLOAD_SIZE_CAP.
const DEFAULT_PAYLOAD_SIZE_CAP = 4 * 1024 * 1024

export function getKiroCrewPayloadSizeCap(): number {
  const configured = Number(process.env.GHOST_KIROCREW_PAYLOAD_SIZE_CAP || '')
  return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_PAYLOAD_SIZE_CAP
}
