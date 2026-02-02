<template>
  <div class="space-y-6">
    <!-- Header & Controls -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h2 class="text-xl font-bold text-gray-900 dark:text-white">User Journey Visualizer</h2>
        <p class="text-sm text-gray-500 dark:text-gray-400">See how users navigate through the site</p>
      </div>
      <div class="flex items-center gap-2">
        <USelect
          v-model="timeRange"
          :options="timeRangeOptions"
          class="w-36"
          @change="fetchData"
        />
        <UButton
          icon="i-heroicons-arrow-path"
          color="gray"
          variant="soft"
          :loading="loading"
          @click="fetchData"
        />
      </div>
    </div>

    <!-- View Tabs -->
    <UTabs v-model="activeTab" :items="tabs" class="w-full">
      <template #item="{ item }">
        <UCard class="mt-4">
          <!-- Flow Diagram View -->
          <div v-if="item.key === 'flow'" class="min-h-[500px]">
            <div v-if="loading" class="flex items-center justify-center h-[500px]">
              <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-primary-500" />
            </div>
            <div v-else-if="flowData.links.length === 0" class="flex flex-col items-center justify-center h-[500px] text-gray-500">
              <UIcon name="i-heroicons-chart-bar" class="w-12 h-12 mb-4" />
              <p>No navigation data available for this time period</p>
            </div>
            <div v-else ref="sankeyContainer" class="w-full h-[500px]"></div>
          </div>

          <!-- User Sessions View -->
          <div v-else-if="item.key === 'sessions'" class="min-h-[400px]">
            <div v-if="loading" class="flex items-center justify-center h-[400px]">
              <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-primary-500" />
            </div>
            <div v-else-if="userSessions.length === 0" class="flex flex-col items-center justify-center h-[400px] text-gray-500">
              <UIcon name="i-heroicons-users" class="w-12 h-12 mb-4" />
              <p>No user sessions found</p>
            </div>
            <div v-else class="space-y-4">
              <!-- User selector -->
              <div class="flex items-center gap-4 pb-4 border-b border-gray-200 dark:border-gray-700">
                <span class="text-sm text-gray-500">Select user:</span>
                <div class="flex flex-wrap gap-2">
                  <UButton
                    v-for="user in uniqueUsers"
                    :key="user"
                    :color="selectedUser === user ? 'primary' : 'gray'"
                    :variant="selectedUser === user ? 'solid' : 'soft'"
                    size="sm"
                    @click="selectedUser = user"
                  >
                    {{ user }}
                  </UButton>
                </div>
              </div>

              <!-- Journey Timeline -->
              <div v-if="selectedUserJourney.length > 0" class="relative">
                <!-- Journey Steps -->
                <div class="space-y-0">
                  <template v-for="(step, idx) in selectedUserJourney" :key="idx">
                    <!-- Step Card -->
                    <div class="flex gap-3 group">
                      <!-- Timeline column -->
                      <div class="flex flex-col items-center">
                        <!-- Node -->
                        <div
                          class="relative z-10 flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all duration-300 flex-shrink-0"
                          :class="getStepNodeClass(step, idx)"
                        >
                          <UIcon :name="getPageIcon(step.path)" class="w-4 h-4" />
                          <!-- Animated pulse for most recent -->
                          <span
                            v-if="idx === 0"
                            class="absolute inset-0 rounded-full bg-primary-500 animate-ping opacity-20"
                          ></span>
                        </div>
                        <!-- Connector line -->
                        <div
                          v-if="idx < selectedUserJourney.length - 1"
                          class="w-0.5 flex-1 min-h-[20px] bg-gray-200 dark:bg-gray-700"
                        ></div>
                      </div>

                      <!-- Content -->
                      <div class="flex-1 min-w-0 pb-4">
                        <!-- Page info card -->
                        <div class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                          <div class="flex items-start justify-between gap-2">
                            <div class="min-w-0 flex-1">
                              <div class="flex items-center gap-2 flex-wrap">
                                <NuxtLink
                                  :to="step.path"
                                  class="font-medium text-gray-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 transition-colors text-sm"
                                >
                                  {{ getDetailedPageName(step.path) }}
                                </NuxtLink>
                              </div>
                              <code class="text-xs text-gray-400 dark:text-gray-500 block mt-0.5 truncate">{{ step.path }}</code>
                            </div>
                            <UBadge color="primary" variant="soft" size="xs" class="flex-shrink-0">
                              {{ simplifyPath(step.path) }}
                            </UBadge>
                          </div>
                          <div class="flex items-center gap-4 mt-2 text-xs text-gray-500">
                            <span class="flex items-center gap-1">
                              <UIcon name="i-heroicons-clock" class="w-3 h-3" />
                              {{ formatTime(step.timestamp) }}
                            </span>
                            <span v-if="step.duration && step.duration > 0" class="flex items-center gap-1">
                              <UIcon name="i-heroicons-clock" class="w-3 h-3" />
                              {{ formatDuration(step.duration) }} on page
                            </span>
                          </div>
                        </div>

                        <!-- Time delta badge (between steps) -->
                        <div
                          v-if="idx < selectedUserJourney.length - 1"
                          class="flex items-center gap-2 mt-2 ml-2"
                        >
                          <UIcon name="i-heroicons-arrow-down" class="w-3 h-3 text-gray-400" />
                          <span class="text-xs text-gray-400">
                            {{ formatTimeDelta(step.timestamp - (selectedUserJourney[idx + 1]?.timestamp || step.timestamp)) }} earlier
                          </span>
                        </div>
                      </div>
                    </div>
                  </template>
                </div>

                <!-- Journey Summary -->
                <div class="mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                    <div>
                      <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ selectedUserJourney.length }}</p>
                      <p class="text-xs text-gray-500">Pages Visited</p>
                    </div>
                    <div>
                      <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ uniquePagesCount }}</p>
                      <p class="text-xs text-gray-500">Unique Pages</p>
                    </div>
                    <div>
                      <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ formatDuration(totalSessionTime) }}</p>
                      <p class="text-xs text-gray-500">Session Time</p>
                    </div>
                    <div>
                      <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ mostVisitedPage }}</p>
                      <p class="text-xs text-gray-500">Most Visited</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Heatmap View -->
          <div v-else-if="item.key === 'heatmap'" class="min-h-[500px]">
            <div v-if="loading" class="flex items-center justify-center h-[500px]">
              <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-primary-500" />
            </div>
            <div v-else ref="heatmapContainer" class="w-full h-[500px]"></div>
          </div>

          <!-- Live View -->
          <div v-else-if="item.key === 'live'" class="min-h-[400px]">
            <div class="relative bg-gray-900 rounded-lg p-6 overflow-hidden h-[500px]">
              <!-- Site Map Background -->
              <svg class="absolute inset-0 w-full h-full" viewBox="0 0 800 500" preserveAspectRatio="xMidYMid meet">
                <!-- Page Nodes -->
                <g v-for="(node, idx) in siteMapNodes" :key="node.id">
                  <circle
                    :cx="node.x"
                    :cy="node.y"
                    :r="30 + (node.visits || 0) * 2"
                    :fill="node.color"
                    :opacity="0.2"
                  />
                  <circle
                    :cx="node.x"
                    :cy="node.y"
                    r="25"
                    :fill="node.color"
                    class="transition-all duration-300"
                    :class="{ 'animate-pulse': node.active }"
                  />
                  <text
                    :x="node.x"
                    :y="node.y + 45"
                    text-anchor="middle"
                    class="fill-white text-xs font-medium"
                  >
                    {{ node.label }}
                  </text>
                  <text
                    :x="node.x"
                    :y="node.y + 5"
                    text-anchor="middle"
                    class="fill-white text-lg"
                  >
                    {{ node.icon }}
                  </text>
                </g>

                <!-- Animated Paths -->
                <g v-for="(path, idx) in activePaths" :key="`path-${idx}`">
                  <line
                    :x1="path.from.x"
                    :y1="path.from.y"
                    :x2="path.to.x"
                    :y2="path.to.y"
                    stroke="rgba(16, 185, 129, 0.3)"
                    stroke-width="2"
                  />
                  <!-- Animated dot -->
                  <circle
                    r="6"
                    fill="#10b981"
                    class="animate-path-dot"
                    :style="{
                      '--from-x': path.from.x + 'px',
                      '--from-y': path.from.y + 'px',
                      '--to-x': path.to.x + 'px',
                      '--to-y': path.to.y + 'px',
                      'animation-delay': (idx * 0.5) + 's'
                    }"
                  >
                    <animate
                      attributeName="cx"
                      :from="path.from.x"
                      :to="path.to.x"
                      dur="2s"
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="cy"
                      :from="path.from.y"
                      :to="path.to.y"
                      dur="2s"
                      repeatCount="indefinite"
                    />
                  </circle>
                </g>
              </svg>

              <!-- Legend -->
              <div class="absolute bottom-4 left-4 bg-white/85 dark:bg-gray-800/80 border border-gray-200/70 dark:border-gray-700/60 backdrop-blur rounded-lg p-3">
                <p class="text-xs text-gray-700 dark:text-gray-400 mb-2">Live Navigation Paths</p>
                <div class="flex items-center gap-2">
                  <span class="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span class="text-xs text-gray-700 dark:text-gray-300">Active navigation</span>
                </div>
              </div>

              <!-- Recent Activity Feed -->
              <div class="absolute top-4 right-4 w-64 bg-white/85 dark:bg-gray-800/80 border border-gray-200/70 dark:border-gray-700/60 backdrop-blur rounded-lg p-3 max-h-[200px] overflow-y-auto">
                <p class="text-xs text-gray-700 dark:text-gray-400 mb-2 font-medium">Recent Activity</p>
                <div class="space-y-2">
                  <div
                    v-for="(activity, idx) in recentActivity.slice(0, 5)"
                    :key="idx"
                    class="flex items-center gap-2 text-xs animate-fade-in"
                    :style="{ 'animation-delay': (idx * 0.1) + 's' }"
                  >
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    <span class="text-gray-800 dark:text-gray-300 truncate">{{ activity.user }}</span>
                    <UIcon name="i-heroicons-arrow-right" class="w-3 h-3 text-gray-500 dark:text-gray-500" />
                    <span class="text-emerald-400 truncate">{{ activity.path }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </UCard>
      </template>
    </UTabs>
  </div>
</template>

<script setup lang="ts">
import * as echarts from 'echarts'

interface NavigationLog {
  timestamp: number
  user: string
  path: string
}

interface FlowData {
  nodes: Array<{ name: string }>
  links: Array<{ source: string; target: string; value: number }>
}

interface UserSession {
  user: string
  steps: Array<{ path: string; timestamp: number; duration?: number }>
}

const loading = ref(false)
const timeRange = ref('1h')
const activeTab = ref(0)
const selectedUser = ref<string | null>(null)

const navigationLogs = ref<NavigationLog[]>([])
const sankeyContainer = ref<HTMLElement | null>(null)
const heatmapContainer = ref<HTMLElement | null>(null)
let sankeyChart: echarts.ECharts | null = null
let heatmapChart: echarts.ECharts | null = null

const timeRangeOptions = [
  { label: 'Last Hour', value: '1h' },
  { label: 'Last 24 Hours', value: '1d' },
  { label: 'Last 7 Days', value: '1w' },
]

const tabs = [
  { key: 'flow', label: 'Navigation Flow', icon: 'i-heroicons-arrow-trending-up' },
  { key: 'sessions', label: 'User Sessions', icon: 'i-heroicons-user' },
  { key: 'heatmap', label: 'Page Heatmap', icon: 'i-heroicons-fire' },
  { key: 'live', label: 'Live View', icon: 'i-heroicons-signal' },
]

const timeRangeMap: Record<string, number> = {
  '1h': 3600,
  '1d': 86400,
  '1w': 604800,
}

// Fetch navigation data
async function fetchData() {
  loading.value = true
  try {
    const duration = timeRangeMap[timeRange.value]
    const res = await fetch(`/api/logging/activity-logs?durationInSeconds=${duration}`)
    const data = await res.json()

    if (data.success && data.data) {
      // Parse navigation logs
      navigationLogs.value = data.data
        .filter((log: any) => log.message.startsWith('Navigation - USER:'))
        .map((log: any) => {
          const match = log.message.match(/USER:([\w.@-]+),?\s*PATH:(.+)/)
          return match ? {
            timestamp: log.timestamp,
            user: match[1],
            path: match[2].trim()
          } : null
        })
        .filter(Boolean)
        .sort((a: NavigationLog, b: NavigationLog) => b.timestamp - a.timestamp)

      // Auto-select first user
      const firstLog = navigationLogs.value[0]
      if (firstLog && !selectedUser.value) {
        selectedUser.value = firstLog.user
      }

      // Render charts after data loads
      await nextTick()
      if (activeTab.value === 0) renderSankeyChart()
      if (activeTab.value === 2) renderHeatmapChart()
    }
  } catch (err) {
    console.error('Error fetching navigation data:', err)
  } finally {
    loading.value = false
  }
}

// Compute flow data for Sankey diagram (must be a DAG - no cycles)
const flowData = computed<FlowData>(() => {
  const transitions = new Map<string, number>()
  const nodes = new Set<string>()

  // Group by user and sort by time
  const userLogs = new Map<string, NavigationLog[]>()
  navigationLogs.value.forEach(log => {
    const logs = userLogs.get(log.user) || []
    logs.push(log)
    userLogs.set(log.user, logs)
  })

  // Calculate transitions
  userLogs.forEach(logs => {
    logs.sort((a, b) => a.timestamp - b.timestamp)
    for (let i = 0; i < logs.length - 1; i++) {
      const currentLog = logs[i]
      const nextLog = logs[i + 1]
      if (!currentLog || !nextLog) continue
      const from = simplifyPath(currentLog.path)
      const to = simplifyPath(nextLog.path)
      if (from !== to) {
        const key = `${from}|||${to}`
        transitions.set(key, (transitions.get(key) || 0) + 1)
        nodes.add(from)
        nodes.add(to)
      }
    }
  })

  // Convert to links array
  let links = Array.from(transitions.entries()).map(([key, value]) => {
    const parts = key.split('|||')
    const source = parts[0] || ''
    const target = parts[1] || ''
    return { source, target, value }
  })

  // Remove cycles: Sankey requires a DAG
  // Strategy: Build a level map and only keep edges going to higher levels
  const nodeArray = Array.from(nodes)
  const levelMap = new Map<string, number>()
  const outEdges = new Map<string, string[]>()

  // Build adjacency list
  links.forEach(link => {
    const edges = outEdges.get(link.source) || []
    edges.push(link.target)
    outEdges.set(link.source, edges)
  })

  // Assign levels using BFS from nodes with no incoming edges
  const incomingCount = new Map<string, number>()
  nodeArray.forEach(n => incomingCount.set(n, 0))
  links.forEach(link => {
    incomingCount.set(link.target, (incomingCount.get(link.target) || 0) + 1)
  })

  // Find root nodes (no incoming edges) or use highest outgoing count
  let queue = nodeArray.filter(n => incomingCount.get(n) === 0)
  if (queue.length === 0) {
    // No root nodes - pick node with most outgoing edges
    let maxOut = 0
    let maxNode = nodeArray[0] || ''
    outEdges.forEach((edges, node) => {
      if (edges.length > maxOut) {
        maxOut = edges.length
        maxNode = node
      }
    })
    queue = [maxNode]
  }

  // BFS to assign levels
  let level = 0
  const visited = new Set<string>()
  while (queue.length > 0) {
    const nextQueue: string[] = []
    for (const node of queue) {
      if (visited.has(node)) continue
      visited.add(node)
      levelMap.set(node, level)
      const edges = outEdges.get(node) || []
      for (const target of edges) {
        if (!visited.has(target)) {
          nextQueue.push(target)
        }
      }
    }
    level++
    queue = nextQueue
    // Safety: prevent infinite loop
    if (level > 100) break
  }

  // Assign levels to any unvisited nodes
  nodeArray.forEach(n => {
    if (!levelMap.has(n)) {
      levelMap.set(n, level)
    }
  })

  // Filter links: only keep forward edges (source level < target level)
  // For edges at same level or backwards, keep only the dominant direction
  const edgePairs = new Map<string, { forward: number; backward: number }>()
  links.forEach(link => {
    const srcLevel = levelMap.get(link.source) || 0
    const tgtLevel = levelMap.get(link.target) || 0
    const pairKey = [link.source, link.target].sort().join('|||')

    if (!edgePairs.has(pairKey)) {
      edgePairs.set(pairKey, { forward: 0, backward: 0 })
    }
    const pair = edgePairs.get(pairKey)!

    if (srcLevel < tgtLevel) {
      pair.forward += link.value
    } else if (srcLevel > tgtLevel) {
      pair.backward += link.value
    } else {
      // Same level - treat as forward if source comes first alphabetically
      if (link.source < link.target) {
        pair.forward += link.value
      } else {
        pair.backward += link.value
      }
    }
  })

  // Build final links - only keep dominant direction
  const finalLinks: Array<{ source: string; target: string; value: number }> = []
  const processedPairs = new Set<string>()

  links.forEach(link => {
    const pairKey = [link.source, link.target].sort().join('|||')
    if (processedPairs.has(pairKey)) return
    processedPairs.add(pairKey)

    const pair = edgePairs.get(pairKey)
    if (!pair) return

    const srcLevel = levelMap.get(link.source) || 0
    const tgtLevel = levelMap.get(link.target) || 0

    if (pair.forward >= pair.backward) {
      // Keep forward direction
      if (srcLevel <= tgtLevel) {
        finalLinks.push({ source: link.source, target: link.target, value: pair.forward + pair.backward })
      } else {
        finalLinks.push({ source: link.target, target: link.source, value: pair.forward + pair.backward })
      }
    } else {
      // Keep backward direction (reversed)
      if (srcLevel > tgtLevel) {
        finalLinks.push({ source: link.target, target: link.source, value: pair.forward + pair.backward })
      } else {
        finalLinks.push({ source: link.source, target: link.target, value: pair.forward + pair.backward })
      }
    }
  })

  return {
    nodes: nodeArray.map(name => ({ name })),
    links: finalLinks
  }
})

// User sessions
const userSessions = computed<UserSession[]>(() => {
  const sessions = new Map<string, NavigationLog[]>()
  navigationLogs.value.forEach(log => {
    const logs = sessions.get(log.user) || []
    logs.push(log)
    sessions.set(log.user, logs)
  })

  return Array.from(sessions.entries()).map(([user, logs]) => ({
    user,
    steps: logs
      .sort((a, b) => b.timestamp - a.timestamp)
      .map((log, idx, arr) => {
        const nextLog = arr[idx + 1]
        return {
          path: log.path,
          timestamp: log.timestamp,
          duration: nextLog ? log.timestamp - nextLog.timestamp : undefined
        }
      })
  }))
})

const uniqueUsers = computed(() => [...new Set(navigationLogs.value.map(l => l.user))])

const selectedUserJourney = computed(() => {
  if (!selectedUser.value) return []
  const session = userSessions.value.find(s => s.user === selectedUser.value)
  return session?.steps || []
})

const uniquePagesCount = computed(() => {
  return new Set(selectedUserJourney.value.map(s => s.path)).size
})

const totalSessionTime = computed(() => {
  const journey = selectedUserJourney.value
  if (journey.length < 2) return 0
  const first = journey[journey.length - 1]
  const last = journey[0]
  if (!first || !last) return 0
  return last.timestamp - first.timestamp
})

const mostVisitedPage = computed(() => {
  const counts = new Map<string, number>()
  selectedUserJourney.value.forEach(s => {
    counts.set(s.path, (counts.get(s.path) || 0) + 1)
  })
  let max = 0
  let maxPath = '-'
  counts.forEach((count, path) => {
    if (count > max) {
      max = count
      maxPath = simplifyPath(path)
    }
  })
  return maxPath
})

// Site map nodes for live view
const siteMapNodes = computed(() => {
  const pageCounts = new Map<string, number>()
  navigationLogs.value.forEach(log => {
    const simplified = simplifyPath(log.path)
    pageCounts.set(simplified, (pageCounts.get(simplified) || 0) + 1)
  })

  const nodes = [
    { id: 'home', label: 'Dashboard', x: 400, y: 80, color: '#3b82f6', icon: '🏠' },
    { id: 'explorer', label: 'Explorer', x: 200, y: 180, color: '#8b5cf6', icon: '🔍' },
    { id: 'costs', label: 'Costs', x: 600, y: 180, color: '#10b981', icon: '💰' },
    { id: 'account', label: 'Account', x: 150, y: 300, color: '#f59e0b', icon: '🏢' },
    { id: 'admin', label: 'Admin', x: 400, y: 300, color: '#ef4444', icon: '⚙️' },
    { id: 'chat', label: 'AI Chat', x: 650, y: 300, color: '#06b6d4', icon: '💬' },
    { id: 'profile', label: 'Profile', x: 250, y: 420, color: '#ec4899', icon: '👤' },
    { id: 'reports', label: 'Reports', x: 550, y: 420, color: '#84cc16', icon: '📊' },
  ]

  return nodes.map(node => ({
    ...node,
    visits: pageCounts.get(node.label.toLowerCase()) || pageCounts.get(node.id) || 0,
    active: navigationLogs.value.slice(0, 3).some(l =>
      simplifyPath(l.path).toLowerCase().includes(node.id)
    )
  }))
})

// Active paths for animation
const activePaths = computed(() => {
  const paths: Array<{ from: any; to: any }> = []
  const recentLogs = navigationLogs.value.slice(0, 10)

  // Group by user
  const userLogs = new Map<string, NavigationLog[]>()
  recentLogs.forEach(log => {
    const logs = userLogs.get(log.user) || []
    logs.push(log)
    userLogs.set(log.user, logs)
  })

  userLogs.forEach(logs => {
    logs.sort((a, b) => a.timestamp - b.timestamp)
    for (let i = 0; i < logs.length - 1; i++) {
      const currentLog = logs[i]
      const nextLog = logs[i + 1]
      if (!currentLog || !nextLog) continue
      const fromNode = siteMapNodes.value.find(n =>
        simplifyPath(currentLog.path).toLowerCase().includes(n.id)
      )
      const toNode = siteMapNodes.value.find(n =>
        simplifyPath(nextLog.path).toLowerCase().includes(n.id)
      )
      if (fromNode && toNode && fromNode.id !== toNode.id) {
        paths.push({ from: fromNode, to: toNode })
      }
    }
  })

  return paths.slice(0, 5)
})

// Recent activity for live view
const recentActivity = computed(() => {
  return navigationLogs.value.slice(0, 10).map(log => ({
    user: log.user,
    path: simplifyPath(log.path),
    timestamp: log.timestamp
  }))
})

// Render Sankey chart
function renderSankeyChart() {
  if (!sankeyContainer.value || flowData.value.nodes.length === 0) return

  if (sankeyChart) {
    sankeyChart.dispose()
  }

  sankeyChart = echarts.init(sankeyContainer.value, 'dark')

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      triggerOn: 'mousemove',
      formatter: (params: any) => {
        if (params.dataType === 'edge') {
          return `${params.data.source} → ${params.data.target}<br/>Transitions: ${params.data.value}`
        }
        return params.name
      }
    },
    series: [{
      type: 'sankey',
      layout: 'none',
      emphasis: {
        focus: 'adjacency'
      },
      nodeAlign: 'left',
      data: flowData.value.nodes.map(node => ({
        name: node.name,
        itemStyle: { color: getNodeColor(node.name) }
      })),
      links: flowData.value.links,
      lineStyle: {
        color: 'gradient',
        curveness: 0.5,
        opacity: 0.4
      },
      label: {
        color: '#fff',
        fontSize: 12
      }
    }]
  }

  sankeyChart.setOption(option)
}

// Render heatmap chart
function renderHeatmapChart() {
  if (!heatmapContainer.value) return

  if (heatmapChart) {
    heatmapChart.dispose()
  }

  heatmapChart = echarts.init(heatmapContainer.value, 'dark')

  // Build transition matrix
  const pages = [...new Set(navigationLogs.value.map(l => simplifyPath(l.path)))]
  const matrix: number[][] = pages.map(() => pages.map(() => 0))

  const userLogs = new Map<string, NavigationLog[]>()
  navigationLogs.value.forEach(log => {
    const logs = userLogs.get(log.user) || []
    logs.push(log)
    userLogs.set(log.user, logs)
  })

  userLogs.forEach(logs => {
    logs.sort((a, b) => a.timestamp - b.timestamp)
    for (let i = 0; i < logs.length - 1; i++) {
      const currentLog = logs[i]
      const nextLog = logs[i + 1]
      if (!currentLog || !nextLog) continue
      const fromIdx = pages.indexOf(simplifyPath(currentLog.path))
      const toIdx = pages.indexOf(simplifyPath(nextLog.path))
      if (fromIdx !== -1 && toIdx !== -1) {
        const row = matrix[fromIdx]
        if (row && row[toIdx] !== undefined) {
          row[toIdx] = (row[toIdx] || 0) + 1
        }
      }
    }
  })

  const data: [number, number, number][] = []
  matrix.forEach((row, i) => {
    row.forEach((value, j) => {
      if (value > 0) {
        data.push([i, j, value])
      }
    })
  })

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      position: 'top',
      formatter: (params: any) => {
        return `${pages[params.data[0]]} → ${pages[params.data[1]]}<br/>Transitions: ${params.data[2]}`
      }
    },
    grid: {
      left: 120,
      right: 20,
      top: 20,
      bottom: 120
    },
    xAxis: {
      type: 'category',
      data: pages,
      axisLabel: {
        rotate: 45,
        color: '#9ca3af',
        fontSize: 10
      },
      axisLine: { lineStyle: { color: '#374151' } }
    },
    yAxis: {
      type: 'category',
      data: pages,
      axisLabel: {
        color: '#9ca3af',
        fontSize: 10
      },
      axisLine: { lineStyle: { color: '#374151' } }
    },
    visualMap: {
      min: 0,
      max: Math.max(...data.map(d => d[2]), 1),
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      inRange: {
        color: ['#1e293b', '#3b82f6', '#10b981', '#f59e0b', '#ef4444']
      },
      textStyle: { color: '#9ca3af' }
    },
    series: [{
      type: 'heatmap',
      data,
      label: {
        show: true,
        color: '#fff',
        fontSize: 10
      },
      emphasis: {
        itemStyle: {
          shadowBlur: 10,
          shadowColor: 'rgba(0, 0, 0, 0.5)'
        }
      }
    }]
  }

  heatmapChart.setOption(option)
}

// Helper functions
function simplifyPath(path: string): string {
  // Simplify paths for grouping
  if (path === '/') return 'Dashboard'
  if (path.match(/^\/account\/\d+/)) return 'Account Details'
  if (path.includes('/account/explorer')) return 'Explorer'
  if (path.includes('/account/costs')) return 'Costs'
  if (path.includes('/account/org')) return 'Org Chart'
  if (path.includes('/admin')) return 'Admin'
  if (path.includes('/chat')) return 'AI Chat'
  if (path.includes('/profile')) return 'Profile'
  if (path.includes('/settings')) return 'Settings'
  if (path.includes('/reports')) return 'Reports'
  if (path.includes('/support')) return 'Support'

  // Return cleaned path
  const parts = path.split('/').filter(Boolean)
  const firstPart = parts[0]
  if (!firstPart) return path
  return firstPart.charAt(0).toUpperCase() + firstPart.slice(1)
}

function getNodeColor(name: string): string {
  const colors: Record<string, string> = {
    'Dashboard': '#3b82f6',
    'Explorer': '#8b5cf6',
    'Costs': '#10b981',
    'Account Details': '#f59e0b',
    'Admin': '#ef4444',
    'AI Chat': '#06b6d4',
    'Profile': '#ec4899',
    'Settings': '#6366f1',
    'Reports': '#84cc16',
    'Org Chart': '#14b8a6',
    'Support': '#a855f7'
  }
  return colors[name] || '#6b7280'
}

function getPageIcon(path: string): string {
  if (path === '/') return 'i-heroicons-home'
  if (path.includes('/admin')) return 'i-heroicons-shield-check'
  if (path.includes('/account/costs')) return 'i-heroicons-currency-dollar'
  if (path.includes('/account/explorer')) return 'i-heroicons-magnifying-glass'
  if (path.match(/^\/account\/\d+/)) return 'i-heroicons-building-office'
  if (path.includes('/chat')) return 'i-heroicons-chat-bubble-left-right'
  if (path.includes('/profile')) return 'i-heroicons-user-circle'
  if (path.includes('/settings')) return 'i-heroicons-cog-6-tooth'
  if (path.includes('/reports')) return 'i-heroicons-document-chart-bar'
  if (path.includes('/support')) return 'i-heroicons-question-mark-circle'
  return 'i-heroicons-document'
}

function getPageName(path: string): string {
  if (path === '/') return 'Dashboard'
  const simplified = simplifyPath(path)
  if (simplified !== path) return simplified

  const parts = path.split('/').filter(Boolean)
  return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' → ')
}

function getDetailedPageName(path: string): string {
  if (path === '/') return 'Dashboard'

  const parts = path.split('/').filter(Boolean)
  if (parts.length === 0) return 'Dashboard'

  // Build readable name from path segments
  const readable = parts.map(p => {
    // Handle special cases
    if (p === 'ai') return 'AI Operations'
    if (p === 'monitoring') return 'Monitoring'
    if (p === 'settings') return 'Settings'
    if (p === 'users') return 'Users'
    if (p === 'content') return 'Content'
    if (p === 'pipelines') return 'Pipelines'
    if (p === 'costs') return 'Costs'
    if (p === 'explorer') return 'Explorer'
    if (p === 'org') return 'Org Chart'
    if (p === 'chat') return 'AI Chat'
    if (p === 'profile') return 'Profile'
    if (p === 'reports') return 'Reports'
    if (p === 'support') return 'Support'
    if (p === 'account') return 'Account'
    if (p === 'admin') return 'Admin'
    // Check if it's an ID (numeric)
    if (/^\d+$/.test(p)) return `#${p}`
    // Capitalize first letter
    return p.charAt(0).toUpperCase() + p.slice(1)
  })

  return readable.join(' / ')
}

function getStepNodeClass(step: any, idx: number): string {
  if (idx === 0) {
    return 'border-primary-500 bg-primary-500 text-white shadow-lg shadow-primary-500/30'
  }
  return 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 group-hover:border-primary-400'
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${Math.round(ms / 1000)}s`
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`
  return `${(ms / 3600000).toFixed(1)}h`
}

function formatTimeDelta(ms: number): string {
  const absMs = Math.abs(ms)
  if (absMs < 1000) return '<1s'
  if (absMs < 60000) return `${Math.round(absMs / 1000)}s`
  if (absMs < 3600000) return `${Math.round(absMs / 60000)}m`
  return `${(absMs / 3600000).toFixed(1)}h`
}

// Watch for tab changes to render appropriate chart
watch(activeTab, async (tab) => {
  await nextTick()
  if (tab === 0) renderSankeyChart()
  if (tab === 2) renderHeatmapChart()
})

// Handle resize
function handleResize() {
  sankeyChart?.resize()
  heatmapChart?.resize()
}

onMounted(async () => {
  await fetchData()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  sankeyChart?.dispose()
  heatmapChart?.dispose()
})
</script>

<style scoped>
@keyframes fade-in {
  from { opacity: 0; transform: translateX(-10px); }
  to { opacity: 1; transform: translateX(0); }
}

.animate-fade-in {
  animation: fade-in 0.3s ease-out forwards;
  opacity: 0;
}
</style>
