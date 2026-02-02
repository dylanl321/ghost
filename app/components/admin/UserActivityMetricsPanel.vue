<template>
  <div>
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-1">
          User Activity Metrics
        </h2>
        <p class="text-sm text-gray-600 dark:text-gray-400">
          Average session length and most active pages from navigation logs ({{ activityPeriod }})
        </p>
      </div>
      <div class="flex gap-2">
        <USelect
          v-model="activityPeriod"
          :options="[{ label: 'Last 7 days', value: '7d' }, { label: 'Last 30 days', value: '30d' }]"
          class="w-40"
          @update:model-value="load"
        />
        <UButton
          icon="i-heroicons-arrow-path"
          color="blue"
          variant="soft"
          size="sm"
          :loading="loading"
          @click="load"
        >
          Refresh
        </UButton>
      </div>
    </div>

    <!-- Global summary -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <UCard>
        <div class="flex items-center gap-3">
          <div class="p-2 bg-cyan-500/10 rounded-lg">
            <Icon name="i-heroicons-clock" class="w-5 h-5 text-cyan-500" />
          </div>
          <div>
            <p class="text-xs text-gray-600 dark:text-gray-400">Avg. session length</p>
            <p class="text-xl font-bold text-gray-900 dark:text-white">{{ formatDuration(global?.avgSessionLengthMs ?? 0) }}</p>
          </div>
        </div>
      </UCard>
      <UCard>
        <div class="flex items-center gap-3">
          <div class="p-2 bg-green-500/10 rounded-lg">
            <Icon name="i-heroicons-user-group" class="w-5 h-5 text-green-500" />
          </div>
          <div>
            <p class="text-xs text-gray-600 dark:text-gray-400">Total sessions</p>
            <p class="text-xl font-bold text-gray-900 dark:text-white">{{ global?.totalSessions ?? 0 }}</p>
          </div>
        </div>
      </UCard>
      <UCard>
        <div class="flex items-center gap-3">
          <div class="p-2 bg-amber-500/10 rounded-lg">
            <Icon name="i-heroicons-map" class="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <p class="text-xs text-gray-600 dark:text-gray-400">Top pages</p>
            <p class="text-sm font-semibold text-gray-900 dark:text-white truncate max-w-[180px]" :title="globalTopPagesStr">
              {{ globalTopPagesStr || '—' }}
            </p>
          </div>
        </div>
      </UCard>
    </div>

    <UCard>
      <template #header>
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
          By user
        </h3>
      </template>

      <div v-if="loading" class="text-center py-12">
        <Icon name="i-heroicons-arrow-path" class="w-8 h-8 text-gray-400 animate-spin mx-auto mb-2" />
        <p class="text-gray-500 dark:text-gray-400">Loading activity metrics...</p>
      </div>

      <div v-else-if="loadError" class="text-center py-12 text-amber-600 dark:text-amber-400">
        <Icon name="i-heroicons-exclamation-triangle" class="w-12 h-12 mx-auto mb-2 opacity-50" />
        <p>{{ loadError }}</p>
      </div>

      <div v-else-if="!byUser.length" class="text-center py-12 text-gray-500">
        <Icon name="i-heroicons-chart-bar" class="w-12 h-12 mx-auto mb-2 opacity-50" />
        <p>No navigation activity in this period</p>
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="border-b border-gray-200 dark:border-gray-700">
            <tr class="text-left">
              <th class="pb-3 pr-4 font-medium text-gray-700 dark:text-gray-300">User</th>
              <th class="pb-3 pr-4 font-medium text-gray-700 dark:text-gray-300">Sessions</th>
              <th class="pb-3 pr-4 font-medium text-gray-700 dark:text-gray-300">Avg. session</th>
              <th class="pb-3 font-medium text-gray-700 dark:text-gray-300">Most active pages</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
            <tr v-for="u in byUser" :key="u.userId" class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <td class="py-3 pr-4">
                <div class="flex items-center gap-2">
                  <UserAvatar :email="u.userId" size="sm" />
                  <span class="font-medium text-gray-900 dark:text-white">{{ u.userId }}</span>
                </div>
              </td>
              <td class="py-3 pr-4 text-gray-600 dark:text-gray-400">{{ u.sessionCount }}</td>
              <td class="py-3 pr-4 text-gray-600 dark:text-gray-400">{{ formatDuration(u.avgSessionLengthMs) }}</td>
              <td class="py-3">
                <div class="flex flex-wrap gap-1">
                  <UBadge
                    v-for="p in u.topPages.slice(0, 4)"
                    :key="p.path"
                    color="gray"
                    variant="soft"
                    size="xs"
                  >
                    {{ p.path }} ({{ p.count }})
                  </UBadge>
                  <span v-if="u.topPages.length > 4" class="text-xs text-gray-500">+{{ u.topPages.length - 4 }} more</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
const activityPeriod = ref<'7d' | '30d'>('7d')
const loading = ref(false)
const loadError = ref<string | null>(null)
const byUser = ref<Array<{ userId: string; avgSessionLengthMs: number; sessionCount: number; topPages: Array<{ path: string; count: number }> }>>([])
const global = ref<{ avgSessionLengthMs: number; totalSessions: number; topPages: Array<{ path: string; count: number }> } | null>(null)

const globalTopPagesStr = computed(() => {
  const top = global.value?.topPages?.slice(0, 5)
  if (!top?.length) return ''
  return top.map(p => p.path).join(', ')
})

function formatDuration(ms: number): string {
  if (ms <= 0 || !Number.isFinite(ms)) return '—'
  const sec = Math.round(ms / 1000)
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  const s = sec % 60
  if (min < 60) return s ? `${min}m ${s}s` : `${min}m`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

async function load() {
  loading.value = true
  loadError.value = null
  try {
    const res = await $fetch<{ success: boolean; data: { byUser: typeof byUser.value; global: typeof global.value } }>(
      '/api/admin/user-activity-metrics',
      { query: { period: activityPeriod.value } }
    )
    if (res.success && res.data) {
      byUser.value = res.data.byUser ?? []
      global.value = res.data.global ?? null
    }
  } catch {
    byUser.value = []
    global.value = null
    loadError.value = 'Activity metrics unavailable'
  } finally {
    loading.value = false
  }
}

onMounted(() => load())
</script>
