<template>
  <div>
    <!-- Header -->
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-1">
        Share Links Management
      </h1>
      <p class="text-sm text-gray-600 dark:text-gray-400">
        View and manage all share links created by users across the platform
      </p>
    </div>

    <!-- Shortlinks Table Card -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <Icon name="i-heroicons-link" class="w-5 h-5 text-gray-400" />
            <h3 class="text-base font-semibold text-gray-900 dark:text-white">
              All Share Links
            </h3>
            <UBadge v-if="!shortlinksLoading" color="gray" variant="soft">
              {{ shortlinksTotal }} total
            </UBadge>
          </div>
          <UButton
            icon="i-heroicons-arrow-path"
            color="gray"
            variant="soft"
            size="sm"
            @click="refreshShortlinks"
            :loading="shortlinksLoading"
          >
            Refresh
          </UButton>
        </div>
      </template>

      <!-- Loading State -->
      <div v-if="shortlinksLoading && shortlinks.length === 0" class="flex flex-col items-center justify-center py-16">
        <Icon name="i-heroicons-arrow-path" class="w-10 h-10 animate-spin text-gray-400 mb-3" />
        <p class="text-sm text-gray-600 dark:text-gray-400">Loading share links...</p>
      </div>

      <!-- Error State -->
      <div v-else-if="shortlinksError" class="text-center py-16">
        <Icon name="i-heroicons-exclamation-triangle" class="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">Failed to Load</h3>
        <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">{{ shortlinksError }}</p>
        <UButton @click="refreshShortlinks" color="blue" size="sm">
          Try Again
        </UButton>
      </div>

      <!-- Shortlinks Table -->
      <div v-else-if="shortlinks.length > 0" class="overflow-x-auto">
        <UTable
          :rows="shortlinks"
          :columns="shortlinksColumns"
          :loading="shortlinksLoading"
        >
          <template #shortUrl-data="{ row }">
            <div class="flex items-center gap-2 min-w-[200px]">
              <code class="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded font-mono">
                {{ row.shortUrl }}
              </code>
              <UButton
                icon="i-heroicons-clipboard-document"
                size="xs"
                color="gray"
                variant="ghost"
                @click="copyToClipboard(row.shortUrl)"
              />
            </div>
          </template>

          <template #pagePath-data="{ row }">
            <div class="max-w-sm">
              <div class="text-sm font-medium text-gray-900 dark:text-white truncate">
                {{ row.pagePath }}
              </div>
              <div v-if="row.description" class="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                {{ row.description }}
              </div>
            </div>
          </template>

          <template #visitCount-data="{ row }">
            <div class="flex items-center gap-2">
              <Icon name="i-heroicons-eye" class="w-4 h-4 text-gray-400" />
              <span class="font-semibold text-gray-900 dark:text-white">{{ row.visitCount }}</span>
            </div>
          </template>

          <template #createdBy-data="{ row }">
            <div class="flex items-center gap-2">
              <Icon name="i-heroicons-user" class="w-4 h-4 text-gray-400" />
              <span class="text-sm text-gray-700 dark:text-gray-300">{{ row.createdBy || 'Unknown' }}</span>
            </div>
          </template>

          <template #createdAt-data="{ row }">
            <div class="text-sm">
              <div class="text-gray-900 dark:text-white">{{ formatDate(row.createdAt) }}</div>
              <div class="text-xs text-gray-500 dark:text-gray-400">
                {{ formatTimeAgo(row.createdAt) }}
              </div>
            </div>
          </template>

          <template #lastVisited-data="{ row }">
            <div class="text-sm">
              <span v-if="row.lastVisited" class="text-gray-700 dark:text-gray-300">
                {{ formatTimeAgo(row.lastVisited) }}
              </span>
              <span v-else class="text-gray-400 italic">Never</span>
            </div>
          </template>

          <template #actions-data="{ row }">
            <UButton
              icon="i-heroicons-arrow-top-right-on-square"
              size="xs"
              color="blue"
              variant="ghost"
              @click="openLink(row.shortUrl)"
            />
          </template>
        </UTable>
      </div>

      <!-- Empty State -->
      <div v-else class="text-center py-16">
        <Icon name="i-heroicons-link-slash" class="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">No Share Links Found</h3>
        <p class="text-sm text-gray-600 dark:text-gray-400">
          Share links will appear here when users create them
        </p>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">

// Shortlinks management
const { links: shortlinks, total: shortlinksTotal, loading: shortlinksLoading, error: shortlinksError, fetchShortlinks } = useShortlinks()

const shortlinksColumns = [
  { key: 'shortUrl', label: 'Short URL', sortable: false },
  { key: 'pagePath', label: 'Destination', sortable: false },
  { key: 'visitCount', label: 'Views', sortable: true },
  { key: 'createdBy', label: 'Created By', sortable: false },
  { key: 'createdAt', label: 'Created', sortable: true },
  { key: 'lastVisited', label: 'Last Visit', sortable: false },
  { key: 'actions', label: '', sortable: false }
]

// Date formatting helpers
const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

// Copy to clipboard
// Open link in new tab
const openLink = (url: string) => {
  window.open(url, '_blank')
}

// Refresh shortlinks
const refreshShortlinks = () => {
  fetchShortlinks({ limit: 100 })
}

// Load shortlinks on mount
onMounted(() => {
  fetchShortlinks({ limit: 100 })
})
</script>
