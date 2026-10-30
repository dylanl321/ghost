/**
 * Notification Emitter
 *
 * In-memory singleton that bridges sendUserNotification() with SSE connections.
 * When a notification is created, it pushes the event to all connected
 * SSE streams for that user (same container only).
 */

import { EventEmitter } from 'node:events'
import type { ServerResponse } from 'node:http'
import { logger } from './logger'

function normalizeUserId(userId: string): string {
  return userId.toLowerCase()
}

class NotificationEmitter extends EventEmitter {
  private connections = new Map<string, Set<ServerResponse>>()

  /**
   * Register an SSE connection for a user.
   * Returns a cleanup function to call on disconnect.
   */
  registerConnection(rawUserId: string, res: ServerResponse): () => void {
    // Notifications are stored and emitted under the lowercased id; a stream
    // registered under a mixed-case email never received a push.
    const userId = normalizeUserId(rawUserId)
    if (!this.connections.has(userId)) {
      this.connections.set(userId, new Set())
    }
    this.connections.get(userId)!.add(res)
    logger.debug(`[NotifEmitter] Connection registered for ${userId} (${this.connections.get(userId)!.size} active)`)

    return () => this.removeConnection(userId, res)
  }

  /**
   * Remove a connection (called on disconnect or write error)
   */
  removeConnection(rawUserId: string, res: ServerResponse): void {
    const userId = normalizeUserId(rawUserId)
    const userConns = this.connections.get(userId)
    if (userConns) {
      userConns.delete(res)
      if (userConns.size === 0) {
        this.connections.delete(userId)
      }
    }
  }

  /**
   * Push a notification to all connected SSE streams for a user.
   * Called by sendUserNotification() after successful DynamoDB write.
   */
  emitNotification(rawUserId: string, notification: any): void {
    const userId = normalizeUserId(rawUserId)
    const streams = this.connections.get(userId)
    if (!streams || streams.size === 0) return

    const data = `event: notification\ndata: ${JSON.stringify(notification)}\n\n`

    for (const res of streams) {
      try {
        res.write(data)
      } catch {
        // Dead connection — clean up
        this.removeConnection(userId, res)
      }
    }
  }

  /**
   * Get the number of active connections (for debugging/monitoring)
   */
  getConnectionCount(): number {
    let total = 0
    for (const conns of this.connections.values()) {
      total += conns.size
    }
    return total
  }
}

export const notificationEmitter = new NotificationEmitter()
