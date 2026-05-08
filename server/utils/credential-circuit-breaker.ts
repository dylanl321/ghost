import { logger } from './logger'

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

interface CircuitEntry {
  state: CircuitState
  consecutiveFailures: number
  lastFailureTime: number
  openedAt: number
  halfOpenInFlight: boolean
  lastError: string
}

export interface CircuitBreakerStats {
  open: string[]
  halfOpen: string[]
  totalTracked: number
}

const FAILURE_THRESHOLD = parseInt(process.env.AWS_CIRCUIT_BREAKER_THRESHOLD || '3')
const COOLDOWN_MS = parseInt(process.env.AWS_CIRCUIT_BREAKER_COOLDOWN_MS || '1800000')

class AssumeRoleCircuitBreaker {
  private circuits = new Map<string, CircuitEntry>()

  canAttempt(accountId: string): boolean {
    const entry = this.circuits.get(accountId)
    if (!entry) return true

    switch (entry.state) {
      case 'CLOSED':
        return true

      case 'OPEN': {
        const elapsed = Date.now() - entry.openedAt
        if (elapsed >= COOLDOWN_MS) {
          entry.state = 'HALF_OPEN'
          entry.halfOpenInFlight = true
          return true
        }
        return false
      }

      case 'HALF_OPEN':
        if (entry.halfOpenInFlight) return false
        entry.halfOpenInFlight = true
        return true
    }
  }

  recordSuccess(accountId: string): void {
    const entry = this.circuits.get(accountId)
    if (!entry) return

    if (entry.state === 'HALF_OPEN') {
      logger.info(`[Circuit Breaker] Circuit RECOVERED for account ${accountId}. Resuming normal operations.`)
    }

    this.circuits.delete(accountId)
  }

  recordFailure(accountId: string, error: Error): void {
    let entry = this.circuits.get(accountId)

    if (!entry) {
      entry = {
        state: 'CLOSED',
        consecutiveFailures: 0,
        lastFailureTime: 0,
        openedAt: 0,
        halfOpenInFlight: false,
        lastError: ''
      }
      this.circuits.set(accountId, entry)
    }

    entry.consecutiveFailures++
    entry.lastFailureTime = Date.now()
    entry.lastError = error.message
    entry.halfOpenInFlight = false

    if (entry.state === 'HALF_OPEN') {
      entry.state = 'OPEN'
      entry.openedAt = Date.now()
      logger.warn(
        `[Circuit Breaker] Circuit remains OPEN for account ${accountId} after half-open probe failed. ` +
        `Next retry in ${Math.ceil(COOLDOWN_MS / 60000)}min. Error: ${error.message}`
      )
      return
    }

    if (entry.consecutiveFailures >= FAILURE_THRESHOLD && entry.state === 'CLOSED') {
      entry.state = 'OPEN'
      entry.openedAt = Date.now()
      logger.warn(
        `[Circuit Breaker] Circuit OPENED for account ${accountId} after ${entry.consecutiveFailures} consecutive failures. ` +
        `Will retry in ${Math.ceil(COOLDOWN_MS / 60000)}min. Last error: ${error.message}`
      )
    }
  }

  getState(accountId: string): CircuitState {
    return this.circuits.get(accountId)?.state || 'CLOSED'
  }

  getStats(): CircuitBreakerStats {
    const open: string[] = []
    const halfOpen: string[] = []

    for (const [accountId, entry] of this.circuits) {
      if (entry.state === 'OPEN') open.push(accountId)
      else if (entry.state === 'HALF_OPEN') halfOpen.push(accountId)
    }

    return { open, halfOpen, totalTracked: this.circuits.size }
  }

  reset(accountId: string): void {
    this.circuits.delete(accountId)
    logger.info(`[Circuit Breaker] Circuit manually reset for account ${accountId}`)
  }

  resetAll(): void {
    const count = this.circuits.size
    this.circuits.clear()
    logger.info(`[Circuit Breaker] All ${count} circuits reset`)
  }
}

export const assumeRoleCircuitBreaker = new AssumeRoleCircuitBreaker()
