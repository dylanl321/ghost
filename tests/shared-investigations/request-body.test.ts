import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer, request } from 'node:http'
import test from 'node:test'
import { createApp, defineEventHandler, setResponseStatus, toNodeListener } from 'h3'
import { readCollaborationBody } from '../../server/kirocrew/collaboration/request-body'
import { httpStatusForError, toErrorEnvelope } from '../../server/kirocrew/collaboration/api-support'

test('HTTP byte limits reject declared and chunked oversize before accepting content', async () => {
  let accepted = 0
  const app = createApp().use(defineEventHandler(async event => {
    try {
      const body = await readCollaborationBody(event, 8)
      accepted++
      return { size: body?.byteLength ?? 0 }
    } catch (error) {
      setResponseStatus(event, httpStatusForError(error))
      return toErrorEnvelope(error)
    }
  }))
  const server = createServer(toNodeListener(app)).listen(0, '127.0.0.1')
  try {
    await once(server, 'listening')
    const port = (server.address() as { port: number }).port
    const send = (chunks: string[], contentLength?: number) => new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = request({
        host: '127.0.0.1', port, method: 'POST',
        headers: contentLength === undefined ? { 'Transfer-Encoding': 'chunked' } : { 'Content-Length': contentLength }
      }, response => {
        let body = ''
        response.setEncoding('utf8')
        response.on('data', chunk => { body += chunk })
        response.on('end', () => resolve({ status: response.statusCode!, body }))
      })
      req.on('error', reject)
      for (const chunk of chunks) req.write(chunk)
      req.end()
    })
    assert.equal((await send(['💡', '💡'])).status, 200)
    assert.equal(accepted, 1)
    for (const response of [await send(['123456789'], 9), await send(['1234', '56789'])]) {
      assert.equal(response.status, 413)
      assert.ok(response.body.includes('payload_too_large'))
      assert.ok(!response.body.includes('1234'))
    }
    assert.equal(accepted, 1)
    assert.deepEqual(JSON.parse((await send([], 0)).body), { size: 0 })
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})

test('an interrupted upload cannot become a successful empty body', { timeout: 5000 }, async () => {
  let finish!: (value: boolean) => void
  let started!: () => void
  const entered = new Promise<void>(resolve => { started = resolve })
  const rejected = new Promise<boolean>(resolve => { finish = resolve })
  const app = createApp().use(defineEventHandler(async event => {
    started()
    try {
      await readCollaborationBody(event, 8)
      finish(false)
    } catch {
      finish(true)
    }
    return {}
  }))
  const server = createServer(toNodeListener(app)).listen(0, '127.0.0.1')
  try {
    await once(server, 'listening')
    const port = (server.address() as { port: number }).port
    const req = request({ host: '127.0.0.1', port, method: 'POST', headers: { 'Content-Length': 8 } })
    req.on('error', () => {})
    req.write('1234')
    await entered
    req.destroy()
    assert.equal(await rejected, true)
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})
