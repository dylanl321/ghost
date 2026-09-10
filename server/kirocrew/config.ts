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
