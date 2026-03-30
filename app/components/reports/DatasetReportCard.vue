<template>
  <UCard class="hover:shadow-lg transition-shadow">
    <template #header>
      <div class="flex items-start justify-between">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white truncate">
              {{ report.reportName }}
            </h3>
            <UBadge
              :color="statusColor"
              variant="subtle"
              size="xs"
            >
              {{ report.status }}
            </UBadge>
          </div>
          <p v-if="report.description" class="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
            {{ report.description }}
          </p>
        </div>

        <!-- Actions Dropdown -->
        <UDropdown :items="actions" class="ml-2">
          <UButton
            color="gray"
            variant="ghost"
            icon="i-heroicons-ellipsis-vertical"
            size="xs"
          />
        </UDropdown>
      </div>
    </template>

    <!-- Dataset Badges -->
    <div class="mb-4">
      <div class="flex flex-wrap gap-2">
        <UBadge
          v-if="report.reportConfig.datasets?.config?.enabled"
          color="blue"
          variant="soft"
        >
          <UIcon name="i-heroicons-cog-6-tooth" class="w-3 h-3 mr-1" />
          AWS Config
        </UBadge>
        <UBadge
          v-if="report.reportConfig.datasets?.securityHub?.enabled"
          color="red"
          variant="soft"
        >
          <UIcon name="i-heroicons-shield-check" class="w-3 h-3 mr-1" />
          Security Hub
        </UBadge>
        <UBadge
          v-if="report.reportConfig.datasets?.cloudtrail?.enabled"
          color="purple"
          variant="soft"
        >
          <UIcon name="i-heroicons-document-text" class="w-3 h-3 mr-1" />
          CloudTrail
        </UBadge>
      </div>
    </div>

    <!-- Report Info -->
    <div class="space-y-3 text-sm">
      <!-- Schedule -->
      <div class="flex items-start gap-2">
        <UIcon name="i-heroicons-clock" class="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
        <div class="flex-1 min-w-0">
          <div class="text-gray-600 dark:text-gray-400">
            {{ scheduleText }}
          </div>
          <div v-if="report.nextRunTime" class="text-xs text-gray-500 dark:text-gray-500 mt-0.5">
            Next run: {{ formatNextRun(report.nextRunTime) }}
          </div>
        </div>
      </div>

      <!-- Accounts -->
      <div class="flex items-start gap-2">
        <UIcon name="i-heroicons-building-office" class="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
        <div class="flex-1 min-w-0">
          <div class="text-gray-600 dark:text-gray-400">
            {{ accountsText }}
          </div>
        </div>
      </div>

      <!-- Recipients -->
      <div class="flex items-start gap-2">
        <UIcon name="i-heroicons-envelope" class="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
        <div class="flex-1 min-w-0">
          <div class="text-gray-600 dark:text-gray-400 truncate">
            {{ recipientsText }}
          </div>
        </div>
      </div>

      <!-- Format & AI -->
      <div class="flex items-center gap-3">
        <UBadge color="gray" variant="subtle" size="xs">
          {{ report.reportConfig.format?.toUpperCase() || 'PDF' }}
        </UBadge>
        <UBadge v-if="report.reportConfig.enableAI" color="purple" variant="subtle" size="xs">
          <UIcon name="i-heroicons-sparkles" class="w-3 h-3 mr-1" />
          AI Insights
        </UBadge>
      </div>

      <!-- Last Run Status -->
      <div v-if="report.lastRunTime" class="flex items-start gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
        <UIcon
          :name="lastRunIcon"
          :class="lastRunIconClass"
          class="w-4 h-4 mt-0.5 flex-shrink-0"
        />
        <div class="flex-1 min-w-0">
          <div class="text-xs text-gray-500 dark:text-gray-500">
            Last run: {{ formatDate(report.lastRunTime) }}
            <span v-if="report.runCount" class="ml-1">({{ report.runCount }} total)</span>
          </div>
          <div v-if="report.lastRunError" class="text-xs text-red-600 dark:text-red-400 mt-0.5 truncate">
            {{ report.lastRunError }}
          </div>
        </div>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import type { ScheduledReport } from '#shared/types/scheduled-reports'

const props = defineProps<{
  report: ScheduledReport
}>()

const emit = defineEmits<{
  edit: [report: ScheduledReport]
  delete: [report: ScheduledReport]
  test: [report: ScheduledReport]
  togglePause: [report: ScheduledReport]
  viewHistory: [report: ScheduledReport]
}>()

// Computed
const statusColor = computed(() => {
  switch (props.report.status) {
    case 'active': return 'green'
    case 'paused': return 'yellow'
    case 'disabled': return 'gray'
    default: return 'gray'
  }
})

const scheduleText = computed(() => {
  const freq = props.report.schedule.frequency
  const time = props.report.schedule.time

  if (freq === 'daily') {
    return `Daily at ${time}`
  } else if (freq === 'weekly') {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const day = days[props.report.schedule.dayOfWeek || 0]
    return `Weekly on ${day} at ${time}`
  } else if (freq === 'monthly') {
    return `Monthly on day ${props.report.schedule.dayOfMonth} at ${time}`
  } else if (freq === 'quarterly') {
    return `Quarterly at ${time}`
  }
  return freq
})

const accountsText = computed(() => {
  const count = props.report.reportConfig.accounts?.length || 0
  if (count === 0) return 'All accounts'
  return `${count} account${count !== 1 ? 's' : ''}`
})

const recipientsText = computed(() => {
  const count = props.report.recipients.length
  if (count === 0) return 'No recipients'
  if (count === 1) return props.report.recipients[0]
  return `${props.report.recipients[0]} +${count - 1} more`
})

const lastRunIcon = computed(() => {
  switch (props.report.lastRunStatus) {
    case 'success': return 'i-heroicons-check-circle'
    case 'failed': return 'i-heroicons-x-circle'
    case 'running': return 'i-heroicons-arrow-path'
    default: return 'i-heroicons-clock'
  }
})

const lastRunIconClass = computed(() => {
  switch (props.report.lastRunStatus) {
    case 'success': return 'text-green-500'
    case 'failed': return 'text-red-500'
    case 'running': return 'text-blue-500 animate-spin'
    default: return 'text-gray-400'
  }
})

const actions = computed(() => {
  const items = [
    [{
      label: 'Edit',
      icon: 'i-heroicons-pencil',
      click: () => emit('edit', props.report)
    }],
    [{
      label: props.report.status === 'active' ? 'Pause' : 'Resume',
      icon: props.report.status === 'active' ? 'i-heroicons-pause' : 'i-heroicons-play',
      click: () => emit('togglePause', props.report)
    }, {
      label: 'Send Test',
      icon: 'i-heroicons-paper-airplane',
      click: () => emit('test', props.report)
    }, {
      label: 'View History',
      icon: 'i-heroicons-clock',
      click: () => emit('viewHistory', props.report)
    }],
    [{
      label: 'Delete',
      icon: 'i-heroicons-trash',
      click: () => emit('delete', props.report),
      class: 'text-red-600 dark:text-red-400'
    }]
  ]

  return items
})

// Methods
function formatDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  })
}

function formatNextRun(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = date.getTime() - now.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 0) return 'Overdue'
  if (diffMins < 60) return `in ${diffMins}m`
  if (diffHours < 24) return `in ${diffHours}h`
  if (diffDays < 7) return `in ${diffDays}d`

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}
</script>
