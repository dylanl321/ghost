<template>
  <UCard :ui="{ body: 'p-0 sm:p-0', header: 'px-4 py-3 sm:px-4' }">
    <template #header>
      <div class="flex items-center justify-between gap-2">
        <h2 class="m-0 text-base font-bold text-gray-900 dark:text-white">Needs attention</h2>
        <UBadge v-if="items.length > 0" :color="hasCritical ? 'error' : 'warning'" variant="subtle">{{ items.length }}</UBadge>
      </div>
    </template>

    <ul v-if="items.length > 0" class="m-0 list-none divide-y divide-gray-200 p-0 dark:divide-gray-800">
      <li v-for="item in items" :key="item.id" class="flex gap-3 px-4 py-3.5">
        <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" :class="iconBg(item.severity)">
          <UIcon :name="iconFor(item)" class="h-4 w-4" />
        </span>
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <span class="text-sm font-semibold text-gray-900 dark:text-white">{{ item.title }}</span>
          <span class="text-[13px] leading-snug text-gray-500 dark:text-gray-400">{{ item.body }}</span>
          <UButton
            class="-ml-2 self-start"
            size="xs"
            color="primary"
            variant="link"
            :label="item.action.label"
            @click="emit('action', item)"
          />
        </div>
      </li>
    </ul>
    <p v-else class="m-0 px-4 py-6 text-sm text-gray-500 dark:text-gray-400">
      Nothing needs attention for this selection.
    </p>
  </UCard>
</template>

<script setup lang="ts">
import type { AttentionItem, AttentionSeverity } from '#shared/utils/cost-dashboard'

const props = defineProps<{ items: AttentionItem[] }>()
const emit = defineEmits<{ action: [item: AttentionItem] }>()

const hasCritical = computed(() => props.items.some(i => i.severity === 'critical'))

const iconBg = (severity: AttentionSeverity) => ({
  critical: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  warning: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  info: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'
}[severity])

const iconFor = (item: AttentionItem) => ({
  overrun: 'i-heroicons-currency-dollar',
  'budget-alerts': 'i-heroicons-bell-alert',
  'early-month': 'i-heroicons-calendar',
  historical: 'i-heroicons-clock',
  'carried-forward': 'i-heroicons-arrow-uturn-right',
  untagged: 'i-heroicons-tag'
}[item.kind])
</script>
