<template>
  <UModal v-model="isOpen" :ui="{ width: 'max-w-4xl' }">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-lg font-semibold text-white">Quick Report Presets</h3>
            <p class="text-sm text-gray-400 mt-1">
              Choose a pre-configured report template to get started quickly
            </p>
          </div>
          <UButton
            icon="i-heroicons-x-mark"
            variant="ghost"
            color="gray"
            size="sm"
            @click="isOpen = false"
          />
        </div>
      </template>

      <!-- Category Filter -->
      <div class="mb-6">
        <div class="flex items-center gap-2 flex-wrap">
          <UButton
            v-for="category in categories"
            :key="category.value"
            :color="selectedCategory === category.value ? 'primary' : 'gray'"
            :variant="selectedCategory === category.value ? 'solid' : 'outline'"
            size="sm"
            @click="selectedCategory = category.value"
          >
            <UIcon :name="category.icon" class="w-4 h-4 mr-1" />
            {{ category.label }}
          </UButton>
          <UButton
            :color="selectedCategory === null ? 'primary' : 'gray'"
            :variant="selectedCategory === null ? 'solid' : 'outline'"
            size="sm"
            @click="selectedCategory = null"
          >
            All Presets
          </UButton>
        </div>
      </div>

      <!-- Search -->
      <div class="mb-6">
        <UInput
          v-model="searchQuery"
          icon="i-heroicons-magnifying-glass"
          placeholder="Search presets..."
          size="lg"
        />
      </div>

      <!-- Presets Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-96 overflow-y-auto">
        <div
          v-for="preset in filteredPresets"
          :key="preset.id"
          class="p-4 rounded-lg border border-gray-700 hover:border-blue-500 cursor-pointer transition-all bg-gray-900/50 hover:bg-gray-900"
          @click="selectPreset(preset)"
        >
          <div class="flex items-start gap-3">
            <div class="flex-shrink-0">
              <div class="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center">
                <UIcon :name="preset.icon" class="w-5 h-5 text-blue-400" />
              </div>
            </div>
            <div class="flex-1 min-w-0">
              <h4 class="text-sm font-semibold text-white mb-1">{{ preset.name }}</h4>
              <p class="text-xs text-gray-400 mb-2">{{ preset.description }}</p>
              <div class="flex items-center gap-2 flex-wrap">
                <UBadge
                  v-if="preset.suggestedFormat"
                  color="blue"
                  variant="soft"
                  size="xs"
                >
                  {{ preset.suggestedFormat.toUpperCase() }}
                </UBadge>
                <UBadge
                  v-if="preset.enableAI"
                  color="purple"
                  variant="soft"
                  size="xs"
                >
                  <UIcon name="i-heroicons-sparkles" class="w-3 h-3 mr-1" />
                  AI Insights
                </UBadge>
                <UBadge
                  :color="getCategoryColor(preset.category)"
                  variant="soft"
                  size="xs"
                >
                  {{ preset.category }}
                </UBadge>
              </div>
            </div>
            <div class="flex-shrink-0">
              <UIcon name="i-heroicons-chevron-right" class="w-5 h-5 text-gray-500" />
            </div>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="filteredPresets.length === 0" class="py-12 text-center">
        <UIcon name="i-heroicons-magnifying-glass" class="w-12 h-12 text-gray-600 mx-auto mb-3" />
        <p class="text-gray-400">No presets found matching your search</p>
      </div>
    </UCard>
  </UModal>
</template>

<script setup lang="ts">
import { DATASET_PRESETS, getPresetCategories } from '#shared/types/dataset-presets'
import type { DatasetPreset } from '#shared/types/dataset-presets'

const isOpen = defineModel<boolean>({ default: false })

const emit = defineEmits<{
  select: [preset: DatasetPreset]
}>()

const categories = getPresetCategories()
const selectedCategory = ref<DatasetPreset['category'] | null>(null)
const searchQuery = ref('')

const filteredPresets = computed(() => {
  let presets = DATASET_PRESETS

  // Filter by category
  if (selectedCategory.value) {
    presets = presets.filter(p => p.category === selectedCategory.value)
  }

  // Filter by search query
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    presets = presets.filter(p =>
      p.name.toLowerCase().includes(query) ||
      p.description.toLowerCase().includes(query)
    )
  }

  return presets
})

function selectPreset(preset: DatasetPreset) {
  emit('select', preset)
  isOpen.value = false
}

function getCategoryColor(category: DatasetPreset['category']) {
  const colors: Record<DatasetPreset['category'], string> = {
    security: 'red',
    network: 'cyan',
    compliance: 'yellow',
    access: 'purple',
    operations: 'green'
  }
  return colors[category] || 'gray'
}
</script>
