/**
 * Lightweight event bus for achievement tracking.
 *
 * App code emits typed events; the achievement engine subscribes and evaluates
 * badge rules. The bus is a module-level singleton — all callers share state.
 *
 * Usage in any component/composable:
 *   const { emit } = useEventBus()
 *   emit('page.visited', { page: '/costs' })
 */

export interface AppEvent {
  type: string
  timestamp: number
  payload: Record<string, any>
}

type EventHandler = (event: AppEvent) => void

// Module-level singleton state
const handlers = new Map<string, Set<EventHandler>>()
const globalHandlers = new Set<EventHandler>()

export function useEventBus() {
  /** Subscribe to a specific event type. Returns an unsubscribe function. */
  function on(type: string, handler: EventHandler): () => void {
    if (!handlers.has(type)) handlers.set(type, new Set())
    handlers.get(type)!.add(handler)
    return () => handlers.get(type)!.delete(handler)
  }

  /** Subscribe to all events. Returns an unsubscribe function. */
  function onAny(handler: EventHandler): () => void {
    globalHandlers.add(handler)
    return () => globalHandlers.delete(handler)
  }

  /** Emit an event. Fire-and-forget — never blocks the caller. */
  function emit(type: string, payload: Record<string, any> = {}) {
    const event: AppEvent = { type, timestamp: Date.now(), payload }
    try {
      handlers.get(type)?.forEach(h => h(event))
      globalHandlers.forEach(h => h(event))
    } catch {
      // Silently swallow — event bus must never break app code
    }
  }

  return { on, onAny, emit }
}
