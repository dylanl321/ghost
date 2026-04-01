<template>
  <div class="container mx-auto px-6 py-8 max-w-7xl">
    <!-- Back Button -->
    <UButton color="gray" variant="ghost" icon="i-heroicons-arrow-left" @click="navigateTo('/admin/users')" class="mb-6">
      Back to Users
    </UButton>

    <!-- Loading State -->
    <div v-if="loading" class="flex items-center justify-center py-24">
      <Icon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-blue-500" />
    </div>

    <!-- Error State -->
    <UAlert
      v-else-if="error"
      color="red"
      variant="subtle"
      icon="i-heroicons-exclamation-triangle"
      title="Failed to load user data"
      :description="error"
      class="mb-6"
    />

    <!-- Not Found -->
    <div v-else-if="!userPrefs" class="text-center py-24">
      <Icon name="i-heroicons-user" class="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
      <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-2">User Not Found</h2>
      <p class="text-gray-500 dark:text-gray-400 mb-6">No preferences found for this user.</p>
      <UButton color="blue" @click="navigateTo('/admin/users')">Back to Users</UButton>
    </div>

    <!-- User Detail -->
    <template v-else>
      <!-- Header -->
      <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
        <div class="flex items-center gap-4">
          <UserAvatar :email="userPrefs.userId" size="lg" />
          <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
              {{ truncateEmail(userPrefs.userId).name }}
            </h1>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{{ userPrefs.userId }}</p>
            <div class="flex items-center gap-2 mt-2">
              <UBadge color="blue" variant="soft" size="sm">
                <Icon name="i-heroicons-globe-alt" class="w-3 h-3 mr-1" />
                {{ userPrefs.timezone }}
              </UBadge>
              <UBadge v-if="userPrefs.lastLoginAt" color="green" variant="soft" size="sm">
                Last login: {{ formatRelativeDate(userPrefs.lastLoginAt) }}
              </UBadge>
              <UBadge v-else color="gray" variant="soft" size="sm">Never logged in</UBadge>
            </div>
          </div>
        </div>

        <div class="flex gap-2">
          <UButton icon="i-heroicons-pencil" color="blue" variant="soft" size="sm" @click="showEditModal = true">
            Edit
          </UButton>
          <UButton icon="i-heroicons-trash" color="red" variant="soft" size="sm" @click="showDeleteModal = true">
            Delete
          </UButton>
        </div>
      </div>

      <!-- Stats Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <UCard>
          <div class="text-center">
            <p class="text-sm text-gray-500 dark:text-gray-400">Avg. Session</p>
            <p class="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
              {{ activityLoading ? '…' : formatSessionDuration(userActivity?.avgSessionLengthMs ?? 0) }}
            </p>
          </div>
        </UCard>
        <UCard>
          <div class="text-center">
            <p class="text-sm text-gray-500 dark:text-gray-400">Total Sessions</p>
            <p class="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
              {{ activityLoading ? '…' : (userActivity?.sessionCount ?? 0) }}
            </p>
          </div>
        </UCard>
        <UCard>
          <div class="text-center">
            <p class="text-sm text-gray-500 dark:text-gray-400">Favorite Accounts</p>
            <p class="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
              {{ userPrefs.preferences?.favoriteAccounts?.length ?? 0 }}
            </p>
          </div>
        </UCard>
        <UCard>
          <div class="text-center">
            <p class="text-sm text-gray-500 dark:text-gray-400">Account Created</p>
            <p class="mt-1 text-lg font-bold text-gray-900 dark:text-white">
              {{ formatRelativeDate(userPrefs.createdAt) }}
            </p>
          </div>
        </UCard>
      </div>

      <!-- Tabbed Content -->
      <UTabs v-model="activeTab" :items="tabs" class="mb-6" />

      <div class="mt-6">
        <!-- Preferences Tab -->
        <div v-if="activeTab === 0" class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- System Settings -->
          <UCard>
            <template #header>
              <div class="flex items-center gap-2">
                <Icon name="i-heroicons-cog-6-tooth" class="w-5 h-5 text-gray-500" />
                <h3 class="text-sm font-semibold text-gray-900 dark:text-white">System Settings</h3>
              </div>
            </template>
            <div class="space-y-3">
              <DetailRow label="Timezone" :value="userPrefs.timezone" />
              <DetailRow label="Created" :value="formatAbsoluteDate(userPrefs.createdAt)" />
              <DetailRow label="Last Updated" :value="formatAbsoluteDate(userPrefs.updatedAt)" />
              <DetailRow label="Last Login" :value="userPrefs.lastLoginAt ? formatAbsoluteDate(userPrefs.lastLoginAt) : 'Never'" />
            </div>
          </UCard>

          <!-- Onboarding Status -->
          <UCard>
            <template #header>
              <div class="flex items-center gap-2">
                <Icon name="i-heroicons-academic-cap" class="w-5 h-5 text-purple-500" />
                <h3 class="text-sm font-semibold text-gray-900 dark:text-white">Onboarding Status</h3>
              </div>
            </template>
            <div class="space-y-4">
              <!-- Welcome Banner -->
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <Icon name="i-heroicons-sparkles" class="w-4 h-4 text-amber-500" />
                  <span class="text-sm text-gray-700 dark:text-gray-300">Welcome Banner</span>
                </div>
                <div class="flex items-center gap-2">
                  <UBadge
                    :color="userPrefs.preferences?.welcomeBanner?.dismissed ? 'gray' : 'green'"
                    variant="soft"
                    size="xs"
                  >
                    {{ userPrefs.preferences?.welcomeBanner?.dismissed ? 'Dismissed' : 'Active' }}
                  </UBadge>
                  <UButton
                    v-if="userPrefs.preferences?.welcomeBanner?.dismissed"
                    size="xs"
                    color="blue"
                    variant="ghost"
                    @click="handleResetTour('welcomeBanner', 'Welcome Banner')"
                    :loading="resettingTour === 'welcomeBanner'"
                  >
                    Reset
                  </UButton>
                </div>
              </div>
              <div v-if="userPrefs.preferences?.welcomeBanner" class="pl-6 text-xs text-gray-500 dark:text-gray-400 space-y-1">
                <div>Seen {{ userPrefs.preferences.welcomeBanner.seenCount ?? 0 }} times</div>
                <div v-if="userPrefs.preferences.welcomeBanner.resetByAdminAt">
                  Last admin reset: {{ formatRelativeDate(userPrefs.preferences.welcomeBanner.resetByAdminAt) }}
                </div>
              </div>

              <!-- Cost Tour -->
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <Icon name="i-heroicons-currency-dollar" class="w-4 h-4 text-green-500" />
                  <span class="text-sm text-gray-700 dark:text-gray-300">Cost Dashboard Tour</span>
                </div>
                <div class="flex items-center gap-2">
                  <UBadge
                    :color="userPrefs.preferences?.costTour?.completed ? 'green' : 'yellow'"
                    variant="soft"
                    size="xs"
                  >
                    {{ userPrefs.preferences?.costTour?.completed ? 'Completed' : `Step ${userPrefs.preferences?.costTour?.lastStep ?? 0}` }}
                  </UBadge>
                  <UButton
                    size="xs"
                    color="blue"
                    variant="ghost"
                    @click="handleResetTour('costTour', 'Cost Tour')"
                    :loading="resettingTour === 'costTour'"
                  >
                    Reset
                  </UButton>
                </div>
              </div>

              <!-- Account Tour -->
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <Icon name="i-heroicons-building-office" class="w-4 h-4 text-blue-500" />
                  <span class="text-sm text-gray-700 dark:text-gray-300">Account Details Tour</span>
                </div>
                <div class="flex items-center gap-2">
                  <UBadge
                    :color="userPrefs.preferences?.accountTour?.completed ? 'green' : 'yellow'"
                    variant="soft"
                    size="xs"
                  >
                    {{ userPrefs.preferences?.accountTour?.completed ? 'Completed' : `Step ${userPrefs.preferences?.accountTour?.lastStep ?? 0}` }}
                  </UBadge>
                  <UButton
                    size="xs"
                    color="blue"
                    variant="ghost"
                    @click="handleResetTour('accountTour', 'Account Tour')"
                    :loading="resettingTour === 'accountTour'"
                  >
                    Reset
                  </UButton>
                </div>
              </div>
            </div>
          </UCard>

          <!-- Favorite Accounts -->
          <UCard>
            <template #header>
              <div class="flex items-center gap-2">
                <Icon name="i-heroicons-star" class="w-5 h-5 text-yellow-500" />
                <h3 class="text-sm font-semibold text-gray-900 dark:text-white">Favorite Accounts</h3>
                <UBadge v-if="favoriteAccounts.length" color="gray" variant="soft" size="xs">
                  {{ favoriteAccounts.length }}
                </UBadge>
              </div>
            </template>
            <div v-if="favoriteAccounts.length" class="flex flex-wrap gap-2">
              <div
                v-for="(accountId, idx) in favoriteAccounts"
                :key="idx"
                class="px-2.5 py-1 rounded-md bg-gray-100 dark:bg-gray-800 text-xs font-mono text-gray-700 dark:text-gray-300"
              >
                {{ accountId }}
              </div>
            </div>
            <p v-else class="text-sm text-gray-500 dark:text-gray-400 italic">No favorite accounts</p>
          </UCard>

          <!-- Dashboard Layout -->
          <UCard>
            <template #header>
              <div class="flex items-center gap-2">
                <Icon name="i-heroicons-squares-2x2" class="w-5 h-5 text-indigo-500" />
                <h3 class="text-sm font-semibold text-gray-900 dark:text-white">Dashboard Layout</h3>
                <UBadge
                  :color="userPrefs.preferences?.dashboardLayout ? 'indigo' : 'gray'"
                  variant="soft"
                  size="xs"
                >
                  {{ userPrefs.preferences?.dashboardLayout ? 'Custom' : 'Default' }}
                </UBadge>
              </div>
            </template>
            <div v-if="userPrefs.preferences?.dashboardLayout" class="space-y-3">
              <div class="flex justify-between items-center">
                <span class="text-sm text-gray-600 dark:text-gray-400">Hidden sections</span>
                <span class="text-sm font-medium text-gray-900 dark:text-white">
                  {{ hiddenSections.length }}
                </span>
              </div>
              <div v-if="hiddenSections.length" class="flex flex-wrap gap-1">
                <UBadge v-for="s in hiddenSections" :key="s" color="gray" variant="soft" size="xs">{{ s }}</UBadge>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-sm text-gray-600 dark:text-gray-400">Disabled metric cards</span>
                <span class="text-sm font-medium text-gray-900 dark:text-white">
                  {{ disabledMetrics.length }}
                </span>
              </div>
              <div v-if="disabledMetrics.length" class="flex flex-wrap gap-1">
                <UBadge v-for="m in disabledMetrics" :key="m" color="gray" variant="soft" size="xs">{{ m }}</UBadge>
              </div>
            </div>
            <p v-else class="text-sm text-gray-500 dark:text-gray-400 italic">Using default layout</p>
          </UCard>

          <!-- Other Preferences -->
          <UCard v-if="otherPreferences.length" class="lg:col-span-2">
            <template #header>
              <div class="flex items-center gap-2">
                <Icon name="i-heroicons-adjustments-horizontal" class="w-5 h-5 text-gray-500" />
                <h3 class="text-sm font-semibold text-gray-900 dark:text-white">Other Preferences</h3>
              </div>
            </template>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div v-for="[key, value] in otherPreferences" :key="key" class="space-y-1">
                <label class="text-xs font-medium text-gray-500 dark:text-gray-400">{{ key }}</label>
                <AdminUsersPreferenceValueDisplay :prop-key="key" :value="value" />
              </div>
            </div>
          </UCard>
        </div>

        <!-- Activity Tab -->
        <div v-else-if="activeTab === 1">
          <div v-if="activityLoading" class="text-center py-12">
            <Icon name="i-heroicons-arrow-path" class="w-8 h-8 text-gray-400 animate-spin mx-auto mb-2" />
            <p class="text-gray-500 dark:text-gray-400">Loading activity data...</p>
          </div>

          <div v-else-if="!userActivity" class="text-center py-12">
            <Icon name="i-heroicons-chart-bar" class="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <p class="text-gray-500 dark:text-gray-400">No activity data available for this period.</p>
          </div>

          <template v-else>
            <!-- Activity Period Selector -->
            <div class="flex justify-end mb-4">
              <USelect
                v-model="activityPeriod"
                :options="[{ label: 'Last 7 days', value: '7d' }, { label: 'Last 30 days', value: '30d' }]"
                class="w-40"
                @update:model-value="loadActivity"
              />
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <!-- Session Stats -->
              <UCard>
                <template #header>
                  <h3 class="text-sm font-semibold text-gray-900 dark:text-white">Session Stats</h3>
                </template>
                <div class="space-y-3">
                  <DetailRow label="Sessions" :value="String(userActivity.sessionCount)" />
                  <DetailRow label="Avg. Duration" :value="formatSessionDuration(userActivity.avgSessionLengthMs)" />
                  <DetailRow v-if="userActivity.actionCount" label="Total Actions" :value="String(userActivity.actionCount)" />
                </div>
              </UCard>

              <!-- Top Pages -->
              <UCard>
                <template #header>
                  <h3 class="text-sm font-semibold text-gray-900 dark:text-white">Most Visited Pages</h3>
                </template>
                <div v-if="userActivity.topPages.length" class="space-y-2">
                  <div
                    v-for="page in userActivity.topPages.slice(0, 8)"
                    :key="page.path"
                    class="flex items-center justify-between"
                  >
                    <span class="text-sm text-gray-700 dark:text-gray-300 truncate">{{ page.path }}</span>
                    <UBadge color="gray" variant="soft" size="xs">{{ page.count }}</UBadge>
                  </div>
                </div>
                <p v-else class="text-sm text-gray-500 italic">No page visits recorded</p>
              </UCard>

              <!-- Action Breakdown -->
              <UCard v-if="userActivity.topActions?.length" class="lg:col-span-2">
                <template #header>
                  <h3 class="text-sm font-semibold text-gray-900 dark:text-white">Action Breakdown</h3>
                </template>
                <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                  <div
                    v-for="action in userActivity.topActions"
                    :key="action.type"
                    class="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50"
                  >
                    <span class="text-sm text-gray-700 dark:text-gray-300 truncate">{{ formatActionType(action.type) }}</span>
                    <UBadge color="purple" variant="soft" size="xs">{{ action.count }}</UBadge>
                  </div>
                </div>
              </UCard>
            </div>
          </template>
        </div>
      </div>
    </template>

    <!-- Edit Modal -->
    <AdminUsersUserEditModal
      v-model="showEditModal"
      :prefs="userPrefs"
      @saved="reloadData"
    />

    <!-- Delete Modal -->
    <AdminUsersUserDeleteModal
      v-model="showDeleteModal"
      :user-id="userPrefs?.userId ?? ''"
      @deleted="navigateTo('/admin/users')"
    />
  </div>
</template>

<script setup lang="ts">
import type { UserPreferences } from '#shared/types/user-preferences'
import { SECTION_LABELS, ALL_METRIC_CARD_IDS, METRIC_CARD_LABELS } from '#shared/types/dashboard-layout'
import {
  formatSessionDuration,
  formatRelativeDate,
  formatAbsoluteDate,
  truncateEmail,
  formatActionType,
  type ActivityMetricsData
} from '~/composables/useAdminUserDetail'

definePageMeta({
  layout: 'admin',
  middleware: 'auth-permission',
  permission: 'admin',
  title: 'User Details'
})

// Simple detail row component inline
const DetailRow = defineComponent({
  props: { label: String, value: String },
  template: `<div class="flex justify-between items-center">
    <span class="text-sm text-gray-600 dark:text-gray-400">{{ label }}</span>
    <span class="text-sm font-medium text-gray-900 dark:text-white">{{ value || '—' }}</span>
  </div>`
})

const route = useRoute()
const userId = computed(() => decodeURIComponent(route.params.userId as string))
const { fetchAllPreferences, fetchActivityMetrics, resetTourForUser } = useAdminUserDetail()

// State
const loading = ref(true)
const error = ref<string | null>(null)
const userPrefs = ref<UserPreferences | null>(null)
const activityLoading = ref(false)
const activityPeriod = ref<'7d' | '30d'>('7d')
const activityData = ref<ActivityMetricsData | null>(null)
const showEditModal = ref(false)
const showDeleteModal = ref(false)
const resettingTour = ref<string | null>(null)

const activeTab = ref(0)
const tabs = [
  { label: 'Preferences', icon: 'i-heroicons-cog-6-tooth' },
  { label: 'Activity', icon: 'i-heroicons-chart-bar' }
]

// Computed
const favoriteAccounts = computed(() => userPrefs.value?.preferences?.favoriteAccounts ?? [])

const hiddenSections = computed(() => {
  const layout = userPrefs.value?.preferences?.dashboardLayout
  if (!layout?.sections) return []
  return layout.sections
    .filter((s: any) => !s.visible)
    .map((s: any) => SECTION_LABELS[s.id as keyof typeof SECTION_LABELS] || s.id)
})

const disabledMetrics = computed(() => {
  const layout = userPrefs.value?.preferences?.dashboardLayout
  if (!layout?.metricCards) return []
  return ALL_METRIC_CARD_IDS
    .filter(id => layout.metricCards[id] === false)
    .map(id => METRIC_CARD_LABELS[id] || id)
})

const otherPreferences = computed(() => {
  const prefs = userPrefs.value?.preferences
  if (!prefs) return []
  const knownKeys = ['favoriteAccounts', 'dashboardLayout', 'welcomeBanner', 'costTour', 'accountTour']
  return Object.entries(prefs).filter(([key]) => !knownKeys.includes(key))
})

const userActivity = computed(() => {
  if (!activityData.value) return null
  return activityData.value.byUser.find(u => u.userId === userId.value) ?? null
})

// Load data
async function loadPreferences() {
  try {
    const all = await fetchAllPreferences()
    userPrefs.value = all.find(p => p.userId === userId.value) ?? null
  } catch (err: any) {
    error.value = err.message || 'Failed to load user data'
  }
}

async function loadActivity() {
  activityLoading.value = true
  activityData.value = await fetchActivityMetrics(activityPeriod.value)
  activityLoading.value = false
}

async function reloadData() {
  loading.value = true
  error.value = null
  await loadPreferences()
  loading.value = false
}

async function handleResetTour(tourKey: string, label: string) {
  if (!userPrefs.value) return
  resettingTour.value = tourKey
  const success = await resetTourForUser(
    userPrefs.value.userId,
    userPrefs.value.preferences || {},
    tourKey,
    label
  )
  if (success) await reloadData()
  resettingTour.value = null
}

onMounted(async () => {
  await Promise.all([loadPreferences(), loadActivity()])
  loading.value = false
})
</script>
