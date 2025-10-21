<template>
  <UModal v-model="isOpen" :ui="{ width: 'sm:max-w-lg' }" @close="handleClose">
    <UCard
      :ui="{
        ring: '',
        divide: 'divide-y divide-gray-200 dark:divide-gray-700',
        body: { base: 'p-6', padding: '' },
        header: { base: 'py-4 px-6' },
        footer: { base: 'py-4 px-6' }
      }"
    >
      <template #header>
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
            Schedule Report
          </h3>
          <UButton
            color="gray"
            variant="ghost"
            icon="i-heroicons-x-mark-20-solid"
            size="sm"
            @click="handleClose"
          />
        </div>
      </template>

      <div class="space-y-6">
        <!-- Current Configuration Info -->
        <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div class="flex items-start gap-3">
            <Icon name="i-heroicons-information-circle" class="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div class="space-y-2 text-sm">
              <p class="font-medium text-blue-900 dark:text-blue-100">
                Your current configuration will be used:
              </p>
              <ul class="text-blue-800 dark:text-blue-200 space-y-1">
                <li v-if="config.accounts.length > 0">
                  • <strong>Accounts:</strong> {{ config.accounts.length }} selected
                </li>
                <li v-else>
                  • <strong>Accounts:</strong> All accounts (org-wide)
                </li>
                <li>• <strong>Timeframe:</strong> {{ getTimeframeLabel(config.timeframe) }}</li>
                <li>• <strong>Data Mode:</strong> {{ config.dataMode === 'billable' ? 'Billable (Raw AWS)' : 'Proforma (With savings)' }}</li>
                <li>• <strong>Format:</strong> {{ config.format.toUpperCase() }}</li>
              </ul>
            </div>
          </div>
        </div>

        <!-- Report Name -->
        <UFormGroup label="Report Name" required>
          <UInput
            v-model="form.reportName"
            placeholder="e.g., Weekly Team Cost Report"
            :error="errors.reportName"
          />
        </UFormGroup>

        <!-- Schedule Configuration -->
        <div class="space-y-4">
          <h4 class="text-sm font-semibold text-gray-900 dark:text-white">
            Delivery Schedule
          </h4>

          <UFormGroup label="Frequency" required>
            <USelect
              v-model="form.schedule.frequency"
              :options="frequencyOptions"
              @change="handleFrequencyChange"
            />
          </UFormGroup>

          <!-- Day of Week (Weekly) -->
          <UFormGroup
            v-if="form.schedule.frequency === 'weekly'"
            label="Day of Week"
            required
          >
            <USelect
              v-model="form.schedule.dayOfWeek"
              :options="dayOfWeekOptions"
            />
          </UFormGroup>

          <!-- Day of Month (Monthly) -->
          <UFormGroup
            v-if="form.schedule.frequency === 'monthly'"
            label="Day of Month"
            required
          >
            <USelect
              v-model="form.schedule.dayOfMonth"
              :options="dayOfMonthOptions"
            />
          </UFormGroup>

          <!-- Month of Quarter (Quarterly) -->
          <UFormGroup
            v-if="form.schedule.frequency === 'quarterly'"
            label="Month of Quarter"
            required
          >
            <USelect
              v-model="form.schedule.monthOfQuarter"
              :options="monthOfQuarterOptions"
            />
          </UFormGroup>

          <div class="grid grid-cols-2 gap-4">
            <UFormGroup label="Time" required>
              <UInput
                v-model="form.schedule.time"
                type="time"
                placeholder="09:00"
              />
            </UFormGroup>

            <UFormGroup label="Timezone" required>
              <USelect
                v-model="form.schedule.timezone"
                :options="timezoneOptions"
              />
            </UFormGroup>
          </div>

          <!-- Next Run Preview -->
          <div v-if="nextRunPreview" class="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            <p class="text-sm text-gray-700 dark:text-gray-300">
              <Icon name="i-heroicons-clock" class="w-4 h-4 inline mr-1" />
              <strong>Next delivery:</strong> {{ nextRunPreview }}
            </p>
          </div>
        </div>

        <!-- Recipient Info -->
        <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
          <div class="flex items-start gap-2">
            <Icon name="i-heroicons-envelope" class="w-5 h-5 text-gray-500 dark:text-gray-400 mt-0.5" />
            <div class="flex-1">
              <p class="text-sm font-medium text-gray-900 dark:text-white mb-1">
                Recipient{{ isAdmin ? 's' : '' }}
              </p>
              <p class="text-sm text-gray-600 dark:text-gray-400">
                {{ isAdmin
                  ? 'Reports will be sent to your email. Use Advanced Settings to add more recipients.'
                  : `Reports will be sent to ${userEmail}`
                }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex justify-between items-center">
          <!-- Advanced Settings Button (Admin Only) -->
          <UButton
            v-if="isAdmin"
            color="gray"
            variant="ghost"
            icon="i-heroicons-cog-6-tooth"
            @click="openAdvancedSettings"
          >
            Advanced Settings
          </UButton>
          <div v-else></div>

          <div class="flex gap-2">
            <UButton
              color="gray"
              variant="ghost"
              @click="handleClose"
            >
              Cancel
            </UButton>
            <UButton
              color="blue"
              @click="handleSubmit"
              :loading="submitting"
              :disabled="!canSubmit"
            >
              Schedule Report
            </UButton>
          </div>
        </div>
      </template>
    </UCard>
  </UModal>
</template>

<script setup lang="ts">
import type { ReportConfig, ScheduleConfig, CreateReportRequest } from '~/shared/types/scheduled-reports'

const props = defineProps<{
  modelValue: boolean
  config: ReportConfig
  isAdmin?: boolean
  userEmail?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  submit: [data: CreateReportRequest]
  openAdvanced: [config: ReportConfig, schedule: ScheduleConfig, reportName: string]
}>()

const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const submitting = ref(false)
const errors = ref<Record<string, string>>({})

// Form data
const form = ref({
  reportName: '',
  schedule: {
    frequency: 'weekly' as any,
    dayOfWeek: 1,
    dayOfMonth: 1,
    monthOfQuarter: 1,
    time: '09:00',
    timezone: 'America/New_York'
  }
})

// Options
const frequencyOptions = [
  { label: 'Daily', value: 'daily' },
  { label: 'Weekly', value: 'weekly' },
  { label: 'Monthly', value: 'monthly' },
  { label: 'Quarterly', value: 'quarterly' }
]

const dayOfWeekOptions = [
  { label: 'Monday', value: 1 },
  { label: 'Tuesday', value: 2 },
  { label: 'Wednesday', value: 3 },
  { label: 'Thursday', value: 4 },
  { label: 'Friday', value: 5 },
  { label: 'Saturday', value: 6 },
  { label: 'Sunday', value: 0 }
]

const dayOfMonthOptions = Array.from({ length: 31 }, (_, i) => ({
  label: `${i + 1}`,
  value: i + 1
}))

const monthOfQuarterOptions = [
  { label: 'First month', value: 1 },
  { label: 'Second month', value: 2 },
  { label: 'Third month', value: 3 }
]

const timezoneOptions = [
  { label: 'Eastern Time (ET)', value: 'America/New_York' },
  { label: 'Central Time (CT)', value: 'America/Chicago' },
  { label: 'Mountain Time (MT)', value: 'America/Denver' },
  { label: 'Pacific Time (PT)', value: 'America/Los_Angeles' },
  { label: 'Alaska Time (AKT)', value: 'America/Anchorage' },
  { label: 'Hawaii Time (HST)', value: 'Pacific/Honolulu' },
  { label: 'UTC', value: 'UTC' }
]

const canSubmit = computed(() => {
  return form.value.reportName.trim().length > 0 && form.value.schedule.time.length > 0
})

const nextRunPreview = computed(() => {
  const { frequency, dayOfWeek, dayOfMonth, time, timezone } = form.value.schedule
  const [hours, minutes] = time.split(':').map(Number)

  const now = new Date()
  let next = new Date()

  switch (frequency) {
    case 'daily':
      next.setHours(hours, minutes, 0, 0)
      if (next <= now) {
        next.setDate(next.getDate() + 1)
      }
      break
    case 'weekly':
      next.setHours(hours, minutes, 0, 0)
      const currentDay = next.getDay()
      const daysUntilNext = (dayOfWeek! - currentDay + 7) % 7
      next.setDate(next.getDate() + (daysUntilNext || 7))
      break
    case 'monthly':
      next.setDate(dayOfMonth!)
      next.setHours(hours, minutes, 0, 0)
      if (next <= now) {
        next.setMonth(next.getMonth() + 1)
      }
      break
    case 'quarterly':
      next.setHours(hours, minutes, 0, 0)
      next.setMonth(next.getMonth() + 3)
      break
  }

  return next.toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  })
})

function getTimeframeLabel(timeframe: string): string {
  const labels: Record<string, string> = {
    'thisMonth': 'This Month',
    'lastMonth': 'Last Month',
    'last3Months': 'Last 3 Months',
    'last6Months': 'Last 6 Months',
    'last12Months': 'Last 12 Months',
    'yearToDate': 'Year to Date',
    'lastYear': 'Last Year'
  }
  return labels[timeframe] || timeframe
}

function handleFrequencyChange() {
  // Reset day-specific fields when frequency changes
  if (form.value.schedule.frequency === 'daily') {
    form.value.schedule.dayOfWeek = undefined
    form.value.schedule.dayOfMonth = undefined
    form.value.schedule.monthOfQuarter = undefined
  }
}

function handleClose() {
  isOpen.value = false
  setTimeout(() => {
    resetForm()
  }, 300)
}

function resetForm() {
  form.value = {
    reportName: '',
    schedule: {
      frequency: 'weekly',
      dayOfWeek: 1,
      dayOfMonth: 1,
      monthOfQuarter: 1,
      time: '09:00',
      timezone: 'America/New_York'
    }
  }
  errors.value = {}
}

function handleSubmit() {
  // Validate
  if (!form.value.reportName.trim()) {
    errors.value.reportName = 'Report name is required'
    return
  }

  // Ensure we have a valid email
  if (!props.userEmail || !props.userEmail.trim()) {
    errors.value.reportName = 'User email not available. Please refresh the page.'
    return
  }

  const data: CreateReportRequest = {
    reportName: form.value.reportName,
    reportConfig: props.config,
    schedule: form.value.schedule,
    recipients: [props.userEmail],
    emailTemplate: {
      subject: 'Your Scheduled AWS Cost Report - {{reportName}}',
      body: '', // Will use default pre-canned template
      isCustom: false
    }
  }

  submitting.value = true
  emit('submit', data)
}

function openAdvancedSettings() {
  emit('openAdvanced', props.config, form.value.schedule, form.value.reportName)
  handleClose()
}

// Reset submitting when modal closes
watch(isOpen, (value) => {
  if (!value) {
    submitting.value = false
  }
})
</script>
