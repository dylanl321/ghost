<template>
  <div>
    <label class="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">{{ label }}</label>
    <USelectMenu
      v-model="model"
      :items="options"
      value-key="value"
      label-key="label"
      multiple
      size="sm"
      :placeholder="`All ${label.toLowerCase()}s`"
    />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  label: string
  options: Array<{ label: string; value: string }>
}>()

const model = defineModel<string[]>({ default: () => [] })
</script>
