<template>
  <div>
    <!-- Dropdown when instances are preloaded -->
    <USelectMenu
      v-if="hasPreloadedInstances"
      v-model="selectedInstance"
      :options="instanceOptions"
      :loading="context.state.instancesLoading"
      searchable
      searchable-placeholder="Search by ID, name, or IP..."
      :placeholder="placeholder"
      :search-attributes="['label', 'instanceId', 'instanceName', 'privateIp', 'publicIp']"
      value-attribute="value"
      class="w-full"
      :disabled="disabled"
    >
      <template #label>
        <span v-if="context.state.instancesLoading" class="text-gray-500">Loading instances...</span>
        <span v-else-if="selectedInstanceData" class="flex items-center gap-2 min-w-0">
          <span
            class="w-2 h-2 rounded-full flex-shrink-0"
            :class="getStateColor(selectedInstanceData.state)"
          />
          <span class="truncate">{{ selectedInstanceData.name || selectedInstanceData.value }}</span>
          <span class="text-xs text-gray-500 font-mono flex-shrink-0">{{ selectedInstanceData.value }}</span>
        </span>
        <span v-else class="text-gray-500">{{ placeholder }}</span>
      </template>
      <template #option="{ option }">
        <div class="flex items-center justify-between w-full gap-2">
          <div class="flex items-center gap-2 min-w-0 flex-1">
            <span
              class="w-2 h-2 rounded-full flex-shrink-0"
              :class="getStateColor(option.state)"
            />
            <div class="min-w-0 flex-1">
              <div class="font-medium truncate">{{ option.name || option.value }}</div>
              <div class="text-xs text-gray-500 font-mono">{{ option.value }}</div>
              <div v-if="option.privateIp || option.type" class="text-xs text-gray-400">
                <span v-if="option.privateIp">{{ option.privateIp }}</span>
                <span v-if="option.privateIp && option.type"> · </span>
                <span v-if="option.type">{{ option.type }}</span>
              </div>
            </div>
          </div>
          <UBadge
            :color="getStateBadgeColor(option.state)"
            variant="soft"
            size="xs"
            class="flex-shrink-0"
          >
            {{ option.state }}
          </UBadge>
        </div>
      </template>
    </USelectMenu>

    <!-- Text input fallback when no account selected or no instances -->
    <div v-else>
      <UInput
        v-model="manualInput"
        :placeholder="noAccountPlaceholder"
        class="w-full"
        :disabled="disabled"
      />
      <p v-if="!context.isAccountReady.value" class="text-xs text-gray-500 mt-1">
        Select an account above to browse instances
      </p>
      <p v-else-if="context.state.instances.length === 0 && !context.state.instancesLoading" class="text-xs text-gray-500 mt-1">
        No instances found in this account
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
interface InstanceOption {
  label: string
  value: string
  name: string
  instanceId: string
  instanceName: string
  privateIp: string
  publicIp: string
  type: string
  state: string
}

const props = withDefaults(defineProps<{
  modelValue?: string
  placeholder?: string
  noAccountPlaceholder?: string
  disabled?: boolean
}>(), {
  modelValue: '',
  placeholder: 'Select instance',
  noAccountPlaceholder: 'Enter instance ID (e.g., i-1234567890abcdef0)',
  disabled: false
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const context = useSupportContext()

// Check if we have preloaded instances to show dropdown
const hasPreloadedInstances = computed(() => {
  return context.isAccountReady.value &&
         (context.state.instances.length > 0 || context.state.instancesLoading)
})

// Build options from preloaded instances
const instanceOptions = computed<InstanceOption[]>(() => {
  return context.state.instances.map(inst => ({
    label: `${inst.instanceName || inst.resourceId} (${inst.resourceId})`,
    value: inst.resourceId,
    name: inst.instanceName || '',
    instanceId: inst.resourceId,
    instanceName: inst.instanceName || '',
    privateIp: inst.privateIpAddress || '',
    publicIp: inst.publicIpAddress || '',
    type: inst.instanceType || '',
    state: inst.instanceState || 'unknown'
  }))
})

// Selected instance for dropdown
const selectedInstance = computed({
  get: () => props.modelValue,
  set: (value: string) => emit('update:modelValue', value)
})

// Manual input for text field fallback
const manualInput = computed({
  get: () => props.modelValue,
  set: (value: string) => emit('update:modelValue', value)
})

// Find selected instance data for display
const selectedInstanceData = computed(() => {
  if (!selectedInstance.value) return null
  return instanceOptions.value.find(opt => opt.value === selectedInstance.value)
})

// State indicator colors
function getStateColor(state: string): string {
  switch (state?.toLowerCase()) {
    case 'running':
      return 'bg-green-500'
    case 'stopped':
      return 'bg-red-500'
    case 'pending':
    case 'stopping':
    case 'shutting-down':
      return 'bg-yellow-500'
    case 'terminated':
      return 'bg-gray-400'
    default:
      return 'bg-gray-400'
  }
}

function getStateBadgeColor(state: string): 'green' | 'red' | 'yellow' | 'gray' {
  switch (state?.toLowerCase()) {
    case 'running':
      return 'green'
    case 'stopped':
      return 'red'
    case 'pending':
    case 'stopping':
    case 'shutting-down':
      return 'yellow'
    default:
      return 'gray'
  }
}
</script>
