<template>
  <div class="space-y-4 p-6">
    <!-- Filters and Search Bar -->
    <div class="flex items-center justify-between gap-4">
      <!-- Filter Buttons -->
      <div class="flex items-center gap-2">
        <UButton
          v-for="filter in filters"
          :key="filter.value"
          :color="currentFilter === filter.value ? 'primary' : 'gray'"
          :variant="currentFilter === filter.value ? 'solid' : 'ghost'"
          size="sm"
          @click="currentFilter = filter.value"
        >
          {{ filter.label }}
          <UBadge
            v-if="filter.count !== undefined"
            :color="currentFilter === filter.value ? 'white' : 'gray'"
            size="xs"
            class="ml-1"
          >
            {{ filter.count }}
          </UBadge>
        </UButton>
      </div>

      <!-- Search Input -->
      <div class="w-64">
        <UInput
          v-model="searchQuery"
          icon="i-heroicons-magnifying-glass"
          placeholder="Search schedules..."
          size="sm"
        />
      </div>
    </div>

    <!-- Table View -->
    <div v-if="filteredReports.length > 0" class="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-900/50 border-b border-gray-700">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-400">Report Name</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-400">Datasets</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-400">Schedule</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-400">Next Run</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-400">Accounts</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-400">Status</th>
              <th class="px-4 py-3 text-right text-xs font-semibold text-gray-400">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-700">
            <tr
              v-for="report in filteredReports"
              :key="report.reportId"
              class="hover:bg-gray-900/30 transition-colors cursor-pointer"
              @click="handleRowClick(report)"
            >
              <!-- Report Name -->
              <td class="px-4 py-3">
                <div class="flex items-center gap-2">
                  <UIcon name="i-heroicons-document-text" class="w-4 h-4 text-gray-400" />
                  <div>
                    <div class="text-white font-medium">{{ report.reportName }}</div>
                    <div v-if="report.description" class="text-xs text-gray-500 truncate max-w-xs">
                      {{ report.description }}
                    </div>
                  </div>
                </div>
              </td>

              <!-- Datasets -->
              <td class="px-4 py-3">
                <div class="flex items-center gap-1">
                  <UBadge
                    v-for="dataset in getEnabledDatasets(report)"
                    :key="dataset"
                    :color="getDatasetColor(dataset)"
                    variant="soft"
                    size="xs"
                  >
                    {{ dataset }}
                  </UBadge>
                </div>
              </td>

              <!-- Schedule -->
              <td class="px-4 py-3">
                <div class="text-gray-300 text-xs">
                  {{ formatSchedule(report.schedule) }}
                </div>
              </td>

              <!-- Next Run -->
              <td class="px-4 py-3">
                <div class="text-gray-300 text-xs" v-if="report.nextRunTime">
                  {{ formatNextRun(report.nextRunTime) }}
                </div>
                <div v-else class="text-gray-500 text-xs italic">Not scheduled</div>
              </td>

              <!-- Accounts -->
              <td class="px-4 py-3">
                <div class="text-gray-400 text-xs">
                  {{ report.reportConfig.accounts?.length || 'All' }} accounts
                </div>
              </td>

              <!-- Status -->
              <td class="px-4 py-3">
                <UBadge
                  :color="report.status === 'active' ? 'green' : 'gray'"
                  :icon="report.status === 'active' ? 'i-heroicons-check-circle' : 'i-heroicons-pause-circle'"
                  size="xs"
                >
                  {{ report.status === 'active' ? 'Active' : 'Paused' }}
                </UBadge>
              </td>

              <!-- Actions -->
              <td class="px-4 py-3" @click.stop>
                <div class="flex items-center justify-end gap-1">
                  <UTooltip text="Edit">
                    <UButton
                      icon="i-heroicons-pencil-square"
                      color="gray"
                      variant="ghost"
                      size="xs"
                      @click="emit('edit', report)"
                    />
                  </UTooltip>

                  <UTooltip :text="report.status === 'active' ? 'Pause' : 'Resume'">
                    <UButton
                      :icon="report.status === 'active' ? 'i-heroicons-pause' : 'i-heroicons-play'"
                      color="gray"
                      variant="ghost"
                      size="xs"
                      @click="emit('toggle-pause', report)"
                    />
                  </UTooltip>

                  <UTooltip text="Send Test">
                    <UButton
                      icon="i-heroicons-paper-airplane"
                      color="gray"
                      variant="ghost"
                      size="xs"
                      @click="emit('test', report)"
                    />
                  </UTooltip>

                  <UDropdown :items="getDropdownItems(report)" :ui="{ width: 'w-48' }">
                    <UButton
                      icon="i-heroicons-ellipsis-vertical"
                      color="gray"
                      variant="ghost"
                      size="xs"
                    />
                  </UDropdown>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else class="text-center py-12 bg-gray-800 rounded-lg border border-gray-700">
      <UIcon name="i-heroicons-calendar-days" class="w-12 h-12 text-gray-600 mx-auto mb-3" />
      <h3 class="text-sm font-medium text-white mb-1">
        {{ searchQuery ? 'No schedules found' : 'No scheduled reports yet' }}
      </h3>
      <p class="text-xs text-gray-500">
        {{ searchQuery ? 'Try adjusting your search or filters' : 'Create your first scheduled report to get started' }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ScheduledReport } from '#shared/types/scheduled-reports'
import type { DatasetReportConfig } from '#shared/types/dataset-reports'

// Events
const emit = defineEmits<{
  edit: [report: ScheduledReport]
  delete: [report: ScheduledReport]
  test: [report: ScheduledReport]
  'toggle-pause': [report: ScheduledReport]
  'view-history': [report: ScheduledReport]
}>()

// Composable
const { reports } = useDatasetReports()

// State
const currentFilter = ref('all')
const searchQuery = ref('')

// Computed
const filters = computed(() => [
  { label: 'All', value: 'all', count: reports.value.length },
  { label: 'Active', value: 'active', count: reports.value.filter(r => r.status === 'active').length },
  { label: 'Paused', value: 'paused', count: reports.value.filter(r => r.status === 'paused').length }
])

const filteredReports = computed(() => {
  let filtered = reports.value

  // Filter by status
  if (currentFilter.value !== 'all') {
    filtered = filtered.filter(r => r.status === currentFilter.value)
  }

  // Filter by search query
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase()
    filtered = filtered.filter(r =>
      r.reportName.toLowerCase().includes(query) ||
      r.description?.toLowerCase().includes(query)
    )
  }

  return filtered
})

// Methods
function handleRowClick(report: ScheduledReport) {
  emit('edit', report)
}

function getEnabledDatasets(report: ScheduledReport): string[] {
  const config = report.reportConfig as unknown as DatasetReportConfig
  const datasets: string[] = []
  if (config.datasets?.config?.enabled) datasets.push('Config')
  if (config.datasets?.securityHub?.enabled) datasets.push('SecHub')
  if (config.datasets?.cloudtrail?.enabled) datasets.push('CloudTrail')
  if (config.datasets?.entraUsers?.enabled) datasets.push('Entra')
  return datasets
}

function getDatasetColor(dataset: string) {
  const colors = {
    'Config': 'blue' as const,
    'SecHub': 'red' as const,
    'CloudTrail': 'green' as const
  }
  return colors[dataset as keyof typeof colors] || 'gray' as const
}

function formatSchedule(schedule: any): string {
  if (!schedule) return 'Not configured'

  if (schedule.frequency === 'daily') {
    return `Daily at ${schedule.time || '9:00 AM'}`
  } else if (schedule.frequency === 'weekly') {
    const days = schedule.daysOfWeek?.join(', ') || 'Mon'
    return `Weekly on ${days}`
  } else if (schedule.frequency === 'monthly') {
    return `Monthly on day ${schedule.dayOfMonth || 1}`
  }

  return schedule.frequency || 'Custom'
}

function formatNextRun(timestamp: string): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = date.getTime() - now.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays < 0) return 'Overdue'
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays < 7) return `In ${diffDays} days`

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getDropdownItems(report: ScheduledReport) {
  return [
    [{
      label: 'View History',
      icon: 'i-heroicons-clock',
      click: () => emit('view-history', report)
    }],
    [{
      label: 'Delete',
      icon: 'i-heroicons-trash',
      click: () => emit('delete', report)
    }]
  ]
}
</script>
