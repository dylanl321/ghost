export type KiroCrewCheckState = 'ok' | 'disabled' | 'missing' | 'unavailable' | 'unverified'

export interface KiroCrewHealthCheck {
  id: 'health-observation' | 'configuration-store' | 'published-profile' | 'installer-payload' | 'collaboration-runtime' | 'lifecycle-workers' | 'pilot-acceptance'
  label: string
  state: KiroCrewCheckState
  detail: string
}

/** Admin-only observation. Never includes configuration values or error bodies. */
export interface KiroCrewHealth {
  checkedAt: string
  configuration: 'healthy' | 'attention' | 'unavailable'
  collaboration: 'disabled' | 'not-ready' | 'unverified' | 'unknown'
  revision: number | null
  publishedAt: string | null
  profile: {
    enabled: boolean
    spaces: number
    enabledSpaces: number
    sourceBindings: number
    evidencePolicies: number
    workflowVersions: number
  } | null
  checks: KiroCrewHealthCheck[]
}
