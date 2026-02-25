<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="text-lg font-semibold">Current Month Budget Alerts</div>
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
      <p class="text-gray-600 dark:text-gray-400 text-sm">No budget alerts this month</p>
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

      <!-- Spend/Budget Column -->
      <template #overspend-data="{ row }">
        <span v-if="row.overspend_amount" class="text-red-400 font-medium text-sm">
          +{{ formatCurrency(row.overspend_amount, 0) }} over
        </span>
        <span v-else class="text-gray-400 text-sm">
          {{ formatCurrency(row.actual_spend, 0) }} / {{ formatCurrency(row.budget, 0) }}
        </span>
      </template>

      <!-- Status Column -->
      <template #delivery_status-data="{ row }">
        <UBadge :color="getStatusColor(row.delivery_status)" variant="subtle" size="xs">
          {{ row.delivery_status }}
        </UBadge>
      </template>

      <!-- Actions Column -->
      <template #actions-data="{ row }">
        <UButton
          v-if="row.email_body_s3_uri"
          color="gray"
          variant="ghost"
          size="xs"
          icon="i-heroicons-envelope"
          :loading="loadingEmailId === row.alert_id"
          @click="viewEmail(row)"
        >
          View
        </UButton>
      </template>
    </UTable>

    <!-- Email Preview Slideover -->
    <USlideover v-model="showEmailModal" :ui="{ width: 'max-w-3xl' }">
      <div class="flex flex-col h-full">
        <!-- Header -->
        <div class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Email Preview</h3>
            <p v-if="emailSubject" class="text-sm text-gray-600 dark:text-gray-400 mt-1">{{ emailSubject }}</p>
          </div>
          <UButton
            color="gray"
            variant="ghost"
            icon="i-heroicons-x-mark"
            @click="showEmailModal = false"
          />
        </div>

        <!-- Loading -->
        <div v-if="loadingEmail" class="flex-1 flex items-center justify-center">
          <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 text-gray-400 animate-spin" />
        </div>

        <!-- Email Content -->
        <div v-else-if="emailHtml" class="flex-1 overflow-hidden p-4">
          <div class="bg-white rounded-lg h-full">
            <iframe
              :srcdoc="emailHtml"
              class="w-full h-full rounded-lg"
              sandbox="allow-same-origin"
            />
          </div>
        </div>

        <!-- Error State -->
        <div v-else class="flex-1 flex items-center justify-center">
          <p class="text-gray-600 dark:text-gray-400">Failed to load email content</p>
        </div>
      </div>
    </USlideover>
  </UCard>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useToast } from '#imports'
import type { BudgetAlert } from '@/shared/types/budget-alerts'

const props = defineProps<{
  accountIds: string[]
}>()

const toast = useToast()
const loading = ref(false)
const alerts = ref<BudgetAlert[]>([])

// Email preview state
const showEmailModal = ref(false)
const loadingEmail = ref(false)
const loadingEmailId = ref<string | null>(null)
const emailHtml = ref<string | null>(null)
const emailSubject = ref<string | null>(null)

// Debounce timer for account selection changes
let debounceTimer: ReturnType<typeof setTimeout> | null = null

// Get current month in YYYY-MM format for filtering
function getCurrentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

const columns = [
  { key: 'created_at', label: 'Date', sortable: true },
  { key: 'account_name', label: 'Account' },
  { key: 'alert_level', label: 'Level', sortable: true },
  { key: 'alert_type', label: 'Type', sortable: true },
  { key: 'overspend', label: 'Spend / Budget' },
  { key: 'delivery_status', label: 'Status', sortable: true },
  { key: 'actions', label: '' }
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

// Get color for delivery status badge
function getStatusColor(status: string): string {
  switch (status) {
    case 'SUCCESS':
    case 'SENT':
      return 'green'
    case 'FAILED':
      return 'red'
    case 'PENDING':
      return 'gray'
    default:
      return 'gray'
  }
}

// View email content for an alert
async function viewEmail(alert: BudgetAlert) {
  if (!alert.email_body_s3_uri) return

  try {
    loadingEmailId.value = alert.alert_id
    loadingEmail.value = true
    emailHtml.value = null
    emailSubject.value = alert.email_subject || null
    showEmailModal.value = true

    const res = await $fetch<{ success: boolean; data?: { html: string; subject?: string }; error?: string }>(`/api/alerts/${alert.alert_id}/email`, {
      query: { accountId: alert.account_id }
    })

    if (res.success && res.data?.html) {
      emailHtml.value = res.data.html
      emailSubject.value = res.data.subject || alert.email_subject || 'Budget Alert'
    } else {
      throw new Error(res.error || 'Failed to load email content')
    }
  } catch (err: any) {
    console.error('Failed to fetch email content:', err)
    toast.add({
      title: 'Error',
      description: err.message || 'Failed to load email content.',
      color: 'red'
    })
    showEmailModal.value = false
  } finally {
    loadingEmail.value = false
    loadingEmailId.value = null
  }
}

// Fetch alerts from API - filtered to current month only
async function fetchAlerts() {
  try {
    loading.value = true
    const currentMonth = getCurrentMonth()

    // Always query by month (uses efficient GSI), then filter client-side by accounts
    const res = await $fetch<{ success: boolean; data: BudgetAlert[] }>('/api/alerts/list', {
      query: { month: currentMonth, limit: 50 }
    })

    if (res.success && res.data) {
      let filtered = res.data
      // Filter to selected accounts client-side if any are selected
      if (props.accountIds.length > 0) {
        const selectedSet = new Set(props.accountIds)
        filtered = filtered.filter(alert => selectedSet.has(alert.account_id))
      }
      // Sort by date descending
      filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      alerts.value = filtered
    } else {
      alerts.value = []
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
