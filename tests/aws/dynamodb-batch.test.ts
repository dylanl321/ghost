import assert from 'node:assert/strict'
import test from 'node:test'

import { clearAllClients, getClient } from '../../server/lib/aws-client-factory'
import { batchDeleteItems, batchPutItems, scanAllItems, updateItem } from '../../server/utils/dynamodb'

process.env.AWS_GOVCLOUD_ACCESS_KEY_ID = 'AKIAEXAMPLEGOVCLOUD0'
process.env.AWS_GOVCLOUD_SECRET_ACCESS_KEY = 'test-secret'

// getDynamoDBClient returns the factory's cached client, so stubbing send on
// that instance intercepts every call the helpers make.
async function stubDynamoSend(handler: (command: any) => any) {
  const client: any = await getClient('govcloud', 'dynamodb')
  client.send = async (command: any) => handler(command)
}

test.afterEach(() => {
  clearAllClients()
})

test('batchPutItems retries unprocessed items until they are written', async () => {
  const attempts: number[] = []
  await stubDynamoSend((command) => {
    const requests = command.input.RequestItems.table
    attempts.push(requests.length)
    // First attempt leaves two items unprocessed, as DynamoDB does under throttling.
    if (attempts.length === 1) {
      return { UnprocessedItems: { table: requests.slice(0, 2) } }
    }
    return { UnprocessedItems: {} }
  })

  const items = Array.from({ length: 5 }, (_, i) => ({ id: `item-${i}` }))
  const result = await batchPutItems('table', items)

  assert.deepEqual(attempts, [5, 2])
  assert.deepEqual(result, { processedCount: 5, failedCount: 0 })
})

test('batchPutItems throws instead of reporting a partial write as success', async () => {
  await stubDynamoSend((command) => {
    const requests = command.input.RequestItems.table
    return { UnprocessedItems: { table: requests.slice(0, 1) } }
  })

  await assert.rejects(
    batchPutItems('table', [{ id: 'a' }, { id: 'b' }]),
    /failed for 1 of 2 items/
  )
})

test('batchDeleteItems counts items it could not delete', async () => {
  await stubDynamoSend(() => {
    throw Object.assign(new Error('denied'), { name: 'AccessDeniedException' })
  })

  const result = await batchDeleteItems('table', [{ id: 'a' }, { id: 'b' }, { id: 'c' }])
  assert.deepEqual(result, { deletedCount: 0, failedCount: 3 })
})

test('batch writes split requests into groups of 25', async () => {
  const sizes: number[] = []
  await stubDynamoSend((command) => {
    sizes.push(command.input.RequestItems.table.length)
    return {}
  })

  await batchPutItems('table', Array.from({ length: 60 }, (_, i) => ({ id: i })))
  assert.deepEqual(sizes.sort((a, b) => b - a), [25, 25, 10])
})

test('scanAllItems follows LastEvaluatedKey across pages', async () => {
  const startKeys: unknown[] = []
  await stubDynamoSend((command) => {
    startKeys.push(command.input.ExclusiveStartKey)
    if (!command.input.ExclusiveStartKey) {
      return { Items: [{ id: { S: 'a' } }], LastEvaluatedKey: { id: { S: 'a' } } }
    }
    return { Items: [{ id: { S: 'b' } }] }
  })

  const items = await scanAllItems('table')
  assert.deepEqual(items, [{ id: 'a' }, { id: 'b' }])
  assert.deepEqual(startKeys, [undefined, { id: { S: 'a' } }])
})

test('updateItem rejects an update whose fields are all empty', async () => {
  await stubDynamoSend(() => {
    throw new Error('should not be called')
  })

  await assert.rejects(
    updateItem('table', { id: 'a' }, { name: '', notes: null }),
    /No valid fields to update/
  )
})
