<template>
  <USelectMenu
    v-model="selectedAccount"
    :options="filteredAccounts"
    :loading="!isReady"
    searchable
    searchable-placeholder="Search accounts..."
    :placeholder="placeholder"
    :search-attributes="['label', 'name', 'value']"
    value-attribute="value"
    class="w-full"
    :disabled="disabled"
  >
    <template #label>
      <span v-if="!isReady" class="text-gray-500">Loading accounts...</span>
      <span v-else-if="selectedAccountData" class="flex items-center gap-2 min-w-0">
        <span class="truncate">{{ selectedAccountData.name }}</span>
        <span class="text-xs text-gray-500 font-mono flex-shrink-0">{{ selectedAccount }}</span>
      </span>
      <span v-else class="text-gray-500">{{ placeholder }}</span>
    </template>
    <template #option="{ option }">
      <div class="flex items-center justify-between w-full gap-2">
        <div class="min-w-0 flex-1">
          <div class="font-medium truncate">{{ option.name }}</div>
          <div class="text-xs text-gray-500 font-mono">{{ option.value }}</div>
        </div>
        <UBadge
          :color="option.isGovCloud ? 'purple' : 'blue'"
          variant="soft"
          size="xs"
          class="flex-shrink-0"
        >
          {{ option.isGovCloud ? 'GovCloud' : 'Commercial' }}
        </UBadge>
      </div>
    </template>
  </USelectMenu>
</template>

<script setup lang="ts">
interface AccountOption {
  label: string
  value: string
  name: string
  isGovCloud: boolean
}

const props = withDefaults(defineProps<{
  modelValue?: string
  environment?: 'commercial' | 'govcloud'
  placeholder?: string
  required?: boolean
  disabled?: boolean
}>(), {
  modelValue: '',
  environment: 'govcloud',
  placeholder: 'Select account',
  required: false,
  disabled: false
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

// Use the enclave store (already populated on app load)
const enclaveStore = useEnclaveStore()

// Check if store is ready
const isReady = computed(() => {
  return Object.keys(enclaveStore.enclaves || {}).length > 0
})

// Build options from enclave store
const accountOptions = computed<AccountOption[]>(() => {
  const enclaves = Object.values(enclaveStore.enclaves || {})
  const options: AccountOption[] = []

  for (const account of enclaves) {
    if (!account) continue

    // Skip decommissioned or inactive accounts
    const enclaveStatus = (account.enclaveStatus || '').toLowerCase()
    const accountStatus = (account.accountStatus || '').toLowerCase()
    if (enclaveStatus.includes('decommission') || accountStatus.includes('decommission') ||
        enclaveStatus.includes('inactive') || accountStatus.includes('inactive')) {
      continue
    }

    const name = account.projectName || account.accountName || 'Unknown'
    const commercialId = account.awsStandardAccountID || account.accountId
    const govCloudId = account.awsGovCloudAccountID

    // Add commercial account option
    if (commercialId) {
      options.push({
        label: `${name} (${commercialId})`,
        value: commercialId,
        name,
        isGovCloud: false
      })
    }

    // Add GovCloud account option if it has a GovCloud ID
    if (govCloudId) {
      options.push({
        label: `${name} (${govCloudId})`,
        value: govCloudId,
        name,
        isGovCloud: true
      })
    }
  }

  // Sort by name
  options.sort((a, b) => a.name.localeCompare(b.name))
  return options
})

// Filter accounts based on environment
const filteredAccounts = computed(() => {
  if (props.environment === 'govcloud') {
    return accountOptions.value.filter(opt => opt.isGovCloud)
  }
  return accountOptions.value.filter(opt => !opt.isGovCloud)
})

// Selected account value (ID)
const selectedAccount = computed({
  get: () => props.modelValue,
  set: (value: string) => emit('update:modelValue', value)
})

// Find the selected account data for display
const selectedAccountData = computed(() => {
  if (!selectedAccount.value) return null
  return accountOptions.value.find(opt => opt.value === selectedAccount.value)
})
</script>
