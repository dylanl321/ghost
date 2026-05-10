<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
          User Preferences
        </h2>
        <UBadge color="blue" variant="soft">
          {{ rows.length }} of {{ total }} {{ total === 1 ? 'user' : 'users' }}
        </UBadge>
      </div>
    </template>

    <!-- Loading State -->
    <div v-if="loading" class="text-center py-12">
      <Icon name="i-heroicons-arrow-path" class="w-8 h-8 text-gray-400 animate-spin mx-auto mb-2" />
      <p class="text-gray-500 dark:text-gray-400">Loading user preferences...</p>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="text-center py-12">
      <Icon name="i-heroicons-exclamation-triangle" class="w-16 h-16 text-red-500 mx-auto mb-4" />
      <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">Failed to Load Preferences</h3>
      <p class="text-gray-500 dark:text-gray-400 mb-6">{{ error }}</p>
      <UButton @click="$emit('retry')" color="blue">Try Again</UButton>
    </div>

    <!-- Empty State -->
    <div v-else-if="total === 0" class="text-center py-12">
      <Icon name="i-heroicons-users" class="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
      <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">No User Preferences Yet</h3>
      <p class="text-gray-500 dark:text-gray-400">User preferences will appear here once users log in.</p>
    </div>

    <!-- Preferences Table -->
    <div v-else>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="border-b border-gray-200 dark:border-gray-700">
            <tr class="text-left">
              <th class="pb-3 pr-4 font-medium text-gray-700 dark:text-gray-300">User</th>
              <th class="pb-3 pr-4 font-medium text-gray-700 dark:text-gray-300">Timezone</th>
              <th class="pb-3 pr-4 font-medium text-gray-700 dark:text-gray-300">Favorites</th>
              <th class="pb-3 pr-4 font-medium text-gray-700 dark:text-gray-300">Layout</th>
              <th class="pb-3 pr-4 font-medium text-gray-700 dark:text-gray-300">Avg. session</th>
              <th class="pb-3 pr-4 font-medium text-gray-700 dark:text-gray-300">Last Login</th>
              <th class="pb-3 font-medium text-gray-700 dark:text-gray-300 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
            <tr
              v-for="prefs in paginatedRows"
              :key="prefs.userId"
              class="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
              @click="navigateTo(`/admin/users/${encodeURIComponent(prefs.userId)}`)"
            >
              <td class="py-3 pr-4">
                <div class="flex items-center gap-2">
                  <UserAvatar :email="prefs.userId" size="sm" />
                  <div class="min-w-0">
                    <div class="font-medium text-gray-900 dark:text-white text-sm truncate">
                      {{ truncateEmail(prefs.userId).name }}
                    </div>
                    <div class="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[200px]">
                      {{ prefs.userId }}
                    </div>
                    <UserResourceLinks
                      :username="truncateEmail(prefs.userId).name"
                      :compact="true"
                      class="mt-1"
                    />
                  </div>
                </div>
              </td>
              <td class="py-3 pr-4">
                <UBadge color="blue" variant="soft" size="sm">{{ prefs.timezone }}</UBadge>
              </td>
              <td class="py-3 pr-4">
                <div class="flex items-center gap-1">
                  <Icon name="i-heroicons-star-solid" class="w-4 h-4 text-yellow-500" />
                  <span class="text-gray-900 dark:text-white font-medium">
                    {{ prefs.preferences?.favoriteAccounts?.length || 0 }}
                  </span>
                </div>
              </td>
              <td class="py-3 pr-4">
                <UBadge v-if="isLayoutTrulyCustom(prefs)" color="indigo" variant="soft" size="sm">
                  Custom
                </UBadge>
                <UBadge v-else color="gray" variant="soft" size="sm">Default</UBadge>
              </td>
              <td class="py-3 pr-4 text-gray-600 dark:text-gray-400 text-xs">
                {{ metricsLoading ? '…' : formatSessionDuration(getUserAvgSession(prefs.userId)) }}
              </td>
              <td class="py-3 pr-4 text-gray-600 dark:text-gray-400 text-xs">
                {{ prefs.lastLoginAt ? formatRelativeDate(prefs.lastLoginAt) : 'Never' }}
              </td>
              <td class="py-3 text-right" @click.stop>
                <UDropdown :items="getActionItems(prefs)" :popper="{ placement: 'bottom-end' }">
                  <UButton color="gray" variant="ghost" size="xs" icon="i-heroicons-ellipsis-vertical" />
                </UDropdown>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div v-if="rows.length > pageSize" class="flex justify-between items-center mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <span class="text-sm text-gray-500 dark:text-gray-400">
          Showing {{ paginationStart + 1 }}-{{ Math.min(paginationStart + pageSize, rows.length) }} of {{ rows.length }}
        </span>
        <UPagination
          v-model="currentPage"
          :page-count="pageSize"
          :total="rows.length"
        />
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import type { UserPreferences } from '#shared/types/user-preferences'
import type { DashboardLayoutConfig } from '#shared/types/dashboard-layout'
import { layoutsAreEqual, DEFAULT_DASHBOARD_LAYOUT } from '#shared/types/dashboard-layout'
import { formatSessionDuration, formatRelativeDate, truncateEmail } from '~/composables/useAdminUserDetail'

const props = defineProps<{
  rows: UserPreferences[]
  total: number
  loading: boolean
  error: string | null
  metricsLoading: boolean
  getUserAvgSession: (userId: string) => number
}>()

const emit = defineEmits<{
  retry: []
  edit: [prefs: UserPreferences]
  delete: [prefs: UserPreferences]
  resetBanner: [prefs: UserPreferences]
  resetCostTour: [prefs: UserPreferences]
  resetAccountTour: [prefs: UserPreferences]
}>()

const { orgDefault } = useDashboardLayout()

function isLayoutTrulyCustom(prefs: UserPreferences): boolean {
  const saved = prefs.preferences?.dashboardLayout as DashboardLayoutConfig | undefined
  if (!saved?.sections || !Array.isArray(saved.sections)) return false
  if (orgDefault.value && layoutsAreEqual(saved, orgDefault.value as DashboardLayoutConfig)) return false
  if (layoutsAreEqual(saved, DEFAULT_DASHBOARD_LAYOUT as DashboardLayoutConfig)) return false
  return true
}

const pageSize = 15
const currentPage = ref(1)

const paginationStart = computed(() => (currentPage.value - 1) * pageSize)
const paginatedRows = computed(() =>
  props.rows.slice(paginationStart.value, paginationStart.value + pageSize)
)

// Reset page when filtered data changes
watch(() => props.rows.length, () => {
  currentPage.value = 1
})

function getActionItems(prefs: UserPreferences) {
  return [
    [
      {
        label: 'View Details',
        icon: 'i-heroicons-eye',
        click: () => navigateTo(`/admin/users/${encodeURIComponent(prefs.userId)}`)
      },
      {
        label: 'Edit Preferences',
        icon: 'i-heroicons-pencil',
        click: () => emit('edit', prefs)
      }
    ],
    [
      {
        label: 'Reset Welcome Banner',
        icon: 'i-heroicons-sparkles',
        click: () => emit('resetBanner', prefs)
      },
      {
        label: 'Reset Cost Tour',
        icon: 'i-heroicons-currency-dollar',
        click: () => emit('resetCostTour', prefs)
      },
      {
        label: 'Reset Account Tour',
        icon: 'i-heroicons-building-office',
        click: () => emit('resetAccountTour', prefs)
      }
    ],
    [
      {
        label: 'Delete Preferences',
        icon: 'i-heroicons-trash',
        class: 'text-red-500',
        click: () => emit('delete', prefs)
      }
    ]
  ]
}
</script>
