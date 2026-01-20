<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="text-lg font-semibold">Recent Budget Alerts</div>
          <UBadge v-if="alerts.length > 0" color="emerald" variant="subtle">
            {{ alerts.length }} alert{{ alerts.length !== 1 ? 's' : '' }}
          </UBadge>
        </div>
        <UButton
          color="gray"
          variant="ghost"
          icon="i-heroicons-arrow-path"
          :loading="loading"
          title="Refresh alerts"
          @click="fetchAlerts"
        >
          Refresh
        </UButton>
      </div>
    </template>

    <!-- Loading State -->
    <div v-if="loading" class="flex items-center justify-center py-8">
      <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 text-gray-400 animate-spin" />
    </div>

    <!-- Empty State -->
    <div v-else-if="alerts.length === 0" class="flex flex-col items-center justify-center py-8 text-center">
      <UIcon name="i-heroicons-bell-slash" class="w-10 h-10 text-gray-500 mb-3" />
      <p class="text-gray-400 text-sm">No recent alerts</p>
    </div>

    <!-- Alerts Table -->
    <UTable
      v-else
      :rows="alerts"
      :columns="columns"
      class="min-w-full"
      :ui="{ td: { base: 'py-2' } }"
    >
      <!-- Date Column -->
      <template #created_at-data="{ row }">
        <span class="text-sm">{{ formatDate(row.created_at) }}</span>
      </template>

      <!-- Account Column -->
      <template #account_name-data="{ row }">
        <NuxtLink
          :to="`/account/${row.account_id}`"
          class="text-sm text-blue-400 hover:text-blue-300 hover:underline truncate block max-w-[150px]"
          :title="row.account_name || row.account_id"
        >
          {{ truncateName(row.account_name || row.account_id) }}
        </NuxtLink>
      </template>

      <!-- Level Column -->
      <template #alert_level-data="{ row }">
        <UBadge :color="getLevelColor(row.alert_level)" variant="subtle" size="xs">
          {{ row.alert_level }}
        </UBadge>
      </template>

      <!-- Type Column -->
      <template #alert_type-data="{ row }">
        <UBadge :color="getTypeColor(row.alert_type)" variant="subtle" size="xs">
          {{ row.alert_type }}
        </UBadge>
      </template>
    </UTable>
  </UCard>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import type { BudgetAlert } from '@/shared/types/budget-alerts'

const props = defineProps<{
  accountIds: string[]
}>()

const loading = ref(false)
const alerts = ref<BudgetAlert[]>([])

// Debounce timer for account selection changes
let debounceTimer: ReturnType<typeof setTimeout> | null = null

const columns = [
  { key: 'created_at', label: 'Date', sortable: true },
  { key: 'account_name', label: 'Account' },
  { key: 'alert_level', label: 'Level', sortable: true },
  { key: 'alert_type', label: 'Type', sortable: true }
]

// Format date as "Jan 15, 2:30 PM"
function formatDate(timestamp: string): string {
  return new Date(timestamp).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
}

// Truncate account name for compact display
function truncateName(name: string): string {
  if (name.length <= 20) return name
  return name.substring(0, 18) + '...'
}

// Get color for alert level badge
function getLevelColor(level: string): string {
  switch (level) {
    case 'INFO':
      return 'blue'
    case 'WARNING':
      return 'yellow'
    case 'CRITICAL':
      return 'red'
    case 'ESCALATION':
      return 'purple'
    default:
      return 'gray'
  }
}

// Get color for alert type badge
function getTypeColor(type: string): string {
  switch (type) {
    case 'FORECAST':
      return 'cyan'
    case 'ACTUAL':
      return 'orange'
    default:
      return 'gray'
  }
}

// Fetch alerts from API
async function fetchAlerts() {
  try {
    loading.value = true

    if (props.accountIds.length === 0) {
      // No accounts selected: fetch recent alerts across all accounts
      const res = await $fetch<{ success: boolean; data: BudgetAlert[] }>('/api/alerts/list', {
        query: { limit: 10 }
      })

      if (res.success && res.data) {
        alerts.value = res.data
      } else {
        alerts.value = []
      }
    } else {
      // Accounts selected: fetch alerts for each account and merge
      const fetchPromises = props.accountIds.map(accountId =>
        $fetch<{ success: boolean; data: BudgetAlert[] }>('/api/alerts/list', {
          query: { accountId, limit: 5 }
        }).catch(() => ({ success: false, data: [] as BudgetAlert[] }))
      )

      const results = await Promise.all(fetchPromises)

      // Merge all alerts and sort by date descending
      const allAlerts: BudgetAlert[] = []
      for (const res of results) {
        if (res.success && res.data) {
          allAlerts.push(...res.data)
        }
      }

      // Sort by created_at descending and take top 10
      allAlerts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      alerts.value = allAlerts.slice(0, 10)
    }
  } catch (err: any) {
    console.error('Failed to fetch budget alerts:', err)
    alerts.value = []
  } finally {
    loading.value = false
  }
}

// Watch accountIds with debounce to avoid excessive fetches during multi-select
watch(
  () => props.accountIds,
  () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
    }
    debounceTimer = setTimeout(() => {
      fetchAlerts()
    }, 300)
  },
  { deep: true }
)

// Fetch alerts on mount
onMounted(() => {
  fetchAlerts()
})
</script>
