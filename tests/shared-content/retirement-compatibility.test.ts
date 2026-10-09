import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { computed, readonly, ref } from 'vue'
import { DEFAULT_SITE_CONFIG, isRetiredSiteConfigKey } from '../../shared/types/site-config'
import { BADGE_DEFINITIONS } from '../../app/config/badgeDefinitions'
import { useAchievementEngine } from '../../app/composables/useAchievementEngine'

test('retired chatbot settings are excluded while hosted MCP settings remain', async () => {
  const { buildNestedConfig, getSiteConfig } = await import('../../server/utils/site-config')
  const retired = ['features.strandsChat.enabled', 'features.strandsChat.streaming.enabled', 'features.strandsChatPopup.enabled', 'services.strands.serverUrl']
  for (const key of retired) {
    assert.equal(isRetiredSiteConfigKey(key), true)
    assert.equal(await getSiteConfig(key), null)
  }
  assert.equal(DEFAULT_SITE_CONFIG.some(item => isRetiredSiteConfigKey(item.key)), false)
  const mcp = DEFAULT_SITE_CONFIG.find(item => item.key === 'mcp.audit.rawErrors.enabled')!
  assert.deepEqual(buildNestedConfig([mcp, ...retired.map(key => ({ ...mcp, key }))]), {
    mcp: { audit: { rawErrors: { enabled: true } } }
  })
})

test('saved dashboard layouts safely discard the retired chat widget', async () => {
  const globals = globalThis as any
  const previous = Object.fromEntries(['ref', 'computed', 'readonly', 'useUserPreferences', 'useUserRoles'].map(key => [key, globals[key]]))
  Object.assign(globals, { ref, computed, readonly,
    useUserPreferences: () => ({ getPreference: () => ({ sections: [{ id: 'quickChat', visible: true }, { id: 'myActivity', visible: true, displayStyle: 'half' }], metricCards: {} }), setPreference: async () => {} }),
    useUserRoles: () => ({ isAdmin: ref(true) })
  })
  try {
    const { useDashboardLayout } = await import('../../app/composables/useDashboardLayout')
    const dashboard = useDashboardLayout()
    assert.equal(dashboard.layout.value.sections.some(section => (section.id as string) === 'quickChat'), false)
    assert.equal(dashboard.visibleSections.value.some(section => (section.id as string) === 'quickChat'), false)
    assert.deepEqual(dashboard.layout.value.sections[0], { id: 'myActivity', visible: true, displayStyle: 'half' })
  } finally { Object.assign(globals, previous) }
})

test('persisted chat badges do not inflate earned badge counts or return in synced awards', () => {
  const engine = useAchievementEngine()
  engine.init(BADGE_DEFINITIONS)
  const active = BADGE_DEFINITIONS[0]!.id
  engine.loadProgress({ counts: {}, uniques: {}, seen: [], awarded: [active, 'ai-whisperer', 'chatterbox'], awardedAt: { [active]: '2026-10-08', 'ai-whisperer': '2026-10-08' } })
  const saved = engine.getSerializableProgress()
  assert.deepEqual(saved.awarded, [active])
  assert.deepEqual(Object.keys(saved.awardedAt), [active])
})

test('hosted MCP compatibility URLs redirect permanently and chatbot routes are removed', async () => {
  const globals = globalThis as any
  const previous = globals.defineNuxtConfig
  globals.defineNuxtConfig = (config: any) => config
  try {
    const { default: config } = await import('../../nuxt.config')
    for (const [from, to] of [['/chat/mcp', '/mcp-connections'], ['/chat/mcp/details', '/mcp-connections/details'], ['/support/mcp', '/mcp-connections']]) {
      assert.deepEqual((config.routeRules as Record<string, any>)[from!]!.redirect, { to, statusCode: 301 })
    }
    for (const route of ['app/pages/chat', 'server/api/chat', 'server/api/strands', 'server/api/ai/chat.post.ts']) {
      assert.equal(existsSync(resolve(route)), false)
    }
    assert.equal(existsSync(resolve('server/routes/mcp.post.ts')), true)
  } finally { globals.defineNuxtConfig = previous }
})
