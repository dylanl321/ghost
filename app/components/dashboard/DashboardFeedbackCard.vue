<template>
  <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-2">
        <UIcon name="i-heroicons-light-bulb" class="w-5 h-5 text-purple-500" />
        <h2 class="text-sm font-semibold text-gray-900 dark:text-white">Feature Requests</h2>
      </div>
      <NuxtLink to="/admin" class="text-xs text-blue-500 hover:text-blue-400 transition-colors">
        View All →
      </NuxtLink>
    </div>

    <!-- Loading -->
    <LoadingSkeleton v-if="loading" type="card" />

    <!-- Error -->
    <div v-else-if="error" class="text-center py-4">
      <p class="text-xs text-gray-400">Unable to load feedback</p>
    </div>

    <!-- No items -->
    <div v-else-if="items.length === 0" class="text-center py-4">
      <UIcon name="i-heroicons-inbox" class="w-8 h-8 text-gray-400 mx-auto mb-2" />
      <p class="text-xs text-gray-500 dark:text-gray-400">No open feedback items</p>
    </div>

    <!-- Items -->
    <div v-else class="space-y-1">
      <!-- Counts -->
      <div class="flex gap-3 mb-3">
        <div v-if="bugCount > 0" class="flex items-center gap-1">
          <UIcon name="i-heroicons-bug-ant" class="w-3 h-3 text-red-400" />
          <span class="text-xs font-medium text-red-400">{{ bugCount }} bugs</span>
        </div>
        <div v-if="featureCount > 0" class="flex items-center gap-1">
          <UIcon name="i-heroicons-sparkles" class="w-3 h-3 text-purple-400" />
          <span class="text-xs font-medium text-purple-400">{{ featureCount }} features</span>
        </div>
        <div class="flex items-center gap-1 ml-auto">
          <span class="text-[10px] text-gray-400">{{ openCount }} open</span>
        </div>
      </div>

      <!-- Recent items -->
      <div
        v-for="item in recentItems"
        :key="item.id"
        class="flex items-start gap-2 py-1.5 border-t border-gray-100 dark:border-gray-800 first:border-0 first:pt-0"
      >
        <UIcon
          :name="item.type === 'bug' ? 'i-heroicons-bug-ant' : 'i-heroicons-sparkles'"
          class="w-3.5 h-3.5 mt-0.5 shrink-0"
          :class="item.type === 'bug' ? 'text-red-400' : 'text-purple-400'"
        />
        <div class="min-w-0 flex-1">
          <p class="text-xs text-gray-900 dark:text-white truncate">{{ item.description }}</p>
          <p class="text-[10px] text-gray-400">{{ item.reporter_email?.split('@')[0] || 'Anonymous' }}</p>
        </div>
        <UBadge
          :color="item.resolved ? 'green' : 'gray'"
          variant="subtle"
          size="xs"
          class="shrink-0"
        >
          {{ item.resolved ? 'Done' : 'Open' }}
        </UBadge>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface FeedbackItem {
  id: string
  type: string
  description: string
  reporter_email?: string
  resolved?: boolean
  environment?: string
  date_utc?: string
  time_utc?: string
}

const items = ref<FeedbackItem[]>([])
const loading = ref(true)
const error = ref(false)

const recentItems = computed(() => items.value.slice(0, 5))
const openCount = computed(() => items.value.filter(i => !i.resolved).length)
const bugCount = computed(() => items.value.filter(i => i.type === 'bug' && !i.resolved).length)
const featureCount = computed(() => items.value.filter(i => i.type === 'feature' && !i.resolved).length)

onMounted(async () => {
  try {
    const result = await $fetch<{ success: boolean; data: { items: FeedbackItem[] } }>('/api/feedback/list')
    if (result.success && result.data?.items) {
      // Sort by most recent first using date_utc + time_utc
      items.value = result.data.items.sort((a, b) => {
        const dateA = `${a.date_utc || ''}T${a.time_utc || ''}`
        const dateB = `${b.date_utc || ''}T${b.time_utc || ''}`
        return dateB.localeCompare(dateA)
      })
    }
  } catch {
    error.value = true
  } finally {
    loading.value = false
  }
})
</script>
