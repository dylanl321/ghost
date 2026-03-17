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
          @click="loadPreferences"
          :loading="loading"
        >
          Refresh
        </UButton>
      </div>
    </div>

    <!-- Stats Cards -->
    <div class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-7 gap-4 mb-6">
      <UCard>
        <div class="flex items-center gap-3">
          <div class="p-2 bg-blue-500/10 rounded-lg">
            <Icon name="i-heroicons-users" class="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <p class="text-xs text-gray-600 dark:text-gray-400">Total Users</p>
            <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ allPreferences.length }}</p>
          </div>
        </div>
      </UCard>

      <UCard>
        <div class="flex items-center gap-3">
          <div class="p-2 bg-green-500/10 rounded-lg">
            <Icon name="i-heroicons-clock" class="w-5 h-5 text-green-500" />
          </div>
          <div>
            <p class="text-xs text-gray-600 dark:text-gray-400">Active Today</p>
            <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ activeToday }}</p>
          </div>
        </div>
      </UCard>

      <UCard>
        <div class="flex items-center gap-3">
          <div class="p-2 bg-yellow-500/10 rounded-lg">
            <Icon name="i-heroicons-star" class="w-5 h-5 text-yellow-500" />
          </div>
          <div>
            <p class="text-xs text-gray-600 dark:text-gray-400">With Favorites</p>
            <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ usersWithFavorites }}</p>
          </div>
        </div>
      </UCard>

      <UCard>
        <div class="flex items-center gap-3">
          <div class="p-2 bg-indigo-500/10 rounded-lg">
            <Icon name="i-heroicons-squares-2x2" class="w-5 h-5 text-indigo-500" />
          </div>
          <div>
            <p class="text-xs text-gray-600 dark:text-gray-400">Custom Layouts</p>
            <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ usersWithCustomLayout }}</p>
          </div>
        </div>
      </UCard>

      <UCard>
        <div class="flex items-center gap-3">
          <div class="p-2 bg-purple-500/10 rounded-lg">
            <Icon name="i-heroicons-globe-alt" class="w-5 h-5 text-purple-500" />
          </div>
          <div>
            <p class="text-xs text-gray-600 dark:text-gray-400">Unique Timezones</p>
            <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ uniqueTimezones }}</p>
          </div>
        </div>
      </UCard>

      <UCard>
        <div class="flex items-center gap-3">
          <div class="p-2 bg-cyan-500/10 rounded-lg">
            <Icon name="i-heroicons-clock" class="w-5 h-5 text-cyan-500" />
          </div>
          <div>
            <p class="text-xs text-gray-600 dark:text-gray-400">Avg. session ({{ activityPeriod }})</p>
            <p class="text-2xl font-bold text-gray-900 dark:text-white">
              {{ activityMetricsLoading ? '…' : formatSessionDuration(globalAvgSessionMs) }}
            </p>
          </div>
        </div>
      </UCard>

      <UCard>
        <div class="flex items-center gap-3">
          <div class="p-2 bg-amber-500/10 rounded-lg">
            <Icon name="i-heroicons-map" class="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <p class="text-xs text-gray-600 dark:text-gray-400">Most active pages</p>
            <p class="text-sm font-semibold text-gray-900 dark:text-white truncate max-w-[140px]" :title="globalTopPagesLabel">
              {{ activityMetricsLoading ? '…' : globalTopPagesLabel || '—' }}
            </p>
          </div>
        </div>
      </UCard>
    </div>

    <p v-if="activityMetricsError" class="text-sm text-amber-600 dark:text-amber-400 mb-4">
      {{ activityMetricsError }}
    </p>

    <!-- Search and Filters -->
    <UCard class="mb-6">
      <div class="space-y-4">
        <div class="flex flex-col sm:flex-row gap-4">
          <!-- Search -->
          <div class="flex-1">
            <UInput
              v-model="searchQuery"
              icon="i-heroicons-magnifying-glass"
              placeholder="Search by user email..."
              size="lg"
            />
          </div>

          <!-- Timezone Filter -->
          <div class="w-full sm:w-64">
            <USelect
              v-model="timezoneFilter"
              :options="[{ label: 'All Timezones', value: '' }, ...timezoneOptions]"
              size="lg"
              placeholder="Filter by timezone"
            />
          </div>

          <!-- Sort -->
          <div class="w-full sm:w-48">
            <USelect
              v-model="sortBy"
              :options="sortOptions"
              size="lg"
            />
          </div>

          <!-- Activity period -->
          <div class="w-full sm:w-40">
            <USelect
              v-model="activityPeriod"
              :options="[{ label: 'Last 7 days', value: '7d' }, { label: 'Last 30 days', value: '30d' }]"
              size="lg"
              @update:model-value="loadActivityMetrics"
            />
          </div>
        </div>

        <!-- Active Filters Display -->
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
          <UButton
            size="xs"
            color="gray"
            variant="ghost"
            @click="clearFilters"
          >
            Clear all
          </UButton>
        </div>
      </div>
    </UCard>

    <!-- User Preferences List -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
            User Preferences
          </h2>
          <UBadge color="blue" variant="soft">
            {{ filteredPreferences.length }} of {{ allPreferences.length }} {{ allPreferences.length === 1 ? 'user' : 'users' }}
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
        <UButton @click="loadPreferences()" color="blue">
          Try Again
        </UButton>
      </div>

      <!-- Empty State -->
      <div v-else-if="allPreferences.length === 0" class="text-center py-12">
        <Icon name="i-heroicons-users" class="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
          No User Preferences Yet
        </h3>
        <p class="text-gray-500 dark:text-gray-400 mb-6">
          User preferences will appear here once users log in and their settings are created.
        </p>
      </div>

      <!-- Preferences Table -->
      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="border-b border-gray-200 dark:border-gray-700">
            <tr class="text-left">
              <th class="pb-3 pr-4 font-medium text-gray-700 dark:text-gray-300">User</th>
              <th class="pb-3 pr-4 font-medium text-gray-700 dark:text-gray-300">Timezone</th>
              <th class="pb-3 pr-4 font-medium text-gray-700 dark:text-gray-300">Favorites</th>
              <th class="pb-3 pr-4 font-medium text-gray-700 dark:text-gray-300">Layout</th>
              <th class="pb-3 pr-4 font-medium text-gray-700 dark:text-gray-300">Avg. session</th>
              <th class="pb-3 pr-4 font-medium text-gray-700 dark:text-gray-300">Most active page</th>
              <th class="pb-3 pr-4 font-medium text-gray-700 dark:text-gray-300">Last Login</th>
              <th class="pb-3 pr-4 font-medium text-gray-700 dark:text-gray-300">Created</th>
              <th class="pb-3 font-medium text-gray-700 dark:text-gray-300">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
            <tr v-for="prefs in filteredPreferences" :key="prefs.userId" class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <td class="py-3 pr-4">
                <div class="flex items-center gap-2">
                  <UserAvatar :email="prefs.userId" size="sm" />
                  <div>
                    <div class="font-medium text-gray-900 dark:text-white text-sm">{{ prefs.userId }}</div>
                  </div>
                </div>
              </td>
              <td class="py-3 pr-4">
                <UBadge color="blue" variant="soft" size="sm">
                  {{ prefs.timezone }}
                </UBadge>
              </td>
              <td class="py-3 pr-4">
                <div class="flex items-center gap-1">
                  <Icon name="i-heroicons-star-solid" class="w-4 h-4 text-yellow-500" />
                  <span class="text-gray-900 dark:text-white font-medium">
                    {{ getFavoriteCount(prefs) }}
                  </span>
                </div>
              </td>
              <td class="py-3 pr-4">
                <UBadge v-if="hasCustomLayout(prefs)" color="indigo" variant="soft" size="sm">
                  <Icon name="i-heroicons-squares-2x2" class="w-3 h-3 mr-1" />
                  Custom
                </UBadge>
                <UBadge v-else color="gray" variant="soft" size="sm">
                  Default
                </UBadge>
              </td>
              <td class="py-3 pr-4 text-gray-600 dark:text-gray-400 text-xs">
                {{ activityMetricsLoading ? '…' : formatSessionDuration(getUserAvgSessionMs(prefs.userId)) }}
              </td>
              <td class="py-3 pr-4 text-gray-600 dark:text-gray-400 text-xs max-w-[120px] truncate" :title="getUserTopPage(prefs.userId)">
                {{ activityMetricsLoading ? '…' : getUserTopPage(prefs.userId) || '—' }}
              </td>
              <td class="py-3 pr-4 text-gray-600 dark:text-gray-400 text-xs">
                {{ prefs.lastLoginAt ? formatDate(prefs.lastLoginAt) : 'Never' }}
              </td>
              <td class="py-3 pr-4 text-gray-600 dark:text-gray-400 text-xs">
                {{ formatDate(prefs.createdAt) }}
              </td>
              <td class="py-3">
                <div class="flex items-center gap-1">
                  <UButton
                    color="gray"
                    variant="ghost"
                    size="xs"
                    icon="i-heroicons-eye"
                    @click="viewDetails(prefs)"
                    title="View details"
                  />
                  <UButton
                    color="blue"
                    variant="ghost"
                    size="xs"
                    icon="i-heroicons-pencil"
                    @click="editPreferences(prefs)"
                    title="Edit preferences"
                  />
                  <UTooltip text="Re-enable welcome banner">
                    <UButton
                      color="gray"
                      variant="ghost"
                      size="xs"
                      icon="i-heroicons-sparkles"
                      @click="resetWelcomeBannerFor(prefs)"
                      title="Re-enable welcome banner"
                    />
                  </UTooltip>
                  <UTooltip text="Reset Cost Dashboard tour">
                    <UButton
                      color="gray"
                      variant="ghost"
                      size="xs"
                      icon="i-heroicons-currency-dollar"
                      @click="resetCostTourFor(prefs)"
                      title="Reset Cost tour"
                    />
                  </UTooltip>
                  <UTooltip text="Reset Account Details tour">
                    <UButton
                      color="gray"
                      variant="ghost"
                      size="xs"
                      icon="i-heroicons-building-office"
                      @click="resetAccountTourFor(prefs)"
                      title="Reset Account tour"
                    />
                  </UTooltip>
                  <UButton
                    color="red"
                    variant="ghost"
                    size="xs"
                    icon="i-heroicons-trash"
                    @click="confirmDelete(prefs)"
                    title="Delete preferences"
                  />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>

    <!-- Details Modal -->
    <UModal v-model="showDetailsModal" :ui="{ width: 'sm:max-w-2xl' }">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              User Preferences Details
            </h3>
            <UButton
              icon="i-heroicons-pencil"
              color="blue"
              variant="soft"
              size="xs"
              @click="editFromDetails"
            >
              Edit
            </UButton>
          </div>
        </template>

        <div v-if="viewingPrefs" class="space-y-6">
          <!-- User Info -->
          <div>
            <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">User Information</h4>
            <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-3">
              <div class="flex items-center gap-3">
                <UserAvatar :email="viewingPrefs.userId" size="md" />
                <div>
                  <div class="font-medium text-gray-900 dark:text-white">{{ viewingPrefs.userId }}</div>
                  <div class="text-xs text-gray-500">User ID</div>
                </div>
              </div>
            </div>
          </div>

          <!-- System Preferences -->
          <div>
            <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">System Preferences</h4>
            <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-3">
              <div class="flex justify-between items-center">
                <span class="text-sm text-gray-600 dark:text-gray-400">Timezone</span>
                <UBadge color="blue" variant="soft">{{ viewingPrefs.timezone }}</UBadge>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-sm text-gray-600 dark:text-gray-400">Last Login</span>
                <span class="text-sm text-gray-900 dark:text-white">
                  {{ viewingPrefs.lastLoginAt ? formatDate(viewingPrefs.lastLoginAt) : 'Never' }}
                </span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-sm text-gray-600 dark:text-gray-400">Account Created</span>
                <span class="text-sm text-gray-900 dark:text-white">{{ formatDate(viewingPrefs.createdAt) }}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-sm text-gray-600 dark:text-gray-400">Last Updated</span>
                <span class="text-sm text-gray-900 dark:text-white">{{ formatDate(viewingPrefs.updatedAt) }}</span>
              </div>
            </div>
          </div>

          <!-- Activity metrics (last N days) -->
          <div>
            <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Activity ({{ activityPeriod === '7d' ? 'last 7 days' : 'last 30 days' }})</h4>
            <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-3">
              <div v-if="activityMetricsLoading" class="text-sm text-gray-500">Loading…</div>
              <template v-else-if="viewingUserActivity">
                <div class="flex justify-between items-center">
                  <span class="text-sm text-gray-600 dark:text-gray-400">Avg. session length</span>
                  <span class="text-sm text-gray-900 dark:text-white font-medium">{{ formatSessionDuration(viewingUserActivity.avgSessionLengthMs) }}</span>
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-sm text-gray-600 dark:text-gray-400">Sessions</span>
                  <span class="text-sm text-gray-900 dark:text-white font-medium">{{ viewingUserActivity.sessionCount }}</span>
                </div>
                <div v-if="viewingUserActivity.topPages.length">
                  <span class="text-sm text-gray-600 dark:text-gray-400 block mb-2">Most active pages</span>
                  <div class="flex flex-wrap gap-1">
                    <UBadge
                      v-for="p in viewingUserActivity.topPages.slice(0, 5)"
                      :key="p.path"
                      color="gray"
                      variant="soft"
                      size="xs"
                    >
                      {{ p.path }} ({{ p.count }})
                    </UBadge>
                  </div>
                </div>
                <div v-else class="text-sm text-gray-500 italic">No navigation data in this period</div>
              </template>
              <div v-else class="text-sm text-gray-500 italic">No activity in this period</div>
            </div>
          </div>

          <!-- Custom Preferences -->
          <div v-if="viewingPrefs.preferences && Object.keys(viewingPrefs.preferences).length > 0">
            <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Custom Preferences</h4>
            <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-3">
              <!-- Favorite Accounts -->
              <div v-if="viewingPrefs.preferences.favoriteAccounts">
                <div class="flex items-center gap-2 mb-2">
                  <Icon name="i-heroicons-star-solid" class="w-4 h-4 text-yellow-500" />
                  <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Favorite Accounts</span>
                  <UBadge size="xs" color="gray" variant="soft">
                    {{ viewingPrefs.preferences.favoriteAccounts.length }} accounts
                  </UBadge>
                </div>
                <div class="pl-6 space-y-1">
                  <div
                    v-for="(accountId, idx) in viewingPrefs.preferences.favoriteAccounts"
                    :key="idx"
                    class="text-xs font-mono text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-900 px-2 py-1 rounded"
                  >
                    {{ accountId }}
                  </div>
                </div>
              </div>

              <!-- Dashboard Layout -->
              <div v-if="viewingPrefs.preferences.dashboardLayout">
                <div class="flex items-center gap-2 mb-2">
                  <Icon name="i-heroicons-squares-2x2" class="w-4 h-4 text-indigo-500" />
                  <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Dashboard Layout</span>
                  <UBadge size="xs" color="indigo" variant="soft">Custom</UBadge>
                </div>
                <div class="pl-6 space-y-2">
                  <div class="flex justify-between items-center">
                    <span class="text-xs text-gray-600 dark:text-gray-400">Hidden sections</span>
                    <span class="text-xs font-medium text-gray-900 dark:text-white">{{ getLayoutHiddenSections(viewingPrefs.preferences.dashboardLayout).length }}</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-xs text-gray-600 dark:text-gray-400">Disabled metric cards</span>
                    <span class="text-xs font-medium text-gray-900 dark:text-white">{{ getLayoutDisabledMetrics(viewingPrefs.preferences.dashboardLayout).length }}</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-xs text-gray-600 dark:text-gray-400">Custom section order</span>
                    <UBadge size="xs" :color="hasCustomSectionOrder(viewingPrefs.preferences.dashboardLayout) ? 'indigo' : 'gray'" variant="soft">
                      {{ hasCustomSectionOrder(viewingPrefs.preferences.dashboardLayout) ? 'Yes' : 'No' }}
                    </UBadge>
                  </div>
                </div>
              </div>

              <!-- Other Custom Preferences -->
              <div v-for="(value, key) in viewingPrefs.preferences" :key="key">
                <div v-if="key !== 'favoriteAccounts' && key !== 'dashboardLayout'" class="space-y-2">
                  <span class="text-sm font-medium text-gray-700 dark:text-gray-300">{{ key }}</span>
                  <pre class="text-xs bg-white dark:bg-gray-900 p-2 rounded overflow-x-auto">{{ JSON.stringify(value, null, 2) }}</pre>
                </div>
              </div>
            </div>
          </div>
          <div v-else>
            <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Custom Preferences</h4>
            <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 text-center">
              <p class="text-sm text-gray-500 dark:text-gray-400 italic">No custom preferences set</p>
            </div>
          </div>
        </div>

        <template #footer>
          <div class="flex justify-end">
            <UButton color="gray" variant="ghost" @click="showDetailsModal = false">
              Close
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Edit Modal -->
    <UModal v-model="showEditModal" :ui="{ width: 'sm:max-w-2xl' }">
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
            Edit User Preferences
          </h3>
        </template>

        <div v-if="editingPrefs" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              User
            </label>
            <div class="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-md">
              <UserAvatar :email="editingPrefs.userId" size="sm" />
              <span class="text-sm text-gray-900 dark:text-white">{{ editingPrefs.userId }}</span>
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Timezone
            </label>
            <USelect
              v-model="editTimezone"
              :options="commonTimezones"
              option-attribute="label"
              value-attribute="value"
              size="lg"
            />
          </div>

          <!-- Favorite Accounts Editor -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Favorite Accounts
            </label>
            <UTextarea
              v-model="editFavorites"
              :rows="5"
              placeholder="Enter account IDs, one per line"
              class="font-mono text-sm"
            />
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Enter AWS account IDs, one per line. Current: {{ editFavorites.split('\n').filter(l => l.trim()).length }} accounts
            </p>
          </div>

          <!-- Raw Custom Preferences JSON Editor -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Custom Preferences (Advanced)
            </label>
            <UTextarea
              v-model="editCustomPreferences"
              :rows="8"
              placeholder="{}"
              class="font-mono text-xs"
            />
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
              JSON format. Changes here will override the Favorite Accounts field above.
            </p>
          </div>
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="gray" variant="ghost" @click="showEditModal = false">
              Cancel
            </UButton>
            <UButton color="blue" :loading="saving" @click="saveEdit">
              Save Changes
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Delete Confirmation Modal -->
    <UModal v-model="showDeleteModal" :ui="{ width: 'sm:max-w-md' }">
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
            Delete User Preferences
          </h3>
        </template>

        <div class="space-y-4">
          <p class="text-gray-700 dark:text-gray-300">
            Are you sure you want to delete preferences for <strong>{{ deletingPrefs?.userId }}</strong>?
          </p>
          <p class="text-sm text-gray-600 dark:text-gray-400">
            This will reset all settings to defaults. Preferences will be recreated automatically the next time the user logs in.
          </p>
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="gray" variant="ghost" @click="showDeleteModal = false">
              Cancel
            </UButton>
            <UButton color="red" :loading="deleting" @click="confirmDeleteAction">
              Delete Preferences
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import type { UserPreferences } from '#shared/types/user-preferences'
import { COMMON_TIMEZONES } from '#shared/types/user-preferences'
import type { DashboardLayoutConfig } from '#shared/types/dashboard-layout'
import { DEFAULT_DASHBOARD_LAYOUT, ALL_METRIC_CARD_IDS } from '#shared/types/dashboard-layout'

// State
const allPreferences = ref<UserPreferences[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const showEditModal = ref(false)
const showDeleteModal = ref(false)
const showDetailsModal = ref(false)
const editingPrefs = ref<UserPreferences | null>(null)
const deletingPrefs = ref<UserPreferences | null>(null)
const viewingPrefs = ref<UserPreferences | null>(null)
const editTimezone = ref<string>('')
const editFavorites = ref<string>('')
const editCustomPreferences = ref<string>('')
const saving = ref(false)
const deleting = ref(false)
const commonTimezones = COMMON_TIMEZONES
const toast = useToast()

// Search and filter state
const searchQuery = ref('')
const timezoneFilter = ref('')
const sortBy = ref('lastLogin')

// Activity metrics (admin)
const activityPeriod = ref<'7d' | '30d'>('7d')
const activityMetrics = ref<{
  byUser: Array<{ userId: string; avgSessionLengthMs: number; sessionCount: number; topPages: Array<{ path: string; count: number }> }>
  global: { avgSessionLengthMs: number; totalSessions: number; topPages: Array<{ path: string; count: number }> }
} | null>(null)
const activityMetricsLoading = ref(false)
const activityMetricsError = ref<string | null>(null)

// Computed properties for stats
const activeToday = computed(() => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return allPreferences.value.filter(prefs => {
    if (!prefs.lastLoginAt) return false
    const lastLogin = new Date(prefs.lastLoginAt)
    return lastLogin >= today
  }).length
})

const usersWithFavorites = computed(() => {
  return allPreferences.value.filter(prefs => {
    return prefs.preferences?.favoriteAccounts && prefs.preferences.favoriteAccounts.length > 0
  }).length
})

const usersWithCustomLayout = computed(() => {
  return allPreferences.value.filter(prefs => hasCustomLayout(prefs)).length
})

const uniqueTimezones = computed(() => {
  const timezones = new Set(allPreferences.value.map(p => p.timezone))
  return timezones.size
})

const globalAvgSessionMs = computed(() => activityMetrics.value?.global?.avgSessionLengthMs ?? 0)
const globalTopPagesLabel = computed(() => {
  const top = activityMetrics.value?.global?.topPages?.slice(0, 3)
  if (!top?.length) return ''
  return top.map(p => p.path).join(', ')
})

const viewingUserActivity = computed(() => {
  if (!viewingPrefs.value || !activityMetrics.value) return null
  return activityMetrics.value.byUser.find(u => u.userId === viewingPrefs.value!.userId) ?? null
})

// Timezone options for filter
const timezoneOptions = computed(() => {
  const timezones = new Set(allPreferences.value.map(p => p.timezone))
  return Array.from(timezones).sort().map(tz => ({ label: tz, value: tz }))
})

// Sort options
const sortOptions = [
  { label: 'Last Login (Recent)', value: 'lastLogin' },
  { label: 'Created Date (Recent)', value: 'created' },
  { label: 'User Email (A-Z)', value: 'email' },
  { label: 'Most Favorites', value: 'favorites' }
]

// Filtered and sorted preferences
const filteredPreferences = computed(() => {
  let filtered = [...allPreferences.value]

  // Apply search filter
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    filtered = filtered.filter(prefs =>
      prefs.userId.toLowerCase().includes(query)
    )
  }

  // Apply timezone filter
  if (timezoneFilter.value) {
    filtered = filtered.filter(prefs => prefs.timezone === timezoneFilter.value)
  }

  // Apply sorting
  filtered.sort((a, b) => {
    switch (sortBy.value) {
      case 'lastLogin':
        return new Date(b.lastLoginAt || 0).getTime() - new Date(a.lastLoginAt || 0).getTime()
      case 'created':
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      case 'email':
        return a.userId.localeCompare(b.userId)
      case 'favorites':
        return (b.preferences?.favoriteAccounts?.length || 0) - (a.preferences?.favoriteAccounts?.length || 0)
      default:
        return 0
    }
  })

  return filtered
})

// Helper functions
function getFavoriteCount(prefs: UserPreferences): number {
  return prefs.preferences?.favoriteAccounts?.length || 0
}

function hasCustomLayout(prefs: UserPreferences): boolean {
  return !!prefs.preferences?.dashboardLayout
}

function getLayoutHiddenSections(layout: DashboardLayoutConfig): string[] {
  return (layout.sections || []).filter(s => !s.visible).map(s => s.id)
}

function getLayoutDisabledMetrics(layout: DashboardLayoutConfig): string[] {
  if (!layout.metricCards) return []
  return ALL_METRIC_CARD_IDS.filter(id => layout.metricCards[id] === false)
}

function hasCustomSectionOrder(layout: DashboardLayoutConfig): boolean {
  if (!layout.sections?.length) return false
  const userOrder = layout.sections.map(s => s.id)
  const defaultOrder = DEFAULT_DASHBOARD_LAYOUT.sections.map(s => s.id)
  return JSON.stringify(userOrder) !== JSON.stringify(defaultOrder)
}

function clearFilters() {
  searchQuery.value = ''
  timezoneFilter.value = ''
}

// Load all preferences
async function loadPreferences() {
  loading.value = true
  error.value = null

  try {
    const response = await $fetch<{ data: { preferences: UserPreferences[]; total: number } }>('/api/admin/user-preferences')
    allPreferences.value = response.data.preferences
  } catch (err: any) {
    console.error('Failed to load user preferences:', err)
    error.value = err.message || 'Failed to load user preferences'
  } finally {
    loading.value = false
  }
}

// View details
function viewDetails(prefs: UserPreferences) {
  viewingPrefs.value = prefs
  showDetailsModal.value = true
}

// Edit from details modal
function editFromDetails() {
  if (viewingPrefs.value) {
    showDetailsModal.value = false
    editPreferences(viewingPrefs.value)
  }
}

// Edit preferences
function editPreferences(prefs: UserPreferences) {
  editingPrefs.value = prefs
  editTimezone.value = prefs.timezone

  // Populate favorites textarea
  const favorites = prefs.preferences?.favoriteAccounts || []
  editFavorites.value = favorites.join('\n')

  // Populate custom preferences JSON
  editCustomPreferences.value = JSON.stringify(prefs.preferences || {}, null, 2)

  showEditModal.value = true
}

// Save edit
async function saveEdit() {
  if (!editingPrefs.value) return

  saving.value = true
  try {
    // Parse custom preferences JSON
    let customPrefs: Record<string, any> = {}
    try {
      customPrefs = JSON.parse(editCustomPreferences.value || '{}')
    } catch (e) {
      toast.add({
        title: 'Invalid JSON',
        description: 'Custom preferences must be valid JSON',
        color: 'red',
        icon: 'i-heroicons-exclamation-triangle'
      })
      saving.value = false
      return
    }

    // If favorites field has content, parse and use it (overrides JSON)
    if (editFavorites.value.trim()) {
      const favoritesList = editFavorites.value
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
      customPrefs.favoriteAccounts = favoritesList
    }

    await $fetch(`/api/admin/user-preferences/${encodeURIComponent(editingPrefs.value.userId)}`, {
      method: 'PATCH',
      body: {
        timezone: editTimezone.value,
        preferences: customPrefs
      }
    })

    toast.add({
      title: 'Preferences Updated',
      description: `Preferences updated for ${editingPrefs.value.userId}`,
      color: 'green',
      icon: 'i-heroicons-check-circle'
    })

    showEditModal.value = false
    await loadPreferences()
  } catch (err: any) {
    toast.add({
      title: 'Update Failed',
      description: err.message || 'Failed to update preferences',
      color: 'red',
      icon: 'i-heroicons-x-circle'
    })
  } finally {
    saving.value = false
  }
}

// Admin quick actions to reset onboarding/tutorials for a user
async function patchUserPreferences(userId: string, prefsPatch: Record<string, any>) {
  await $fetch(`/api/admin/user-preferences/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: {
      preferences: prefsPatch
    }
  })
}

async function resetWelcomeBannerFor(prefs: UserPreferences) {
  try {
    await patchUserPreferences(prefs.userId, {
      ...(prefs.preferences || {}),
      welcomeBanner: {
        ...(prefs.preferences?.welcomeBanner || {}),
        dismissed: false,
        seenCount: 0,
        clicked: false,
        resetByAdminAt: new Date().toISOString()
      }
    })
    toast.add({
      title: 'Welcome Banner Enabled',
      description: `Banner will show again for ${prefs.userId}`,
      color: 'green',
      icon: 'i-heroicons-check-circle'
    })
    await loadPreferences()
  } catch (err: any) {
    toast.add({
      title: 'Action Failed',
      description: err.message || 'Could not update banner preference',
      color: 'red',
      icon: 'i-heroicons-x-circle'
    })
  }
}

async function resetCostTourFor(prefs: UserPreferences) {
  try {
    await patchUserPreferences(prefs.userId, {
      ...(prefs.preferences || {}),
      costTour: {
        ...(prefs.preferences?.costTour || {}),
        completed: false,
        lastStep: 0,
        resetByAdminAt: new Date().toISOString()
      }
    })
    toast.add({
      title: 'Cost Tour Reset',
      description: `Tour will auto-start next time for ${prefs.userId}`,
      color: 'green',
      icon: 'i-heroicons-check-circle'
    })
    await loadPreferences()
  } catch (err: any) {
    toast.add({
      title: 'Action Failed',
      description: err.message || 'Could not reset cost tour',
      color: 'red',
      icon: 'i-heroicons-x-circle'
    })
  }
}

async function resetAccountTourFor(prefs: UserPreferences) {
  try {
    await patchUserPreferences(prefs.userId, {
      ...(prefs.preferences || {}),
      accountTour: {
        ...(prefs.preferences?.accountTour || {}),
        completed: false,
        lastStep: 0,
        resetByAdminAt: new Date().toISOString()
      }
    })
    toast.add({
      title: 'Account Tour Reset',
      description: `Tour will auto-start next time for ${prefs.userId}`,
      color: 'green',
      icon: 'i-heroicons-check-circle'
    })
    await loadPreferences()
  } catch (err: any) {
    toast.add({
      title: 'Action Failed',
      description: err.message || 'Could not reset account tour',
      color: 'red',
      icon: 'i-heroicons-x-circle'
    })
  }
}

// Confirm delete
function confirmDelete(prefs: UserPreferences) {
  deletingPrefs.value = prefs
  showDeleteModal.value = true
}

// Delete action
async function confirmDeleteAction() {
  if (!deletingPrefs.value) return

  deleting.value = true
  try {
    await $fetch(`/api/admin/user-preferences/${encodeURIComponent(deletingPrefs.value.userId)}`, {
      method: 'DELETE'
    })

    toast.add({
      title: 'Preferences Deleted',
      description: `Preferences deleted for ${deletingPrefs.value.userId}`,
      color: 'green',
      icon: 'i-heroicons-check-circle'
    })

    showDeleteModal.value = false
    await loadPreferences()
  } catch (err: any) {
    toast.add({
      title: 'Delete Failed',
      description: err.message || 'Failed to delete preferences',
      color: 'red',
      icon: 'i-heroicons-x-circle'
    })
  } finally {
    deleting.value = false
  }
}

// Format date
function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days} days ago`
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`
    if (days < 365) return `${Math.floor(days / 30)} months ago`

    return date.toLocaleDateString()
  } catch {
    return dateStr
  }
}

// Export to CSV
function exportToCSV() {
  try {
    const headers = ['User ID', 'Timezone', 'Favorite Count', 'Custom Layout', `Avg. Session (${activityPeriod.value})`, 'Most Active Page', 'Last Login', 'Created At', 'Updated At', 'Custom Preferences']
    const rows = filteredPreferences.value.map(prefs => [
      prefs.userId,
      prefs.timezone,
      getFavoriteCount(prefs).toString(),
      hasCustomLayout(prefs) ? 'Yes' : 'No',
      formatSessionDuration(getUserAvgSessionMs(prefs.userId)),
      getUserTopPage(prefs.userId) || '',
      prefs.lastLoginAt || 'Never',
      prefs.createdAt,
      prefs.updatedAt,
      JSON.stringify(prefs.preferences || {})
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `user-preferences-${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    toast.add({
      title: 'Export Successful',
      description: `Exported ${filteredPreferences.value.length} user preferences`,
      color: 'green',
      icon: 'i-heroicons-check-circle'
    })
  } catch (err: any) {
    toast.add({
      title: 'Export Failed',
      description: err.message || 'Failed to export preferences',
      color: 'red',
      icon: 'i-heroicons-x-circle'
    })
  }
}

// Activity metrics functions
async function loadActivityMetrics() {
  activityMetricsLoading.value = true
  activityMetricsError.value = null
  try {
    const res = await $fetch<{
      success: boolean
      data: {
        byUser: Array<{ userId: string; avgSessionLengthMs: number; sessionCount: number; topPages: Array<{ path: string; count: number }> }>
        global: { avgSessionLengthMs: number; totalSessions: number; topPages: Array<{ path: string; count: number }> }
      }
    }>('/api/admin/user-activity-metrics', { query: { period: activityPeriod.value } })
    if (res.success && res.data) {
      activityMetrics.value = {
        byUser: res.data.byUser ?? [],
        global: res.data.global ?? { avgSessionLengthMs: 0, totalSessions: 0, topPages: [] }
      }
    }
  } catch {
    activityMetrics.value = null
    activityMetricsError.value = 'Activity metrics unavailable'
  } finally {
    activityMetricsLoading.value = false
  }
}

function formatSessionDuration(ms: number): string {
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

function getUserAvgSessionMs(userId: string): number {
  if (!activityMetrics.value) return 0
  const user = activityMetrics.value.byUser.find(u => u.userId === userId)
  return user?.avgSessionLengthMs ?? 0
}

function getUserTopPage(userId: string): string {
  if (!activityMetrics.value) return ''
  const user = activityMetrics.value.byUser.find(u => u.userId === userId)
  return user?.topPages?.[0]?.path ?? ''
}

// Load on mount
onMounted(() => {
  loadPreferences()
  loadActivityMetrics()
})
</script>
