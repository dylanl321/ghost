import assert from 'node:assert/strict'
import test from 'node:test'
import type { H3Event } from 'h3'
import { clearAllAdminCache, isUserAdmin } from '../../server/utils/user-roles'

function oidcEvent(user: Record<string, any>): H3Event {
  return {
    context: {
      auth: {
        isAuthenticated: true,
        authType: 'oidc',
        user
      }
    }
  } as H3Event
}

test('admin check resolves Entra group IDs before denying access', async () => {
  clearAllAdminCache()
  let graphCalls = 0
  const allowed = await isUserAdmin(oidcEvent({
    id: 'group-id-admin-test',
    email: 'creator@example.test',
    claims: { groups: ['5b3b3f60-e52f-4e42-b080-570c5f1fe4d8'] }
  }), async () => {
    graphCalls += 1
    return [{ displayName: 'AWS-Product-Team' }] as any
  })

  assert.equal(allowed, true)
  assert.equal(graphCalls, 1)
})

test('admin check accepts named session groups without Graph', async () => {
  clearAllAdminCache()
  const allowed = await isUserAdmin(oidcEvent({
    id: 'named-group-admin-test',
    email: 'creator@example.test',
    groups: [{ displayName: 'AWS-Product-Team' }]
  }), async () => {
    throw new Error('Graph should not be called')
  })

  assert.equal(allowed, true)
})

test('configured admin usernames do not depend on Graph', async () => {
  clearAllAdminCache()
  const allowed = await isUserAdmin(oidcEvent({
    id: 'username-admin-test',
    email: 'ghost.owner.admin'
  }), async () => {
    throw new Error('Graph should not be called')
  })

  assert.equal(allowed, true)
})
