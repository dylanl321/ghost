<template>
  <div>
    <!-- Dropdown when log groups are preloaded -->
    <USelectMenu
      v-if="hasPreloadedLogGroups"
      v-model="selectedLogGroup"
      :options="logGroupOptions"
      :loading="context.state.logGroupsLoading"
      searchable
      searchable-placeholder="Search log groups..."
      :placeholder="placeholder"
      :search-attributes="['label', 'value', 'prefix']"
      value-attribute="value"
      class="w-full"
      :disabled="disabled"
    >
      <template #label>
        <span v-if="context.state.logGroupsLoading" class="text-gray-500">Loading log groups...</span>
        <span v-else-if="selectedLogGroupData" class="flex items-center gap-2 min-w-0">
          <Icon name="i-heroicons-document-text" class="w-4 h-4 text-orange-500 flex-shrink-0" />
          <span class="truncate font-mono text-sm">{{ selectedLogGroupData.displayName }}</span>
        </span>
        <span v-else class="text-gray-500">{{ placeholder }}</span>
      </template>
      <template #option="{ option }">
        <div class="flex items-center gap-2 w-full">
          <Icon name="i-heroicons-document-text" class="w-4 h-4 text-orange-500 flex-shrink-0" />
          <div class="min-w-0 flex-1">
            <div class="font-mono text-sm truncate">{{ option.displayName }}</div>
            <div v-if="option.retention || option.size" class="text-xs text-gray-500">
              <span v-if="option.retention">{{ option.retention }} days retention</span>
              <span v-if="option.retention && option.size"> · </span>
              <span v-if="option.size">{{ formatBytes(option.size) }}</span>
            </div>
          </div>
        </div>
      </template>
    </USelectMenu>

    <!-- Text input fallback when no account selected or no log groups -->
    <div v-else>
      <UInput
        v-model="manualInput"
        :placeholder="noAccountPlaceholder"
        class="w-full"
        :disabled="disabled"
      />
      <p v-if="!context.isAccountReady.value" class="text-xs text-gray-500 mt-1">
        Select an account above to browse log groups
      </p>
      <p v-else-if="context.state.logGroups.length === 0 && !context.state.logGroupsLoading" class="text-xs text-gray-500 mt-1">
        No log groups found in this account
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
interface LogGroupOption {
  label: string
  value: string
  displayName: string
  prefix: string
  retention: number | null
  size: number | null
}

const props = withDefaults(defineProps<{
  modelValue?: string
  placeholder?: string
  noAccountPlaceholder?: string
  disabled?: boolean
}>(), {
  modelValue: '',
  placeholder: 'Select log group',
  noAccountPlaceholder: 'Enter log group name (e.g., /aws/lambda/my-function)',
  disabled: false
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const context = useSupportContext()

// Check if we have preloaded log groups to show dropdown
const hasPreloadedLogGroups = computed(() => {
  return context.isAccountReady.value &&
         (context.state.logGroups.length > 0 || context.state.logGroupsLoading)
})

// Build options from preloaded log groups
const logGroupOptions = computed<LogGroupOption[]>(() => {
  return context.state.logGroups.map(lg => {
    // Extract a friendly display name (last part of the path)
    const parts = lg.name.split('/')
    const displayName = lg.name
    const prefix = parts.slice(0, -1).join('/') || '/'

    return {
      label: lg.name,
      value: lg.name,
      displayName,
      prefix,
      retention: lg.retentionDays || null,
      size: lg.storedBytes || null
    }
  })
})

// Selected log group for dropdown
const selectedLogGroup = computed({
  get: () => props.modelValue,
  set: (value: string) => emit('update:modelValue', value)
})

// Manual input for text field fallback
const manualInput = computed({
  get: () => props.modelValue,
  set: (value: string) => emit('update:modelValue', value)
})

// Find selected log group data for display
const selectedLogGroupData = computed(() => {
  if (!selectedLogGroup.value) return null
  return logGroupOptions.value.find(opt => opt.value === selectedLogGroup.value)
})

// Format bytes to human-readable
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}
</script>
