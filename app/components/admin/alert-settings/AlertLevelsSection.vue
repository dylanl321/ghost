<template>
  <div>
    <!-- Header with Add button -->
    <div class="flex items-center justify-between mb-4">
      <p class="text-sm text-gray-500 dark:text-gray-400">
        Alert thresholds determine when budget alerts are triggered. Thresholds must be in ascending order.
      </p>
      <UButton
        icon="i-heroicons-plus"
        size="sm"
        @click="openCreateModal"
        :disabled="availableLevels.length === 0"
      >
        Add Level
      </UButton>
    </div>

    <!-- Alert Levels Table -->
    <div v-if="levels && levels.length > 0">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-gray-200 dark:border-gray-700">
              <th class="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Level</th>
              <th class="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Threshold</th>
              <th class="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Min Dollars</th>
              <th class="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Max/Month</th>
              <th class="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Intervals</th>
              <th class="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Color</th>
              <th class="text-right py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="level in levels" :key="level.level" class="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <td class="py-2 px-3">
                <span class="font-medium" :style="{ color: level.color }">{{ level.level }}</span>
              </td>
              <td class="py-2 px-3 font-mono">{{ level.threshold }}%</td>
              <td class="py-2 px-3 font-mono">${{ (level.min_dollars || 0).toLocaleString() }}</td>
              <td class="py-2 px-3">{{ level.max_per_month || 1 }}</td>
              <td class="py-2 px-3 font-mono text-xs">{{ (level.intervals || [0]).join(', ') }} days</td>
              <td class="py-2 px-3">
                <div class="flex items-center gap-2">
                  <div class="w-4 h-4 rounded" :style="{ backgroundColor: level.color }"></div>
                  <span class="font-mono text-xs">{{ level.color }}</span>
                </div>
              </td>
              <td class="py-2 px-3 text-right">
                <div class="flex items-center justify-end gap-1">
                  <UButton
                    icon="i-heroicons-pencil"
                    size="2xs"
                    color="gray"
                    variant="ghost"
                    @click="openEditModal(level)"
                  />
                  <UButton
                    icon="i-heroicons-trash"
                    size="2xs"
                    color="red"
                    variant="ghost"
                    @click="confirmDelete(level)"
                  />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <div v-else class="text-gray-500 dark:text-gray-400 text-sm">
      No alert levels configured.
    </div>

    <!-- Edit/Create Modal -->
    <UModal v-model="showModal">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-medium">{{ isEditing ? 'Edit Alert Level' : 'Create Alert Level' }}</h3>
            <UButton
              icon="i-heroicons-x-mark"
              color="gray"
              variant="ghost"
              @click="showModal = false"
            />
          </div>
        </template>

        <div class="space-y-4">
          <!-- Level Selector (only for create) -->
          <UFormGroup label="Level" required :error="formErrors.level">
            <USelectMenu
              v-model="form.level"
              :options="isEditing ? [form.level] : availableLevels"
              :disabled="isEditing"
              placeholder="Select level"
            />
            <template #hint>
              <span class="text-xs">Valid levels: INFO, WARNING, CRITICAL, ESCALATION</span>
            </template>
          </UFormGroup>

          <!-- Threshold -->
          <UFormGroup label="Threshold (%)" required :error="formErrors.threshold">
            <UInput
              v-model.number="form.threshold"
              type="number"
              :min="100"
              placeholder="115"
            />
            <template #hint>
              <span class="text-xs">Burn rate percentage (e.g., 115 = 15% over pace)</span>
            </template>
          </UFormGroup>

          <!-- Color -->
          <UFormGroup label="Color" required :error="formErrors.color">
            <div class="flex gap-2">
              <input
                type="color"
                v-model="form.color"
                class="w-12 h-10 rounded border border-gray-300 dark:border-gray-600 cursor-pointer"
              />
              <UInput v-model="form.color" placeholder="#FF0000" class="flex-1" />
            </div>
          </UFormGroup>

          <!-- Min Dollars -->
          <UFormGroup label="Min Dollars" :error="formErrors.min_dollars">
            <UInput
              v-model.number="form.min_dollars"
              type="number"
              :min="0"
              placeholder="0"
            />
            <template #hint>
              <span class="text-xs">Minimum dollar overspend to trigger alert</span>
            </template>
          </UFormGroup>

          <!-- Max Per Month -->
          <UFormGroup label="Max Per Month" :error="formErrors.max_per_month">
            <UInput
              v-model.number="form.max_per_month"
              type="number"
              :min="1"
              placeholder="1"
            />
            <template #hint>
              <span class="text-xs">Maximum alerts per account per month</span>
            </template>
          </UFormGroup>

          <!-- Intervals -->
          <UFormGroup label="Intervals (days)" :error="formErrors.intervals">
            <UInput
              v-model="intervalsInput"
              placeholder="0, 1, 3"
            />
            <template #hint>
              <span class="text-xs">Comma-separated days between alerts (e.g., 0, 1, 3)</span>
            </template>
          </UFormGroup>
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="gray" variant="ghost" @click="showModal = false">
              Cancel
            </UButton>
            <UButton @click="saveAlertLevel" :loading="saving">
              {{ isEditing ? 'Save Changes' : 'Create' }}
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Delete Confirmation Modal -->
    <UModal v-model="showDeleteModal">
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-exclamation-triangle" class="w-5 h-5 text-red-500" />
            <h3 class="text-lg font-medium">Delete Alert Level</h3>
          </div>
        </template>

        <p class="text-gray-600 dark:text-gray-400">
          Are you sure you want to delete the <strong :style="{ color: levelToDelete?.color }">{{ levelToDelete?.level }}</strong> alert level?
        </p>
        <p class="text-sm text-red-500 mt-2">
          This action cannot be undone. Recipients configured for this level may need to be updated.
        </p>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="gray" variant="ghost" @click="showDeleteModal = false">
              Cancel
            </UButton>
            <UButton color="red" @click="deleteLevel" :loading="deleting">
              Delete
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import type { AlertLevelConfig } from '#shared/types/budget-alert-config'

const props = defineProps<{
  levels: AlertLevelConfig[] | null
}>()

const toast = useToast()
const { updateAlertLevel, createAlertLevel, deleteAlertLevel } = useAlertConfig()

const ALL_LEVELS = ['INFO', 'WARNING', 'CRITICAL', 'ESCALATION']

// Modal state
const showModal = ref(false)
const showDeleteModal = ref(false)
const isEditing = ref(false)
const saving = ref(false)
const deleting = ref(false)
const levelToDelete = ref<AlertLevelConfig | null>(null)

// Form state
const form = ref({
  level: '',
  threshold: 100,
  color: '#3B82F6',
  min_dollars: 0,
  max_per_month: 1,
  intervals: [0]
})

const intervalsInput = ref('0')

const formErrors = ref<Record<string, string>>({})

// Compute available levels (ones not already configured)
const availableLevels = computed(() => {
  const existingLevels = props.levels?.map(l => l.level) || []
  return ALL_LEVELS.filter(l => !existingLevels.includes(l))
})

function resetForm() {
  form.value = {
    level: '',
    threshold: 100,
    color: '#3B82F6',
    min_dollars: 0,
    max_per_month: 1,
    intervals: [0]
  }
  intervalsInput.value = '0'
  formErrors.value = {}
}

function openCreateModal() {
  resetForm()
  isEditing.value = false
  if (availableLevels.value.length > 0) {
    form.value.level = availableLevels.value[0]
  }
  showModal.value = true
}

function openEditModal(level: AlertLevelConfig) {
  resetForm()
  isEditing.value = true
  form.value = {
    level: level.level,
    threshold: level.threshold,
    color: level.color,
    min_dollars: level.min_dollars || 0,
    max_per_month: level.max_per_month || 1,
    intervals: level.intervals || [0]
  }
  intervalsInput.value = (level.intervals || [0]).join(', ')
  showModal.value = true
}

function confirmDelete(level: AlertLevelConfig) {
  levelToDelete.value = level
  showDeleteModal.value = true
}

function validateForm(): boolean {
  formErrors.value = {}

  if (!form.value.level) {
    formErrors.value.level = 'Level is required'
  }

  if (form.value.threshold < 100) {
    formErrors.value.threshold = 'Threshold must be at least 100%'
  }

  if (!form.value.color || !/^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/.test(form.value.color)) {
    formErrors.value.color = 'Invalid hex color format'
  }

  if (form.value.min_dollars < 0) {
    formErrors.value.min_dollars = 'Min dollars must be non-negative'
  }

  if (form.value.max_per_month < 1) {
    formErrors.value.max_per_month = 'Max per month must be at least 1'
  }

  // Parse and validate intervals
  try {
    const intervals = intervalsInput.value.split(',').map(s => {
      const num = parseInt(s.trim(), 10)
      if (isNaN(num) || num < 0) throw new Error('Invalid interval')
      return num
    })
    form.value.intervals = intervals
  } catch (e) {
    formErrors.value.intervals = 'Invalid intervals format'
  }

  return Object.keys(formErrors.value).length === 0
}

async function saveAlertLevel() {
  if (!validateForm()) return

  saving.value = true
  try {
    if (isEditing.value) {
      await updateAlertLevel(form.value.level, {
        threshold: form.value.threshold,
        color: form.value.color,
        min_dollars: form.value.min_dollars,
        max_per_month: form.value.max_per_month,
        intervals: form.value.intervals
      })
      toast.add({
        title: 'Alert Level Updated',
        description: `${form.value.level} has been updated`,
        color: 'green',
        timeout: 2000
      })
    } else {
      await createAlertLevel({
        level: form.value.level,
        threshold: form.value.threshold,
        color: form.value.color,
        min_dollars: form.value.min_dollars,
        max_per_month: form.value.max_per_month,
        intervals: form.value.intervals
      })
      toast.add({
        title: 'Alert Level Created',
        description: `${form.value.level} has been created`,
        color: 'green',
        timeout: 2000
      })
    }
    showModal.value = false
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || e.message || 'Failed to save alert level',
      color: 'red'
    })
  } finally {
    saving.value = false
  }
}

async function deleteLevel() {
  if (!levelToDelete.value) return

  deleting.value = true
  try {
    await deleteAlertLevel(levelToDelete.value.level)
    toast.add({
      title: 'Alert Level Deleted',
      description: `${levelToDelete.value.level} has been deleted`,
      color: 'green',
      timeout: 2000
    })
    showDeleteModal.value = false
    levelToDelete.value = null
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.data?.message || e.message || 'Failed to delete alert level',
      color: 'red'
    })
  } finally {
    deleting.value = false
  }
}
</script>
