export const KIROCREW_SCOPES = [
  'kirocrew.bootstrap.read',
  'kirocrew.config.read',
  'kirocrew.config.admin'
] as const

export type KiroCrewScope = typeof KIROCREW_SCOPES[number]

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
}
