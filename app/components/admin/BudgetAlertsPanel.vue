<template>
  <div class="space-y-6">
    <!-- Header -->
    <UCard>
      <h1 class="text-2xl font-semibold">Budget Alerts</h1>
      <p class="text-sm text-gray-500">View all budget alerts across accounts. Filter by level, type, delivery status, or month.</p>
    </UCard>

    <!-- Filters -->
    <UCard>
      <template #header>
        <div class="text-lg font-semibold">Filters</div>
      </template>

      <div class="flex flex-wrap gap-6 items-center">
        <UFormGroup label="Account" class="min-w-[200px]">
          <UInput
            v-model="accountSearch"
            placeholder="Search by account name/ID..."
          />
        </UFormGroup>

        <UFormGroup label="Level" class="min-w-[160px]">
          <USelect
            v-model="selectedLevel"
            :options="levelOptions"
            placeholder="Select level"
          />
        </UFormGroup>

        <UFormGroup label="Type" class="min-w-[160px]">
          <USelect
            v-model="selectedType"
            :options="typeOptions"
            placeholder="Select type"
          />
        </UFormGroup>

        <UFormGroup label="Delivery Status" class="min-w-[160px]">
          <USelect
            v-model="selectedDeliveryStatus"
            :options="deliveryStatusOptions"
            placeholder="Select status"
          />
        </UFormGroup>

        <UFormGroup label="Mode" class="min-w-[160px]">
          <USelect
            v-model="selectedMode"
            :options="modeOptions"
            placeholder="Select mode"
          />
        </UFormGroup>

        <UFormGroup label="Month" class="min-w-[140px]">
          <UInput
            v-model="selectedMonth"
            type="month"
            placeholder="YYYY-MM"
          />
        </UFormGroup>
      </div>
    </UCard>

    <!-- Operations Summary Cards -->
    <div v-if="!loading && alerts.length > 0" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <!-- Total Alerts -->
      <UCard>
        <div class="flex items-center gap-3">
          <div class="flex-shrink-0 p-2 rounded-lg bg-blue-500/10">
            <UIcon name="i-heroicons-bell" class="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <p class="text-sm text-gray-400">Total Alerts</p>
            <p class="text-2xl font-semibold">{{ summaryStats.total }}</p>
          </div>
        </div>
      </UCard>

      <!-- Success Rate -->
      <UCard>
        <div class="flex items-center gap-3">
          <div class="flex-shrink-0 p-2 rounded-lg" :class="successRateColorClasses.bg">
            <UIcon name="i-heroicons-chart-pie" class="w-6 h-6" :class="successRateColorClasses.icon" />
          </div>
          <div>
            <p class="text-sm text-gray-400">Success Rate</p>
            <p class="text-2xl font-semibold" :class="successRateColorClasses.text">
              {{ summaryStats.successRate }}%
            </p>
          </div>
        </div>
      </UCard>

      <!-- Failed Alerts -->
      <UCard>
        <div class="flex items-center gap-3">
          <div class="flex-shrink-0 p-2 rounded-lg" :class="summaryStats.failed > 0 ? 'bg-red-500/10' : 'bg-gray-500/10'">
            <UIcon name="i-heroicons-x-circle" class="w-6 h-6" :class="summaryStats.failed > 0 ? 'text-red-400' : 'text-gray-400'" />
          </div>
          <div>
            <p class="text-sm text-gray-400">Failed</p>
            <div class="flex items-center gap-2">
              <p class="text-2xl font-semibold" :class="summaryStats.failed > 0 ? 'text-red-400' : ''">
                {{ summaryStats.failed }}
              </p>
              <UBadge v-if="summaryStats.failed > 0" color="red" variant="subtle" size="xs">
                Needs attention
              </UBadge>
            </div>
          </div>
        </div>
      </UCard>

      <!-- Dry-Run Alerts -->
      <UCard>
        <div class="flex items-center gap-3">
          <div class="flex-shrink-0 p-2 rounded-lg bg-purple-500/10">
            <UIcon name="i-heroicons-beaker" class="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <p class="text-sm text-gray-400">Dry-Run</p>
            <div class="flex items-center gap-2">
              <p class="text-2xl font-semibold text-purple-400">{{ summaryStats.dryRun }}</p>
              <UBadge v-if="summaryStats.dryRun > 0" color="purple" variant="subtle" size="xs">
                Test mode
              </UBadge>
            </div>
          </div>
        </div>
      </UCard>
    </div>

    <!-- Results Table -->
    <UCard>
      <template #header>
        <div class="flex justify-between items-center">
          <div class="flex items-center gap-3">
            <div class="text-lg font-semibold">Results</div>
            <UBadge color="emerald" variant="subtle">{{ filteredItems.length }} results</UBadge>
          </div>
          <UButton
            color="gray"
            variant="ghost"
            icon="i-heroicons-arrow-path"
            :loading="loading"
            title="Refresh data"
            @click="fetchAlerts"
          >
            Refresh
          </UButton>
        </div>
      </template>

      <!-- Loading State -->
      <div v-if="loading" class="flex items-center justify-center py-12">
        <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 text-gray-400 animate-spin" />
      </div>

      <!-- Empty State -->
      <div v-else-if="alerts.length === 0" class="flex flex-col items-center justify-center py-12 text-center">
        <UIcon name="i-heroicons-bell-slash" class="w-12 h-12 text-gray-500 mb-4" />
        <p class="text-gray-400">No budget alerts found</p>
      </div>

      <!-- Alerts Table -->
      <UTable
        v-else
        :rows="paginatedItems"
        :columns="columns"
        class="min-w-full"
      >
        <!-- Date Column -->
        <template #created_at-data="{ row }">
          {{ formatDate(row.created_at) }}
        </template>

        <!-- Account Column -->
        <template #account_name-data="{ row }">
          <NuxtLink
            :to="`/account/${row.account_id}`"
            class="text-blue-400 hover:text-blue-300 hover:underline"
            :title="row.account_name || row.account_id"
          >
            {{ row.account_name || row.account_id }}
          </NuxtLink>
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

        <!-- Spend Column -->
        <template #spend-data="{ row }">
          <span v-if="row.overspend_amount" class="text-red-400 font-medium">
            +{{ formatCurrency(row.overspend_amount) }}
          </span>
          <span v-else class="text-gray-400 text-sm">
            {{ formatCurrency(row.actual_spend) }} / {{ formatCurrency(row.budget) }}
          </span>
        </template>

        <!-- Status Column -->
        <template #delivery_status-data="{ row }">
          <div class="flex flex-col gap-1">
            <div class="flex items-center gap-2">
              <UBadge :color="getStatusColor(row.delivery_status)" variant="subtle">
                {{ row.delivery_status }}
              </UBadge>
              <span v-if="row.dry_run" class="text-xs text-purple-400">(Dry-Run)</span>
            </div>
            <span v-if="getRecipientCount(row) > 0" class="text-xs text-gray-500">
              {{ getRecipientText(row) }}
            </span>
          </div>
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

      <!-- Pagination -->
      <div v-if="filteredItems.length > 0" class="flex justify-end items-center mt-4">
        <UPagination
          v-model="page"
          :page-count="pageCount"
          :total="filteredItems.length"
        />
      </div>
    </UCard>

    <!-- Email Preview Modal -->
    <USlideover v-model="showEmailModal" :ui="{ width: 'max-w-3xl' }">
      <div class="flex flex-col h-full">
        <!-- Header -->
        <div class="flex items-center justify-between p-4 border-b border-gray-700">
          <div>
            <h3 class="text-lg font-semibold">Email Preview</h3>
            <p v-if="emailSubject" class="text-sm text-gray-400 mt-1">{{ emailSubject }}</p>
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
        <div v-else-if="emailHtml" class="flex-1 overflow-auto p-4">
          <div class="bg-white rounded-lg">
            <iframe
              :srcdoc="emailHtml"
              class="w-full h-full min-h-[600px] rounded-lg"
              sandbox="allow-same-origin"
            />
          </div>
        </div>

        <!-- Error State -->
        <div v-else class="flex-1 flex items-center justify-center">
          <p class="text-gray-400">Failed to load email content</p>
        </div>
      </div>
    </USlideover>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useToast } from '#imports'
import type { BudgetAlert, BudgetAlertLevel, BudgetAlertType, BudgetAlertDeliveryStatus } from '@/shared/types/budget-alerts'

type LevelFilter = 'All' | BudgetAlertLevel
type TypeFilter = 'All' | BudgetAlertType
type DeliveryStatusFilter = 'All' | BudgetAlertDeliveryStatus
type ModeFilter = 'All' | 'production' | 'dry-run'

const toast = useToast()
const loading = ref(false)
const alerts = ref<BudgetAlert[]>([])

// Filter state
const accountSearch = ref('')
const selectedLevel = ref<LevelFilter>('All')
const selectedType = ref<TypeFilter>('All')
const selectedDeliveryStatus = ref<DeliveryStatusFilter>('All')
const selectedMode = ref<ModeFilter>('All')
const selectedMonth = ref('')

// Pagination state
const page = ref(1)
const pageCount = 20

// Email preview state
const showEmailModal = ref(false)
const loadingEmail = ref(false)
const loadingEmailId = ref<string | null>(null)
const emailHtml = ref<string | null>(null)
const emailSubject = ref<string | null>(null)

// Filter options
const levelOptions = [
  { label: 'All Levels', value: 'All' },
  { label: 'Info', value: 'INFO' },
  { label: 'Warning', value: 'WARNING' },
  { label: 'Critical', value: 'CRITICAL' },
  { label: 'Escalation', value: 'ESCALATION' }
]

const typeOptions = [
  { label: 'All Types', value: 'All' },
  { label: 'Forecast', value: 'FORECAST' },
  { label: 'Actual', value: 'ACTUAL' }
]

const deliveryStatusOptions = [
  { label: 'All Statuses', value: 'All' },
  { label: 'Success', value: 'SUCCESS' },
  { label: 'Sent', value: 'SENT' },
  { label: 'Failed', value: 'FAILED' },
  { label: 'Pending', value: 'PENDING' }
]

const modeOptions = [
  { label: 'All Modes', value: 'All' },
  { label: 'Production Only', value: 'production' },
  { label: 'Dry-Run Only', value: 'dry-run' }
]

// Table columns
const columns = [
  { key: 'created_at', label: 'Date', sortable: true },
  { key: 'account_name', label: 'Account', sortable: true },
  { key: 'alert_level', label: 'Level', sortable: true },
  { key: 'alert_type', label: 'Type', sortable: true },
  { key: 'spend', label: 'Spend/Budget' },
  { key: 'delivery_status', label: 'Status', sortable: true },
  { key: 'actions', label: '' }
]

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

// Format currency values
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount)
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

// Get total recipient count from all recipient fields
function getRecipientCount(alert: BudgetAlert): number {
  const toCount = alert.recipients_to?.length || 0
  const ccCount = alert.recipients_cc?.length || 0
  const legacyCount = alert.recipients?.length || 0
  // Use new fields if available, otherwise fall back to legacy
  return toCount + ccCount > 0 ? toCount + ccCount : legacyCount
}

// Get formatted recipient text for display
function getRecipientText(alert: BudgetAlert): string {
  const count = getRecipientCount(alert)
  if (count === 0) return ''

  // Get all recipients for display
  const allRecipients: string[] = []
  if (alert.recipients_to?.length) {
    allRecipients.push(...alert.recipients_to)
  }
  if (alert.recipients_cc?.length) {
    allRecipients.push(...alert.recipients_cc)
  }
  // Fall back to legacy recipients if new fields are empty
  if (allRecipients.length === 0 && alert.recipients?.length) {
    allRecipients.push(...alert.recipients)
  }

  // Show specific emails for small lists (1-2), otherwise show count
  if (allRecipients.length <= 2) {
    return `-> ${allRecipients.join(', ')}`
  }
  return `-> ${count} recipients`
}

// Client-side filtering
const filteredItems = computed(() =>
  alerts.value.filter((item) => {
    // Account search filter (matches account_id or account_name)
    const matchesAccount = accountSearch.value
      ? (item.account_name?.toLowerCase().includes(accountSearch.value.toLowerCase()) ||
         item.account_id.includes(accountSearch.value))
      : true

    // Level filter
    const matchesLevel = selectedLevel.value === 'All' || item.alert_level === selectedLevel.value

    // Type filter
    const matchesType = selectedType.value === 'All' || item.alert_type === selectedType.value

    // Delivery status filter
    const matchesStatus = selectedDeliveryStatus.value === 'All' || item.delivery_status === selectedDeliveryStatus.value

    // Mode filter (production vs dry-run)
    let matchesMode = true
    if (selectedMode.value === 'production') {
      matchesMode = !item.dry_run
    } else if (selectedMode.value === 'dry-run') {
      matchesMode = item.dry_run === true
    }

    return matchesAccount && matchesLevel && matchesType && matchesStatus && matchesMode
  })
)

// Pagination
const paginatedItems = computed(() => {
  const start = (page.value - 1) * pageCount
  return filteredItems.value.slice(start, start + pageCount)
})

// Summary statistics computed from loaded alerts
const summaryStats = computed(() => {
  const total = alerts.value.length
  if (total === 0) {
    return { total: 0, successRate: 0, failed: 0, dryRun: 0 }
  }

  const successful = alerts.value.filter(
    a => a.delivery_status === 'SUCCESS' || a.delivery_status === 'SENT'
  ).length
  const failed = alerts.value.filter(a => a.delivery_status === 'FAILED').length
  const dryRun = alerts.value.filter(a => a.dry_run === true).length

  // Calculate success rate as percentage (exclude dry-run from calculation for meaningful rate)
  const nonDryRunTotal = total - dryRun
  const successRate = nonDryRunTotal > 0
    ? Math.round((successful / nonDryRunTotal) * 100)
    : 100

  return { total, successRate, failed, dryRun }
})

// Color classes for success rate based on threshold
const successRateColorClasses = computed(() => {
  const rate = summaryStats.value.successRate
  if (rate >= 95) {
    return { bg: 'bg-green-500/10', icon: 'text-green-400', text: 'text-green-400' }
  } else if (rate >= 80) {
    return { bg: 'bg-yellow-500/10', icon: 'text-yellow-400', text: 'text-yellow-400' }
  } else {
    return { bg: 'bg-red-500/10', icon: 'text-red-400', text: 'text-red-400' }
  }
})

// Fetch alerts from API
async function fetchAlerts() {
  try {
    loading.value = true

    // Build query params - use month filter for efficient GSI query if provided
    const queryParams: Record<string, string> = {
      limit: '100'
    }

    // Use month for efficient GSI query (YYYY-MM format)
    if (selectedMonth.value) {
      queryParams.month = selectedMonth.value
    }

    const res = await $fetch<{ success: boolean; data: BudgetAlert[] }>('/api/alerts/list', {
      query: queryParams
    })

    if (res.success && res.data) {
      alerts.value = res.data
    } else {
      throw new Error('Failed to fetch alerts')
    }
  } catch (err: any) {
    console.error('Failed to fetch budget alerts:', err)
    toast.add({
      title: 'Error',
      description: err.message || 'Failed to load budget alerts.',
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

    const res = await $fetch<{ success: boolean; data: { html: string; subject?: string } }>(
      `/api/alerts/${alert.alert_id}/email`,
      { query: { accountId: alert.account_id } }
    )

    if (res.success && res.data?.html) {
      emailHtml.value = res.data.html
      emailSubject.value = res.data.subject || alert.email_subject || 'Budget Alert'
    } else {
      throw new Error('Failed to load email content')
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

// Reset page when filters change
watch([accountSearch, selectedLevel, selectedType, selectedDeliveryStatus, selectedMode], () => {
  page.value = 1
})

// Refetch when month changes (uses efficient GSI query)
watch(selectedMonth, () => {
  page.value = 1
  fetchAlerts()
})

// Load alerts on mount
onMounted(() => {
  fetchAlerts()
})
</script>
