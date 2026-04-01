<template>
  <div>
    <!-- Boolean -->
    <UBadge v-if="typeof value === 'boolean'" :color="value ? 'green' : 'gray'" variant="soft" size="sm">
      {{ value ? 'Enabled' : 'Disabled' }}
    </UBadge>

    <!-- Number -->
    <span v-else-if="typeof value === 'number'" class="text-sm text-gray-900 dark:text-white font-mono">
      {{ value }}
    </span>

    <!-- String -->
    <span v-else-if="typeof value === 'string'" class="text-sm text-gray-900 dark:text-white">
      {{ value || '—' }}
    </span>

    <!-- Array of strings -->
    <div v-else-if="isStringArray(value)" class="flex flex-wrap gap-1">
      <UBadge v-for="(item, i) in (value as string[])" :key="i" color="gray" variant="soft" size="xs">
        {{ item }}
      </UBadge>
      <span v-if="!(value as string[]).length" class="text-sm text-gray-500 italic">None</span>
    </div>

    <!-- welcomeBanner object -->
    <div v-else-if="propKey === 'welcomeBanner' && isObject(value)" class="space-y-2">
      <div class="flex items-center justify-between">
        <span class="text-xs text-gray-600 dark:text-gray-400">Status</span>
        <UBadge :color="(value as any).dismissed ? 'gray' : 'green'" variant="soft" size="xs">
          {{ (value as any).dismissed ? 'Dismissed' : 'Active' }}
        </UBadge>
      </div>
      <div v-if="(value as any).seenCount != null" class="flex items-center justify-between">
        <span class="text-xs text-gray-600 dark:text-gray-400">Seen count</span>
        <span class="text-xs font-medium text-gray-900 dark:text-white">{{ (value as any).seenCount }}</span>
      </div>
      <div v-if="(value as any).clicked != null" class="flex items-center justify-between">
        <span class="text-xs text-gray-600 dark:text-gray-400">Clicked</span>
        <UBadge :color="(value as any).clicked ? 'green' : 'gray'" variant="soft" size="xs">
          {{ (value as any).clicked ? 'Yes' : 'No' }}
        </UBadge>
      </div>
      <div v-if="(value as any).resetByAdminAt" class="flex items-center justify-between">
        <span class="text-xs text-gray-600 dark:text-gray-400">Last admin reset</span>
        <span class="text-xs text-gray-900 dark:text-white">{{ formatRelativeDate((value as any).resetByAdminAt) }}</span>
      </div>
    </div>

    <!-- costTour / accountTour object -->
    <div v-else-if="isTourObject(propKey, value)" class="space-y-2">
      <div class="flex items-center justify-between">
        <span class="text-xs text-gray-600 dark:text-gray-400">Status</span>
        <UBadge :color="(value as any).completed ? 'green' : 'yellow'" variant="soft" size="xs">
          {{ (value as any).completed ? 'Completed' : 'In Progress' }}
        </UBadge>
      </div>
      <div v-if="(value as any).lastStep != null" class="flex items-center justify-between">
        <span class="text-xs text-gray-600 dark:text-gray-400">Last step</span>
        <span class="text-xs font-medium text-gray-900 dark:text-white">Step {{ (value as any).lastStep }}</span>
      </div>
      <div v-if="(value as any).resetByAdminAt" class="flex items-center justify-between">
        <span class="text-xs text-gray-600 dark:text-gray-400">Last admin reset</span>
        <span class="text-xs text-gray-900 dark:text-white">{{ formatRelativeDate((value as any).resetByAdminAt) }}</span>
      </div>
    </div>

    <!-- Generic object fallback -->
    <div v-else-if="isObject(value)" class="max-h-48 overflow-auto rounded bg-gray-50 dark:bg-gray-900 p-3">
      <div v-if="objectEntries(value).length <= 8" class="space-y-1.5">
        <div v-for="[k, v] in objectEntries(value)" :key="k" class="flex items-start justify-between gap-4">
          <span class="text-xs text-gray-500 dark:text-gray-400 shrink-0">{{ k }}</span>
          <span class="text-xs text-gray-900 dark:text-white text-right font-mono break-all">{{ formatSimpleValue(v) }}</span>
        </div>
      </div>
      <pre v-else class="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-all">{{ JSON.stringify(value, null, 2) }}</pre>
    </div>

    <!-- Null/undefined -->
    <span v-else class="text-sm text-gray-400 italic">—</span>
  </div>
</template>

<script setup lang="ts">
import { formatRelativeDate } from '~/composables/useAdminUserDetail'

defineProps<{
  propKey: string
  value: any
}>()

function isStringArray(val: any): boolean {
  return Array.isArray(val) && val.every(item => typeof item === 'string')
}

function isObject(val: any): boolean {
  return val !== null && typeof val === 'object' && !Array.isArray(val)
}

function isTourObject(key: string, val: any): boolean {
  return (key === 'costTour' || key === 'accountTour') && isObject(val)
}

function objectEntries(val: any): [string, any][] {
  return Object.entries(val || {})
}

function formatSimpleValue(val: any): string {
  if (val === null || val === undefined) return '—'
  if (typeof val === 'boolean') return val ? 'Yes' : 'No'
  if (typeof val === 'object') return JSON.stringify(val)
  return String(val)
}
</script>
