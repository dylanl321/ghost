<template>
  <UModal v-model="isOpen" :ui="{ width: 'sm:max-w-2xl' }" @close="handleClose">
    <UCard
      :ui="{
        ring: '',
        divide: 'divide-y divide-gray-200 dark:divide-gray-700',
        body: { base: 'p-0', padding: '' },
        header: { base: 'py-4 px-6' },
        footer: { base: 'py-4 px-6' }
      }"
    >
      <template #header>
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
            {{ editingReport ? 'Edit Report' : 'Create Scheduled Report' }}
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

      <!-- Step Progress -->
      <div class="px-6 pt-6 pb-4">
        <div class="flex items-center justify-between">
          <div
            v-for="(step, index) in steps"
            :key="index"
            class="flex items-center flex-1"
          >
            <div class="flex flex-col items-center flex-1">
              <div
                :class="[
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors',
                  currentStep >= index
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                ]"
              >
                {{ index + 1 }}
              </div>
              <span
                :class="[
                  'text-xs mt-1',
                  currentStep >= index
                    ? 'text-gray-900 dark:text-white font-medium'
                    : 'text-gray-500 dark:text-gray-400'
                ]"
              >
                {{ step }}
              </span>
            </div>
            <div
              v-if="index < steps.length - 1"
              :class="[
                'h-0.5 flex-1 transition-colors',
                currentStep > index
                  ? 'bg-blue-600'
                  : 'bg-gray-200 dark:bg-gray-700'
              ]"
            />
          </div>
        </div>
      </div>

      <!-- Form Content -->
      <div class="px-6 py-6 space-y-6">
        <!-- Step 1: Basic Info -->
        <div v-show="currentStep === 0" class="space-y-4">
          <UFormGroup label="Report Name" required>
            <UInput
              v-model="form.reportName"
              placeholder="e.g., Monthly Cost Summary"
              :error="errors.reportName"
            />
          </UFormGroup>

          <UFormGroup label="Description" help="Optional description of this report">
            <UTextarea
              v-model="form.description"
              placeholder="Brief description of what this report covers"
              :rows="3"
            />
          </UFormGroup>
        </div>

        <!-- Step 2: Report Configuration -->
        <div v-show="currentStep === 1" class="space-y-4">
          <UFormGroup label="Accounts" help="Leave empty for org-wide report">
            <USelectMenu
              v-model="form.accounts"
              :options="accountOptions"
              multiple
              placeholder="Select accounts (or leave empty for all)"
              value-attribute="id"
              option-attribute="name"
            />
          </UFormGroup>

          <UFormGroup label="Timeframe" required>
            <USelect
              v-model="form.reportConfig.timeframe"
              :options="timeframeOptions"
            />
          </UFormGroup>

          <UFormGroup label="Data Mode" required>
            <div class="flex gap-4">
              <URadio
                v-model="form.reportConfig.dataMode"
                value="billable"
                label="Billable (Raw AWS costs)"
              />
              <URadio
                v-model="form.reportConfig.dataMode"
                value="proforma"
                label="Proforma (With savings plans)"
              />
            </div>
          </UFormGroup>

          <UFormGroup label="Report Format" required>
            <div class="grid grid-cols-2 gap-3">
              <URadio
                v-for="format in formatOptions"
                :key="format.value"
                v-model="form.reportConfig.format"
                :value="format.value"
                :label="format.label"
              />
            </div>
          </UFormGroup>

          <UFormGroup label="Include in Report">
            <div class="space-y-2">
              <UCheckbox
                v-model="form.reportConfig.includeServices"
                label="Include service breakdown"
              />
              <UCheckbox
                v-model="form.reportConfig.includeHistorical"
                label="Include historical trends"
              />
              <UCheckbox
                v-model="form.reportConfig.includeForecast"
                label="Include cost forecast"
              />
            </div>
          </UFormGroup>
        </div>

        <!-- Step 3: Schedule -->
        <div v-show="currentStep === 2" class="space-y-4">
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

          <!-- Next Run Preview -->
          <div v-if="nextRunPreview" class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div class="flex items-start gap-2">
              <Icon name="i-heroicons-information-circle" class="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
              <div>
                <p class="text-sm font-medium text-blue-900 dark:text-blue-100">
                  Next scheduled run:
                </p>
                <p class="text-sm text-blue-700 dark:text-blue-300 mt-1">
                  {{ nextRunPreview }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- Step 4: Email Settings -->
        <div v-show="currentStep === 3" class="space-y-4">
          <UFormGroup
            label="Recipients"
            :help="isAdmin ? 'Enter email addresses separated by commas' : 'Reports will be sent to your email'"
            required
          >
            <UInput
              v-if="isAdmin"
              v-model="recipientsInput"
              placeholder="user1@example.com, user2@example.com"
              :error="errors.recipients"
            />
            <UInput
              v-else
              :model-value="userEmail"
              readonly
              disabled
            />
          </UFormGroup>

          <UFormGroup label="Email Subject">
            <UInput
              v-model="form.emailTemplate.subject"
              placeholder="Your AWS Cost Report - {{reportName}}"
            />
            <template #help>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Available variables: {{reportName}}, {{timeframe}}, {{totalCost}}, {{date}}
              </p>
            </template>
          </UFormGroup>

          <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
            <p class="text-sm text-gray-600 dark:text-gray-400">
              <Icon name="i-heroicons-information-circle" class="w-4 h-4 inline mr-1" />
              A professional email template will be used with your report attached.
            </p>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex justify-between">
          <UButton
            v-if="currentStep > 0"
            color="gray"
            variant="ghost"
            @click="prevStep"
          >
            Back
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
              v-if="currentStep < steps.length - 1"
              color="blue"
              @click="nextStep"
              :disabled="!canProceed"
            >
              Next
            </UButton>
            <UButton
              v-else
              color="blue"
              @click="handleSubmit"
              :loading="submitting"
              :disabled="!canProceed"
            >
              {{ editingReport ? 'Save Changes' : 'Create Report' }}
            </UButton>
          </div>
        </div>
      </template>
    </UCard>
  </UModal>
</template>

<script setup lang="ts">
import type { ScheduledReport, CreateReportRequest, UpdateReportRequest } from '~/shared/types/scheduled-reports'

const props = defineProps<{
  modelValue: boolean
  editingReport?: ScheduledReport | null
  isAdmin?: boolean
  userEmail?: string
  initialConfig?: Partial<CreateReportRequest>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  submit: [data: CreateReportRequest | UpdateReportRequest]
}>()

const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const steps = ['Basic Info', 'Configuration', 'Schedule', 'Email']
const currentStep = ref(0)
const submitting = ref(false)
const errors = ref<Record<string, string>>({})

// Form data
const form = ref({
  reportName: '',
  description: '',
  accounts: [] as string[],
  reportConfig: {
    timeframe: 'lastMonth' as any,
    dataMode: 'billable' as any,
    viewType: 'summary',
    format: 'pdf' as any,
    includeServices: true,
    includeHistorical: true,
    includeForecast: false
  },
  schedule: {
    frequency: 'monthly' as any,
    dayOfWeek: 1,
    dayOfMonth: 1,
    monthOfQuarter: 1,
    time: '09:00',
    timezone: 'America/New_York'
  },
  emailTemplate: {
    subject: 'Your AWS Cost Report - {{reportName}}',
    body: '',
    isCustom: false
  }
})

const recipientsInput = ref('')

// Options
const accountOptions = ref<Array<{ id: string; name: string }>>([])
const timeframeOptions = [
  { label: 'This Month', value: 'thisMonth' },
  { label: 'Last Month', value: 'lastMonth' },
  { label: 'Last 3 Months', value: 'last3Months' },
  { label: 'Last 6 Months', value: 'last6Months' },
  { label: 'Last 12 Months', value: 'last12Months' },
  { label: 'Year to Date', value: 'yearToDate' },
  { label: 'Last Year', value: 'lastYear' }
]

const frequencyOptions = [
  { label: 'Daily', value: 'daily' },
  { label: 'Weekly', value: 'weekly' },
  { label: 'Monthly', value: 'monthly' },
  { label: 'Quarterly', value: 'quarterly' }
]

const formatOptions = [
  { label: 'PDF', value: 'pdf' },
  { label: 'Excel (XLSX)', value: 'xlsx' },
  { label: 'CSV', value: 'csv' },
  { label: 'JSON', value: 'json' }
]

const dayOfWeekOptions = [
  { label: 'Sunday', value: 0 },
  { label: 'Monday', value: 1 },
  { label: 'Tuesday', value: 2 },
  { label: 'Wednesday', value: 3 },
  { label: 'Thursday', value: 4 },
  { label: 'Friday', value: 5 },
  { label: 'Saturday', value: 6 }
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

const nextRunPreview = computed(() => {
  // Calculate and display next run time based on current settings
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
      // Simplified quarterly calculation
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

const canProceed = computed(() => {
  switch (currentStep.value) {
    case 0:
      return form.value.reportName.trim().length > 0
    case 1:
      return true
    case 2:
      return form.value.schedule.time.length > 0
    case 3:
      if (props.isAdmin) {
        return recipientsInput.value.trim().length > 0
      }
      return true
    default:
      return true
  }
})

function nextStep() {
  if (currentStep.value < steps.length - 1) {
    currentStep.value++
  }
}

function prevStep() {
  if (currentStep.value > 0) {
    currentStep.value--
  }
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
    currentStep.value = 0
    resetForm()
  }, 300)
}

function resetForm() {
  form.value = {
    reportName: '',
    description: '',
    accounts: [],
    reportConfig: {
      timeframe: 'lastMonth',
      dataMode: 'billable',
      viewType: 'summary',
      format: 'pdf',
      includeServices: true,
      includeHistorical: true,
      includeForecast: false
    },
    schedule: {
      frequency: 'monthly',
      dayOfWeek: 1,
      dayOfMonth: 1,
      monthOfQuarter: 1,
      time: '09:00',
      timezone: 'America/New_York'
    },
    emailTemplate: {
      subject: 'Your AWS Cost Report - {{reportName}}',
      body: '',
      isCustom: false
    }
  }
  recipientsInput.value = ''
  errors.value = {}
}

function handleSubmit() {
  // Parse recipients
  const recipients = props.isAdmin
    ? recipientsInput.value.split(',').map(e => e.trim()).filter(Boolean)
    : [props.userEmail || '']

  const data: CreateReportRequest = {
    reportName: form.value.reportName,
    description: form.value.description || undefined,
    reportConfig: {
      accounts: form.value.accounts,
      ...form.value.reportConfig
    },
    schedule: form.value.schedule,
    recipients,
    emailTemplate: form.value.emailTemplate
  }

  submitting.value = true
  emit('submit', data)
}

// Load editing data or initial config if provided
watch(() => [props.editingReport, props.initialConfig] as const, ([report, initial]) => {
  if (report) {
    // Editing existing report
    form.value = {
      reportName: report.reportName,
      description: report.description || '',
      accounts: report.reportConfig.accounts,
      reportConfig: report.reportConfig,
      schedule: report.schedule,
      emailTemplate: report.emailTemplate
    }
    recipientsInput.value = report.recipients.join(', ')
  } else if (initial) {
    // Pre-filling from initial config
    if (initial.reportName) form.value.reportName = initial.reportName
    if (initial.description) form.value.description = initial.description
    if (initial.reportConfig) {
      form.value.accounts = initial.reportConfig.accounts || []
      Object.assign(form.value.reportConfig, initial.reportConfig)
    }
    if (initial.schedule) {
      Object.assign(form.value.schedule, initial.schedule)
    }
    if (initial.emailTemplate) {
      Object.assign(form.value.emailTemplate, initial.emailTemplate)
    }
    if (initial.recipients) {
      recipientsInput.value = initial.recipients.join(', ')
    }
  }
}, { immediate: true })

// Reset submitting when modal closes
watch(isOpen, (value) => {
  if (!value) {
    submitting.value = false
  }
})
</script>
