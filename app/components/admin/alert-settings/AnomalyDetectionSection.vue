<template>
  <div class="space-y-6">
    <!-- Main Anomaly Detection -->
    <div>
      <h4 class="text-sm font-medium text-gray-900 dark:text-white mb-3">AWS Cost Anomaly Detection</h4>
      <div v-if="anomalyDetection" class="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg space-y-4">
        <!-- Enabled Toggle -->
        <div class="flex items-center justify-between">
          <div>
            <span class="text-sm text-gray-600 dark:text-gray-400">Enabled</span>
          </div>
          <UToggle
            :model-value="anomalyDetection.enabled !== false"
            :loading="savingAnomalyField === 'enabled'"
            @update:model-value="updateAnomalyField('enabled', $event)"
          />
        </div>

        <!-- Min Impact -->
        <div class="flex items-center justify-between gap-2">
          <span class="text-sm text-gray-600 dark:text-gray-400">Min Impact</span>
          <div v-if="editingField === 'anomaly_min_impact'" class="flex items-center gap-2">
            <div class="flex items-center">
              <span class="text-sm text-gray-500 mr-1">$</span>
              <UInput
                v-model.number="editValue"
                type="number"
                size="sm"
                class="w-28"
                :min="0"
                @keyup.enter="saveAnomalyField('min_impact_dollars')"
                @keyup.escape="cancelEdit"
              />
            </div>
            <UButton icon="i-heroicons-check" size="xs" color="green" @click="saveAnomalyField('min_impact_dollars')" :loading="savingAnomalyField === 'min_impact_dollars'" />
            <UButton icon="i-heroicons-x-mark" size="xs" color="gray" variant="ghost" @click="cancelEdit" />
          </div>
          <div v-else class="flex items-center gap-2">
            <span class="text-sm font-mono text-gray-900 dark:text-white">${{ (anomalyDetection.min_impact_dollars || 100).toLocaleString() }}</span>
            <UButton icon="i-heroicons-pencil" size="2xs" color="gray" variant="ghost" @click="startEdit('anomaly_min_impact', anomalyDetection.min_impact_dollars || 100)" />
          </div>
        </div>

        <!-- Lookback Days -->
        <div class="flex items-center justify-between gap-2">
          <span class="text-sm text-gray-600 dark:text-gray-400">Lookback Days</span>
          <div v-if="editingField === 'anomaly_lookback'" class="flex items-center gap-2">
            <UInput
              v-model.number="editValue"
              type="number"
              size="sm"
              class="w-20"
              :min="1"
              :max="90"
              @keyup.enter="saveAnomalyField('lookback_days')"
              @keyup.escape="cancelEdit"
            />
            <UButton icon="i-heroicons-check" size="xs" color="green" @click="saveAnomalyField('lookback_days')" :loading="savingAnomalyField === 'lookback_days'" />
            <UButton icon="i-heroicons-x-mark" size="xs" color="gray" variant="ghost" @click="cancelEdit" />
          </div>
          <div v-else class="flex items-center gap-2">
            <span class="text-sm font-mono text-gray-900 dark:text-white">{{ anomalyDetection.lookback_days || 30 }}</span>
            <UButton icon="i-heroicons-pencil" size="2xs" color="gray" variant="ghost" @click="startEdit('anomaly_lookback', anomalyDetection.lookback_days || 30)" />
          </div>
        </div>

        <!-- Include in Monthly Report Toggle -->
        <div class="flex items-center justify-between">
          <span class="text-sm text-gray-600 dark:text-gray-400">Include in Monthly Report</span>
          <UToggle
            :model-value="anomalyDetection.include_in_monthly_report !== false"
            :loading="savingAnomalyField === 'include_in_monthly_report'"
            @update:model-value="updateAnomalyField('include_in_monthly_report', $event)"
          />
        </div>
      </div>
      <div v-else class="text-gray-500 dark:text-gray-400 text-sm">Using default anomaly detection settings.</div>
    </div>

    <!-- Standalone Anomaly Alerts -->
    <div>
      <h4 class="text-sm font-medium text-gray-900 dark:text-white mb-3">Standalone Anomaly Alerts</h4>
      <div v-if="standaloneAnomalyAlerts" class="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg space-y-4">
        <!-- Enabled Toggle -->
        <div class="flex items-center justify-between">
          <span class="text-sm text-gray-600 dark:text-gray-400">Enabled</span>
          <UToggle
            :model-value="standaloneAnomalyAlerts.enabled === true"
            :loading="savingStandaloneField === 'enabled'"
            @update:model-value="updateStandaloneField('enabled', $event)"
          />
        </div>

        <!-- Min Impact -->
        <div class="flex items-center justify-between gap-2">
          <span class="text-sm text-gray-600 dark:text-gray-400">Min Impact</span>
          <div v-if="editingField === 'standalone_min_impact'" class="flex items-center gap-2">
            <div class="flex items-center">
              <span class="text-sm text-gray-500 mr-1">$</span>
              <UInput
                v-model.number="editValue"
                type="number"
                size="sm"
                class="w-28"
                :min="0"
                @keyup.enter="saveStandaloneField('min_impact_dollars')"
                @keyup.escape="cancelEdit"
              />
            </div>
            <UButton icon="i-heroicons-check" size="xs" color="green" @click="saveStandaloneField('min_impact_dollars')" :loading="savingStandaloneField === 'min_impact_dollars'" />
            <UButton icon="i-heroicons-x-mark" size="xs" color="gray" variant="ghost" @click="cancelEdit" />
          </div>
          <div v-else class="flex items-center gap-2">
            <span class="text-sm font-mono text-gray-900 dark:text-white">${{ (standaloneAnomalyAlerts.min_impact_dollars || 500).toLocaleString() }}</span>
            <UButton icon="i-heroicons-pencil" size="2xs" color="gray" variant="ghost" @click="startEdit('standalone_min_impact', standaloneAnomalyAlerts.min_impact_dollars || 500)" />
          </div>
        </div>

        <!-- Min Anomaly Score -->
        <div class="flex items-center justify-between gap-2">
          <span class="text-sm text-gray-600 dark:text-gray-400">Min Anomaly Score</span>
          <div v-if="editingField === 'standalone_score'" class="flex items-center gap-2">
            <UInput
              v-model.number="editValue"
              type="number"
              size="sm"
              class="w-20"
              :min="0"
              :max="100"
              @keyup.enter="saveStandaloneField('min_anomaly_score')"
              @keyup.escape="cancelEdit"
            />
            <UButton icon="i-heroicons-check" size="xs" color="green" @click="saveStandaloneField('min_anomaly_score')" :loading="savingStandaloneField === 'min_anomaly_score'" />
            <UButton icon="i-heroicons-x-mark" size="xs" color="gray" variant="ghost" @click="cancelEdit" />
          </div>
          <div v-else class="flex items-center gap-2">
            <span class="text-sm font-mono text-gray-900 dark:text-white">{{ standaloneAnomalyAlerts.min_anomaly_score || 70 }}</span>
            <UButton icon="i-heroicons-pencil" size="2xs" color="gray" variant="ghost" @click="startEdit('standalone_score', standaloneAnomalyAlerts.min_anomaly_score || 70)" />
          </div>
        </div>

        <!-- Max Per Month -->
        <div class="flex items-center justify-between gap-2">
          <span class="text-sm text-gray-600 dark:text-gray-400">Max Per Month</span>
          <div v-if="editingField === 'standalone_max'" class="flex items-center gap-2">
            <UInput
              v-model.number="editValue"
              type="number"
              size="sm"
              class="w-20"
              :min="1"
              @keyup.enter="saveStandaloneField('max_per_month')"
              @keyup.escape="cancelEdit"
            />
            <UButton icon="i-heroicons-check" size="xs" color="green" @click="saveStandaloneField('max_per_month')" :loading="savingStandaloneField === 'max_per_month'" />
            <UButton icon="i-heroicons-x-mark" size="xs" color="gray" variant="ghost" @click="cancelEdit" />
          </div>
          <div v-else class="flex items-center gap-2">
            <span class="text-sm font-mono text-gray-900 dark:text-white">{{ standaloneAnomalyAlerts.max_per_month || 3 }}</span>
            <UButton icon="i-heroicons-pencil" size="2xs" color="gray" variant="ghost" @click="startEdit('standalone_max', standaloneAnomalyAlerts.max_per_month || 3)" />
          </div>
        </div>
      </div>
      <div v-else class="text-gray-500 dark:text-gray-400 text-sm">Standalone anomaly alerts not configured.</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AnomalyDetectionConfig, StandaloneAnomalyAlertsConfig } from '@/shared/types/budget-alert-config'

defineProps<{
  anomalyDetection: AnomalyDetectionConfig | null
  standaloneAnomalyAlerts: StandaloneAnomalyAlertsConfig | null
}>()

const toast = useToast()
const { updateAnomalyDetection, updateStandaloneAnomalyAlerts } = useAlertConfig()

const editingField = ref<string | null>(null)
const editValue = ref<any>(null)
const savingAnomalyField = ref<string | null>(null)
const savingStandaloneField = ref<string | null>(null)

function startEdit(field: string, value: any) {
  editingField.value = field
  editValue.value = value
}

function cancelEdit() {
  editingField.value = null
  editValue.value = null
}

async function updateAnomalyField(field: string, value: any) {
  savingAnomalyField.value = field
  try {
    await updateAnomalyDetection({ [field]: value })
    toast.add({
      title: 'Saved',
      description: `${field.replace(/_/g, ' ')} updated`,
      color: 'green',
      timeout: 2000
    })
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || e.message || 'Failed to save',
      color: 'red'
    })
  } finally {
    savingAnomalyField.value = null
  }
}

async function saveAnomalyField(field: string) {
  if (editValue.value === null || editValue.value === undefined) return

  // Validate lookback days
  if (field === 'lookback_days') {
    if (editValue.value < 1 || editValue.value > 90) {
      toast.add({
        title: 'Invalid Value',
        description: 'Lookback days must be between 1 and 90',
        color: 'red'
      })
      return
    }
  }

  // Validate min_impact_dollars
  if (field === 'min_impact_dollars' && editValue.value < 0) {
    toast.add({
      title: 'Invalid Value',
      description: 'Min impact must be non-negative',
      color: 'red'
    })
    return
  }

  savingAnomalyField.value = field
  try {
    await updateAnomalyDetection({ [field]: editValue.value })
    toast.add({
      title: 'Saved',
      description: `${field.replace(/_/g, ' ')} updated`,
      color: 'green',
      timeout: 2000
    })
    cancelEdit()
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || e.message || 'Failed to save',
      color: 'red'
    })
  } finally {
    savingAnomalyField.value = null
  }
}

async function updateStandaloneField(field: string, value: any) {
  savingStandaloneField.value = field
  try {
    await updateStandaloneAnomalyAlerts({ [field]: value })
    toast.add({
      title: 'Saved',
      description: `${field.replace(/_/g, ' ')} updated`,
      color: 'green',
      timeout: 2000
    })
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || e.message || 'Failed to save',
      color: 'red'
    })
  } finally {
    savingStandaloneField.value = null
  }
}

async function saveStandaloneField(field: string) {
  if (editValue.value === null || editValue.value === undefined) return

  // Validate min_anomaly_score
  if (field === 'min_anomaly_score') {
    if (editValue.value < 0 || editValue.value > 100) {
      toast.add({
        title: 'Invalid Value',
        description: 'Anomaly score must be between 0 and 100',
        color: 'red'
      })
      return
    }
  }

  // Validate max_per_month
  if (field === 'max_per_month' && editValue.value < 1) {
    toast.add({
      title: 'Invalid Value',
      description: 'Max per month must be at least 1',
      color: 'red'
    })
    return
  }

  // Validate min_impact_dollars
  if (field === 'min_impact_dollars' && editValue.value < 0) {
    toast.add({
      title: 'Invalid Value',
      description: 'Min impact must be non-negative',
      color: 'red'
    })
    return
  }

  savingStandaloneField.value = field
  try {
    await updateStandaloneAnomalyAlerts({ [field]: editValue.value })
    toast.add({
      title: 'Saved',
      description: `${field.replace(/_/g, ' ')} updated`,
      color: 'green',
      timeout: 2000
    })
    cancelEdit()
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || e.message || 'Failed to save',
      color: 'red'
    })
  } finally {
    savingStandaloneField.value = null
  }
}
</script>
