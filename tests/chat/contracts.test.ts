import assert from 'node:assert/strict'
import test from 'node:test'
import { findStandaloneAwsAccountIds } from '../../shared/utils/chat-entities'
import { formatChatPageContext, validateChatPageContext } from '../../shared/types/chat-context'
import { buildChatDestination, isSupportedChatDestination } from '../../shared/utils/chat-routes'

test('account selectors ignore IDs embedded in S3 bucket names', () => {
  const text = 'aws-cloudtrail-logs-100771856592-2172ca58 and account (100771856592)'
  assert.deepEqual(findStandaloneAwsAccountIds(text), ['100771856592'])
})

test('page context accepts supported filters and rejects unsafe values', () => {
  const context = validateChatPageContext({
    sourcePage: '/account/costs',
    accountIds: ['100771856592', 'not-an-account'],
    resourceIds: ['i-0123456789abcdef0', '<script>'],
    timeframe: 'last30days',
    dataMode: 'billable'
  })
  assert.deepEqual(context?.accountIds, ['100771856592'])
  assert.deepEqual(context?.resourceIds, ['i-0123456789abcdef0'])
  assert.match(formatChatPageContext(context!), /Selected accounts: 100771856592/)
})

test('deep links emit only destination-supported parameters', () => {
  const costs = buildChatDestination({ name: 'costs', accountIds: ['100771856592'], timeframe: 'last30days' })
  assert.equal(costs, '/account/costs?accounts=100771856592&timeframe=last30days')
  assert.equal(costs.includes('resourceTypes'), false)
  assert.equal(buildChatDestination({ name: 'explorer', accountId: '100771856592' }), '/account/100771856592')
  assert.equal(isSupportedChatDestination(costs), true)
  assert.equal(isSupportedChatDestination('javascript:alert(1)'), false)
})
