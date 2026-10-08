import assert from 'node:assert/strict'
import test from 'node:test'
import { sanitizeMarkdownHtml, sanitizeMermaidSvg } from '../../app/utils/sanitizeHtml'

test('Markdown sanitizer removes executable markup and unsafe protocols', () => {
  const result = sanitizeMarkdownHtml('<img src="x" onerror="alert(1)"><a href="javascript:alert(1)">bad</a><script>alert(1)</script>')
  assert.equal(result.includes('onerror'), false)
  assert.equal(result.includes('javascript:'), false)
  assert.equal(result.includes('<script'), false)
})

test('Markdown sanitizer keeps explicit entity attributes', () => {
  const result = sanitizeMarkdownHtml('<a href="/account/100771856592" data-entity-type="account-id" data-entity-value="100771856592" data-nuxt-link>account</a>')
  assert.match(result, /data-entity-type="account-id"/)
  assert.match(result, /href="\/account\/100771856592"/)
})

test('mermaid sanitizer strips scriptable SVG content', () => {
  const result = sanitizeMermaidSvg('<svg><script>alert(1)</script><foreignObject><div>bad</div></foreignObject><text>ok</text></svg>')
  assert.equal(result.includes('script'), false)
  assert.equal(result.includes('foreignObject'), false)
  assert.match(result, /<text>ok<\/text>/)
})
