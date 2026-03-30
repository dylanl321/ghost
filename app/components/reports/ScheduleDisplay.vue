<template>
  <div class="flex items-center gap-2 text-sm">
    <Icon :name="frequencyIcon" class="w-4 h-4 text-gray-400 dark:text-gray-500" />
    <span :class="textClass">
      {{ scheduleText }}
    </span>
  </div>
</template>

<script setup lang="ts">
import type { ScheduleConfig } from '#shared/types/scheduled-reports'

const props = defineProps<{
  schedule: ScheduleConfig
  textClass?: string
}>()

const frequencyIcon = computed(() => {
  switch (props.schedule.frequency) {
    case 'daily':
      return 'i-heroicons-calendar'
    case 'weekly':
      return 'i-heroicons-calendar-days'
    case 'monthly':
      return 'i-heroicons-calendar'
    case 'quarterly':
      return 'i-heroicons-calendar'
    default:
      return 'i-heroicons-clock'
  }
})

const dayOfWeekNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const scheduleText = computed(() => {
  const { frequency, dayOfWeek, dayOfMonth, time, timezone } = props.schedule

  // Parse timezone abbreviation (e.g., America/New_York -> EST)
  const tzAbbr = getTimezoneAbbr(timezone)

  switch (frequency) {
    case 'daily':
      return `Every day at ${formatTime(time)} ${tzAbbr}`

    case 'weekly':
      const day = dayOfWeek !== undefined ? dayOfWeekNames[dayOfWeek] : 'Unknown'
      return `Every ${day} at ${formatTime(time)} ${tzAbbr}`

    case 'monthly':
      const dom = dayOfMonth || 1
      return `Monthly on the ${ordinal(dom)} at ${formatTime(time)} ${tzAbbr}`

    case 'quarterly':
      return `Quarterly at ${formatTime(time)} ${tzAbbr}`

    default:
      return `${frequency} at ${formatTime(time)}`
  }
})

// Convert 24h time to 12h format
function formatTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number)
  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 || 12
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`
}

// Get ordinal suffix (1st, 2nd, 3rd, etc.)
function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

// Get timezone abbreviation
function getTimezoneAbbr(timezone: string): string {
  const abbrs: Record<string, string> = {
    'America/New_York': 'ET',
    'America/Chicago': 'CT',
    'America/Denver': 'MT',
    'America/Los_Angeles': 'PT',
    'America/Phoenix': 'MST',
    'America/Anchorage': 'AKT',
    'Pacific/Honolulu': 'HST',
    'UTC': 'UTC',
    'Europe/London': 'GMT',
    'Europe/Paris': 'CET',
    'Asia/Tokyo': 'JST',
    'Australia/Sydney': 'AEDT'
  }

  return abbrs[timezone] || timezone.split('/').pop()?.replace(/_/g, ' ') || 'Local'
}
</script>
