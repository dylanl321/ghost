<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="text-lg font-semibold text-gray-900 dark:text-white">Budget Alert History</div>
          <UBadge v-if="filteredAlerts.length > 0" color="emerald" variant="subtle">
            {{ filteredAlerts.length }} alert{{ filteredAlerts.length !== 1 ? 's' : '' }}
          </UBadge>
        </div>
        <div class="flex items-center gap-2">
          <USelect
            v-if="availableMonths.length > 0"
            v-model="selectedMonth"
            :options="availableMonths"
            size="sm"
            class="w-40"
          />
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
      </div>
    </template>

    <!-- Loading State -->
    <div v-if="loading" class="flex items-center justify-center py-12">
      <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 text-gray-400 animate-spin" />
    </div>

    <!-- Empty State -->
    <div v-else-if="filteredAlerts.length === 0" class="flex flex-col items-center justify-center py-12 text-center">
      <UIcon name="i-heroicons-bell-slash" class="w-12 h-12 text-gray-400 dark:text-gray-500 mb-4" />
      <p class="text-gray-600 dark:text-gray-400">
        {{ alerts.length === 0 ? 'No budget alerts have been sent for this account' : 'No alerts for selected month' }}
      </p>
    </div>

    <!-- Alerts Table -->
    <UTable
      v-else
      :rows="filteredAlerts"
      :columns="columns"
      class="min-w-full"
    >
      <!-- Date Column -->
      <template #created_at-data="{ row }">
        {{ formatDate(row.created_at) }}
      </template>

      <!-- Level Column -->
      <template #alert_level-data="{ row }">
        <UBadge :color="getLevelColor(row.alert_level)" variant="subtle">
          {{ row.alert_level }}
        </UBadge>
      </template>

      <!-- Type Column -->
      <template #alert_type-data="{ row }">
        <UBadge :color="getTypeColor(row.alert_type)" variant="subtle">
          {{ row.alert_type }}
        </UBadge>
      </template>

      <!-- Overspend Column -->
      <template #overspend-data="{ row }">
        <span v-if="row.overspend_amount" class="text-red-400 font-medium">
          +{{ formatCurrency(row.overspend_amount, 0) }}
        </span>
        <span v-else class="text-gray-400 text-sm">
          {{ formatCurrency(row.actual_spend, 0) }} / {{ formatCurrency(row.budget, 0) }}
        </span>
      </template>

      <!-- Status Column -->
      <template #delivery_status-data="{ row }">
        <UBadge :color="getStatusColor(row.delivery_status)" variant="subtle">
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

    <!-- Email Preview Modal -->
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
import { ref, computed, onMounted } from 'vue'
import { useToast } from '#imports'
import type { BudgetAlert } from '@/shared/types/budget-alerts'

const props = defineProps<{
  accountId: string
}>()

const toast = useToast()
const loading = ref(false)
const alerts = ref<BudgetAlert[]>([])
const selectedMonth = ref<string>('')

// Email preview state
const showEmailModal = ref(false)
const loadingEmail = ref(false)
const loadingEmailId = ref<string | null>(null)
const emailHtml = ref<string | null>(null)
const emailSubject = ref<string | null>(null)

const columns = [
  { key: 'created_at', label: 'Date', sortable: true },
  { key: 'alert_level', label: 'Level', sortable: true },
  { key: 'alert_type', label: 'Type', sortable: true },
  { key: 'overspend', label: 'Spend/Budget' },
  { key: 'delivery_status', label: 'Status', sortable: true },
  { key: 'actions', label: '' }
]

// Get current month key (YYYY-MM format)
function getCurrentMonthKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// Format month for display (e.g., "January 2026")
function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-')
  const date = new Date(parseInt(year), parseInt(month) - 1)
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

// Available months - always includes current month, plus any months with alerts
const availableMonths = computed(() => {
  const monthsSet = new Set<string>()

  // Always include current month so user can see it even if no alerts yet
  const currentMonth = getCurrentMonthKey()
  monthsSet.add(currentMonth)

  // Add months from alerts data
  alerts.value.forEach(alert => {
    if (alert.month) {
      monthsSet.add(alert.month)
    }
  })

  // Sort months descending (newest first)
  const sortedMonths = Array.from(monthsSet).sort((a, b) => b.localeCompare(a))

  return sortedMonths.map(monthKey => ({
    label: formatMonthLabel(monthKey),
    value: monthKey
  }))
})

// Filtered and sorted alerts
const filteredAlerts = computed(() => {
  let filtered = [...alerts.value]

  // Filter by selected month using alert.month field directly
  if (selectedMonth.value) {
    filtered = filtered.filter(alert => alert.month === selectedMonth.value)
  }

  // Sort by date descending (latest first)
  filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  return filtered
})

// Format date as "Jan 15, 2026 2:30 PM"
function formatDate(timestamp: string): string {
  return new Date(timestamp).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
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

// Fetch alerts from API
async function fetchAlerts() {
  if (!props.accountId) return

  try {
    loading.value = true
    const res = await fetch(`/api/alerts/account/${props.accountId}?limit=100`)
    const data = await res.json()

    if (data.success && data.data) {
      alerts.value = data.data

      // Always default to current month (it's always in the dropdown now)
      selectedMonth.value = getCurrentMonthKey()
    } else {
      throw new Error(data.error || 'Failed to fetch alerts')
    }
  } catch (err: any) {
    console.error('Failed to fetch budget alerts:', err)
    toast.add({
      title: 'Error',
      description: err.message || 'Failed to load budget alert history.',
      color: 'red'
    })
  } finally {
    loading.value = false
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

    const res = await fetch(`/api/alerts/${alert.alert_id}/email?accountId=${props.accountId}`)
    const data = await res.json()

    if (data.success && data.data?.html) {
      emailHtml.value = data.data.html
      emailSubject.value = data.data.subject || alert.email_subject || 'Budget Alert'
    } else {
      throw new Error(data.error || 'Failed to load email content')
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

// Fetch alerts on mount
onMounted(() => {
  fetchAlerts()
})
</script>
