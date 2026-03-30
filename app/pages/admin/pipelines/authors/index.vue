<template>
  <div class="space-y-6 p-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
          Pipeline Authors
        </h1>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          View all developers who have authored pipeline runs
        </p>
      </div>

      <!-- Time Range Selector -->
      <USelectMenu
        v-model="selectedTimeRange"
        :options="timeRangeOptions"
        value-attribute="value"
        option-attribute="label"
      />
    </div>

    <!-- Loading State -->
    <div v-if="pending" class="flex items-center justify-center py-12">
      <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-primary" />
    </div>

    <!-- Error State -->
    <UAlert
      v-else-if="error"
      color="red"
      variant="subtle"
      title="Failed to load authors"
      :description="error.message"
    />

    <!-- Authors Table -->
    <UCard v-else-if="authorsData">
      <!-- Summary Stats -->
      <template #header>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-4">
            <div>
              <p class="text-sm text-gray-500 dark:text-gray-400">Total Authors</p>
              <p class="text-2xl font-bold text-gray-900 dark:text-white">
                {{ authorsData?.data?.totalAuthors || filteredAuthors.length }}
              </p>
            </div>
            <div class="h-12 w-px bg-gray-200 dark:bg-gray-700" />
            <div>
              <p class="text-sm text-gray-500 dark:text-gray-400">Time Range</p>
              <p class="text-lg font-semibold text-gray-900 dark:text-white">
                Last {{ selectedTimeRange }} days
              </p>
            </div>
          </div>

          <!-- Search -->
          <UInput
            v-model="searchQuery"
            icon="i-heroicons-magnifying-glass"
            placeholder="Search authors..."
            class="w-64"
          />
        </div>
      </template>

      <!-- Table -->
      <UTable
        :rows="filteredAuthors"
        :columns="columns"
        :loading="pending"
        :empty-state="{ icon: 'i-heroicons-users', label: 'No authors found' }"
      >
        <!-- Author Column -->
        <template #author-data="{ row }">
          <div class="flex items-center gap-3">
            <!-- Avatar with Initials -->
            <div class="flex-shrink-0">
              <div
                class="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold"
                :style="{ backgroundColor: getAuthorColor(row.author_email) }"
              >
                <span class="text-white">{{ getAuthorInitials(row) }}</span>
              </div>
            </div>

            <!-- Name and Email -->
            <div class="flex flex-col">
              <NuxtLink
                :to="`/admin/pipelines/authors/${encodeURIComponent(row.author_email)}`"
                class="font-medium text-gray-900 dark:text-white hover:text-primary hover:underline"
              >
                {{ row.author_name }}
              </NuxtLink>
              <span class="text-sm text-gray-500 dark:text-gray-400">{{ row.author_email }}</span>
            </div>
          </div>
        </template>

        <!-- Contact Icons Column -->
        <template #contact-data="{ row }">
          <PipelinesAuthorContactIcons :email="row.author_email" />
        </template>

        <!-- Total Runs Column -->
        <template #total_runs-data="{ row }">
          <span class="font-medium">{{ row.total_runs.toLocaleString() }}</span>
        </template>

        <!-- Success Rate Column -->
        <template #success_rate-data="{ row }">
          <div class="flex items-center gap-2">
            <div class="flex-1">
              <div class="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  class="h-full rounded-full transition-all"
                  :class="getSuccessRateColor(row.success_rate)"
                  :style="{ width: `${row.success_rate}%` }"
                />
              </div>
            </div>
            <span class="text-sm font-medium w-12 text-right">{{ row.success_rate.toFixed(1) }}%</span>
          </div>
        </template>

        <!-- Accounts Column -->
        <template #total_accounts-data="{ row }">
          <span class="text-gray-700 dark:text-gray-300">{{ row.total_accounts.toLocaleString() }}</span>
        </template>

        <!-- Last Run Column -->
        <template #last_run-data="{ row }">
          <span class="text-sm text-gray-600 dark:text-gray-400">
            {{ formatRelativeTime(row.last_run) }}
          </span>
        </template>
      </UTable>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import type { PipelineAuthorMetrics } from '#shared/types/pipelines'
import { getAuthorInitials } from '~/utils/author-helpers'
import PipelinesAuthorContactIcons from '~/components/pipelines/AuthorContactIcons.vue'

definePageMeta({
  layout: 'admin',
  middleware: 'auth-permission',
  permission: 'admin.logs'
})

// Time range selector
const timeRangeOptions = [
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 }
]

const selectedTimeRange = ref(30)

// Search
const searchQuery = ref('')

// Fetch authors data
const { data: authorsData, pending, error, refresh } = await useFetch('/api/pipelines/authors/list', {
  query: {
    days: selectedTimeRange,
    environment: 'govcloud'
  },
  watch: [selectedTimeRange]
})

// Table columns
const columns = [
  { key: 'author', label: 'Author', sortable: true },
  { key: 'contact', label: 'Contact' },
  { key: 'total_runs', label: 'Total Runs', sortable: true },
  { key: 'success_rate', label: 'Success Rate', sortable: true },
  { key: 'total_accounts', label: 'Accounts', sortable: true },
  { key: 'last_run', label: 'Last Run', sortable: true }
]

// Filtered authors based on search
const filteredAuthors = computed(() => {
  // Handle the sendSuccess wrapped response
  const authors = authorsData.value?.data?.authors || authorsData.value?.authors || []

  const query = searchQuery.value.toLowerCase().trim()
  if (!query) return authors

  return authors.filter((author: PipelineAuthorMetrics) => {
    return (
      author.author_name.toLowerCase().includes(query) ||
      author.author_email.toLowerCase().includes(query)
    )
  })
})

// Helper: Get author initials
function getAuthorInitials(author: PipelineAuthorMetrics): string {
  const name = author.author_name
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

// Helper: Get success rate color class
function getSuccessRateColor(rate: number): string {
  if (rate >= 90) return 'bg-green-500'
  if (rate >= 70) return 'bg-yellow-500'
  return 'bg-red-500'
}

// Use date formatter composable for timezone-aware formatting
const { formatRelativeTime: formatRelativeTimeWithTz } = useDateFormatter()

// Helper: Format relative time
function formatRelativeTime(timestamp: string): string {
  return formatRelativeTimeWithTz(timestamp)
}
</script>
