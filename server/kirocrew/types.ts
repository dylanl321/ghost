export const KIROCREW_SCOPES = [
  'kirocrew.bootstrap.read',
  'kirocrew.config.read',
  'kirocrew.config.admin',
  'kirocrew.collaboration.read',
  'kirocrew.collaboration.write'
] as const

export type KiroCrewScope = typeof KIROCREW_SCOPES[number]

/**
 * Shared Investigations collaboration scopes carried by a Crew-resource token
 * (Requirement 3.1, 3.2). These are advertised on the same `getKiroCrewResourceUrl()`
 * resource as the configuration scopes so the existing GHOST OAuth provider mints
 * them into the opaque access token, but collaboration authorization treats the
 * configuration scopes (and every non-GHOST session) as insufficient on their own
 * (Requirement 3.3, 24.1). Read and write are checked exactly per operation.
 */
export const COLLABORATION_READ_SCOPE = 'kirocrew.collaboration.read' as const
export const COLLABORATION_WRITE_SCOPE = 'kirocrew.collaboration.write' as const

export type CollaborationScope =
  | typeof COLLABORATION_READ_SCOPE
  | typeof COLLABORATION_WRITE_SCOPE

export type KiroCrewRecord =
  | { name: string; type: 'setting'; value: unknown }
  | { name: string; type: 'file'; mediaType: 'text/plain' | 'application/json' | 'application/yaml'; value: string }
  | { name: string; type: 'secret'; mediaType?: 'text/plain' | 'application/json' | 'application/yaml'; value: string }

export interface KiroCrewRevision {
  schemaVersion: 1
  revision: number
  updatedAt: string
  publishedBy: string
  records: KiroCrewRecord[]
}

export interface KiroCrewPublishInput {
  expectedRevision: number
  records: Array<KiroCrewRecord | {
    name: string
    type: 'secret'
    mediaType?: 'text/plain' | 'application/json' | 'application/yaml'
    preserve: true
  }>
}

export interface KiroCrewRepository {
  current(): Promise<KiroCrewRevision | null>
  publish(input: {
    expectedRevision: number
    records: KiroCrewRecord[]
    publishedBy: string
  }): Promise<KiroCrewRevision>
  /**
   * Return a prior retained revision by number, or null when it was never
   * published. Reads the immutable `REV#<n>` item without touching CURRENT.
   */
  revision(revision: number): Promise<KiroCrewRevision | null>
  /**
   * Re-point CURRENT to a prior retained revision (rollback / audit re-point,
   * Requirement 23.2). This is an admin action, not an operator one: it moves
   * the CURRENT pointer to an already-published `revision` without creating a
   * new revision, appending to history, or re-uploading its payload artifact
   * (the prior revision's S3 object is retained write-once). The monotonic
   * `REV#` history stays intact. Fails when the target revision does not exist.
   */
  repoint(revision: number): Promise<KiroCrewRevision>
}
