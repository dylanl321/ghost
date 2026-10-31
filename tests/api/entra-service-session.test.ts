import assert from 'node:assert/strict'
import test from 'node:test'
import type { H3Event } from 'h3'
import { getUserSession } from '../../server/utils/entra/session'

function serviceEvent(authorization?: string): H3Event {
  return {
    node: { req: { headers: authorization ? { authorization } : {} } },
    context: { datasetExportService: true }
  } as unknown as H3Event
}

test('server-built Graph events use the token they carry', async () => {
  const session = await getUserSession(serviceEvent('Bearer service-token'))
  assert.equal(session?.accessToken, 'service-token')
})

test('a server-built event without a token has no session', async () => {
  assert.equal(await getUserSession(serviceEvent()), null)
})

test('a request header alone does not create a service session', async () => {
  const event = { node: { req: { headers: { authorization: 'Bearer forged' } } }, context: {} } as unknown as H3Event
  const session = await getUserSession(event)
  assert.notEqual(session?.accessToken, 'forged')
})
