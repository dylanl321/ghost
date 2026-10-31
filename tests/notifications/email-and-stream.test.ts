import assert from 'node:assert/strict'
import test from 'node:test'
import type { ServerResponse } from 'node:http'
import { encodeMimeHeader, escapeHtml, renderTemplate } from '../../server/utils/email-service'
import { notificationEmitter } from '../../server/utils/notification-emitter'

test('non-ASCII subjects are RFC 2047 encoded and header injection is stripped', () => {
  assert.equal(encodeMimeHeader('Plain subject'), 'Plain subject')
  const encoded = encodeMimeHeader('[GHOST] Your notification digest — 3 updates')
  assert.match(encoded, /^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/)
  assert.equal(Buffer.from(encoded.slice(10, -2), 'base64').toString('utf8'), '[GHOST] Your notification digest — 3 updates')
  assert.equal(encodeMimeHeader('Report\r\nBcc: attacker@example.com'), 'Report Bcc: attacker@example.com')
})

test('user text is escaped before going into email HTML', () => {
  assert.equal(escapeHtml('<img src=x onerror="alert(1)"> & co'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; co')
})

test('template values containing $ patterns are inserted literally', () => {
  assert.equal(renderTemplate('Report: {{reportName}}', { reportName: 'Costs $& more' } as any), 'Report: Costs $& more')
})

test('SSE pushes reach a stream registered with a mixed-case email', () => {
  const writes: string[] = []
  const res = { write: (chunk: string) => { writes.push(chunk); return true } } as unknown as ServerResponse
  const cleanup = notificationEmitter.registerConnection('Dylan.Lewis@Example.com', res)
  notificationEmitter.emitNotification('dylan.lewis@example.com', { notificationId: 'n1' })
  cleanup()
  assert.equal(writes.length, 1)
  assert.equal(notificationEmitter.getConnectionCount(), 0)
})
