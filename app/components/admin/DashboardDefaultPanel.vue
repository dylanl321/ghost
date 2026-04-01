<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Dashboard Default Layout</h2>
        <p class="text-sm text-gray-500 dark:text-gray-400">The org-wide default layout applied when users reset their dashboard</p>
      </div>
      <div class="flex items-center gap-2">
        <UButton icon="i-heroicons-arrow-path" size="sm" variant="ghost" color="gray" :loading="loading" @click="fetchDefault">
          Refresh
        </UButton>
        <UButton
          v-if="hasLayout"
          icon="i-heroicons-trash"
          size="sm"
          variant="soft"
          color="red"
          :loading="clearing"
          @click="handleClear"
        >
          Clear Default
        </UButton>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading && !layoutData" class="flex items-center justify-center py-12">
      <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 text-gray-400 animate-spin" />
    </div>

    <!-- Empty state -->
    <UCard v-else-if="!hasLayout">
      <div class="text-center py-8">
        <UIcon name="i-heroicons-rectangle-group" class="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
        <p class="text-gray-500 dark:text-gray-400 font-medium">No org default layout configured</p>
        <p class="text-sm text-gray-400 dark:text-gray-500 mt-1">Admins can set one from the dashboard customize panel (cog icon on the main dashboard)</p>
      </div>
    </UCard>

    <!-- Layout details -->
    <template v-else>
      <!-- Metadata -->
      <UCard v-if="updatedAt || updatedBy">
        <div class="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
          <span v-if="updatedBy" class="flex items-center gap-1.5">
            <UIcon name="i-heroicons-user" class="w-4 h-4" />
            Set by {{ updatedBy }}
          </span>
          <span v-if="updatedAt" class="flex items-center gap-1.5">
            <UIcon name="i-heroicons-clock" class="w-4 h-4" />
            {{ formatDate(updatedAt) }}
          </span>
        </div>
      </UCard>

      <!-- Sections -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-squares-2x2" class="w-5 h-5 text-gray-500" />
            <h3 class="font-semibold text-gray-900 dark:text-white">Sections</h3>
            <UBadge color="gray" variant="soft" size="xs">{{ layoutData!.sections.length }}</UBadge>
          </div>
        </template>
        <div class="divide-y divide-gray-100 dark:divide-gray-800">
          <div
            v-for="(section, index) in layoutData!.sections"
            :key="section.id"
            class="flex items-center gap-3 py-2"
            :class="{ 'opacity-50': !section.visible }"
          >
            <span class="text-xs text-gray-400 w-5 text-right font-mono">{{ index + 1 }}</span>
            <span class="flex-1 text-sm text-gray-700 dark:text-gray-300">{{ SECTION_LABELS[section.id] || section.id }}</span>
            <UBadge
              :color="section.visible ? 'green' : 'gray'"
              variant="soft"
              size="xs"
            >
              {{ section.visible ? 'Visible' : 'Hidden' }}
            </UBadge>
            <UBadge
              v-if="section.displayStyle && section.displayStyle !== 'full'"
              color="blue"
              variant="soft"
              size="xs"
            >
              {{ STYLE_LABELS[section.displayStyle] }}
            </UBadge>
          </div>
        </div>
      </UCard>

      <!-- Metric Cards -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-chart-bar" class="w-5 h-5 text-gray-500" />
            <h3 class="font-semibold text-gray-900 dark:text-white">Metric Cards</h3>
          </div>
        </template>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div
            v-for="cardId in ALL_METRIC_CARD_IDS"
            :key="cardId"
            class="flex items-center gap-2 text-sm"
          >
            <UIcon
              :name="layoutData!.metricCards[cardId] ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
              :class="layoutData!.metricCards[cardId] ? 'text-green-500' : 'text-gray-300 dark:text-gray-600'"
              class="w-4 h-4 flex-shrink-0"
            />
            <span class="text-gray-700 dark:text-gray-300">{{ METRIC_CARD_LABELS[cardId] }}</span>
          </div>
        </div>
      </UCard>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { DashboardLayoutConfig } from '#shared/types/dashboard-layout'
import {
  SECTION_LABELS,
  METRIC_CARD_LABELS,
  ALL_METRIC_CARD_IDS,
} from '#shared/types/dashboard-layout'

const STYLE_LABELS: Record<string, string> = {
  'two-thirds': '2/3',
  'half': '1/2',
  'third': '1/3',
}

const toast = useToast()
const loading = ref(false)
const clearing = ref(false)
const layoutData = ref<DashboardLayoutConfig | null>(null)
const updatedAt = ref<string | null>(null)
const updatedBy = ref<string | null>(null)

const hasLayout = computed(() => layoutData.value && layoutData.value.sections?.length > 0)

async function fetchDefault() {
  loading.value = true
  try {
    const res = await $fetch<{
      success: boolean
      layout: DashboardLayoutConfig | null
      updatedAt: string | null
      updatedBy: string | null
    }>('/api/admin/dashboard-layout/get-default', {
      query: { nocache: '1' },
    })
    layoutData.value = res.layout
    updatedAt.value = res.updatedAt
    updatedBy.value = res.updatedBy
  } catch (e: any) {
    toast.add({ title: 'Failed to load default layout', description: e.message, color: 'red', icon: 'i-heroicons-x-circle' })
  } finally {
    loading.value = false
  }
}

async function handleClear() {
  clearing.value = true
  try {
    await $fetch('/api/admin/dashboard-layout/clear-default', { method: 'POST' })
    layoutData.value = null
    updatedAt.value = null
    updatedBy.value = null
    toast.add({ title: 'Default layout cleared', color: 'green', icon: 'i-heroicons-check-circle' })
  } catch (e: any) {
    toast.add({ title: 'Failed to clear default layout', description: e.message, color: 'red', icon: 'i-heroicons-x-circle' })
  } finally {
    clearing.value = false
  }
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString()
  } catch {
    return dateStr
  }
}

onMounted(() => {
  fetchDefault()
})
</script>
