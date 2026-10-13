import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import test from 'node:test'
import { createApp, defineEventHandler, toNodeListener } from 'h3'
import healthHandler from '../../server/api/admin/kirocrew/health.get'
import readConfigHandler from '../../server/api/admin/kirocrew/config.get'
import writeConfigHandler from '../../server/api/admin/kirocrew/config.post'
import { MemoryKiroCrewRepository, setKiroCrewRepositoryForTest } from '../../server/kirocrew/repository'

test('health and publication routes enforce admin access before reading storage', async () => {
  const previousBypass = process.env.ADMIN_BYPASS
  delete process.env.ADMIN_BYPASS
  const repository = new MemoryKiroCrewRepository()
  let reads = 0
  repository.current = async () => { reads++; return null }
  setKiroCrewRepositoryForTest(repository)
  let admin = false
  const app = createApp()
  app.use(defineEventHandler(event => {
    event.context.auth = { isAuthenticated: true, authType: 'dev', user: {
      email: 'synthetic@example.test', groups: admin ? ['AWS-Product-Team'] : []
    } }
  }))
  app.use('/health', healthHandler)
  app.use('/config-read', readConfigHandler)
  app.use('/config-write', writeConfigHandler)
  const server = createServer(toNodeListener(app)).listen(0, '127.0.0.1')
  try {
    await once(server, 'listening')
    const address = server.address() as { port: number }
    for (const path of ['health', 'config-read', 'config-write']) {
      const response = await fetch(`http://127.0.0.1:${address.port}/${path}`, {
        method: path === 'config-write' ? 'POST' : 'GET'
      })
      assert.equal(response.status, 403)
    }
    assert.equal(reads, 0)
    admin = true
    const response = await fetch(`http://127.0.0.1:${address.port}/health`)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    const health = await response.json()
    assert.equal(health.configuration, 'attention')
    assert.equal(health.revision, null)
    assert.equal(reads, 1)
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    setKiroCrewRepositoryForTest(undefined)
    if (previousBypass === undefined) delete process.env.ADMIN_BYPASS
    else process.env.ADMIN_BYPASS = previousBypass
  }
})
