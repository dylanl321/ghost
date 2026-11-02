<template>
  <!-- Standalone radio button. Nuxt UI 4 dropped URadio; URadioGroup can't span radios laid out apart. -->
  <label class="inline-flex items-start gap-2 cursor-pointer select-none" :class="{ 'opacity-75 cursor-not-allowed': disabled }">
    <input
      v-model="model"
      type="radio"
      :value="value"
      :name="name"
      :disabled="disabled"
      class="mt-0.5 size-4 shrink-0 cursor-pointer accent-primary-500 disabled:cursor-not-allowed"
    >
    <span class="text-sm">
      <span class="block font-medium text-gray-700 dark:text-gray-200">
        <slot name="label">{{ label }}</slot>
      </span>
      <span v-if="help || $slots.help" class="block text-gray-500 dark:text-gray-400">
        <slot name="help">{{ help }}</slot>
      </span>
    </span>
  </label>
</template>

<script setup lang="ts">
defineProps<{
  value: string | number | boolean
  label?: string
  help?: string
  name?: string
  disabled?: boolean
}>()

const model = defineModel<string | number | boolean | null | undefined>()
</script>
