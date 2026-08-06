import assert from 'node:assert/strict'
import test from 'node:test'
import { sanitizeChatHtml, sanitizeMermaidSvg } from '../../app/utils/sanitizeHtml'
import { serializePublicChatMessage } from '../../server/utils/public-chat'

test('chat sanitizer removes executable markup and unsafe protocols', () => {
  const result = sanitizeChatHtml('<img src="x" onerror="alert(1)"><a href="javascript:alert(1)">bad</a><script>alert(1)</script>')
  assert.equal(result.includes('onerror'), false)
  assert.equal(result.includes('javascript:'), false)
  assert.equal(result.includes('<script'), false)
})

test('chat sanitizer keeps explicit entity attributes', () => {
  const result = sanitizeChatHtml('<a href="/account/100771856592" data-entity-type="account-id" data-entity-value="100771856592" data-nuxt-link>account</a>')
  assert.match(result, /data-entity-type="account-id"/)
  assert.match(result, /href="\/account\/100771856592"/)
})

test('mermaid sanitizer strips scriptable SVG content', () => {
  const result = sanitizeMermaidSvg('<svg><script>alert(1)</script><foreignObject><div>bad</div></foreignObject><text>ok</text></svg>')
  assert.equal(result.includes('script'), false)
  assert.equal(result.includes('foreignObject'), false)
  assert.match(result, /<text>ok<\/text>/)
})

test('public messages omit private execution details', () => {
  const source = {
    messageId: 'message-1',
    role: 'assistant' as const,
    content: 'Result',
    timestamp: '2026-07-27T00:00:00.000Z',
    reasoning: 'private chain',
    jobId: 'job-1',
    metadata: { mcpUsed: 'private-tool', model: 'private-model', tokens: { input: 1 } },
    status: { status: 'complete' }
  }
  const result = serializePublicChatMessage(source)
  assert.deepEqual(result, {
    messageId: source.messageId,
    role: source.role,
    content: source.content,
    timestamp: source.timestamp
  })
})
