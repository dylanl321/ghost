/**
 * Dashboard Layout Composable
 * Manages customizable dashboard section ordering, visibility, and display styles
 * Uses useUserPreferences for persistence (DynamoDB-backed with localStorage fallback)
 */

import type {
  DashboardLayoutConfig,
  DashboardSectionConfig,
  DashboardSectionId,
  DisplayStyle,
  MetricCardId,
} from '#shared/types/dashboard-layout'
import {
  ALL_SECTION_IDS,
  ALL_METRIC_CARD_IDS,
  DEFAULT_DASHBOARD_LAYOUT,
  SECTION_STYLE_SUPPORT,
  layoutsAreEqual,
} from '#shared/types/dashboard-layout'

const LAYOUT_KEY = 'dashboardLayout'

// Cached org default layout (fetched once per session)
const orgDefault = ref<DashboardLayoutConfig | null>(null)
const orgDefaultFetched = ref(false)

async function fetchOrgDefault() {
  if (orgDefaultFetched.value) return
  orgDefaultFetched.value = true
  try {
    const res = await $fetch<{ success: boolean; layout: DashboardLayoutConfig | null }>('/api/admin/dashboard-layout/get-default')
    if (res.success && res.layout) {
      orgDefault.value = res.layout
    }
  } catch {
    // Silently fall back to hardcoded default
  }
}

const ADMIN_SECTION_IDS = new Set<DashboardSectionId>(['adminOverview', 'adminAlerts', 'adminPipeline', 'adminFeedback'])

export function useDashboardLayout() {
  const { setPreference, getPreference } = useUserPreferences()
  const { isAdmin } = useUserRoles()

  // Fetch org default on first use (non-blocking)
  if (import.meta.client && !orgDefaultFetched.value) {
    fetchOrgDefault()
  }

  // Effective default: org-configured default if available, else hardcoded
  const effectiveDefault = computed<DashboardLayoutConfig>(() =>
    orgDefault.value ?? DEFAULT_DASHBOARD_LAYOUT
  )

  // Merge saved layout with defaults to handle new sections added later
  const layout = computed<DashboardLayoutConfig>(() => {
    const saved = getPreference<DashboardLayoutConfig>(LAYOUT_KEY)
    if (!saved || !saved.sections || !Array.isArray(saved.sections)) {
      return {
        sections: [...effectiveDefault.value.sections],
        metricCards: { ...effectiveDefault.value.metricCards },
      }
    }

    // Merge sections: keep saved order, append any new sections not yet in saved config
    const savedIds = new Set(saved.sections.map(s => s.id))
    const mergedSections: DashboardSectionConfig[] = [
      ...saved.sections
        .filter(s => ALL_SECTION_IDS.includes(s.id))
        .map(s => {
          // Migrate legacy 'compact' → 'third'
          const rawStyle = s.displayStyle === 'compact' as any ? 'third' : s.displayStyle
          // Validate displayStyle against supported styles for this section
          const supported = SECTION_STYLE_SUPPORT[s.id] || ['full']
          const style = rawStyle && supported.includes(rawStyle) ? rawStyle : undefined
          return { id: s.id, visible: s.visible, displayStyle: style }
        }),
      ...ALL_SECTION_IDS.filter(id => !savedIds.has(id)).map(id => ({ id, visible: true })),
    ]

    // Merge metric cards: keep saved values, default new ones to true
    const mergedMetricCards = { ...DEFAULT_DASHBOARD_LAYOUT.metricCards }
    if (saved.metricCards) {
      for (const id of ALL_METRIC_CARD_IDS) {
        if (id in saved.metricCards) {
          mergedMetricCards[id] = saved.metricCards[id]
        }
      }
    }

    return { sections: mergedSections, metricCards: mergedMetricCards }
  })

  // Filter out admin-only sections for non-admin users so their wrapper divs
  // don't render as empty grid items and break the column layout
  const visibleSections = computed(() =>
    layout.value.sections.filter(s => s.visible && (isAdmin.value || !ADMIN_SECTION_IDS.has(s.id)))
  )

  const visibleMetricCardCount = computed(() =>
    ALL_METRIC_CARD_IDS.filter(id => layout.value.metricCards[id]).length
  )

  // Whether the current layout matches the org default: true/false/null (no default configured)
  const matchesOrgDefault = computed<boolean | null>(() => {
    if (!orgDefault.value) return null
    return layoutsAreEqual(layout.value, orgDefault.value)
  })

  // Returns Tailwind col-span classes for a section based on its display style
  function sectionColSpan(style?: DisplayStyle): string {
    switch (style) {
      case 'two-thirds': return 'col-span-12 lg:col-span-8'
      case 'half':       return 'col-span-12 lg:col-span-6'
      case 'third':      return 'col-span-12 md:col-span-6 lg:col-span-4'
      default:           return 'col-span-12'
    }
  }

  function isSectionVisible(id: DashboardSectionId): boolean {
    const section = layout.value.sections.find(s => s.id === id)
    return section?.visible ?? true
  }

  function isMetricCardVisible(id: MetricCardId): boolean {
    return layout.value.metricCards[id] ?? true
  }

  async function persist(updated: DashboardLayoutConfig) {
    await setPreference(LAYOUT_KEY, updated)
    useEventBus().emit('dashboard.customized', { action: 'layout_changed' })
  }

  async function toggleSection(id: DashboardSectionId) {
    const current = layout.value
    const wasVisible = current.sections.find(s => s.id === id)?.visible ?? true
    const sections = current.sections.map(s =>
      s.id === id ? { ...s, visible: !s.visible } : s
    )
    await persist({ ...current, sections })
    if (wasVisible) {
      useEventBus().emit('dashboard.widget_removed', { sectionId: id })
    }
  }

  async function toggleMetricCard(id: MetricCardId) {
    const current = layout.value
    const metricCards = { ...current.metricCards, [id]: !current.metricCards[id] }
    await persist({ ...current, metricCards })
  }

  async function moveSectionUp(id: DashboardSectionId) {
    const current = layout.value
    const sections = [...current.sections]
    const idx = sections.findIndex(s => s.id === id)
    if (idx <= 0) return
    ;[sections[idx - 1]!, sections[idx]!] = [sections[idx]!, sections[idx - 1]!]
    await persist({ ...current, sections })
  }

  async function moveSectionDown(id: DashboardSectionId) {
    const current = layout.value
    const sections = [...current.sections]
    const idx = sections.findIndex(s => s.id === id)
    if (idx < 0 || idx >= sections.length - 1) return
    ;[sections[idx]!, sections[idx + 1]!] = [sections[idx + 1]!, sections[idx]!]
    await persist({ ...current, sections })
  }

  async function setSectionStyle(id: DashboardSectionId, style: DisplayStyle) {
    const supported = SECTION_STYLE_SUPPORT[id] || ['full']
    if (!supported.includes(style)) return
    const current = layout.value
    const sections = current.sections.map(s =>
      s.id === id ? { ...s, displayStyle: style } : s
    )
    await persist({ ...current, sections })
  }

  async function reorderSections(newSections: DashboardSectionConfig[]) {
    const current = layout.value
    await persist({ ...current, sections: newSections })
  }

  async function resetLayout() {
    await persist({
      sections: [...effectiveDefault.value.sections],
      metricCards: { ...effectiveDefault.value.metricCards },
    })
  }

  async function exportAsDefault(): Promise<{ saved: true; verified: boolean }> {
    const current = layout.value
    await $fetch('/api/admin/dashboard-layout/set-default', {
      method: 'POST',
      body: { layout: current },
    })
    // Update local cache so the org default reflects immediately
    orgDefault.value = current

    // Verify by fetching back from the server (bypass cache)
    try {
      const res = await $fetch<{ success: boolean; layout: DashboardLayoutConfig | null }>('/api/admin/dashboard-layout/get-default', {
        query: { nocache: '1' },
      })
      const verified = !!(res.success && res.layout && layoutsAreEqual(current, res.layout))
      return { saved: true, verified }
    } catch {
      // Verification fetch failed but the save itself succeeded
      return { saved: true, verified: false }
    }
  }

  return {
    layout,
    visibleSections,
    visibleMetricCardCount,
    matchesOrgDefault,
    orgDefault: readonly(orgDefault),
    sectionColSpan,
    isSectionVisible,
    isMetricCardVisible,
    toggleSection,
    toggleMetricCard,
    moveSectionUp,
    moveSectionDown,
    setSectionStyle,
    reorderSections,
    resetLayout,
    exportAsDefault,
  }
}
