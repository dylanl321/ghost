<template>
  <UModal v-model="isOpen" :ui="{ width: 'sm:max-w-2xl' }">
    <UCard :ui="{ body: { padding: '' }, header: { padding: 'p-4' } }">
      <template #header>
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Add Filter</h3>
          <UButton color="gray" variant="ghost" icon="i-heroicons-x-mark" size="sm" @click="isOpen = false" />
        </div>
      </template>

      <!-- Search filters -->
      <div class="p-4 border-b border-gray-200 dark:border-gray-700">
        <UInput
          v-model="searchQuery"
          placeholder="Search filters..."
          icon="i-heroicons-magnifying-glass"
          size="md"
        />
      </div>

      <!-- Category tabs -->
      <div class="border-b border-gray-200 dark:border-gray-700">
        <div class="flex gap-1 p-2">
          <UButton
            v-for="tab in tabs"
            :key="tab.key"
            :variant="selectedTabKey === tab.key ? 'solid' : 'ghost'"
            :color="selectedTabKey === tab.key ? 'primary' : 'gray'"
            size="sm"
            @click="selectedTabKey = tab.key"
          >
            {{ tab.label }}
          </UButton>
        </div>
      </div>

      <!-- Tab content -->
      <div class="p-4 space-y-2 max-h-[400px] overflow-y-auto">
        <div
          v-for="config in getFilteredConfigs(selectedTabKey)"
          :key="config.field"
          class="p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors"
          @click="selectFilter(config)"
        >
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <div class="font-medium text-sm text-gray-900 dark:text-white">
                {{ config.label }}
              </div>
              <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {{ config.description }}
              </div>
              <div class="flex items-center gap-2 mt-2">
                <UBadge color="gray" variant="subtle" size="xs">
                  {{ getFilterTypeLabel(config.type) }}
                </UBadge>
              </div>
              <div
                v-if="config.type !== 'boolean' && getValuesPreviewText(config)"
                class="text-xs text-gray-500 dark:text-gray-400 mt-2 font-mono"
              >
                {{ getValuesPreviewText(config) }}
              </div>
            </div>
            <UButton
              icon="i-heroicons-plus"
              size="xs"
              color="emerald"
              variant="soft"
            />
          </div>
        </div>

        <!-- Empty state -->
        <div v-if="getFilteredConfigs(selectedTabKey).length === 0" class="text-center py-8 text-gray-500">
          <UIcon name="i-heroicons-funnel" class="w-8 h-8 mx-auto mb-2" />
          <p>No filters found</p>
        </div>
      </div>
    </UCard>
  </UModal>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { advancedFilterConfigs, getUniqueFieldValues, getValuesPreview } from '~/utils/advancedFilterConfig'
import type { FilterConfig } from '~/utils/advancedFilterConfig'

// Props
const props = defineProps<{
  modelValue: boolean
  enclaves: Record<string, AWSEnclaveData>
}>()

// Emits
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'filterSelected': [config: FilterConfig]
}>()

// Local state
const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const searchQuery = ref('')
const selectedTabKey = ref('all')

// Tabs for categories
const tabs = [
  { key: 'all', label: 'All Filters' },
  { key: 'Technical', label: 'Technical' },
  { key: 'Classification', label: 'Classification' },
  { key: 'Financial', label: 'Financial' },
  { key: 'Other', label: 'Other' }
]

// Get filters by category and search
const getFilteredConfigs = (category: string) => {
  let configs = category === 'all' ? advancedFilterConfigs : advancedFilterConfigs.filter(c => c.category === category)

  // Apply search filter
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    configs = configs.filter(c =>
      c.label.toLowerCase().includes(query) ||
      c.description?.toLowerCase().includes(query) ||
      c.field.toLowerCase().includes(query)
    )
  }

  return configs
}

// Get available values count for a field
const getAvailableValuesCount = (field: keyof AWSEnclaveData) => {
  return getUniqueFieldValues(props.enclaves, field).length
}

// Get filter type label
const getFilterTypeLabel = (type: string) => {
  const labels: Record<string, string> = {
    'select': 'Dropdown',
    'select-multi': 'Multi-select',
    'boolean': 'Yes/No',
    'text': 'Text search'
  }
  return labels[type] || type
}

// Get values preview text for filter card
const getValuesPreviewText = (config: FilterConfig) => {
  const values = getUniqueFieldValues(props.enclaves, config.field)
  return getValuesPreview(values)
}

// Handle filter selection
const selectFilter = (config: FilterConfig) => {
  emit('filterSelected', config)
  isOpen.value = false
}
</script>
