import { getItem, putItem } from '../../utils/dynamodb'
import { getOAuthTableConfig, useDurableOAuthStore } from '../config'
import type { GhostMcpIdentity } from '../types'

const developmentIdentities = new Map<string, GhostMcpIdentity>()

function identityKey(subject: string) {
  return { artifactId: `GhostIdentity#${subject}` }
}

export async function saveGhostMcpIdentity(identity: GhostMcpIdentity): Promise<void> {
  if (!useDurableOAuthStore()) {
    developmentIdentities.set(identity.subject, identity)
    return
  }
  const config = getOAuthTableConfig()
  await putItem(config.tableName, {
    ...identityKey(identity.subject),
    model: 'GhostIdentity',
    payload: identity
  }, config.environment, config.accountId)
}

export async function getGhostMcpIdentity(subject: string): Promise<GhostMcpIdentity | null> {
  if (!useDurableOAuthStore()) return developmentIdentities.get(subject) || null
  const config = getOAuthTableConfig()
  const item = await getItem(config.tableName, identityKey(subject), config.environment, config.accountId) as { payload?: GhostMcpIdentity } | null
  return item?.payload || null
}
