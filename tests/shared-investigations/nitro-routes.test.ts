import assert from 'node:assert/strict'
import { once } from 'node:events'
import { readdir } from 'node:fs/promises'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test from 'node:test'
import { createApp, toNodeListener } from 'h3'
import { getCollaborationRuntime, setCollaborationRuntime } from '../../server/kirocrew/collaboration/api-runtime'

async function routeFiles(directory: string): Promise<string[]> {
  const files: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await routeFiles(path))
    else if (/\.(get|post|put|patch|delete)\.ts$/.test(entry.name)) files.push(path)
  }
  return files.sort()
}

test('every actual Nitro collaboration route loads and stays closed without a runtime', async () => {
  const previous = getCollaborationRuntime()
  setCollaborationRuntime(null)
  const directory = fileURLToPath(new URL('../../server/api/kirocrew/v1/collaboration', import.meta.url))
  const files = await routeFiles(directory)
  assert.ok(files.length >= 20)
  const app = createApp()
  for (const [index, file] of files.entries()) {
    const route = await import(pathToFileURL(file).href)
    assert.equal(typeof route.default, 'function', file)
    app.use(`/route/${index}/probe`, route.default)
  }
  const server = createServer(toNodeListener(app)).listen(0, '127.0.0.1')
  try {
    await once(server, 'listening')
    const port = (server.address() as { port: number }).port
    for (const [index, file] of files.entries()) {
      const method = file.match(/\.(get|post|put|patch|delete)\.ts$/)![1]!.toUpperCase()
      const response = await fetch(`http://127.0.0.1:${port}/route/${index}/probe`, {
        method,
        ...(method === 'GET' ? {} : { body: '{}', headers: { 'Content-Type': 'application/json' } })
      })
      assert.equal(response.status, 404, file)
      assert.ok((await response.text()).includes('not_found'), file)
    }
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    setCollaborationRuntime(previous)
  }
})
