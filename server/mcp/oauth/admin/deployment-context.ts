/**
 * OAuth Administration — deployment-context resolver.
 *
 * Derives the server-authoritative {@link OAuthDeploymentContext} and the
 * server-only {@link OAuthAdminTableConfig} from runtime configuration ONLY.
 *
 * SAFETY: A caller can never select an environment, table, endpoint, account,
 * or AWS partition (Requirement 2.2 / 16.1). Every value returned here is
 * derived from `process.env` / `getOAuthAdminTableConfig()` and the existing
 * `isProductionEnvironment()` detection. `NODE_ENV` is surfaced only as
 * `executionMode` and is NOT sufficient evidence that an ECS deployment is
 * Production (see design "Authorization, deployment binding, and capability
 * gate").
 */

import { createHash } from 'node:crypto'
import type {
  AwsPartition,
  OAuthDeploymentContext,
  OAuthDeploymentEnvironment,
  OAuthProvenance
} from '#shared/types/oauth-administration'
import type {
  OAuthAdminDeploymentContextResolver,
  OAuthAdminTableConfig
} from './types'
import { getOAuthAdminTableConfig, isProductionEnvironment, useDurableOAuthAdminStore } from '../../config'

/**
 * Map the AWS partition (`commercial` / `govcloud`) used for the administration
 * table to the deployment environment LABEL. The two are intentionally
 * distinct (see `OAuthDeploymentContext.partition` vs `.environment`): the
 * partition is where storage physically lives, the environment is the
 * human-safe deployment label.
 */
function resolveEnvironmentLabel(): OAuthDeploymentEnvironment {
  // An explicit, server-set label always wins. This is deployment/runtime
  // configuration, never caller input.
  const explicit = (process.env.GHOST_OAUTH_ADMIN_DEPLOYMENT || '').trim().toLowerCase()
  if (explicit === 'development' || explicit === 'production' || explicit === 'local') {
    return explicit
  }

  if (isProductionEnvironment()) return 'production'

  const nodeEnv = (process.env.NODE_ENV || '').trim().toLowerCase()
  if (nodeEnv === 'development') return 'development'
  // A missing NODE_ENV on a workstation with no durable store is a local run;
  // anything else we cannot positively classify stays `unknown` rather than
  // being optimistically labelled a real environment (Requirement 2.5).
  if (!nodeEnv && !useDurableOAuthAdminStore()) return 'local'
  return 'unknown'
}

/**
 * A configuration value is `effective` only when we can point at the concrete
 * runtime input that produced it (an explicit admin table name). Otherwise the
 * context was assembled from defaults and its provenance is `configured`.
 */
function resolveProvenance(tableConfig: OAuthAdminTableConfig): OAuthProvenance {
  const hasExplicitTable = Boolean(process.env.GHOST_OAUTH_ADMIN_TABLE_NAME)
  const hasExplicitDeployment = Boolean((process.env.GHOST_OAUTH_ADMIN_DEPLOYMENT || '').trim())
  if (hasExplicitTable || hasExplicitDeployment) return 'effective'
  // Falls back to the default table name — a value the deployment configured
  // implicitly rather than one we observed in effect.
  return tableConfig.tableName ? 'configured' : 'unknown'
}

/**
 * Derive a stable, opaque deployment identifier used to scope every partition
 * key and cursor signature. Built from the deployment label, the AWS partition,
 * the account (when known), and the table name so two deployments never share
 * a partition. Hashed so the raw table/account identifiers are not echoed back
 * to the browser inside the deployment id.
 */
function deriveDeploymentId(
  environment: OAuthDeploymentEnvironment,
  partition: AwsPartition,
  tableConfig: OAuthAdminTableConfig
): string {
  const material = [
    environment,
    partition,
    tableConfig.accountId || 'no-account',
    tableConfig.tableName
  ].join('|')
  return createHash('sha256').update(material).digest('base64url').slice(0, 24)
}

/**
 * The default resolver. Stateless — it reads runtime configuration on each
 * call so a rotated env var is observed without a restart, matching the rest
 * of `server/mcp/config.ts`.
 */
export class RuntimeOAuthAdminDeploymentContextResolver implements OAuthAdminDeploymentContextResolver {
  getTableConfig(): OAuthAdminTableConfig {
    // Delegates entirely to the server-only runtime configuration helper added
    // in task 1.2. Callers cannot influence this.
    return getOAuthAdminTableConfig()
  }

  resolve(): OAuthDeploymentContext {
    const tableConfig = this.getTableConfig()
    const environment = resolveEnvironmentLabel()
    const partition = tableConfig.environment satisfies AwsPartition
    const provenance = resolveProvenance(tableConfig)
    return {
      deploymentId: deriveDeploymentId(environment, partition, tableConfig),
      environment,
      executionMode: (process.env.NODE_ENV || 'unknown').trim().toLowerCase() || 'unknown',
      partition,
      provenance
    }
  }
}

/** Shared singleton resolver for server request paths. */
export const oauthAdminDeploymentContextResolver: OAuthAdminDeploymentContextResolver =
  new RuntimeOAuthAdminDeploymentContextResolver()

/** Convenience wrapper mirroring the `resolveOAuthAdminDeploymentContext()` name in the design. */
export function resolveOAuthAdminDeploymentContext(): OAuthDeploymentContext {
  return oauthAdminDeploymentContextResolver.resolve()
}
