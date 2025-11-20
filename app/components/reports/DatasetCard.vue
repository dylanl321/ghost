<template>
  <div
    :class="[
      'border-2 rounded-lg transition-all',
      modelValue
        ? `border-${color}-500 bg-${color}-50 dark:bg-${color}-900/20`
        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
    ]"
  >
    <div class="p-4">
      <div class="flex items-start gap-4">
        <!-- Icon -->
        <div
          :class="[
            'flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center',
            modelValue
              ? `bg-${color}-500 text-white`
              : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
          ]"
        >
          <UIcon :name="icon" class="w-6 h-6" />
        </div>

        <!-- Content -->
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between mb-1">
            <h4 class="font-semibold text-gray-900 dark:text-white">
              {{ title }}
            </h4>
            <UToggle
              :model-value="modelValue"
              @update:model-value="$emit('update:modelValue', $event)"
              :disabled="disabled"
            />
          </div>
          <p class="text-sm text-gray-600 dark:text-gray-400">
            {{ description }}
          </p>
        </div>
      </div>

      <!-- Filters Section (Expandable) -->
      <div v-if="modelValue && $slots.filters" class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <slot name="filters" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title: string
  description: string
  icon: string
  color: string
  modelValue: boolean
  disabled?: boolean
}>()

defineEmits<{
  'update:modelValue': [value: boolean]
}>()
</script>
