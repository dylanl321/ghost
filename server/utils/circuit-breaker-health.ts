import type { CircuitBreakerStats } from './credential-circuit-breaker'

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy'

export interface CircuitBreakerHealthResult {
  /** Concise, account-ID-free warning when any circuit is open/half-open, else null. */
  warning: string | null
  /** Resulting overall status after applying the circuit-breaker signal. */
  status: HealthStatus
}

/**
 * Decide how open/half-open assume-role circuits affect readiness.
 *
 * An open or half-open circuit means a dependency account is actively failing
 * assume-role, so the endpoint must not keep reporting `healthy`. We downgrade
 * `healthy` to `degraded` but never override a worse status (`unhealthy` stays
 * `unhealthy`, `degraded` stays `degraded`). The warning intentionally carries
 * only counts — account IDs live in the `circuitBreaker` diagnostic, and no
 * credentials, errors, or stacks are included.
 */
export function evaluateCircuitBreakerHealth(
  stats: CircuitBreakerStats,
  currentStatus: HealthStatus
): CircuitBreakerHealthResult {
  const openCount = stats.open?.length ?? 0
  const halfOpenCount = stats.halfOpen?.length ?? 0

  if (openCount === 0 && halfOpenCount === 0) {
    return { warning: null, status: currentStatus }
  }

  const parts: string[] = []
  if (openCount > 0) parts.push(`${openCount} open`)
  if (halfOpenCount > 0) parts.push(`${halfOpenCount} half-open`)

  return {
    warning: `Assume-role circuit breaker tripped: ${parts.join(', ')} account circuit(s)`,
    // Only lift healthy to degraded; never downgrade an already-worse status.
    status: currentStatus === 'healthy' ? 'degraded' : currentStatus
  }
}
