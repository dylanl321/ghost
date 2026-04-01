<template>
  <div class="space-y-6">
    <!-- No data -->
    <div v-if="!actions.length && !cloudwatchActivity" class="text-center py-12">
      <Icon name="i-heroicons-chart-bar" class="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
      <p class="text-gray-500 dark:text-gray-400">No activity data available for this user.</p>
    </div>

    <template v-else>
      <!-- Quick Insights -->
      <div v-if="actions.length" class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <UCard>
          <div class="flex items-center gap-3">
            <div class="p-2 bg-purple-500/10 rounded-lg">
              <Icon name="i-heroicons-fire" class="w-5 h-5 text-purple-500" />
            </div>
            <div>
              <p class="text-xs text-gray-500 dark:text-gray-400">Top Feature</p>
              <p class="text-sm font-bold text-gray-900 dark:text-white">{{ topFeature.label }}</p>
              <p class="text-xs text-gray-400">{{ topFeature.pct }}% of actions</p>
            </div>
          </div>
        </UCard>
        <UCard>
          <div class="flex items-center gap-3">
            <div class="p-2 bg-blue-500/10 rounded-lg">
              <Icon name="i-heroicons-clock" class="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p class="text-xs text-gray-500 dark:text-gray-400">Last Active</p>
              <p class="text-sm font-bold text-gray-900 dark:text-white">{{ formatRelativeDate(new Date(actions[0]!.timestamp).toISOString()) }}</p>
              <p class="text-xs text-gray-400">{{ formatAbsoluteDate(new Date(actions[0]!.timestamp).toISOString()) }}</p>
            </div>
          </div>
        </UCard>
        <UCard>
          <div class="flex items-center gap-3">
            <div class="p-2 bg-green-500/10 rounded-lg">
              <Icon name="i-heroicons-bolt" class="w-5 h-5 text-green-500" />
            </div>
            <div>
              <p class="text-xs text-gray-500 dark:text-gray-400">Tracked Actions</p>
              <p class="text-sm font-bold text-gray-900 dark:text-white">{{ actions.length }}</p>
              <p class="text-xs text-gray-400">across {{ featureBreakdown.length }} features</p>
            </div>
          </div>
        </UCard>
      </div>

      <!-- Feature Usage Bars -->
      <UCard v-if="featureBreakdown.length">
        <template #header>
          <h3 class="text-sm font-semibold text-gray-900 dark:text-white">Feature Usage</h3>
        </template>
        <div class="space-y-4">
          <div v-for="feature in featureBreakdown" :key="feature.area">
            <div class="flex items-center justify-between mb-1.5">
              <div class="flex items-center gap-2">
                <Icon :name="feature.icon" :class="`w-4 h-4 ${feature.color}`" />
                <span class="text-sm font-medium text-gray-800 dark:text-gray-200">{{ feature.label }}</span>
              </div>
              <span class="text-xs text-gray-500 dark:text-gray-400">
                {{ feature.count }} actions · {{ feature.pct }}%
              </span>
            </div>
            <div class="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
              <div
                class="h-full rounded-full transition-all"
                :class="feature.barColor"
                :style="{ width: `${feature.pct}%` }"
              />
            </div>
            <!-- Sub-actions -->
            <div v-if="feature.subActions.length > 1" class="mt-2 pl-6 flex flex-wrap gap-1.5">
              <span
                v-for="sub in feature.subActions.slice(0, 6)"
                :key="sub.label"
                class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-50 dark:bg-gray-800/60 text-xs text-gray-600 dark:text-gray-400"
              >
                {{ sub.label }}
                <span class="font-medium text-gray-900 dark:text-white">{{ sub.count }}</span>
              </span>
              <span v-if="feature.subActions.length > 6" class="text-xs text-gray-400 self-center">
                +{{ feature.subActions.length - 6 }} more
              </span>
            </div>
          </div>
        </div>
      </UCard>

      <!-- Behavioral Preferences -->
      <UCard v-if="preferences.length">
        <template #header>
          <h3 class="text-sm font-semibold text-gray-900 dark:text-white">Behavioral Patterns</h3>
        </template>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div
            v-for="pref in preferences"
            :key="pref.label"
            class="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50"
          >
            <span class="text-sm text-gray-600 dark:text-gray-400">{{ pref.label }}</span>
            <UBadge :color="pref.color as any" variant="soft" size="sm">{{ pref.value }}</UBadge>
          </div>
        </div>
      </UCard>

      <!-- Session Workflows -->
      <UCard v-if="workflows.length">
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-semibold text-gray-900 dark:text-white">Activity Sessions</h3>
            <UBadge color="gray" variant="soft" size="xs">{{ workflows.length }} sessions</UBadge>
          </div>
        </template>
        <div class="space-y-3">
          <div
            v-for="(session, idx) in workflows.slice(0, showAllSessions ? undefined : 5)"
            :key="idx"
            class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
          >
            <!-- Session header -->
            <button
              class="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
              @click="toggleSession(idx)"
            >
              <div class="flex items-center gap-3">
                <div class="flex -space-x-1">
                  <div
                    v-for="area in session.areas.slice(0, 3)"
                    :key="area"
                    class="w-5 h-5 rounded-full flex items-center justify-center ring-2 ring-white dark:ring-gray-900"
                    :class="getFeatureConfig(area).bgClass"
                  >
                    <Icon :name="getFeatureConfig(area).icon" class="w-3 h-3 text-white" />
                  </div>
                </div>
                <div>
                  <span class="text-sm font-medium text-gray-900 dark:text-white">
                    {{ session.summary }}
                  </span>
                  <span class="text-xs text-gray-500 dark:text-gray-400 ml-2">
                    {{ session.actions.length }} actions
                  </span>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-xs text-gray-500 dark:text-gray-400">
                  {{ formatRelativeDate(new Date(session.startTime).toISOString()) }}
                </span>
                <Icon
                  :name="expandedSessions.has(idx) ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
                  class="w-4 h-4 text-gray-400"
                />
              </div>
            </button>

            <!-- Expanded actions -->
            <div v-if="expandedSessions.has(idx)" class="px-4 py-2 space-y-1 border-t border-gray-200 dark:border-gray-700">
              <div
                v-for="(action, aIdx) in session.actions"
                :key="aIdx"
                class="flex items-center gap-3 py-1"
              >
                <div class="w-1.5 h-1.5 rounded-full" :class="getFeatureConfig(action.type.split('.')[0] || 'other').dotColor" />
                <span class="text-xs text-gray-700 dark:text-gray-300">{{ formatActionType(action.type) }}</span>
                <span v-if="action.detail" class="text-xs text-gray-400 font-mono">{{ action.detail }}</span>
                <span class="text-xs text-gray-400 ml-auto whitespace-nowrap">
                  {{ formatTime(action.timestamp) }}
                </span>
              </div>
            </div>
          </div>

          <UButton
            v-if="workflows.length > 5"
            size="sm"
            color="gray"
            variant="ghost"
            block
            @click="showAllSessions = !showAllSessions"
          >
            {{ showAllSessions ? 'Show less' : `Show all ${workflows.length} sessions` }}
          </UButton>
        </div>
      </UCard>

      <!-- CloudWatch server metrics (if available) -->
      <UCard v-if="cloudwatchActivity">
        <template #header>
          <div class="flex items-center gap-2">
            <h3 class="text-sm font-semibold text-gray-900 dark:text-white">Server-Side Metrics</h3>
            <UBadge color="gray" variant="soft" size="xs">from CloudWatch</UBadge>
          </div>
        </template>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div class="text-center p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            <p class="text-xs text-gray-500 dark:text-gray-400">Sessions</p>
            <p class="text-xl font-bold text-gray-900 dark:text-white">{{ cloudwatchActivity.sessionCount }}</p>
          </div>
          <div class="text-center p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            <p class="text-xs text-gray-500 dark:text-gray-400">Avg. Duration</p>
            <p class="text-xl font-bold text-gray-900 dark:text-white">{{ formatSessionDuration(cloudwatchActivity.avgSessionLengthMs) }}</p>
          </div>
          <div class="text-center p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            <p class="text-xs text-gray-500 dark:text-gray-400">Actions Logged</p>
            <p class="text-xl font-bold text-gray-900 dark:text-white">{{ cloudwatchActivity.actionCount || 0 }}</p>
          </div>
        </div>
        <div v-if="cloudwatchActivity.topPages?.length" class="space-y-2">
          <p class="text-xs font-medium text-gray-500 dark:text-gray-400">Most Visited Pages</p>
          <div class="flex flex-wrap gap-2">
            <div
              v-for="page in cloudwatchActivity.topPages.slice(0, 6)"
              :key="page.path"
              class="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-gray-100 dark:bg-gray-800 text-xs"
            >
              <span class="text-gray-700 dark:text-gray-300">{{ page.path }}</span>
              <UBadge color="gray" variant="soft" size="xs">{{ page.count }}</UBadge>
            </div>
          </div>
        </div>
      </UCard>
    </template>
  </div>
</template>

<script setup lang="ts">
import {
  formatSessionDuration,
  formatRelativeDate,
  formatAbsoluteDate,
  formatActionType
} from '~/composables/useAdminUserDetail'

interface RecentAction {
  type: string
  detail?: string
  timestamp: number
}

interface CloudwatchUserMetric {
  avgSessionLengthMs: number
  sessionCount: number
  topPages: Array<{ path: string; count: number }>
  actionCount?: number
  topActions?: Array<{ type: string; count: number }>
}

const props = defineProps<{
  actions: RecentAction[]
  cloudwatchActivity: CloudwatchUserMetric | null
}>()

const expandedSessions = ref(new Set<number>())
const showAllSessions = ref(false)

function toggleSession(idx: number) {
  const next = new Set(expandedSessions.value)
  if (next.has(idx)) next.delete(idx)
  else next.add(idx)
  expandedSessions.value = next
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

// --- Feature area config ---
interface FeatureConfig {
  label: string
  icon: string
  color: string
  barColor: string
  bgClass: string
  dotColor: string
}

const FEATURE_MAP: Record<string, FeatureConfig> = {
  cost: {
    label: 'Cost Dashboard',
    icon: 'i-heroicons-currency-dollar',
    color: 'text-green-500',
    barColor: 'bg-green-500',
    bgClass: 'bg-green-500',
    dotColor: 'bg-green-500'
  },
  export: {
    label: 'Data Export',
    icon: 'i-heroicons-arrow-down-tray',
    color: 'text-blue-500',
    barColor: 'bg-blue-500',
    bgClass: 'bg-blue-500',
    dotColor: 'bg-blue-500'
  },
  account: {
    label: 'Accounts',
    icon: 'i-heroicons-building-office',
    color: 'text-amber-500',
    barColor: 'bg-amber-500',
    bgClass: 'bg-amber-500',
    dotColor: 'bg-amber-500'
  },
  dashboard: {
    label: 'Dashboard',
    icon: 'i-heroicons-squares-2x2',
    color: 'text-indigo-500',
    barColor: 'bg-indigo-500',
    bgClass: 'bg-indigo-500',
    dotColor: 'bg-indigo-500'
  },
  search: {
    label: 'Search',
    icon: 'i-heroicons-magnifying-glass',
    color: 'text-cyan-500',
    barColor: 'bg-cyan-500',
    bgClass: 'bg-cyan-500',
    dotColor: 'bg-cyan-500'
  },
  chat: {
    label: 'AI Chat',
    icon: 'i-heroicons-chat-bubble-left-right',
    color: 'text-purple-500',
    barColor: 'bg-purple-500',
    bgClass: 'bg-purple-500',
    dotColor: 'bg-purple-500'
  }
}

const DEFAULT_FEATURE: FeatureConfig = {
  label: 'Other',
  icon: 'i-heroicons-ellipsis-horizontal-circle',
  color: 'text-gray-500',
  barColor: 'bg-gray-400',
  bgClass: 'bg-gray-500',
  dotColor: 'bg-gray-400'
}

function getFeatureConfig(area: string): FeatureConfig {
  return FEATURE_MAP[area] || DEFAULT_FEATURE
}

function getArea(type: string): string {
  return type.split('.')[0] || 'other'
}

// --- Feature breakdown with horizontal bars ---
const featureBreakdown = computed(() => {
  if (!props.actions.length) return []

  const areaCounts: Record<string, { count: number; subActions: Record<string, number> }> = {}
  for (const a of props.actions) {
    const area = getArea(a.type)
    if (!areaCounts[area]) areaCounts[area] = { count: 0, subActions: {} }
    areaCounts[area].count++

    // Parse detail for sub-action label
    const subLabel = parseSubLabel(a)
    if (subLabel) {
      areaCounts[area].subActions[subLabel] = (areaCounts[area].subActions[subLabel] || 0) + 1
    }
  }

  const total = props.actions.length
  return Object.entries(areaCounts)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([area, data]) => {
      const config = getFeatureConfig(area)
      const subActions = Object.entries(data.subActions)
        .sort((a, b) => b[1] - a[1])
        .map(([label, count]) => ({ label, count }))

      return {
        area,
        ...config,
        count: data.count,
        pct: Math.round((data.count / total) * 100),
        subActions
      }
    })
})

// Top feature for insights card
const topFeature = computed(() => {
  if (!featureBreakdown.value.length) return { label: '—', pct: 0 }
  const f = featureBreakdown.value[0]!
  return { label: f.label, pct: f.pct }
})

// --- Behavioral preferences extracted from action details ---
const preferences = computed(() => {
  const prefs: Array<{ label: string; value: string; color: string }> = []

  // Find preferred cost tab
  const tabSwitches = props.actions.filter(a => a.type === 'cost.tab_switch')
  if (tabSwitches.length) {
    const tabCounts: Record<string, number> = {}
    for (const a of tabSwitches) {
      const tab = a.detail?.replace('chartTab:', '') || 'unknown'
      tabCounts[tab] = (tabCounts[tab] || 0) + 1
    }
    const top = Object.entries(tabCounts).sort((a, b) => b[1] - a[1])[0]
    if (top) prefs.push({ label: 'Preferred Cost View', value: capitalize(top[0]), color: 'green' })
  }

  // Find preferred cost mode
  const modeToggles = props.actions.filter(a => a.type === 'cost.mode_toggle')
  if (modeToggles.length) {
    const modeCounts: Record<string, number> = {}
    for (const a of modeToggles) {
      const mode = a.detail?.replace('mode:', '') || 'unknown'
      modeCounts[mode] = (modeCounts[mode] || 0) + 1
    }
    const top = Object.entries(modeCounts).sort((a, b) => b[1] - a[1])[0]
    if (top) prefs.push({ label: 'Preferred Cost Mode', value: capitalize(top[0]), color: 'blue' })
  }

  // Find most drilled tag
  const drilldowns = props.actions.filter(a => a.type === 'cost.tag_drilldown')
  if (drilldowns.length) {
    const tagCounts: Record<string, number> = {}
    for (const a of drilldowns) {
      const tag = a.detail?.replace('tag:', '') || 'unknown'
      tagCounts[tag] = (tagCounts[tag] || 0) + 1
    }
    const top = Object.entries(tagCounts).sort((a, b) => b[1] - a[1])[0]
    if (top) prefs.push({ label: 'Most Explored Tag', value: top[0], color: 'amber' })
  }

  // Find export sources
  const exports = props.actions.filter(a => a.type.startsWith('export.'))
  if (exports.length) {
    const srcCounts: Record<string, number> = {}
    for (const a of exports) {
      const src = a.detail?.replace('source:', '') || a.type.split('.')[1] || 'unknown'
      srcCounts[src] = (srcCounts[src] || 0) + 1
    }
    const top = Object.entries(srcCounts).sort((a, b) => b[1] - a[1])[0]
    if (top) prefs.push({ label: 'Export Source', value: capitalize(top[0].replace(/-/g, ' ')), color: 'cyan' })
  }

  return prefs
})

// --- Group actions into session workflows ---
const SESSION_GAP_MS = 30 * 60 * 1000 // 30 min gap = new session

const workflows = computed(() => {
  if (!props.actions.length) return []

  // Sort newest first, then group
  const sorted = [...props.actions].sort((a, b) => b.timestamp - a.timestamp)
  const sessions: Array<{ actions: RecentAction[]; startTime: number; endTime: number }> = []
  let current: RecentAction[] = []

  for (const action of sorted) {
    if (current.length) {
      const prevTs = current[current.length - 1]!.timestamp
      if (prevTs - action.timestamp > SESSION_GAP_MS) {
        sessions.push(finalizeSession(current))
        current = []
      }
    }
    current.push(action)
  }
  if (current.length) sessions.push(finalizeSession(current))

  return sessions.map(s => {
    const areas = [...new Set(s.actions.map(a => getArea(a.type)))]
    const areaLabels = areas.map(a => getFeatureConfig(a).label)
    const summary = areaLabels.length <= 2
      ? areaLabels.join(' & ')
      : `${areaLabels[0]} & ${areaLabels.length - 1} more`

    return { ...s, areas, summary }
  })
})

function finalizeSession(actions: RecentAction[]) {
  return {
    actions: actions.sort((a, b) => a.timestamp - b.timestamp), // chronological within session
    startTime: Math.min(...actions.map(a => a.timestamp)),
    endTime: Math.max(...actions.map(a => a.timestamp))
  }
}

// --- Helpers ---
function parseSubLabel(action: RecentAction): string | null {
  if (!action.detail) return null
  // "chartTab:forecast" → "forecast", "tag:aws:createdBy" → "aws:createdBy", "mode:proforma" → "proforma"
  const parts = action.detail.split(':')
  if (parts.length >= 2) return parts.slice(1).join(':')
  return action.detail
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
</script>
