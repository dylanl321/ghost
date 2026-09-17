/**
 * OAuth Administration — DynamoDB single-table record layout.
 *
 * Centralizes the opaque composite key derivation for the
 * `ghost-oauth-administration-<env>` table (see terraform/oauth-administration.tf
 * and design "DynamoDB record layout and retention"). Every partition key is
 * scoped to the server-resolved deployment (`ENV#<deployment>#...`) so a caller
 * can never address another deployment's partition.
 *
 * Base key:
 *   PK=ENV#<deployment>#APPLICATIONS            SK=CLIENT#<clientId>
 *   PK=ENV#<deployment>#<kind>#DAY#<YYYY-MM-DD>  SK=<timestamp>#<id>   (day streams)
 *   PK=ENV#<deployment>#<kind>                   SK=<id>               (singletons)
 *
 * Sparse GSIs (only populated on items that link to the relevant reference):
 *   GSI1 ClientSubjectTimeIndex  GSI1PK=ENV#<deployment>#CLIENT#<id>#<kind> | ENV#<deployment>#SUBJECT#<id>#<kind>
 *   GSI2 ReferenceIndex          GSI2PK=ENV#<deployment>#REF#<kind>#<reference>
 *   GSI3 IssueMembershipIndex    GSI3PK=ENV#<deployment>#ISSUE#<issueId>
 *   (all three sort on <timestamp>#<id>)
 */

import type { OAuthDeploymentContext } from '#shared/types/oauth-administration'
import type { OAuthAdminRecordKind } from './types'

export const OAUTH_ADMIN_INDEXES = {
  clientSubjectTime: 'ClientSubjectTimeIndex',
  reference: 'ReferenceIndex',
  issueMembership: 'IssueMembershipIndex'
} as const

/** Attribute names for the base table and GSIs, matching the Terraform schema. */
export const ATTR = {
  pk: 'PK',
  sk: 'SK',
  gsi1pk: 'GSI1PK',
  gsi1sk: 'GSI1SK',
  gsi2pk: 'GSI2PK',
  gsi2sk: 'GSI2SK',
  gsi3pk: 'GSI3PK',
  gsi3sk: 'GSI3SK'
} as const

function envPrefix(ctx: OAuthDeploymentContext): string {
  return `ENV#${ctx.deploymentId}`
}

/** Day partition label (`YYYY-MM-DD`) for an ISO timestamp. */
export function dayPartition(isoTimestamp: string): string {
  // Slice the date component from a normalized ISO string. Bounded day
  // partitions make the 90-day maximum query range enforceable.
  return new Date(isoTimestamp).toISOString().slice(0, 10)
}

/** Inclusive list of `YYYY-MM-DD` day partitions spanning [from, to]. */
export function dayPartitionsInRange(fromIso: string, toIso: string): string[] {
  const start = new Date(dayPartition(fromIso) + 'T00:00:00.000Z').getTime()
  const end = new Date(dayPartition(toIso) + 'T00:00:00.000Z').getTime()
  const days: string[] = []
  for (let t = start; t <= end; t += 86_400_000) {
    days.push(new Date(t).toISOString().slice(0, 10))
    if (days.length > 90) break // hard safety bound on the max query range
  }
  return days
}

/** Stable sort key for a time-ordered stream row. */
export function timeSortKey(isoTimestamp: string, id: string): string {
  return `${isoTimestamp}#${id}`
}

// --- Base key derivation ---------------------------------------------------

/** Application inventory: PK=ENV#<deployment>#APPLICATIONS, SK=CLIENT#<clientId>. */
export function applicationKey(ctx: OAuthDeploymentContext, clientId: string) {
  return { [ATTR.pk]: `${envPrefix(ctx)}#APPLICATIONS`, [ATTR.sk]: `CLIENT#${clientId}` }
}

/** Day-stream partition key for events/audit: PK=ENV#<deployment>#<kind>#DAY#<day>. */
export function dayStreamPartition(ctx: OAuthDeploymentContext, kind: OAuthAdminRecordKind, day: string): string {
  return `${envPrefix(ctx)}#${kind}#DAY#${day}`
}

/** Full day-stream key for an event/audit row. */
export function dayStreamKey(
  ctx: OAuthDeploymentContext,
  kind: OAuthAdminRecordKind,
  isoTimestamp: string,
  id: string
) {
  return {
    [ATTR.pk]: dayStreamPartition(ctx, kind, dayPartition(isoTimestamp)),
    [ATTR.sk]: timeSortKey(isoTimestamp, id)
  }
}

/** Singleton partition for a kind: PK=ENV#<deployment>#<kind>. */
export function singletonPartition(ctx: OAuthDeploymentContext, kind: OAuthAdminRecordKind): string {
  return `${envPrefix(ctx)}#${kind}`
}

/** Singleton key: PK=ENV#<deployment>#<kind>, SK=<id>. */
export function singletonKey(ctx: OAuthDeploymentContext, kind: OAuthAdminRecordKind, id: string) {
  return { [ATTR.pk]: singletonPartition(ctx, kind), [ATTR.sk]: id }
}

// --- Sparse GSI key derivation ---------------------------------------------

/** GSI1 partition for a client/time stream. */
export function clientTimePartition(ctx: OAuthDeploymentContext, clientId: string, kind: OAuthAdminRecordKind): string {
  return `${envPrefix(ctx)}#CLIENT#${clientId}#${kind}`
}

/** GSI1 partition for a subject/time stream. */
export function subjectTimePartition(ctx: OAuthDeploymentContext, subject: string, kind: OAuthAdminRecordKind): string {
  return `${envPrefix(ctx)}#SUBJECT#${subject}#${kind}`
}

/** GSI2 partition for an attempt/correlation/diagnostic reference. */
export function referencePartition(ctx: OAuthDeploymentContext, refKind: string, reference: string): string {
  return `${envPrefix(ctx)}#REF#${refKind}#${reference}`
}

/** GSI3 partition for issue membership. */
export function issueMembershipPartition(ctx: OAuthDeploymentContext, issueId: string): string {
  return `${envPrefix(ctx)}#ISSUE#${issueId}`
}
