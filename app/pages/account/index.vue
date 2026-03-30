<template>
  <div class="space-y-6 p-6 max-w-[1800px] mx-auto">
    <!-- Header with Controls -->
    <UCard>
      <div class="space-y-4 p-2">
        <div class="flex justify-between items-center">
          <div>
            <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-1">Organization Structure</h1>
            <p class="text-gray-600 dark:text-gray-300 text-sm">
              AWS Organizations hierarchy with Service Control Policies
            </p>
          </div>
          <div class="flex gap-2">
            <USelectMenu
              v-model="selectedEnvironment"
              :options="environmentOptions"
              size="sm"
              class="w-40"
            />
            <UButton color="white" variant="ghost" icon="i-heroicons-arrow-path" @click="refreshData">
              Refresh
            </UButton>
            <UButton color="white" variant="ghost" icon="i-heroicons-viewfinder-circle" title="Fit to Screen" @click="fitToScreen" />
            <UButton color="white" variant="ghost" icon="i-heroicons-plus" @click="zoomIn" />
            <UButton color="white" variant="ghost" icon="i-heroicons-minus" @click="zoomOut" />
          </div>
        </div>

        <!-- Search and Controls -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div class="lg:col-span-2">
            <UInput
              v-model="searchTerm"
              placeholder="Search organizational units and accounts..."
              icon="i-heroicons-magnifying-glass"
              size="sm"
            />
          </div>
          <div class="flex gap-2">
            <UButton color="emerald" variant="soft" size="sm" @click="expandAll">
              Expand All
            </UButton>
            <UButton color="gray" variant="soft" size="sm" @click="collapseAll">
              Collapse All
            </UButton>
            <UToggle v-model="showPolicies">
              <template #default="{ checked }">
                <span class="text-sm" :class="checked ? 'text-blue-500' : 'text-gray-400'">
                  {{ checked ? 'Show SCPs' : 'Hide SCPs' }}
                </span>
              </template>
            </UToggle>
          </div>
        </div>

        <!-- Stats Bar -->
        <div class="flex justify-between items-center text-xs text-gray-400 pt-2 border-t border-gray-700">
          <div class="flex gap-4">
            <span>OUs: <strong class="text-white">{{ totalOUs }}</strong></span>
            <span>Accounts: <strong class="text-white">{{ totalAccounts }}</strong></span>
            <span>Nodes: <strong class="text-white">{{ totalNodes }}</strong></span>
          </div>
          <span v-if="orgInfo">
            Organization: {{ orgInfo.id }}
          </span>
        </div>
      </div>
    </UCard>

    <!-- Loading State -->
    <UCard v-if="isLoading" class="bg-gray-900 border border-gray-700">
      <div class="space-y-4 p-12">
        <div class="flex items-center justify-center gap-3">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"/>
          <span class="text-gray-300 text-lg">Loading organization structure...</span>
        </div>
        <UProgress color="blue" animation="carousel" />
      </div>
    </UCard>

    <!-- Error State -->
    <UCard v-else-if="error" class="bg-gray-900 border border-gray-700">
      <div class="p-4">
        <div class="flex items-center gap-2 text-red-500 mb-2">
          <Icon name="i-heroicons-exclamation-triangle" class="w-5 h-5" />
          <span class="font-semibold">Error Loading Data</span>
        </div>
        <p class="text-gray-400">{{ error }}</p>
        <UButton color="white" variant="soft" size="sm" class="mt-4" @click="refreshData">
          Try Again
        </UButton>
      </div>
    </UCard>

    <!-- Main Content Grid -->
    <div v-else-if="treeData" class="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <!-- Chart Container -->
      <div class="xl:col-span-2">
        <UCard class="bg-gray-900 border border-gray-700 relative">
          <div ref="chartContainerRef" class="visualization-container">
            <!-- Legend -->
            <div class="absolute top-4 left-4 bg-gray-800/90 backdrop-blur-sm rounded-lg p-3 text-xs z-20 border border-gray-700">
              <div class="font-semibold text-white mb-2">Legend</div>
              <div class="space-y-1">
                <div class="flex items-center gap-2">
                  <div class="w-4 h-4 rounded" style="background: #1e293b; border: 2px solid #3b82f6;"></div>
                  <span class="text-gray-300">Root</span>
                </div>
                <div class="flex items-center gap-2">
                  <div class="w-4 h-4 rounded" style="background: #1e3a8a; border: 2px solid #60a5fa;"></div>
                  <span class="text-gray-300">Organizational Unit</span>
                </div>
                <div class="flex items-center gap-2">
                  <div class="w-4 h-4 rounded" style="background: #1f2937; border: 2px solid #6b7280;"></div>
                  <span class="text-gray-300">Account</span>
                </div>
              </div>
            </div>
          </div>
        </UCard>
      </div>

      <!-- Detail Panel -->
      <div class="xl:col-span-1 space-y-6">
        <!-- Organization Info -->
        <UCard v-if="orgInfo" class="bg-gray-900 border border-gray-700">
          <template #header>
            <span class="font-semibold text-white">Organization Details</span>
          </template>

          <div class="space-y-3">
            <div>
              <p class="text-xs text-gray-400 mb-1">Organization ID</p>
              <p class="text-sm text-white font-mono">{{ orgInfo.id }}</p>
            </div>
            <div>
              <p class="text-xs text-gray-400 mb-1">Master Account</p>
              <p class="text-sm text-white font-mono">{{ orgInfo.masterAccountId }}</p>
            </div>
            <div>
              <p class="text-xs text-gray-400 mb-1">Master Email</p>
              <p class="text-sm text-white break-all">{{ orgInfo.masterAccountEmail }}</p>
            </div>
            <div>
              <p class="text-xs text-gray-400 mb-1">Feature Set</p>
              <UBadge :color="orgInfo.featureSet === 'ALL' ? 'green' : 'gray'" variant="soft">
                {{ orgInfo.featureSet }}
              </UBadge>
            </div>
            <div v-if="orgInfo.availablePolicyTypes && orgInfo.availablePolicyTypes.length > 0">
              <p class="text-xs text-gray-400 mb-2">Policy Types</p>
              <div class="flex flex-wrap gap-1">
                <UBadge
                  v-for="policy in orgInfo.availablePolicyTypes"
                  :key="policy.Type"
                  :color="policy.Status === 'ENABLED' ? 'blue' : 'gray'"
                  variant="soft"
                  size="xs"
                >
                  {{ policy.Type.replace('SERVICE_CONTROL_POLICY', 'SCP') }}
                </UBadge>
              </div>
            </div>
          </div>
        </UCard>

        <!-- Selected Node Details -->
        <UCard v-if="selectedNode" class="bg-gray-900 border border-gray-700">
          <template #header>
            <div class="flex justify-between items-center">
              <div class="flex items-center gap-2">
                <span class="font-semibold text-white">{{ selectedNode.name }}</span>
                <UBadge :color="getNodeTypeColor(selectedNode.type)" variant="soft" size="xs">
                  {{ selectedNode.type.toUpperCase() }}
                </UBadge>
              </div>
              <UButton
                color="gray"
                variant="ghost"
                size="xs"
                icon="i-heroicons-x-mark"
                @click="clearSelection"
              />
            </div>
          </template>

          <div class="space-y-4">
            <div>
              <p class="text-xs text-gray-400 mb-1">ID</p>
              <p class="text-sm text-white font-mono break-all">{{ selectedNode.id }}</p>
            </div>

            <div v-if="selectedNode.arn">
              <p class="text-xs text-gray-400 mb-1">ARN</p>
              <p class="text-xs text-white font-mono break-all">{{ selectedNode.arn }}</p>
            </div>

            <!-- Service Control Policies Section -->
            <div v-if="selectedNode.type === 'ou' || selectedNode.type === 'account'" class="pt-3 border-t border-gray-700">
              <div class="flex justify-between items-center mb-3">
                <div class="flex items-center gap-2">
                  <p class="text-sm font-semibold text-white">Service Control Policies</p>
                  <UBadge
                    v-if="selectedNode.policies"
                    :color="selectedNode.policies.length > 0 ? 'blue' : 'gray'"
                    variant="soft"
                    size="xs"
                  >
                    {{ selectedNode.policies.length }}
                  </UBadge>
                </div>
                <UButton
                  v-if="!loadingPolicies && !selectedNode.policies"
                  color="blue"
                  variant="soft"
                  size="xs"
                  icon="i-heroicons-shield-check"
                  @click="loadPoliciesForNode"
                >
                  Load
                </UButton>
              </div>

              <div v-if="loadingPolicies" class="text-center py-4">
                <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto"/>
                <p class="text-xs text-gray-400 mt-2">Loading policies...</p>
              </div>

              <div v-else-if="selectedNode.policies" class="space-y-3">
                <div v-if="selectedNode.policies.length === 0" class="text-center py-4">
                  <Icon name="i-heroicons-shield-exclamation" class="w-8 h-8 text-gray-600 mx-auto mb-2" />
                  <p class="text-xs text-gray-400">No policies attached</p>
                </div>
                <div v-else class="space-y-3">
                  <!-- Summary -->
                  <div v-if="selectedNode.policySummary" class="flex gap-2 text-xs">
                    <UBadge color="green" variant="soft" size="xs">
                      {{ selectedNode.policySummary.directCount }} Direct
                    </UBadge>
                    <UBadge color="blue" variant="soft" size="xs">
                      {{ selectedNode.policySummary.inheritedCount }} Inherited
                    </UBadge>
                  </div>

                  <!-- Direct Policies -->
                  <div v-if="selectedNode.directPolicies && selectedNode.directPolicies.length > 0">
                    <p class="text-xs font-semibold text-gray-400 mb-2">Direct Policies</p>
                    <div class="space-y-2 max-h-48 overflow-y-auto">
                      <div
                        v-for="policy in selectedNode.directPolicies"
                        :key="'direct-' + policy.id"
                        class="p-3 bg-gray-800 rounded-lg border border-green-700/50 hover:border-green-500 transition-colors"
                      >
                        <div class="flex justify-between items-start mb-1">
                          <span class="text-white font-semibold text-sm">{{ policy.name }}</span>
                          <UBadge color="green" variant="soft" size="xs">Direct</UBadge>
                        </div>
                        <p v-if="policy.description" class="text-gray-400 text-xs mb-1">
                          {{ policy.description }}
                        </p>
                        <p class="text-gray-500 font-mono text-xs">{{ policy.id }}</p>
                      </div>
                    </div>
                  </div>

                  <!-- Inherited Policies -->
                  <div v-if="selectedNode.inheritedPolicies && selectedNode.inheritedPolicies.length > 0">
                    <p class="text-xs font-semibold text-gray-400 mb-2">Inherited Policies</p>
                    <div class="space-y-2 max-h-48 overflow-y-auto">
                      <div
                        v-for="policy in selectedNode.inheritedPolicies"
                        :key="'inherited-' + policy.id"
                        class="p-3 bg-gray-800 rounded-lg border border-blue-700/50 hover:border-blue-500 transition-colors"
                      >
                        <div class="flex justify-between items-start mb-1">
                          <span class="text-white font-semibold text-sm">{{ policy.name }}</span>
                          <UBadge color="blue" variant="soft" size="xs">Inherited</UBadge>
                        </div>
                        <p v-if="policy.description" class="text-gray-400 text-xs mb-1">
                          {{ policy.description }}
                        </p>
                        <div class="flex justify-between items-center">
                          <p class="text-gray-500 font-mono text-xs">{{ policy.id }}</p>
                          <p class="text-gray-500 text-xs italic">from {{ policy.attachedAt }}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Children Summary -->
            <div v-if="selectedNode.children && selectedNode.children.length > 0" class="pt-3 border-t border-gray-700">
              <p class="text-xs text-gray-400 mb-2">
                Child OUs ({{ selectedNode.children.filter(c => c.type !== 'account').length }})
              </p>
              <div class="space-y-1 max-h-32 overflow-y-auto">
                <div
                  v-for="child in selectedNode.children.filter(c => c.type !== 'account')"
                  :key="child.id"
                  class="py-1 px-2 bg-gray-800 rounded text-xs hover:bg-gray-700 cursor-pointer transition-colors"
                  @click="selectNode(child)"
                >
                  <div class="flex justify-between items-center">
                    <span class="text-gray-300">{{ child.name }}</span>
                    <UBadge color="indigo" variant="soft" size="xs">OU</UBadge>
                  </div>
                </div>
              </div>
            </div>

            <!-- Accounts in OU -->
            <div v-if="selectedNode.accounts && selectedNode.accounts.length > 0" class="pt-3 border-t border-gray-700">
              <p class="text-xs text-gray-400 mb-2">
                Direct Accounts ({{ selectedNode.accounts.length }})
              </p>
              <div class="space-y-1 max-h-48 overflow-y-auto">
                <div
                  v-for="accountId in selectedNode.accounts"
                  :key="accountId"
                  class="py-2 px-3 bg-gray-800 rounded hover:bg-gray-700 transition-colors"
                >
                  <div class="flex items-center justify-between">
                    <span class="text-white font-mono text-xs">{{ accountId }}</span>
                    <NuxtLink :to="`/account/${accountId}`" class="text-blue-400 hover:text-blue-300 text-xs">
                      View →
                    </NuxtLink>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </UCard>

        <!-- Quick Stats -->
        <UCard class="bg-gray-900 border border-gray-700">
          <template #header>
            <span class="font-semibold text-white">Statistics</span>
          </template>

          <div class="space-y-3">
            <div class="flex justify-between items-center">
              <span class="text-gray-400 text-sm">Total Organizational Units</span>
              <span class="text-white font-semibold text-lg">{{ totalOUs }}</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-gray-400 text-sm">Total Accounts</span>
              <span class="text-white font-semibold text-lg">{{ totalAccounts }}</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-gray-400 text-sm">Total Nodes</span>
              <span class="text-white font-semibold text-lg">{{ totalNodes }}</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-gray-400 text-sm">Environment</span>
              <UBadge :color="selectedEnvironment === 'commercial' ? 'blue' : 'green'" variant="soft">
                {{ selectedEnvironment }}
              </UBadge>
            </div>
          </div>
        </UCard>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, onActivated, onDeactivated, watch, nextTick } from 'vue'
import { useOrganization, type OrgNode } from '~/composables/useOrganization'
import * as d3 from 'd3'

const logger = createLogger('Index')

// Composable
const {
  orgData,
  isLoading,
  error,
  fetchOrganization,
  transformToD3Tree,
  fetchPolicies,
  flattenTree,
  countAccounts,
  countOUs
} = useOrganization()

// State
const selectedEnvironment = ref<'commercial' | 'govcloud'>('govcloud')
const environmentOptions = [
  { label: 'GovCloud', value: 'govcloud' },
  { label: 'Commercial', value: 'commercial' }
]

const searchTerm = ref('')
const selectedNode = ref<OrgNode | null>(null)
const chartContainerRef = ref<HTMLElement>()
const showPolicies = ref(true)
const loadingPolicies = ref(false)

// D3 chart state
let svg: any
let g: any
let zoom: any
let root: any
let tree: any

const nodeWidth = 260
const nodeHeight = 100

// Computed
const treeData = computed(() => {
  if (!orgData.value) return null
  return transformToD3Tree(orgData.value.tree)
})

const orgInfo = computed(() => orgData.value?.organization)

const allNodes = computed(() => {
  if (!treeData.value) return []
  return flattenTree(treeData.value)
})

const totalOUs = computed(() => {
  if (!treeData.value) return 0
  return countOUs(treeData.value)
})

const totalAccounts = computed(() => {
  if (!treeData.value) return 0
  return countAccounts(treeData.value)
})

const totalNodes = computed(() => allNodes.value.length)

// Methods
const refreshData = async () => {
  selectedNode.value = null
  await loadData()
}

const loadData = async () => {
  await fetchOrganization(selectedEnvironment.value)
  if (treeData.value) {
    await nextTick()
    drawChart(treeData.value)
  }
}

const loadPoliciesForNode = async () => {
  if (!selectedNode.value) return

  try {
    loadingPolicies.value = true
    const targetType = selectedNode.value.type === 'account' ? 'ACCOUNT' : 'ORGANIZATIONAL_UNIT'
    const policyData = await fetchPolicies(selectedNode.value.id, targetType, selectedEnvironment.value)

    if (selectedNode.value) {
      // Store all policy data on the node
      selectedNode.value.policies = policyData.allPolicies
      selectedNode.value.directPolicies = policyData.directPolicies
      selectedNode.value.inheritedPolicies = policyData.inheritedPolicies
      selectedNode.value.policyCount = policyData.allPolicies.length
      selectedNode.value.policySummary = policyData.summary
    }
  } finally {
    loadingPolicies.value = false
  }
}

const clearSelection = () => {
  selectedNode.value = null
  // Reset visual selection
  if (svg) {
    d3.selectAll(".node-box")
      .style("stroke", (d: any) => getNodeStrokeColor(d.data.type))
      .style("stroke-width", 2)
  }
}

const selectNode = (node: OrgNode) => {
  selectedNode.value = node
}

const drawChart = (data: OrgNode) => {
  setTimeout(() => {
    const container = chartContainerRef.value
    if (!container) return

    const containerRect = container.getBoundingClientRect()
    const width = Math.max(containerRect.width || 900, 800)
    const height = Math.max(containerRect.height || 700, 700)

    d3.select(container).select("svg").remove()

    svg = d3.select(container)
      .append("svg")
      .attr("width", width)
      .attr("height", height)
      .style("background", "#111827")

    zoom = d3.zoom()
      .scaleExtent([0.1, 3])
      .on("zoom", (event) => {
        g.attr("transform", event.transform)
      })

    svg.call(zoom)

    g = svg.append("g")
      .attr("transform", "translate(50, 50)")

    tree = d3.tree()
      .nodeSize([nodeWidth * 1.2, nodeHeight * 2])
      .separation((a, b) => {
        if (a.parent === b.parent) {
          return a.data.type === 'account' && b.data.type === 'account' ? 0.7 : 1
        }
        return 1.5
      })

    root = d3.hierarchy(data, d => d.children)

    // Initially collapse all OUs except root
    if (root.children) {
      root.children.forEach(collapseRecursive)
    }

    const diagonal = d3.linkVertical()
      .x((d: any) => d.x)
      .y((d: any) => d.y)

    function update(source: any) {
      tree(root)

      const nodes = root.descendants()
      const links = root.links()

      // Update links
      g.selectAll(".link")
        .data(links)
        .join("path")
        .attr("class", "link")
        .attr("d", diagonal)
        .style("fill", "none")
        .style("stroke", "#4a5568")
        .style("stroke-width", 2)
        .style("stroke-opacity", 0.3)

      // Update nodes
      const nodeSelection = g.selectAll(".node")
        .data(nodes)
        .join("g")
        .attr("class", "node")
        .attr("transform", d => `translate(${d.x},${d.y})`)

      nodeSelection.selectAll("*").remove()

      // Node rectangle
      nodeSelection.append("rect")
        .attr("class", "node-box")
        .attr("x", -nodeWidth / 2)
        .attr("y", -nodeHeight / 2)
        .attr("width", nodeWidth)
        .attr("height", nodeHeight)
        .attr("rx", 8)
        .style("fill", d => getNodeColor(d.data.type))
        .style("stroke", d => getNodeStrokeColor(d.data.type))
        .style("stroke-width", 2)
        .style("cursor", "pointer")
        .style("filter", "drop-shadow(0 2px 4px rgba(0,0,0,0.3))")
        .on("click", (event, d) => {
          event.stopPropagation()
          selectedNode.value = d.data

          // Visual feedback
          d3.selectAll(".node-box")
            .style("stroke", (n: any) => getNodeStrokeColor(n.data.type))
            .style("stroke-width", 2)

          d3.select(event.currentTarget)
            .style("stroke", "#3b82f6")
            .style("stroke-width", 3)

          if (d.children || d._children) {
            toggleNode(d)
          }
        })
        .on("mouseenter", function() {
          d3.select(this).style("filter", "drop-shadow(0 4px 8px rgba(59,130,246,0.5)) brightness(1.1)")
        })
        .on("mouseleave", function() {
          d3.select(this).style("filter", "drop-shadow(0 2px 4px rgba(0,0,0,0.3))")
        })

      // Node name
      nodeSelection.append("text")
        .attr("y", -nodeHeight / 2 + 25)
        .attr("text-anchor", "middle")
        .style("fill", "#ffffff")
        .style("font-weight", "600")
        .style("font-size", "13px")
        .style("pointer-events", "none")
        .text(d => {
          const name = d.data.name
          return name.length > 26 ? name.substring(0, 23) + '...' : name
        })

      // Node type badge
      nodeSelection.append("text")
        .attr("y", -nodeHeight / 2 + 45)
        .attr("text-anchor", "middle")
        .style("fill", d => getNodeTypeLabelColor(d.data.type))
        .style("font-size", "10px")
        .style("font-weight", "500")
        .style("pointer-events", "none")
        .text(d => d.data.type.toUpperCase())

      // Account count or ID
      nodeSelection.append("text")
        .attr("y", nodeHeight / 2 - 20)
        .attr("text-anchor", "middle")
        .style("fill", "#d1d5db")
        .style("font-size", "11px")
        .style("font-family", "monospace")
        .style("pointer-events", "none")
        .text(d => {
          if (d.data.type === 'account') {
            return d.data.id.substring(0, 12)
          } else if (d.data.accounts && d.data.accounts.length > 0) {
            return `${d.data.accounts.length} ${d.data.accounts.length === 1 ? 'account' : 'accounts'}`
          }
          return ''
        })

      // Policy count badge (if policies loaded)
      nodeSelection.filter(d => showPolicies.value && d.data.policyCount !== undefined && d.data.policyCount > 0)
        .append("circle")
        .attr("cx", nodeWidth / 2 - 15)
        .attr("cy", -nodeHeight / 2 + 15)
        .attr("r", 10)
        .style("fill", "#3b82f6")
        .style("pointer-events", "none")

      nodeSelection.filter(d => showPolicies.value && d.data.policyCount !== undefined && d.data.policyCount > 0)
        .append("text")
        .attr("x", nodeWidth / 2 - 15)
        .attr("y", -nodeHeight / 2 + 15)
        .attr("dy", "0.35em")
        .attr("text-anchor", "middle")
        .style("fill", "white")
        .style("font-size", "10px")
        .style("font-weight", "bold")
        .style("pointer-events", "none")
        .text(d => d.data.policyCount)

      // Collapse button
      nodeSelection.filter(d => d.children || d._children)
        .append("text")
        .attr("x", nodeWidth / 2 - 20)
        .attr("y", nodeHeight / 2 - 20)
        .style("fill", "#9ca3af")
        .style("cursor", "pointer")
        .style("font-size", "14px")
        .text(d => d.children ? "▼" : "▶")
        .on("click", (event, d) => {
          event.stopPropagation()
          toggleNode(d)
        })
    }

    function toggleNode(d: any) {
      if (d.children) {
        d._children = d.children
        d.children = null
      } else if (d._children) {
        d.children = d._children
        d._children = null

        // Keep grandchildren collapsed
        if (d.children) {
          d.children.forEach(child => {
            if (child.children) {
              child._children = child.children
              child.children = null
            }
          })
        }
      }
      update(root)
    }

    update(root)
    setTimeout(() => fitToScreen(), 100)
  }, 0)
}

function collapseRecursive(d: any) {
  if (d.children) {
    d._children = d.children
    d._children.forEach(collapseRecursive)
    d.children = null
  }
}

const expandAll = () => {
  if (!root) return

  const expandRecursive = (d: any) => {
    if (d._children) {
      d.children = d._children
      d._children = null
    }
    if (d.children) {
      d.children.forEach(expandRecursive)
    }
  }

  expandRecursive(root)
  if (treeData.value) drawChart(treeData.value)
}

const collapseAll = () => {
  if (!root) return

  if (root.children) {
    root.children.forEach(collapseRecursive)
  }
  if (treeData.value) drawChart(treeData.value)
}

const zoomIn = () => {
  if (svg) svg.call(zoom.scaleBy, 1.3)
}

const zoomOut = () => {
  if (svg) svg.call(zoom.scaleBy, 0.7)
}

const fitToScreen = () => {
  if (!g || !svg) return

  try {
    const bounds = g.node()?.getBBox()
    if (!bounds) return

    const container = chartContainerRef.value
    if (!container) return

    const width = container.clientWidth
    const height = container.clientHeight

    const padding = 80
    const scaleX = (width - padding * 2) / bounds.width
    const scaleY = (height - padding * 2) / bounds.height
    const scale = Math.min(scaleX, scaleY, 1)

    const centerX = width / 2
    const centerY = height / 2
    const boundsCenterX = bounds.x + bounds.width / 2
    const boundsCenterY = bounds.y + bounds.height / 2

    const transform = d3.zoomIdentity
      .translate(centerX - boundsCenterX * scale, centerY - boundsCenterY * scale)
      .scale(scale)

    svg.transition()
      .duration(750)
      .call(zoom.transform, transform)
  } catch (error) {
    logger.warn('Failed to fit to screen:', error)
  }
}

const getNodeColor = (type: string) => {
  switch (type) {
    case 'root': return '#1e293b'
    case 'ou': return '#1e3a8a'
    case 'account': return '#1f2937'
    default: return '#1f2937'
  }
}

const getNodeStrokeColor = (type: string) => {
  switch (type) {
    case 'root': return '#3b82f6'
    case 'ou': return '#60a5fa'
    case 'account': return '#6b7280'
    default: return '#6b7280'
  }
}

const getNodeTypeLabelColor = (type: string) => {
  switch (type) {
    case 'root': return '#93c5fd'
    case 'ou': return '#93c5fd'
    case 'account': return '#9ca3af'
    default: return '#9ca3af'
  }
}

const getNodeTypeColor = (type: string) => {
  switch (type) {
    case 'root': return 'blue'
    case 'ou': return 'indigo'
    case 'account': return 'gray'
    default: return 'gray'
  }
}

// Watch environment changes
watch(selectedEnvironment, () => {
  loadData()
})

// Lifecycle
onMounted(() => {
  loadData()
})

const cleanupD3 = () => {
  if (svg) {
    svg.selectAll("*").remove()
  }
}

onDeactivated(cleanupD3)
onUnmounted(cleanupD3)

// Re-render chart when returning via KeepAlive
onActivated(() => {
  if (treeData.value) {
    nextTick(() => drawChart(treeData.value!))
  }
})
</script>

<style scoped>
.visualization-container {
  position: relative;
  width: 100%;
  height: calc(100vh - 300px);
  min-height: 700px;
  border-radius: 8px;
  overflow: hidden;
  background: #111827;
  cursor: grab;
}

.visualization-container:active {
  cursor: grabbing;
}
</style>
