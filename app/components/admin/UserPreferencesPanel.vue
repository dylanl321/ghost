<template>
  <div>
    <!-- Header -->
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-1">
          User Preferences Management
        </h1>
        <p class="text-sm text-gray-600 dark:text-gray-400">
          View, edit, and manage all user preferences and custom settings
        </p>
      </div>
      <div class="flex gap-2">
        <UButton
          icon="i-heroicons-arrow-down-tray"
          color="gray"
          variant="soft"
          size="sm"
          @click="exportToCSV"
          :disabled="filteredPreferences.length === 0"
        >
          Export
        </UButton>
        <UButton
          icon="i-heroicons-arrow-path"
          color="blue"
          variant="soft"
          size="sm"
          @click="loadAll"
          :loading="loading"
        >
          Refresh
        </UButton>
      </div>
    </div>

    <!-- Stats Cards -->
    <UserStatsCards
      :total-users="allPreferences.length"
      :active-today="activeToday"
      :with-favorites="usersWithFavorites"
      :custom-layouts="usersWithCustomLayout"
      :unique-timezones="uniqueTimezones"
      :avg-session-ms="globalAvgSessionMs"
      :top-pages-label="globalTopPagesLabel"
      :activity-period="activityPeriod"
      :metrics-loading="activityMetricsLoading"
    />

    <p v-if="activityMetricsError" class="text-sm text-amber-600 dark:text-amber-400 mb-4">
      {{ activityMetricsError }}
    </p>

    <!-- Search and Filters -->
    <UCard class="mb-6">
      <div class="space-y-4">
        <div class="flex flex-col sm:flex-row gap-4">
          <div class="flex-1">
            <UInput
              v-model="searchQuery"
              icon="i-heroicons-magnifying-glass"
              placeholder="Search by user email..."
              size="lg"
            />
          </div>
          <div class="w-full sm:w-64">
            <USelect
              v-model="timezoneFilter"
              :options="[{ label: 'All Timezones', value: '' }, ...timezoneOptions]"
              size="lg"
              placeholder="Filter by timezone"
            />
          </div>
          <div class="w-full sm:w-48">
            <USelect v-model="sortBy" :options="sortOptions" size="lg" />
          </div>
          <div class="w-full sm:w-40">
            <USelect
              v-model="activityPeriod"
              :options="[{ label: 'Last 7 days', value: '7d' }, { label: 'Last 30 days', value: '30d' }]"
              size="lg"
              @update:model-value="loadActivityMetrics"
            />
          </div>
        </div>

        <!-- Active Filters -->
        <div v-if="searchQuery || timezoneFilter" class="flex items-center gap-2 flex-wrap">
          <span class="text-xs text-gray-600 dark:text-gray-400">Active filters:</span>
          <UBadge v-if="searchQuery" color="blue" variant="soft" size="sm">
            Search: {{ searchQuery }}
            <button @click="searchQuery = ''" class="ml-1 hover:text-gray-900 dark:hover:text-white">
              <Icon name="i-heroicons-x-mark" class="w-3 h-3" />
            </button>
          </UBadge>
          <UBadge v-if="timezoneFilter" color="blue" variant="soft" size="sm">
            Timezone: {{ timezoneFilter }}
            <button @click="timezoneFilter = ''" class="ml-1 hover:text-gray-900 dark:hover:text-white">
              <Icon name="i-heroicons-x-mark" class="w-3 h-3" />
            </button>
          </UBadge>
          <UButton size="xs" color="gray" variant="ghost" @click="searchQuery = ''; timezoneFilter = ''">
            Clear all
          </UButton>
        </div>
      </div>
    </UCard>

    <!-- User Table -->
    <UserPreferencesTable
      :rows="filteredPreferences"
      :total="allPreferences.length"
      :loading="loading"
      :error="loadError"
      :metrics-loading="activityMetricsLoading"
      :get-user-avg-session="getUserAvgSessionMs"
      @retry="loadAll"
      @edit="openEdit"
      @delete="openDelete"
      @reset-banner="(p: UserPreferences) => handleReset(p, 'welcomeBanner', 'Welcome Banner')"
      @reset-cost-tour="(p: UserPreferences) => handleReset(p, 'costTour', 'Cost Tour')"
      @reset-account-tour="(p: UserPreferences) => handleReset(p, 'accountTour', 'Account Tour')"
    />

    <!-- Edit Modal -->
    <UserEditModal
      v-model="showEditModal"
      :prefs="editingPrefs"
      @saved="loadAll"
    />

    <!-- Delete Modal -->
    <UserDeleteModal
      v-model="showDeleteModal"
      :user-id="deletingUserId"
      @deleted="loadAll"
    />
  </div>
</template>

<script setup lang="ts">
import type { UserPreferences } from '#shared/types/user-preferences'
import type { DashboardLayoutConfig } from '#shared/types/dashboard-layout'
import { layoutsAreEqual, DEFAULT_DASHBOARD_LAYOUT } from '#shared/types/dashboard-layout'
import { findUserActivity, formatSessionDuration } from '~/composables/useAdminUserDetail'
import type { ActivityMetricsData } from '~/composables/useAdminUserDetail'

const { fetchAllPreferences, fetchActivityMetrics, resetTourForUser } = useAdminUserDetail()
const { orgDefault, ensureOrgDefault } = useDashboardLayout()
const toast = useToast()

function isLayoutTrulyCustom(prefs: UserPreferences): boolean {
  const saved = prefs.preferences?.dashboardLayout as DashboardLayoutConfig | undefined
  if (!saved?.sections || !Array.isArray(saved.sections)) return false
  if (orgDefault.value && layoutsAreEqual(saved, orgDefault.value as DashboardLayoutConfig)) return false
  if (layoutsAreEqual(saved, DEFAULT_DASHBOARD_LAYOUT as DashboardLayoutConfig)) return false
  return true
}

// State
const allPreferences = ref<UserPreferences[]>([])
const loading = ref(false)
const loadError = ref<string | null>(null)
const showEditModal = ref(false)
const showDeleteModal = ref(false)
const editingPrefs = ref<UserPreferences | null>(null)
const deletingUserId = ref('')

// Filters
const searchQuery = ref('')
const timezoneFilter = ref('')
const sortBy = ref('lastLogin')

// Activity metrics
const activityPeriod = ref<'7d' | '30d'>('7d')
const activityMetrics = ref<ActivityMetricsData | null>(null)
const activityMetricsLoading = ref(false)
const activityMetricsError = ref<string | null>(null)

// Stats
const activeToday = computed(() => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return allPreferences.value.filter(p => p.lastLoginAt && new Date(p.lastLoginAt) >= today).length
})

const usersWithFavorites = computed(() =>
  allPreferences.value.filter(p => (p.preferences?.favoriteAccounts?.length ?? 0) > 0).length
)

const usersWithCustomLayout = computed(() =>
  allPreferences.value.filter(p => isLayoutTrulyCustom(p)).length
)

const uniqueTimezones = computed(() =>
  new Set(allPreferences.value.map(p => p.timezone)).size
)

const globalAvgSessionMs = computed(() => activityMetrics.value?.global?.avgSessionLengthMs ?? 0)

const globalTopPagesLabel = computed(() => {
  const top = activityMetrics.value?.global?.topPages?.slice(0, 3)
  return top?.length ? top.map(p => p.path).join(', ') : ''
})

const timezoneOptions = computed(() => {
  const tzs = new Set(allPreferences.value.map(p => p.timezone))
  return Array.from(tzs).sort().map(tz => ({ label: tz, value: tz }))
})

const sortOptions = [
  { label: 'Last Login (Recent)', value: 'lastLogin' },
  { label: 'Created Date (Recent)', value: 'created' },
  { label: 'User Email (A-Z)', value: 'email' },
  { label: 'Most Favorites', value: 'favorites' }
]

const filteredPreferences = computed(() => {
  let filtered = [...allPreferences.value]

  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    filtered = filtered.filter(p => p.userId.toLowerCase().includes(q))
  }

  if (timezoneFilter.value) {
    filtered = filtered.filter(p => p.timezone === timezoneFilter.value)
  }

  filtered.sort((a, b) => {
    switch (sortBy.value) {
      case 'lastLogin': return new Date(b.lastLoginAt || 0).getTime() - new Date(a.lastLoginAt || 0).getTime()
      case 'created': return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      case 'email': return a.userId.localeCompare(b.userId)
      case 'favorites': return (b.preferences?.favoriteAccounts?.length || 0) - (a.preferences?.favoriteAccounts?.length || 0)
      default: return 0
    }
  })

  return filtered
})

function getUserAvgSessionMs(userId: string): number {
  return findUserActivity(activityMetrics.value?.byUser, userId)?.avgSessionLengthMs ?? 0
}

// Load data
async function loadPreferences() {
  loading.value = true
  loadError.value = null
  try {
    allPreferences.value = await fetchAllPreferences()
  } catch (err: any) {
    loadError.value = err.message || 'Failed to load user preferences'
  } finally {
    loading.value = false
  }
}

async function loadActivityMetrics() {
  activityMetricsLoading.value = true
  activityMetricsError.value = null
  const data = await fetchActivityMetrics(activityPeriod.value)
  if (data) {
    activityMetrics.value = data
  } else {
    activityMetricsError.value = 'Activity metrics unavailable'
  }
  activityMetricsLoading.value = false
}

async function loadAll() {
  await Promise.all([loadPreferences(), loadActivityMetrics()])
}

// Actions
function openEdit(prefs: UserPreferences) {
  editingPrefs.value = prefs
  showEditModal.value = true
}

function openDelete(prefs: UserPreferences) {
  deletingUserId.value = prefs.userId
  showDeleteModal.value = true
}

async function handleReset(prefs: UserPreferences, tourKey: string, label: string) {
  const success = await resetTourForUser(prefs.userId, prefs.preferences || {}, tourKey, label)
  if (success) await loadPreferences()
}

// CSV Export
function exportToCSV() {
  try {
    const headers = ['User ID', 'Timezone', 'Favorites', 'Custom Layout', `Avg. Session (${activityPeriod.value})`, 'Last Login', 'Created At']
    const rows = filteredPreferences.value.map(p => [
      p.userId,
      p.timezone,
      String(p.preferences?.favoriteAccounts?.length || 0),
      isLayoutTrulyCustom(p) ? 'Yes' : 'No',
      formatSessionDuration(getUserAvgSessionMs(p.userId)),
      p.lastLoginAt || 'Never',
      p.createdAt
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.setAttribute('href', URL.createObjectURL(blob))
    link.setAttribute('download', `user-preferences-${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    toast.add({ title: 'Export Successful', description: `Exported ${filteredPreferences.value.length} users`, color: 'green', icon: 'i-heroicons-check-circle' })
  } catch (err: any) {
    toast.add({ title: 'Export Failed', description: err.message || 'Failed to export', color: 'red', icon: 'i-heroicons-x-circle' })
  }
}

onMounted(async () => {
  await Promise.all([loadAll(), ensureOrgDefault()])
})
</script>
