import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getAccountSelectionPayloads,
  normalizeAccountSelectionRequest,
  normalizeAccountSelectionResponse,
  normalizeStrandsDisambiguation
} from '../../server/utils/strands-disambiguation'

test('streamed disambiguation preserves the Strands session ID', () => {
  const result = normalizeStrandsDisambiguation({
    session_id: 'strands-session-123',
    search_term: 'shared account name',
    message: 'Found 1 account. Please select one.',
    matches: [{
      requestId: 'selection-1',
      accountAlias: 'Example',
      displayName: 'Example Account',
      matchScore: 99,
      matchReason: 'Name match',
      govcloudAccountId: '100771856592'
    }]
  }, 'job-id-fallback')

  assert.equal(result.sessionId, 'strands-session-123')
  assert.deepEqual(result.matches[0], {
    request_id: 'selection-1',
    account_alias: 'Example',
    display_name: 'Example Account',
    match_score: 99,
    match_reason: 'Name match',
    govcloud_account_id: '100771856592',
    commercial_account_id: undefined
  })
})

test('account selection accepts either request shape and can try both upstream contracts', () => {
  const camel = normalizeAccountSelectionRequest({ sessionId: 'session-1', requestId: 'request-1' })
  const snake = normalizeAccountSelectionRequest({ session_id: 'session-1', request_id: 'request-1' })

  assert.deepEqual(camel, snake)
  assert.deepEqual(getAccountSelectionPayloads(camel!), [
    { sessionId: 'session-1', requestId: 'request-1' },
    { session_id: 'session-1', request_id: 'request-1' }
  ])
})

test('account selection responses normalize nested camelCase account data', () => {
  const result = normalizeAccountSelectionResponse({
    data: {
      status: 'success',
      message: 'Selected',
      account: {
        requestId: 'request-1',
        accountAlias: 'Example',
        displayName: 'Example Account',
        govcloudAccountId: '100771856592'
      }
    }
  })

  assert.equal(result.account.request_id, 'request-1')
  assert.equal(result.account.govcloud_account_id, '100771856592')
})
