/**
 * OAuth Administration — provider artifact reader (maintenance only).
 *
 * A bounded, resumable, READ-ONLY view over the provider artifact table
 * (`GHOST_OAUTH_TABLE_NAME`, see server/mcp/oauth/adapter.ts). This is the ONLY
 * place the administration surface touches provider artifacts, and it is used
 * exclusively by maintenance backfill/reconciliation — never a request path
 * (design "projection/backfill consistency model", Requirement 5.5 / 18.3).
 *
 * SAFETY:
 *   - Reads only. It never calls `putItem`/`deleteItem`, never resets a
 *     credential, never registers a client, and never creates consent.
 *   - Traverses one bounded page at a time with a resumable continuation token
 *     so a run can stop and resume from a durable checkpoint.
 *   - A single artifact can be re-read for targeted reconciliation so the
 *     projection service can compare against current provider state before a
 *     write and tombstone a removed record.
 *
 * The adapter (adapter.ts) stores each artifact as `{ artifactId: '<model>#<id>',
 * model, payload, ttl, ... }`. We reconstruct `{ model, id, payload, ttl }` and
 * expose only the two models the projections seed from: `Client` and `Grant`.
 */

import { getItem, scanItems } from '../../../utils/dynamodb'
import { getOAuthTableConfig } from '../../config'
import type {
  OAuthProviderArtifact,
  OAuthProviderArtifactPage,
  OAuthProviderArtifactReader
} from './types'

/** Provider models the maintenance backfill is allowed to seed projections from. */
const SEEDABLE_MODELS = new Set(['Client', 'Grant'])

/** Reconstruct the provider artifact id (`<id>`) from the stored `artifactId`. */
function artifactIdFor(model: string, id: string): string {
  return `${model}#${id}`
}

/** Map a raw stored row into the safe {@link OAuthProviderArtifact} shape. */
function toArtifact(row: Record<string, any>): OAuthProviderArtifact | null {
  const model = typeof row.model === 'string' ? row.model : undefined
  const artifactId = typeof row.artifactId === 'string' ? row.artifactId : undefined
  if (!model || !artifactId) return null
  // `artifactId` is `<model>#<id>`; strip the model prefix to recover the id.
  const prefix = `${model}#`
  const id = artifactId.startsWith(prefix) ? artifactId.slice(prefix.length) : artifactId
  const payload = (row.payload && typeof row.payload === 'object') ? row.payload as Record<string, unknown> : {}
  const ttl = typeof row.ttl === 'number' ? row.ttl : undefined
  return { model, id, payload, ttl }
}

/**
 * The default reader against the durable provider artifact table. Stateless;
 * reads table configuration per call so a rotated env var is observed.
 */
export class DynamoOAuthProviderArtifactReader implements OAuthProviderArtifactReader {
  /**
   * Read one bounded page of Client/Grant artifacts. A DynamoDB `Scan` is used
   * with a server-side `FilterExpression` limited to the two seedable models,
   * so only maintenance work ever performs it. The returned `nextToken` is the
   * resumable continuation the checkpoint stores; it is absent once the table
   * has been fully traversed.
   *
   * A read failure surfaces as `{ unavailable: true }` rather than throwing so
   * the backfill can record `unavailable` coverage without fabricating data.
   */
  async readPage(pageSize: number, token?: string): Promise<OAuthProviderArtifactPage> {
    const config = getOAuthTableConfig()
    const bounded = Math.min(Math.max(1, Math.floor(pageSize) || 1), 200)
    try {
      const result = await scanItems(
        config.tableName,
        '#model IN (:client, :grant)',
        bounded,
        token,
        config.environment,
        { '#model': 'model' },
        { ':client': 'Client', ':grant': 'Grant' },
        config.accountId
      )
      const artifacts: OAuthProviderArtifact[] = []
      for (const row of result.items) {
        const artifact = toArtifact(row)
        if (artifact && SEEDABLE_MODELS.has(artifact.model)) artifacts.push(artifact)
      }
      return { artifacts, nextToken: result.nextToken }
    } catch {
      // The provider table could not be read; report availability loss so the
      // backfill records `unavailable` coverage instead of inventing an empty
      // result (Requirement 16.5). The safe error is not surfaced here — the
      // caller records coverage; detailed errors are handled by the redactor.
      return { artifacts: [], unavailable: true }
    }
  }

  /**
   * Read the current provider state for a single Client/Grant for targeted
   * reconciliation. Returns `null` when the provider record is gone (the caller
   * tombstones the projection) or is logically expired by its TTL.
   */
  async readArtifact(model: 'Client' | 'Grant', id: string): Promise<OAuthProviderArtifact | null> {
    const config = getOAuthTableConfig()
    const row = await getItem(
      config.tableName,
      { artifactId: artifactIdFor(model, id) },
      config.environment,
      config.accountId
    ) as Record<string, any> | null
    if (!row) return null
    const nowSeconds = Math.floor(Date.now() / 1000)
    if (typeof row.ttl === 'number' && row.ttl > 0 && row.ttl <= nowSeconds) return null
    const artifact = toArtifact(row)
    return artifact && artifact.model === model ? artifact : null
  }
}

/** Shared singleton reader for maintenance work. */
export const oauthProviderArtifactReader: OAuthProviderArtifactReader =
  new DynamoOAuthProviderArtifactReader()
