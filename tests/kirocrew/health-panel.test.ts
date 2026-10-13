import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { compileScript, parse } from '@vue/compiler-sfc'
import { createSSRApp, defineComponent, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import ts from 'typescript'
import type { KiroCrewHealth } from '../../shared/types/kirocrew-health'

// Compile only this component for a unit test; no Nuxt/application build.
async function component() {
  const filename = new URL('../../app/components/admin/KiroCrewHealthPanel.vue', import.meta.url)
  const source = await readFile(filename, 'utf8')
  const { descriptor } = parse(source, { filename: filename.pathname })
  const script = compileScript(descriptor, { id: 'health-panel-test', inlineTemplate: true })
  const require = createRequire(import.meta.url)
  const vueUrl = pathToFileURL(require.resolve('vue/dist/vue.runtime.esm-bundler.js')).href
  const compiled = ts.transpileModule(script.content, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
  }).outputText.replace(/from ['"]vue['"]/g, `from '${vueUrl}'`)
  return (await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)).default
}

const health: KiroCrewHealth = {
  checkedAt: '2026-09-16T12:00:00Z', configuration: 'healthy', collaboration: 'disabled',
  revision: 4, publishedAt: null,
  profile: { enabled: false, spaces: 2, enabledSpaces: 0, sourceBindings: 1, evidencePolicies: 1, workflowVersions: 2 },
  checks: [
    { id: 'configuration-store', label: 'Configuration storage', state: 'ok', detail: 'The current revision was read.' },
    { id: 'collaboration-runtime', label: 'Collaboration API runtime', state: 'disabled', detail: 'Disabled in the published profile.' },
    { id: 'lifecycle-workers', label: 'Workers', state: 'unverified', detail: 'No observed heartbeat.' }
  ]
}

test('admin health panel renders distinct states, timestamps and accessible refresh without settings inputs', async () => {
  const panel = await component()
  const app = createSSRApp(panel, { health, loading: false, error: '' })
  app.component('UButton', defineComponent({
    setup(_, { slots }) { return () => h('button', slots.default?.()) }
  }))
  const html = await renderToString(app)
  for (const label of ['Health and status', 'Configuration checks passed', 'Collaboration disabled',
    'Not verified', 'Published revision 4', '2026-09-16T12:00:00Z', 'Refresh health', '0 / 2']) {
    assert.ok(html.includes(label), label)
  }
  assert.ok(html.includes('aria-labelledby="kirocrew-health-title"'))
  assert.ok(!/<(?:input|textarea)\b/.test(html))
})

test('refresh errors retain timestamped observations and explicitly mark them stale', async () => {
  const panel = await component()
  const html = await renderToString(createSSRApp(panel, {
    health: { ...health, collaboration: 'not-ready', configuration: 'attention' },
    loading: false, error: 'Unable to refresh health.'
  }).component('UButton', { template: '<button><slot /></button>' }))
  assert.ok(html.includes('role="alert"'))
  assert.ok(html.includes('may be stale'))
  assert.ok(html.includes('Configuration needs attention'))
  assert.ok(html.includes('Collaboration not ready'))
  assert.ok(html.includes('2026-09-16T12:00:00Z'))
})

test('initial loading and denied views do not invent health observations', async () => {
  const panel = await component()
  for (const props of [
    { health: null, loading: true, error: '' },
    { health: null, loading: false, error: 'Administrator access is required.' }
  ]) {
    const html = await renderToString(createSSRApp(panel, props).component('UButton', { template: '<button><slot /></button>' }))
    assert.ok(!html.includes('Configuration checks passed'))
    assert.ok(!html.includes('Published revision'))
    assert.ok(html.includes(props.loading ? 'Checking Kiro Crew health' : 'Administrator access is required'))
  }
})
