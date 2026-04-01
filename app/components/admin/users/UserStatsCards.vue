<template>
  <div class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-7 gap-4 mb-6">
    <UCard>
      <div class="flex items-center gap-3">
        <div class="p-2 bg-blue-500/10 rounded-lg">
          <Icon name="i-heroicons-users" class="w-5 h-5 text-blue-500" />
        </div>
        <div>
          <p class="text-xs text-gray-600 dark:text-gray-400">Total Users</p>
          <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ totalUsers }}</p>
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
          <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ withFavorites }}</p>
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
          <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ customLayouts }}</p>
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
            {{ metricsLoading ? '…' : formatSessionDuration(avgSessionMs) }}
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
          <p class="text-sm font-semibold text-gray-900 dark:text-white truncate max-w-[140px]" :title="topPagesLabel">
            {{ metricsLoading ? '…' : topPagesLabel || '—' }}
          </p>
        </div>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { formatSessionDuration } from '~/composables/useAdminUserDetail'

defineProps<{
  totalUsers: number
  activeToday: number
  withFavorites: number
  customLayouts: number
  uniqueTimezones: number
  avgSessionMs: number
  topPagesLabel: string
  activityPeriod: string
  metricsLoading: boolean
}>()
</script>
