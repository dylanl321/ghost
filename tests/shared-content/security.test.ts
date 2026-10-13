import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'
import * as sanitizers from '../../app/utils/sanitizeHtml'
import { sanitizeMarkdownHtml, sanitizeMermaidSvg } from '../../app/utils/sanitizeHtml'

test('retained Markdown renderers import available sanitizer exports', () => {
  for (const path of [
    '../../app/components/support/MarkdownContent.vue',
    '../../app/components/ai/AiInsightCard.vue',
    '../../app/composables/useMarkdownLinkParser.ts'
  ]) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8')
    const scripts = path.endsWith('.vue')
      ? [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]).join('\n')
      : source
    const parsed = ts.createSourceFile(path, scripts, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    let checked = 0
    for (const statement of parsed.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
      if (statement.moduleSpecifier.text !== '~/utils/sanitizeHtml') continue
      const bindings = statement.importClause?.namedBindings
      assert.ok(bindings && ts.isNamedImports(bindings), `${path} must import sanitizer functions`)
      for (const binding of bindings.elements) {
        const name = (binding.propertyName ?? binding.name).text
        assert.equal(typeof sanitizers[name as keyof typeof sanitizers], 'function', `${path} imports missing sanitizer ${name}`)
        checked++
      }
    }
    assert.ok(checked > 0, `${path} must use the shared sanitizer`)
  }
})

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
