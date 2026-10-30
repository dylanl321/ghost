<template>
  <UCard :ui="{ body: { padding: 'p-6' } }">
    <!-- Header -->
    <div class="flex items-start justify-between mb-4">
      <div class="flex-1">
        <div class="flex items-center gap-2 mb-1">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
            {{ report.reportName }}
          </h3>
          <ReportStatusBadge :status="report.status" />
        </div>
        <p v-if="report.description" class="text-sm text-gray-600 dark:text-gray-400">
          {{ report.description }}
        </p>
      </div>

      <!-- Actions Dropdown -->
      <UDropdown :items="actions" :popper="{ placement: 'bottom-end' }">
        <UButton
          icon="i-heroicons-ellipsis-vertical"
          color="gray"
          variant="ghost"
          size="sm"
        />
      </UDropdown>
    </div>

    <!-- Schedule & Recipients -->
    <div class="space-y-3 mb-4">
      <div class="flex items-start gap-2">
        <Icon name="i-heroicons-clock" class="w-4 h-4 text-gray-400 dark:text-gray-500 mt-0.5" />
        <div class="flex-1">
          <ScheduleDisplay :schedule="report.schedule" text-class="text-gray-700 dark:text-gray-300" />
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Next run: {{ formatDate(report.nextRunTime) }}
          </p>
        </div>
      </div>

      <div class="flex items-start gap-2">
        <Icon name="i-heroicons-envelope" class="w-4 h-4 text-gray-400 dark:text-gray-500 mt-0.5" />
        <div class="flex-1">
          <p class="text-sm text-gray-700 dark:text-gray-300">
            {{ report.recipients.join(', ') }}
          </p>
        </div>
      </div>

      <div class="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
        <div class="flex items-center gap-1">
          <Icon name="i-heroicons-document" class="w-3 h-3" />
          {{ report.reportConfig.format.toUpperCase() }}
        </div>
        <div class="flex items-center gap-1">
          <Icon name="i-heroicons-arrow-path" class="w-3 h-3" />
          {{ report.runCount }} runs
        </div>
      </div>
    </div>

    <!-- Last Run Status -->
    <div
      v-if="report.lastRunTime"
      class="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-700"
    >
      <div class="flex items-center gap-2 text-sm">
        <Icon
          :name="lastRunIcon"
          :class="lastRunIconClass"
          class="w-4 h-4"
        />
        <span class="text-gray-600 dark:text-gray-400">
          Last run: {{ formatTimeAgo(report.lastRunTime) }}
        </span>
      </div>
      <UBadge
        v-if="report.lastRunStatus"
        :color="report.lastRunStatus === 'success' ? 'green' : 'red'"
        variant="soft"
        size="xs"
      >
        {{ report.lastRunStatus }}
      </UBadge>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import type { ScheduledReport } from '#shared/types/scheduled-reports'

const props = defineProps<{
  report: ScheduledReport
  showAdminActions?: boolean
}>()

const emit = defineEmits<{
  edit: [report: ScheduledReport]
  delete: [report: ScheduledReport]
  test: [report: ScheduledReport]
  togglePause: [report: ScheduledReport]
  viewHistory: [report: ScheduledReport]
  runNow: [report: ScheduledReport]
}>()

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
    }]
  ]

  // Add admin-only actions
  if (props.showAdminActions) {
    items[1].push({
      label: 'Run Now',
      icon: 'i-heroicons-bolt',
      click: () => emit('runNow', props.report)
    })
  }

  // Add delete action at the end
  items.push([{
    label: 'Delete',
    icon: 'i-heroicons-trash',
    click: () => emit('delete', props.report)
  }])

  return items
})

const lastRunIcon = computed(() => {
  if (!props.report.lastRunStatus) return 'i-heroicons-question-mark-circle'
  return props.report.lastRunStatus === 'success'
    ? 'i-heroicons-check-circle'
    : 'i-heroicons-x-circle'
})

const lastRunIconClass = computed(() => {
  if (!props.report.lastRunStatus) return 'text-gray-400'
  return props.report.lastRunStatus === 'success'
    ? 'text-green-500'
    : 'text-red-500'
})

// Date formatting helpers
function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
}

</script>
