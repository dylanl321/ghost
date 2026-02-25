<template>
  <UCard>
    <template #header>
      <div class="flex justify-between items-center">
        <div class="text-lg font-semibold">Resource Changes</div>
        <div class="flex items-center gap-2">
          <UBadge color="blue" variant="soft" size="sm">
            Top 10
          </UBadge>
          <UButton
            v-if="resourceBreakdown.length > 10"
            size="xs"
            :color="showAllTable ? 'primary' : 'gray'"
            variant="ghost"
            @click="showAllTable = !showAllTable"
          >
            {{ showAllTable ? 'Hide Table' : 'View All' }}
          </UButton>
        </div>
      </div>
    </template>

    <CenteredLoadingSpinner v-if="loading" />
    <div v-else-if="!resourceBreakdown || resourceBreakdown.length === 0" class="text-center py-8 text-gray-400">
      No resource changes in the selected time period
    </div>
    <div v-else>
      <VChart :option="chartOptions" class="h-80" autoresize />

      <!-- Summary metrics -->
      <div class="border-t border-gray-700 mt-4 pt-4 grid grid-cols-4 gap-4">
        <div>
          <div class="text-gray-400 text-sm">Total Changes</div>
          <div class="text-white text-lg font-semibold">{{ totalChanges }}</div>
        </div>
        <div>
          <div class="text-gray-400 text-sm">Created</div>
          <div class="text-green-400 text-lg font-semibold">{{ createCount }}</div>
        </div>
        <div>
          <div class="text-gray-400 text-sm">Updated</div>
          <div class="text-blue-400 text-lg font-semibold">{{ updateCount }}</div>
        </div>
        <div>
          <div class="text-gray-400 text-sm">Destroyed</div>
          <div class="text-red-400 text-lg font-semibold">{{ destroyCount }}</div>
        </div>
      </div>

      <!-- Expandable full table -->
      <div v-if="showAllTable" class="border-t border-gray-700 mt-4 pt-4">
        <UTable
          :rows="paginatedTableRows"
          :columns="tableColumns"
        >
          <template #action-data="{ row }">
            <UBadge
              :color="getActionColor(row.action)"
              variant="soft"
              size="xs"
            >
              {{ row.action }}
            </UBadge>
          </template>
        </UTable>
        <div v-if="allTableRows.length > tablePageSize" class="flex justify-between items-center mt-3">
          <div class="text-sm text-gray-400">
            Showing {{ tableStart }}-{{ tableEnd }} of {{ allTableRows.length }} resources
          </div>
          <UPagination
            v-model="tablePage"
            :page-count="tablePageSize"
            :total="allTableRows.length"
          />
        </div>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import * as echarts from 'echarts/core'
import { BarChart } from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent
} from 'echarts/components'

// Register required ECharts modules
echarts.use([
  BarChart,
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent
])

interface ResourceChange {
  resourceAddress: string
  resourceType: string
  action: string
  count: number
}

const props = defineProps<{
  resourceBreakdown: ResourceChange[]
  loading: boolean
}>()

// Expandable table state
const showAllTable = ref(false)
const tablePage = ref(1)
const tablePageSize = 20

const tableColumns = [
  { key: 'resourceAddress', label: 'Resource Address' },
  { key: 'resourceType', label: 'Type' },
  { key: 'action', label: 'Action' },
  { key: 'count', label: 'Count', sortable: true }
]

const allTableRows = computed(() => {
  // Group by resource address (same logic as chart but no slice)
  const resourceMap = new Map<string, { resourceAddress: string, resourceType: string, action: string, count: number }>()
  props.resourceBreakdown.forEach(r => {
    const key = `${r.resourceAddress}:${r.action}`
    const existing = resourceMap.get(key)
    if (existing) {
      existing.count += r.count
    } else {
      resourceMap.set(key, { resourceAddress: r.resourceAddress, resourceType: r.resourceType, action: r.action, count: r.count })
    }
  })
  return Array.from(resourceMap.values()).sort((a, b) => b.count - a.count)
})

const paginatedTableRows = computed(() => {
  const start = (tablePage.value - 1) * tablePageSize
  return allTableRows.value.slice(start, start + tablePageSize)
})

const tableStart = computed(() => allTableRows.value.length === 0 ? 0 : (tablePage.value - 1) * tablePageSize + 1)
const tableEnd = computed(() => Math.min(tablePage.value * tablePageSize, allTableRows.value.length))

function getActionColor(action: string): string {
  if (action === 'create') return 'green'
  if (action === 'update') return 'blue'
  if (action === 'destroy') return 'red'
  if (action === 'replace') return 'yellow'
  return 'gray'
}

// Group by action
const createCount = computed(() =>
  props.resourceBreakdown
    .filter(r => r.action === 'create')
    .reduce((sum, r) => sum + r.count, 0)
)

const updateCount = computed(() =>
  props.resourceBreakdown
    .filter(r => r.action === 'update')
    .reduce((sum, r) => sum + r.count, 0)
)

const destroyCount = computed(() =>
  props.resourceBreakdown
    .filter(r => r.action === 'destroy')
    .reduce((sum, r) => sum + r.count, 0)
)

const totalChanges = computed(() =>
  props.resourceBreakdown.reduce((sum, r) => sum + r.count, 0)
)

const chartOptions = computed(() => {
  // Group by resource address (name)
  const resourceMap = new Map<string, {
    address: string
    type: string
    create: number
    update: number
    destroy: number
    replace: number
  }>()

  props.resourceBreakdown.forEach(r => {
    if (!resourceMap.has(r.resourceAddress)) {
      resourceMap.set(r.resourceAddress, {
        address: r.resourceAddress,
        type: r.resourceType,
        create: 0,
        update: 0,
        destroy: 0,
        replace: 0
      })
    }
    const entry = resourceMap.get(r.resourceAddress)!
    if (r.action === 'create') entry.create += r.count
    else if (r.action === 'update') entry.update += r.count
    else if (r.action === 'destroy') entry.destroy += r.count
    else if (r.action === 'replace') entry.replace += r.count
  })

  // Get top 10 resources by total changes (already sorted from API, but re-sort to be safe)
  const sortedResources = Array.from(resourceMap.values())
    .map(resource => ({
      ...resource,
      total: resource.create + resource.update + resource.destroy + resource.replace
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)

  // Format display names - show resource address with type hint
  const resourceNames = sortedResources.map(r => {
    // Truncate long resource addresses for display
    const address = r.address.length > 60 ? r.address.substring(0, 57) + '...' : r.address
    return address
  })

  const createData = sortedResources.map(r => r.create)
  const updateData = sortedResources.map(r => r.update)
  const destroyData = sortedResources.map(r => r.destroy)
  const replaceData = sortedResources.map(r => r.replace)

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow'
      },
      formatter: (params: any) => {
        // Find the resource for this tooltip
        const resourceIndex = params[0].dataIndex
        const resource = sortedResources[resourceIndex]

        if (!resource) {
          return `<strong>${params[0].name}</strong><br/>`
        }

        let result = `<strong>${resource.address}</strong><br/>`
        result += `<span style="color: #9ca3af; font-size: 11px;">${resource.type}</span><br/><br/>`

        params.forEach((p: any) => {
          if (p.data > 0) {
            result += `${p.marker} ${p.seriesName}: ${p.data}<br/>`
          }
        })
        return result
      }
    },
    legend: {
      bottom: 0,
      textStyle: { color: '#9ca3af' }
    },
    xAxis: {
      type: 'value',
      axisLabel: {
        color: '#9ca3af'
      },
      splitLine: { lineStyle: { color: '#374151' } }
    },
    yAxis: {
      type: 'category',
      data: resourceNames,
      axisLabel: {
        color: '#9ca3af',
        fontSize: 11
      }
    },
    grid: { left: '30%', right: '4%', bottom: '15%', top: '2%' },
    series: [
      {
        name: 'Create',
        type: 'bar',
        stack: 'total',
        data: createData,
        itemStyle: { color: '#10b981' }
      },
      {
        name: 'Update',
        type: 'bar',
        stack: 'total',
        data: updateData,
        itemStyle: { color: '#3b82f6' }
      },
      {
        name: 'Replace',
        type: 'bar',
        stack: 'total',
        data: replaceData,
        itemStyle: { color: '#f59e0b' }
      },
      {
        name: 'Destroy',
        type: 'bar',
        stack: 'total',
        data: destroyData,
        itemStyle: { color: '#ef4444' }
      }
    ]
  }
})
</script>
