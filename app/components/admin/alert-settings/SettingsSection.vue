<template>
  <div v-if="settings" class="space-y-4">
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <!-- Email Settings -->
      <div class="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
        <h4 class="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">Email Settings</h4>
        <div class="space-y-3">
          <!-- Email Domain -->
          <div class="flex items-center justify-between gap-2">
            <label class="text-sm text-gray-600 dark:text-gray-400 shrink-0">Email Domain</label>
            <div v-if="editingField === 'email_domain'" class="flex items-center gap-2">
              <UInput
                v-model="editValue"
                size="sm"
                class="w-40"
                placeholder="example.com"
                @keyup.enter="saveField('email_domain')"
                @keyup.escape="cancelEdit"
              />
              <UButton icon="i-heroicons-check" size="xs" color="green" @click="saveField('email_domain')" :loading="savingField === 'email_domain'" />
              <UButton icon="i-heroicons-x-mark" size="xs" color="gray" variant="ghost" @click="cancelEdit" />
            </div>
            <div v-else class="flex items-center gap-2">
              <span class="text-sm font-mono text-gray-900 dark:text-white">{{ settings.email_domain || 'Not set' }}</span>
              <UButton icon="i-heroicons-pencil" size="2xs" color="gray" variant="ghost" @click="startEdit('email_domain', settings.email_domain)" />
            </div>
          </div>

          <!-- From Email -->
          <div class="flex items-center justify-between gap-2">
            <label class="text-sm text-gray-600 dark:text-gray-400 shrink-0">From Email</label>
            <div v-if="editingField === 'from_email'" class="flex items-center gap-2">
              <UInput
                v-model="editValue"
                type="email"
                size="sm"
                class="w-48"
                placeholder="alerts@example.com"
                @keyup.enter="saveField('from_email')"
                @keyup.escape="cancelEdit"
              />
              <UButton icon="i-heroicons-check" size="xs" color="green" @click="saveField('from_email')" :loading="savingField === 'from_email'" />
              <UButton icon="i-heroicons-x-mark" size="xs" color="gray" variant="ghost" @click="cancelEdit" />
            </div>
            <div v-else class="flex items-center gap-2">
              <span class="text-sm font-mono text-gray-900 dark:text-white">{{ settings.from_email || 'Not set' }}</span>
              <UButton icon="i-heroicons-pencil" size="2xs" color="gray" variant="ghost" @click="startEdit('from_email', settings.from_email)" />
            </div>
          </div>

          <!-- From Name -->
          <div class="flex items-center justify-between gap-2">
            <label class="text-sm text-gray-600 dark:text-gray-400 shrink-0">From Name</label>
            <div v-if="editingField === 'from_name'" class="flex items-center gap-2">
              <UInput
                v-model="editValue"
                size="sm"
                class="w-48"
                placeholder="Budget Alert System"
                @keyup.enter="saveField('from_name')"
                @keyup.escape="cancelEdit"
              />
              <UButton icon="i-heroicons-check" size="xs" color="green" @click="saveField('from_name')" :loading="savingField === 'from_name'" />
              <UButton icon="i-heroicons-x-mark" size="xs" color="gray" variant="ghost" @click="cancelEdit" />
            </div>
            <div v-else class="flex items-center gap-2">
              <span class="text-sm text-gray-900 dark:text-white">{{ settings.from_name || 'Budget Alert System' }}</span>
              <UButton icon="i-heroicons-pencil" size="2xs" color="gray" variant="ghost" @click="startEdit('from_name', settings.from_name || 'Budget Alert System')" />
            </div>
          </div>
        </div>
      </div>

      <!-- Time & Thresholds -->
      <div class="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
        <h4 class="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">Time & Thresholds</h4>
        <div class="space-y-3">
          <!-- Timezone -->
          <div class="flex items-center justify-between gap-2">
            <label class="text-sm text-gray-600 dark:text-gray-400 shrink-0">Timezone</label>
            <div v-if="editingField === 'timezone'" class="flex items-center gap-2">
              <USelectMenu
                v-model="editValue"
                :options="timezoneOptions"
                size="sm"
                class="w-48"
              />
              <UButton icon="i-heroicons-check" size="xs" color="green" @click="saveField('timezone')" :loading="savingField === 'timezone'" />
              <UButton icon="i-heroicons-x-mark" size="xs" color="gray" variant="ghost" @click="cancelEdit" />
            </div>
            <div v-else class="flex items-center gap-2">
              <span class="text-sm text-gray-900 dark:text-white">{{ settings.timezone || 'America/New_York' }}</span>
              <UButton icon="i-heroicons-pencil" size="2xs" color="gray" variant="ghost" @click="startEdit('timezone', settings.timezone || 'America/New_York')" />
            </div>
          </div>

          <!-- Business Hours -->
          <div class="flex items-center justify-between gap-2">
            <label class="text-sm text-gray-600 dark:text-gray-400 shrink-0">Business Hours</label>
            <div v-if="editingField === 'business_hours'" class="flex items-center gap-2">
              <UInput
                v-model.number="businessHoursStart"
                type="number"
                size="sm"
                class="w-16"
                :min="0"
                :max="23"
              />
              <span class="text-sm text-gray-500">to</span>
              <UInput
                v-model.number="businessHoursEnd"
                type="number"
                size="sm"
                class="w-16"
                :min="0"
                :max="23"
              />
              <UButton icon="i-heroicons-check" size="xs" color="green" @click="saveBusinessHours" :loading="savingField === 'business_hours'" />
              <UButton icon="i-heroicons-x-mark" size="xs" color="gray" variant="ghost" @click="cancelEdit" />
            </div>
            <div v-else class="flex items-center gap-2">
              <span class="text-sm text-gray-900 dark:text-white">{{ formatHour(settings.business_hours_start ?? 8) }} - {{ formatHour(settings.business_hours_end ?? 18) }}</span>
              <UButton icon="i-heroicons-pencil" size="2xs" color="gray" variant="ghost" @click="startBusinessHoursEdit" />
            </div>
          </div>

          <!-- Min Budget -->
          <div class="flex items-center justify-between gap-2">
            <label class="text-sm text-gray-600 dark:text-gray-400 shrink-0">Min Budget</label>
            <div v-if="editingField === 'min_budget'" class="flex items-center gap-2">
              <div class="flex items-center">
                <span class="text-sm text-gray-500 mr-1">$</span>
                <UInput
                  v-model.number="editValue"
                  type="number"
                  size="sm"
                  class="w-28"
                  :min="0"
                  @keyup.enter="saveField('min_budget')"
                  @keyup.escape="cancelEdit"
                />
              </div>
              <UButton icon="i-heroicons-check" size="xs" color="green" @click="saveField('min_budget')" :loading="savingField === 'min_budget'" />
              <UButton icon="i-heroicons-x-mark" size="xs" color="gray" variant="ghost" @click="cancelEdit" />
            </div>
            <div v-else class="flex items-center gap-2">
              <span class="text-sm text-gray-900 dark:text-white">${{ (settings.min_budget || 1000).toLocaleString() }}</span>
              <UButton icon="i-heroicons-pencil" size="2xs" color="gray" variant="ghost" @click="startEdit('min_budget', settings.min_budget || 1000)" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="text-xs text-gray-500 dark:text-gray-400">
      Last updated: {{ settings.updated_at ? new Date(settings.updated_at).toLocaleString() : 'Unknown' }}
      {{ settings.updated_by ? 'by ' + settings.updated_by : '' }}
    </div>
  </div>
  <div v-else class="text-gray-500 dark:text-gray-400 text-sm">
    No settings configuration found. Default values will be used.
  </div>
</template>

<script setup lang="ts">
import type { SettingsConfig } from '#shared/types/budget-alert-config'

const props = defineProps<{
  settings: SettingsConfig | null
}>()

const toast = useToast()
const { updateSettings } = useAlertConfig()

const editingField = ref<string | null>(null)
const editValue = ref<any>(null)
const savingField = ref<string | null>(null)

// Business hours need separate refs since they're two fields
const businessHoursStart = ref<number>(8)
const businessHoursEnd = ref<number>(18)

const timezoneOptions = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Anchorage',
  'Pacific/Honolulu',
  'UTC'
]

function formatHour(hour: number): string {
  const period = hour >= 12 ? 'PM' : 'AM'
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
  return `${displayHour}:00 ${period}`
}

function startEdit(field: string, value: any) {
  editingField.value = field
  editValue.value = value
}

function startBusinessHoursEdit() {
  editingField.value = 'business_hours'
  businessHoursStart.value = props.settings?.business_hours_start ?? 8
  businessHoursEnd.value = props.settings?.business_hours_end ?? 18
}

function cancelEdit() {
  editingField.value = null
  editValue.value = null
}

async function saveField(field: string) {
  if (editValue.value === null || editValue.value === undefined) return

  // Validate email format for email fields
  if (field === 'from_email') {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(editValue.value)) {
      toast.add({
        title: 'Invalid Email',
        description: 'Please enter a valid email address',
        color: 'red'
      })
      return
    }
  }

  // Validate min_budget
  if (field === 'min_budget' && editValue.value < 0) {
    toast.add({
      title: 'Invalid Value',
      description: 'Minimum budget must be non-negative',
      color: 'red'
    })
    return
  }

  savingField.value = field
  try {
    await updateSettings({ [field]: editValue.value })
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

async function saveBusinessHours() {
  // Validate business hours
  if (businessHoursStart.value < 0 || businessHoursStart.value > 23 ||
      businessHoursEnd.value < 0 || businessHoursEnd.value > 23) {
    toast.add({
      title: 'Invalid Hours',
      description: 'Hours must be between 0 and 23',
      color: 'red'
    })
    return
  }

  if (businessHoursStart.value >= businessHoursEnd.value) {
    toast.add({
      title: 'Invalid Hours',
      description: 'Start hour must be before end hour',
      color: 'red'
    })
    return
  }

  savingField.value = 'business_hours'
  try {
    await updateSettings({
      business_hours_start: businessHoursStart.value,
      business_hours_end: businessHoursEnd.value
    })
    toast.add({
      title: 'Saved',
      description: 'Business hours updated',
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
</script>
