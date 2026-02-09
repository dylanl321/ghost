<template>
  <UDropdown :items="exportMenuItems" :popper="{ placement: 'bottom-end' }">
    <UButton
      icon="i-heroicons-arrow-down-tray"
      :loading="isExporting"
      :disabled="disabled || isExporting"
      color="primary"
      variant="solid"
      :label="buttonLabel"
    >
      {{ buttonText }}
    </UButton>

    <template #item="{ item }">
      <div class="flex items-center gap-2 w-full">
        <UIcon :name="item.icon" class="w-4 h-4" />
        <span class="flex-1">{{ item.label }}</span>
        <span v-if="item.badge" class="text-xs text-gray-500">{{ item.badge }}</span>
      </div>
    </template>
  </UDropdown>
</template>

<script setup lang="ts">
import type { ExportFormat } from '~/shared/types/export'

interface Props {
  // Button appearance
  buttonText?: string
  buttonLabel?: string
  disabled?: boolean

  // Export behavior
  onExport?: (format: ExportFormat) => Promise<void>
  formats?: ExportFormat[]

  // Loading state (can be controlled externally)
  loading?: boolean

  // Schedule functionality
  enableSchedule?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  buttonText: 'Export',
  formats: () => ['csv', 'xlsx', 'pdf', 'json'],
  loading: false
})

const emit = defineEmits<{
  export: [format: ExportFormat]
  schedule: []
}>()

const isExporting = computed(() => props.loading)

// Format configurations
const formatConfigs: Record<ExportFormat, {
  label: string
  icon: string
  description: string
  badge?: string
}> = {
  csv: {
    label: 'CSV',
    icon: 'i-heroicons-document-text',
    description: 'Comma-separated values'
  },
  xlsx: {
    label: 'Excel (XLSX)',
    icon: 'i-heroicons-table-cells',
    description: 'Microsoft Excel format'
  },
  pdf: {
    label: 'PDF',
    icon: 'i-heroicons-document',
    description: 'Portable Document Format'
  },
  json: {
    label: 'JSON',
    icon: 'i-heroicons-code-bracket',
    description: 'JavaScript Object Notation'
  }
}

// Build menu items based on enabled formats
const exportMenuItems = computed(() => {
  const items = props.formats
    .filter(format => formatConfigs[format])
    .map(format => {
      const config = formatConfigs[format]
      return {
        label: config.label,
        icon: config.icon,
        badge: config.badge,
        click: () => handleExport(format)
      }
    })

  const menuGroups = [
    items
  ]

  // Add schedule option if enabled
  if (props.enableSchedule) {
    menuGroups.push([
      {
        label: 'Schedule Report',
        icon: 'i-heroicons-calendar-days',
        click: () => emit('schedule')
      }
    ])
  }

  return menuGroups
})

function handleExport(format: ExportFormat) {
  emit('export', format)
}
</script>
