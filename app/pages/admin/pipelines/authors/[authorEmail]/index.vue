<template>
  <div class="container mx-auto max-w-7xl space-y-6 px-6 py-8">
    <!-- Loading State -->
    <div v-if="pending" class="flex items-center justify-center py-12">
      <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-primary" />
    </div>

    <!-- Error State -->
    <UAlert
      v-else-if="error"
      color="red"
      variant="subtle"
      title="Failed to load author data"
      :description="error.message"
    />

    <!-- Author Dashboard -->
    <template v-else-if="authorData">
      <!-- Header with Author Info -->
      <div class="flex items-start justify-between">
        <div class="flex items-center gap-4">
          <!-- Avatar -->
          <div
            class="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold text-white"
            :style="{ backgroundColor: getAuthorColor(author.email) }"
          >
            {{ getAuthorInitials(author.name) }}
          </div>

          <!-- Author Details -->
          <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
              {{ author.displayName }}
            </h1>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {{ author.email }}
            </p>

            <!-- Contact Icons -->
            <div class="mt-2">
              <PipelinesAuthorContactIcons
                :email="author.email"
                subject="Pipeline Discussion"
              />
            </div>
          </div>
        </div>

        <!-- Time Range Selector -->
        <USelectMenu
          v-model="selectedTimeRange"
          :options="timeRangeOptions"
          value-attribute="value"
          option-attribute="label"
        />
      </div>

      <!-- Summary Stats -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <!-- Total Runs -->
        <UCard>
          <div class="text-center">
            <p class="text-sm text-gray-500 dark:text-gray-400">Total Runs</p>
            <p class="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
              {{ summary?.total_runs || 0 }}
            </p>
          </div>
        </UCard>

        <!-- Success Rate -->
        <UCard>
          <div class="text-center">
            <p class="text-sm text-gray-500 dark:text-gray-400">Success Rate</p>
            <p
              class="mt-2 text-3xl font-bold"
              :class="getSuccessRateColorClass(summary?.success_rate || 0)"
            >
              {{ (summary?.success_rate || 0).toFixed(1) }}%
            </p>
          </div>
        </UCard>

        <!-- Successful Runs -->
        <UCard>
          <div class="text-center">
            <p class="text-sm text-gray-500 dark:text-gray-400">Successful</p>
            <p class="mt-2 text-3xl font-bold text-green-600 dark:text-green-400">
              {{ summary?.successful_runs || 0 }}
            </p>
          </div>
        </UCard>

        <!-- Failed Runs -->
        <UCard>
          <div class="text-center">
            <p class="text-sm text-gray-500 dark:text-gray-400">Failed</p>
            <p class="mt-2 text-3xl font-bold text-red-600 dark:text-red-400">
              {{ summary?.failed_runs || 0 }}
            </p>
          </div>
        </UCard>

        <!-- Avg Duration -->
        <UCard>
          <div class="text-center">
            <p class="text-sm text-gray-500 dark:text-gray-400">Avg Duration</p>
            <p class="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
              {{ formatAvgDuration(summary?.avg_duration || 0) }}
            </p>
          </div>
        </UCard>
      </div>

      <!-- Success Rate Chart -->
      <UCard>
        <template #header>
          <h2 class="text-lg font-semibold">Success Rate Trend</h2>
        </template>
        <div class="h-64 flex items-center justify-center">
          <div class="w-full max-w-md">
            <div class="space-y-2">
              <div class="flex justify-between text-sm">
                <span class="text-gray-500 dark:text-gray-400">Overall Success Rate</span>
                <span class="font-semibold">{{ (summary?.success_rate || 0).toFixed(1) }}%</span>
              </div>
              <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  class="h-full rounded-full transition-all"
                  :class="getSuccessRateBarColor(summary?.success_rate || 0)"
                  :style="{ width: `${summary?.success_rate || 0}%` }"
                />
              </div>
              <div class="flex justify-between text-xs text-gray-400">
                <span>{{ summary?.successful_runs || 0 }} successful</span>
                <span>{{ summary?.failed_runs || 0 }} failed</span>
              </div>
            </div>
          </div>
        </div>
      </UCard>

      <!-- Pipeline Timeline -->
      <PipelinesTimeline
        :pipeline-runs="runs"
        :loading="pending"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import PipelinesAuthorContactIcons from '~/components/pipelines/AuthorContactIcons.vue'
import PipelinesTimeline from '~/components/pipelines/PipelineTimeline.vue'

definePageMeta({
  keepalive: false,
  layout: 'admin',
  middleware: ['auth', 'auth-permission'],
  permission: 'admin'
})

const route = useRoute()
const authorEmail = computed(() => route.params.authorEmail as string)

// Time range selector
const timeRangeOptions = [
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 }
]

const selectedTimeRange = ref(30)

// Fetch author data
const { data: authorData, pending, error } = await useFetch(
  `/api/pipelines/authors/${encodeURIComponent(authorEmail.value)}/timeline`,
  {
    query: {
      days: selectedTimeRange
    },
    watch: [selectedTimeRange]
  }
)

// Extract data from wrapped response
const author = computed(() => authorData.value?.data?.author || { name: '', email: '', displayName: '' })
const summary = computed(() => authorData.value?.data?.summary)
const runs = computed(() => authorData.value?.data?.runs || [])

// Helper: Get author initials
function getAuthorInitials(name: string): string {
  const parts = name.split(/\s+/)

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  }

  return name.substring(0, 2).toUpperCase()
}

// Helper: Generate consistent color from email
function getAuthorColor(email: string): string {
  const colors = [
    '#3B82F6', // blue
    '#10B981', // green
    '#F59E0B', // amber
    '#EF4444', // red
    '#8B5CF6', // purple
    '#EC4899', // pink
    '#14B8A6', // teal
    '#F97316'  // orange
  ]

  let hash = 0
  for (let i = 0; i < email.length; i++) {
    hash = email.charCodeAt(i) + ((hash << 5) - hash)
  }

  return colors[Math.abs(hash) % colors.length]
}

// Helper: Get success rate color class for text
function getSuccessRateColorClass(rate: number): string {
  if (rate >= 90) return 'text-green-600 dark:text-green-400'
  if (rate >= 70) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
}

// Helper: Get success rate bar color
function getSuccessRateBarColor(rate: number): string {
  if (rate >= 90) return 'bg-green-500'
  if (rate >= 70) return 'bg-yellow-500'
  return 'bg-red-500'
}

// Helper: Format average duration
function formatAvgDuration(seconds: number): string {
  if (!seconds) return '0m'

  const mins = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60)

  if (mins > 60) {
    const hours = Math.floor(mins / 60)
    const remainingMins = mins % 60
    return `${hours}h ${remainingMins}m`
  }

  if (mins > 0) {
    return `${mins}m`
  }

  return `${secs}s`
}
</script>
