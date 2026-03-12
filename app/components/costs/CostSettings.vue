<template>
  <UPopover mode="hover" :popper="{ placement: 'bottom-start' }">
    <UTooltip text="Cost Settings" :popper="{ placement: 'top' }">
      <UButton
        data-tour="costs-settings"
        size="sm"
        variant="ghost"
        color="gray"
        icon="i-heroicons-cog-6-tooth"
        :class="{ 'text-blue-400': hasActiveFilters }"
      />
    </UTooltip>
    
    <template #panel="{ close }">
      <div class="p-4 w-72 sm:w-80 max-w-[calc(100vw-2rem)]">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-sm font-semibold text-gray-200">Cost Settings</h3>
          <UButton
            size="xs"
            variant="ghost"
            color="gray"
            @click="resetSettings"
            v-if="hasActiveFilters"
          >
            Reset
          </UButton>
        </div>

        <!-- Forecast Data Management -->
        <div v-if="canImportForecast" class="mb-4 pb-4 border-b border-gray-700">
          <h4 class="text-xs font-medium text-gray-300 mb-2">Forecast Data</h4>
          <UButton
            size="xs"
            variant="outline"
            color="blue"
            icon="i-heroicons-document-arrow-up"
            @click="showForecastUpload = true"
            class="w-full"
          >
            Import Forecast File
          </UButton>
          <div class="mt-2 text-xs text-gray-400">
            Available for AWS-Product-Team members
          </div>
        </div>

        <!-- Data Filtering Section -->
        <div class="space-y-4">
          <div>
            <h4 class="text-xs font-medium text-gray-300 mb-2">Filter Transactions</h4>
            <div class="space-y-2">
              <label class="flex items-center gap-2 cursor-pointer">
                <UCheckbox
                  v-model="settings.hideSavingsPlans"
                />
                <span class="text-xs text-gray-200">Hide Savings Plans</span>
              </label>
              
              <label class="flex items-center gap-2 cursor-pointer">
                <UCheckbox
                  v-model="settings.hideEnterpriseSupport"
                />
                <span class="text-xs text-gray-200">Hide Enterprise Support</span>
              </label>
              
              <label class="flex items-center gap-2 cursor-pointer">
                <UCheckbox
                  v-model="settings.hideReservedInstances"
                />
                <span class="text-xs text-gray-200">Hide Reserved Instances</span>
              </label>
              
              <label class="flex items-center gap-2 cursor-pointer">
                <UCheckbox
                  v-model="settings.hideDevAccounts"
                />
                <span class="text-xs text-gray-200">Hide Dev Accounts</span>
              </label>
            </div>
          </div>

          <!-- Cost Threshold -->
          <div>
            <h4 class="text-xs font-medium text-gray-300 mb-2">Minimum Cost Threshold</h4>
            <div class="flex items-center gap-2">
              <span class="text-xs text-gray-400">$</span>
              <UInput
                v-model.number="settings.minCostThreshold"
                type="number"
                size="sm"
                placeholder="0"
                class="flex-1"
                :min="0"
              />
            </div>
            <p class="text-xs text-gray-400 mt-1">Hide accounts below this amount</p>
          </div>

          <!-- Currency Format -->
          <div>
            <h4 class="text-xs font-medium text-gray-300 mb-2">Currency Display</h4>
            <URadioGroup
              v-model="settings.currencyFormat"
              :options="currencyOptions"
              size="sm"
            />
          </div>

          <!-- Account Visibility -->
          <div>
            <h4 class="text-xs font-medium text-gray-300 mb-2">Account Visibility</h4>
            <label class="flex items-center gap-2 cursor-pointer">
              <UCheckbox
                v-model="settings.showDecommissioned"
              />
              <span class="text-xs text-gray-200">Show Decommissioned Accounts</span>
            </label>
          </div>
        </div>

        <!-- Active Filters Summary -->
        <div v-if="hasActiveFilters" class="mt-4 pt-3 border-t border-gray-700">
          <div class="text-xs text-gray-400 mb-2">Active Filters:</div>
          <div class="flex flex-wrap gap-1">
            <UBadge 
              v-if="settings.hideSavingsPlans"
              size="xs" 
              variant="soft" 
              color="blue"
            >
              No Savings Plans
            </UBadge>
            <UBadge 
              v-if="settings.hideEnterpriseSupport"
              size="xs" 
              variant="soft" 
              color="blue"
            >
              No Enterprise Support
            </UBadge>
            <UBadge 
              v-if="settings.hideReservedInstances"
              size="xs" 
              variant="soft" 
              color="blue"
            >
              No Reserved Instances
            </UBadge>
            <UBadge 
              v-if="settings.hideDevAccounts"
              size="xs" 
              variant="soft" 
              color="blue"
            >
              No Dev Accounts
            </UBadge>
            <UBadge 
              v-if="settings.minCostThreshold > 0"
              size="xs" 
              variant="soft" 
              color="blue"
            >
              Min ${{ formatThreshold(settings.minCostThreshold) }}
            </UBadge>
            <UBadge 
              v-if="!settings.showDecommissioned"
              size="xs" 
              variant="soft" 
              color="blue"
            >
              Active Only
            </UBadge>
          </div>
        </div>
      </div>
    </template>
  </UPopover>

  <!-- Forecast Upload Modal -->
  <UModal v-model="showForecastUpload">
    <UCard>
      <template #header>
        <h3 class="text-lg font-semibold text-white">Import Forecast Data</h3>
      </template>

      <ForecastUpload @close="showForecastUpload = false" />

      <template #footer>
        <div class="flex justify-end">
          <UButton variant="ghost" @click="showForecastUpload = false">
            Close
          </UButton>
        </div>
      </template>
    </UCard>
  </UModal>
</template>

<script setup lang="ts">
import ForecastUpload from './ForecastUpload.vue'

const costSettingsStore = useCostSettingsStore()
const { can } = useUserRoles()

// State
const showForecastUpload = ref(false)

// Check if user has permission to import forecast data
const canImportForecast = computed(() => can('forecast.import'))

const settings = computed({
  get: () => costSettingsStore.$state,
  set: (value) => costSettingsStore.updateSettings(value)
})

const currencyOptions = [
  { value: 'abbreviated', label: 'Abbreviated ($1.2M, $500K)' },
  { value: 'full', label: 'Full ($1,200,000.00)' }
]

const hasActiveFilters = computed(() => {
  return settings.value.hideSavingsPlans ||
         settings.value.hideEnterpriseSupport ||
         settings.value.hideReservedInstances ||
         settings.value.hideDevAccounts ||
         settings.value.minCostThreshold > 0 ||
         !settings.value.showDecommissioned
})

const resetSettings = () => {
  costSettingsStore.resetToDefaults()
}

const formatThreshold = (value: number) => {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`
  return value.toString()
}
</script>