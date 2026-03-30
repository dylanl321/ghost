<template>
  <div class="space-y-6">
    <!-- Threshold Scaling -->
    <div>
      <h4 class="text-sm font-medium text-gray-900 dark:text-white mb-3">Threshold Scaling</h4>
      <div v-if="thresholdScaling" class="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg space-y-4">
        <!-- Enabled Toggle -->
        <div class="flex items-center justify-between">
          <span class="text-sm text-gray-600 dark:text-gray-400">Enabled</span>
          <UToggle
            :model-value="thresholdScaling.enabled !== false"
            :loading="savingField === 'enabled'"
            @update:model-value="updateThresholdField('enabled', $event)"
          />
        </div>

        <!-- Reference Budget -->
        <div class="flex items-center justify-between gap-2">
          <span class="text-sm text-gray-600 dark:text-gray-400">Reference Budget</span>
          <div v-if="editingField === 'reference_budget'" class="flex items-center gap-2">
            <div class="flex items-center">
              <span class="text-sm text-gray-500 mr-1">$</span>
              <UInput
                v-model.number="editValue"
                type="number"
                size="sm"
                class="w-28"
                :min="0"
                @keyup.enter="saveThresholdField('reference_budget')"
                @keyup.escape="cancelEdit"
              />
            </div>
            <UButton icon="i-heroicons-check" size="xs" color="green" @click="saveThresholdField('reference_budget')" :loading="savingField === 'reference_budget'" />
            <UButton icon="i-heroicons-x-mark" size="xs" color="gray" variant="ghost" @click="cancelEdit" />
          </div>
          <div v-else class="flex items-center gap-2">
            <span class="text-sm font-mono text-gray-900 dark:text-white">${{ (thresholdScaling.reference_budget || 1000).toLocaleString() }}</span>
            <UButton icon="i-heroicons-pencil" size="2xs" color="gray" variant="ghost" @click="startEdit('reference_budget', thresholdScaling.reference_budget || 1000)" />
          </div>
        </div>

        <!-- Scaling Factor -->
        <div class="flex items-center justify-between gap-2">
          <span class="text-sm text-gray-600 dark:text-gray-400">Scaling Factor</span>
          <div v-if="editingField === 'scaling_factor'" class="flex items-center gap-2">
            <UInput
              v-model.number="editValue"
              type="number"
              size="sm"
              class="w-20"
              :min="0"
              :step="0.1"
              @keyup.enter="saveThresholdField('scaling_factor')"
              @keyup.escape="cancelEdit"
            />
            <UButton icon="i-heroicons-check" size="xs" color="green" @click="saveThresholdField('scaling_factor')" :loading="savingField === 'scaling_factor'" />
            <UButton icon="i-heroicons-x-mark" size="xs" color="gray" variant="ghost" @click="cancelEdit" />
          </div>
          <div v-else class="flex items-center gap-2">
            <span class="text-sm font-mono text-gray-900 dark:text-white">{{ thresholdScaling.scaling_factor || 6 }}</span>
            <UButton icon="i-heroicons-pencil" size="2xs" color="gray" variant="ghost" @click="startEdit('scaling_factor', thresholdScaling.scaling_factor || 6)" />
          </div>
        </div>

        <!-- Min Threshold -->
        <div class="flex items-center justify-between gap-2">
          <span class="text-sm text-gray-600 dark:text-gray-400">Min Threshold</span>
          <div v-if="editingField === 'min_threshold'" class="flex items-center gap-2">
            <div class="flex items-center">
              <UInput
                v-model.number="editValue"
                type="number"
                size="sm"
                class="w-20"
                :min="100"
                @keyup.enter="saveThresholdField('min_threshold')"
                @keyup.escape="cancelEdit"
              />
              <span class="text-sm text-gray-500 ml-1">%</span>
            </div>
            <UButton icon="i-heroicons-check" size="xs" color="green" @click="saveThresholdField('min_threshold')" :loading="savingField === 'min_threshold'" />
            <UButton icon="i-heroicons-x-mark" size="xs" color="gray" variant="ghost" @click="cancelEdit" />
          </div>
          <div v-else class="flex items-center gap-2">
            <span class="text-sm font-mono text-gray-900 dark:text-white">{{ thresholdScaling.min_threshold || 101 }}%</span>
            <UButton icon="i-heroicons-pencil" size="2xs" color="gray" variant="ghost" @click="startEdit('min_threshold', thresholdScaling.min_threshold || 101)" />
          </div>
        </div>
      </div>
      <div v-else class="text-gray-500 dark:text-gray-400 text-sm">Using default threshold scaling.</div>
    </div>

    <!-- Pace Alerting -->
    <div>
      <h4 class="text-sm font-medium text-gray-900 dark:text-white mb-3">Pace Alerting</h4>
      <div v-if="paceAlerting" class="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg space-y-4">
        <div v-if="paceAlerting.severity_thresholds">
          <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">Severity Score Thresholds</p>
          <div class="flex flex-wrap gap-2">
            <span
              v-for="(score, level) in paceAlerting.severity_thresholds"
              :key="level"
              class="text-xs px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded"
            >
              {{ level }}: {{ score }}
            </span>
          </div>
        </div>
        <div v-if="paceAlerting.minimum_overspend">
          <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">Minimum Overspend</p>
          <p class="text-sm font-mono">
            ${{ paceAlerting.minimum_overspend.dollars }} or {{ paceAlerting.minimum_overspend.percent_of_budget }}%
          </p>
        </div>
        <div v-if="paceAlerting.milestones && paceAlerting.milestones.length > 0">
          <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">Milestones</p>
          <div class="space-y-1">
            <div
              v-for="(milestone, idx) in paceAlerting.milestones"
              :key="idx"
              class="text-xs font-mono"
            >
              {{ milestone.threshold }}% consumed @ {{ milestone.pace_ratio }}x pace -> {{ milestone.level }}
            </div>
          </div>
        </div>
        <p class="text-xs text-gray-400 italic">Pace alerting requires advanced editing (future feature)</p>
      </div>
      <div v-else class="text-gray-500 dark:text-gray-400 text-sm">Using default pace alerting settings.</div>
    </div>

    <!-- ML Config -->
    <div>
      <h4 class="text-sm font-medium text-gray-900 dark:text-white mb-3">ML Forecasting</h4>
      <div v-if="mlConfig" class="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg space-y-4">
        <!-- Enabled Toggle -->
        <div class="flex items-center justify-between">
          <span class="text-sm text-gray-600 dark:text-gray-400">Enabled</span>
          <UToggle
            :model-value="mlConfig.enabled !== false"
            :loading="savingMlField === 'enabled'"
            @update:model-value="updateMlField('enabled', $event)"
          />
        </div>

        <!-- Forecast Days -->
        <div class="flex items-center justify-between gap-2">
          <span class="text-sm text-gray-600 dark:text-gray-400">Forecast Days</span>
          <div v-if="editingField === 'forecast_days'" class="flex items-center gap-2">
            <UInput
              v-model.number="editValue"
              type="number"
              size="sm"
              class="w-20"
              :min="1"
              :max="90"
              @keyup.enter="saveMlField('forecast_days')"
              @keyup.escape="cancelEdit"
            />
            <UButton icon="i-heroicons-check" size="xs" color="green" @click="saveMlField('forecast_days')" :loading="savingMlField === 'forecast_days'" />
            <UButton icon="i-heroicons-x-mark" size="xs" color="gray" variant="ghost" @click="cancelEdit" />
          </div>
          <div v-else class="flex items-center gap-2">
            <span class="text-sm font-mono text-gray-900 dark:text-white">{{ mlConfig.forecast_days || 30 }}</span>
            <UButton icon="i-heroicons-pencil" size="2xs" color="gray" variant="ghost" @click="startEdit('forecast_days', mlConfig.forecast_days || 30)" />
          </div>
        </div>
      </div>
      <div v-else class="text-gray-500 dark:text-gray-400 text-sm">Using default ML forecasting settings.</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ThresholdScalingConfig, PaceAlertingConfig, MlConfig } from '#shared/types/budget-alert-config'

const props = defineProps<{
  thresholdScaling: ThresholdScalingConfig | null
  paceAlerting: PaceAlertingConfig | null
  mlConfig?: MlConfig | null
}>()

const toast = useToast()
const { updateThresholdScaling, updateMlConfig } = useAlertConfig()

const editingField = ref<string | null>(null)
const editValue = ref<any>(null)
const savingField = ref<string | null>(null)
const savingMlField = ref<string | null>(null)

function startEdit(field: string, value: any) {
  editingField.value = field
  editValue.value = value
}

function cancelEdit() {
  editingField.value = null
  editValue.value = null
}

async function updateThresholdField(field: string, value: any) {
  savingField.value = field
  try {
    await updateThresholdScaling({ [field]: value })
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
    savingField.value = null
  }
}

async function saveThresholdField(field: string) {
  if (editValue.value === null || editValue.value === undefined) return

  // Validate reference_budget
  if (field === 'reference_budget' && editValue.value < 0) {
    toast.add({
      title: 'Invalid Value',
      description: 'Reference budget must be non-negative',
      color: 'red'
    })
    return
  }

  // Validate scaling_factor
  if (field === 'scaling_factor' && editValue.value < 0) {
    toast.add({
      title: 'Invalid Value',
      description: 'Scaling factor must be non-negative',
      color: 'red'
    })
    return
  }

  // Validate min_threshold
  if (field === 'min_threshold' && editValue.value < 100) {
    toast.add({
      title: 'Invalid Value',
      description: 'Min threshold must be at least 100%',
      color: 'red'
    })
    return
  }

  savingField.value = field
  try {
    await updateThresholdScaling({ [field]: editValue.value })
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
    savingField.value = null
  }
}

async function updateMlField(field: string, value: any) {
  savingMlField.value = field
  try {
    await updateMlConfig({ [field]: value })
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
    savingMlField.value = null
  }
}

async function saveMlField(field: string) {
  if (editValue.value === null || editValue.value === undefined) return

  // Validate forecast_days
  if (field === 'forecast_days') {
    if (editValue.value < 1 || editValue.value > 90) {
      toast.add({
        title: 'Invalid Value',
        description: 'Forecast days must be between 1 and 90',
        color: 'red'
      })
      return
    }
  }

  savingMlField.value = field
  try {
    await updateMlConfig({ [field]: editValue.value })
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
    savingMlField.value = null
  }
}
</script>
