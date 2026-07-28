<template>
  <UModal v-model="isOpen" fullscreen :prevent-close="saving">
    <UCard :ui="{ base: 'h-full flex flex-col', body: { base: 'flex-1 overflow-hidden p-0' } }">
      <template #header>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              {{ isEdit ? 'Edit Dataset Report' : 'Create Dataset Report' }}
            </h3>
          </div>
          <div class="flex items-center gap-2">
             <UButton
              color="gray"
              variant="ghost"
              icon="i-heroicons-x-mark"
              @click="close"
              :disabled="saving"
            />
          </div>
        </div>
      </template>

      <div class="flex h-full">
        <!-- Sidebar Navigation -->
        <div class="w-64 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 flex flex-col">
          <nav class="flex-1 p-4 space-y-1">
            <button
              v-for="(section, index) in sections"
              :key="section.id"
              @click="currentSection = index"
              :class="[
                'w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2',
                currentSection === index
                  ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              ]"
            >
              <UIcon :name="section.icon" class="w-5 h-5" />
              {{ section.label }}
              <UIcon
                v-if="section.isValid"
                name="i-heroicons-check-circle"
                class="w-4 h-4 ml-auto text-green-500"
              />
            </button>
          </nav>
        </div>

        <!-- Main Content Area -->
        <div class="flex-1 flex flex-col min-w-0 bg-white dark:bg-gray-900">
          <!-- Form Content -->
          <div class="flex-1 overflow-y-auto p-6">
            
            <!-- 1. General Info -->
            <div v-show="currentSection === 0" class="max-w-2xl space-y-6">
              <h2 class="text-xl font-semibold mb-4">Report Details</h2>
              <UFormGroup label="Report Name" required>
                <UInput
                  v-model="form.reportName"
                  placeholder="e.g., Monthly Compliance Audit"
                  :disabled="saving"
                />
              </UFormGroup>
              <UFormGroup label="Description">
                <UTextarea
                  v-model="form.description"
                  placeholder="What is this report for?"
                  :rows="3"
                  :disabled="saving"
                />
              </UFormGroup>
              <UFormGroup label="Output Format">
                <div class="flex gap-3">
                  <UButton
                    v-for="format in formats"
                    :key="format.value"
                    :color="form.reportConfig.format === format.value ? 'blue' : 'gray'"
                    :variant="form.reportConfig.format === format.value ? 'solid' : 'outline'"
                    @click="form.reportConfig.format = format.value"
                    :disabled="saving"
                  >
                    <UIcon :name="format.icon" class="w-4 h-4 mr-2" />
                    {{ format.label }}
                  </UButton>
                </div>
              </UFormGroup>
              <UFormGroup label="AI Insights">
                <UToggle v-model="form.reportConfig.enableAI" />
                <span class="ml-2 text-sm text-gray-600 dark:text-gray-400">Include AI-generated executive summary</span>
              </UFormGroup>
            </div>

            <!-- 2. Datasets -->
            <div v-show="currentSection === 1" class="max-w-4xl space-y-6">
              <h2 class="text-xl font-semibold mb-4">Select Data Sources</h2>
              <p class="text-sm text-gray-500 mb-6">Choose which AWS datasets to include in this report.</p>
              
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div 
                    v-for="dataset in datasetOptions"
                    :key="dataset.key"
                    :class="[
                      'p-4 rounded-lg border-2 cursor-pointer transition-all',
                      form.reportConfig.datasets[dataset.key].enabled
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    ]"
                    @click="toggleDataset(dataset.key)"
                 >
                    <div class="flex items-start justify-between">
                      <div class="flex items-center gap-3">
                        <div class="p-2 rounded-md bg-white dark:bg-gray-800 shadow-sm">
                          <UIcon :name="dataset.icon" class="w-6 h-6 text-gray-700 dark:text-gray-200" />
                        </div>
                        <div>
                          <h3 class="font-semibold">{{ dataset.label }}</h3>
                          <p class="text-xs text-gray-500">{{ dataset.description }}</p>
                        </div>
                      </div>
                      <UToggle :model-value="form.reportConfig.datasets[dataset.key].enabled" />
                    </div>
                 </div>
              </div>

              <!-- Filters for selected datasets -->
              <div v-if="hasAnyDatasetSelected" class="mt-8 pt-8 border-t border-gray-100 dark:border-gray-800">
                <h3 class="text-lg font-medium mb-4">Configure Filters</h3>
                
                <div v-if="form.reportConfig.datasets.config.enabled" class="mb-6 p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                  <h4 class="font-medium text-sm text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                    <UIcon name="i-heroicons-cog-6-tooth" class="w-4 h-4" /> AWS Config Filters
                  </h4>
                  <ConfigFilters v-model="form.reportConfig.datasets.config.filters" />
                </div>

                <div v-if="form.reportConfig.datasets.securityHub.enabled" class="mb-6 p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                   <h4 class="font-medium text-sm text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                    <UIcon name="i-heroicons-shield-check" class="w-4 h-4" /> Security Hub Filters
                  </h4>
                  <SecurityHubFilters v-model="form.reportConfig.datasets.securityHub.filters" />
                </div>

                <div v-if="form.reportConfig.datasets.cloudtrail.enabled" class="mb-6 p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                   <h4 class="font-medium text-sm text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                    <UIcon name="i-heroicons-document-text" class="w-4 h-4" /> CloudTrail Filters
                  </h4>
                  <CloudTrailFilters v-model="form.reportConfig.datasets.cloudtrail.filters" />
                </div>

                <div v-if="form.reportConfig.datasets.entraUsers?.enabled" class="mb-6 p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                  <h4 class="font-medium text-sm text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                    <UIcon name="i-heroicons-users" class="w-4 h-4" /> Entra ID User Filters
                  </h4>
                  <EntraUsersFilters v-model="form.reportConfig.datasets.entraUsers.filters" />
                </div>
              </div>
            </div>

            <!-- 3. Accounts -->
            <div v-show="currentSection === 2" class="max-w-4xl space-y-6">
              <h2 class="text-xl font-semibold mb-4">Target Accounts</h2>
              <p class="text-sm text-gray-500 mb-4">Select the AWS accounts to pull data from.</p>
              <DatasetAccountSelector
                v-model="form.reportConfig.accounts"
                :disabled="saving"
              />
            </div>

            <!-- 4. Preview & Schedule -->
            <div v-show="currentSection === 3" class="max-w-4xl h-full flex flex-col">
               <div class="mb-6">
                 <h2 class="text-xl font-semibold">Preview & Delivery</h2>
                 <p class="text-sm text-gray-500">Review your configuration and choose how to run this report.</p>
               </div>

               <!-- Preview Card -->
               <div class="flex-1 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6 overflow-y-auto">
                  <div class="space-y-4">
                    <h3 class="text-sm font-medium text-gray-500 uppercase tracking-wider">Report Configuration Summary</h3>
                    
                    <div class="grid grid-cols-2 gap-6">
                      <div>
                        <label class="text-xs text-gray-500 block mb-1">Name</label>
                        <p class="font-medium">{{ form.reportName || 'Untitled Report' }}</p>
                      </div>
                      <div>
                        <label class="text-xs text-gray-500 block mb-1">Format</label>
                         <UBadge color="gray" variant="soft">{{ form.reportConfig.format.toUpperCase() }}</UBadge>
                      </div>
                      <div>
                        <label class="text-xs text-gray-500 block mb-1">Datasets</label>
                        <div class="flex gap-2 flex-wrap">
                           <UBadge v-if="form.reportConfig.datasets.config.enabled" color="blue" variant="subtle">Config</UBadge>
                           <UBadge v-if="form.reportConfig.datasets.securityHub.enabled" color="red" variant="subtle">Security Hub</UBadge>
                           <UBadge v-if="form.reportConfig.datasets.cloudtrail.enabled" color="purple" variant="subtle">CloudTrail</UBadge>
                           <UBadge v-if="form.reportConfig.datasets.entraUsers?.enabled" color="green" variant="subtle">Entra Users</UBadge>
                           <span v-if="!hasAnyDatasetSelected" class="text-gray-400 text-sm italic">None selected</span>
                        </div>
                      </div>
                      <div>
                        <label class="text-xs text-gray-500 block mb-1">Accounts</label>
                        <p class="font-medium">{{ form.reportConfig.accounts.length > 0 ? `${form.reportConfig.accounts.length} selected` : 'All Accounts' }}</p>
                      </div>
                    </div>

                    <!-- Pseudo Data Preview -->
                     <div class="mt-8">
                        <label class="text-xs text-gray-500 block mb-2">Data Preview (Mock)</label>
                        <div class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800">
                          <table class="w-full text-sm text-left">
                            <thead class="bg-gray-50 dark:bg-gray-700/50 text-gray-500">
                              <tr>
                                <th class="px-4 py-2">Resource ID</th>
                                <th class="px-4 py-2">Account</th>
                                <th class="px-4 py-2">Region</th>
                                <th class="px-4 py-2">Status</th>
                              </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-100 dark:divide-gray-700/50">
                              <tr class="opacity-50">
                                <td class="px-4 py-2 font-mono text-xs">i-0a1b2c3d4e5f</td>
                                <td class="px-4 py-2">123456789012</td>
                                <td class="px-4 py-2">us-east-1</td>
                                <td class="px-4 py-2"><span class="text-green-500">Compliant</span></td>
                              </tr>
                              <tr class="opacity-50">
                                <td class="px-4 py-2 font-mono text-xs">sg-08971234</td>
                                <td class="px-4 py-2">123456789012</td>
                                <td class="px-4 py-2">us-west-2</td>
                                <td class="px-4 py-2"><span class="text-red-500">Non-Compliant</span></td>
                              </tr>
                               <tr>
                                <td colspan="4" class="px-4 py-3 text-center text-gray-400 text-xs italic bg-gray-50/50 dark:bg-gray-800/50">
                                  Preview data is simulated based on schema. Run report to generate actual results.
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                     </div>
                  </div>
               </div>

               <!-- Delivery Options -->
               <div class="grid grid-cols-2 gap-6 border-t border-gray-200 dark:border-gray-700 pt-6">
                 <div>
                   <div class="flex items-center gap-2 mb-4">
                     <URadio v-model="deliveryMode" value="run_now" label="Run Immediately" />
                     <UBadge size="xs" color="blue" variant="subtle">One-time</UBadge>
                   </div>
                   <p class="text-sm text-gray-500 ml-6 mb-2">Generate this report right now and download the results.</p>
                 </div>

                 <div>
                   <div class="flex items-center gap-2 mb-4">
                     <URadio v-model="deliveryMode" value="schedule" label="Create Schedule" />
                     <UBadge size="xs" color="green" variant="subtle">Recurring</UBadge>
                   </div>
                   
                   <div v-if="deliveryMode === 'schedule'" class="ml-6 space-y-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
                      <UFormGroup label="Frequency">
                        <USelectMenu v-model="form.schedule.frequency" :options="frequencyOptions" value-attribute="value" option-attribute="label" size="sm" />
                      </UFormGroup>
                      <UFormGroup label="Recipients">
                         <UInput v-model="recipientsText" placeholder="email@example.com" size="sm" />
                      </UFormGroup>
                   </div>
                 </div>
               </div>
            </div>

          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex items-center justify-between">
          <div class="text-sm text-gray-500">
             {{ isEdit ? 'Editing existing report' : 'New report configuration' }}
          </div>
          <div class="flex items-center gap-2">
            <UButton color="gray" variant="ghost" @click="close">Cancel</UButton>
            
            <UButton 
              v-if="currentSection < 3"
              color="gray" 
              variant="solid" 
              @click="currentSection++"
            >
              Next: {{ sections[currentSection + 1]?.label || '' }}
            </UButton>

            <UButton 
              v-else
              color="blue" 
              @click="handleExecute" 
              :loading="saving"
              :icon="deliveryMode === 'schedule' ? 'i-heroicons-calendar' : 'i-heroicons-play'"
            >
              {{ deliveryMode === 'schedule' ? (isEdit ? 'Update Schedule' : 'Create Schedule') : 'Run Report Now' }}
            </UButton>
          </div>
        </div>
      </template>
    </UCard>
  </UModal>
</template>

<script setup lang="ts">
import type { ScheduledReport } from '#shared/types/scheduled-reports'
import type { DatasetReportConfig, DatasetSelection } from '#shared/types/dataset-reports'

type CompleteDatasetSelection = {
  [K in keyof Required<DatasetSelection>]: NonNullable<DatasetSelection[K]>
}
type CompleteDatasetReportConfig = Omit<DatasetReportConfig, 'datasets'> & { datasets: CompleteDatasetSelection }

const logger = createLogger('DatasetReportFormModal')

const props = defineProps<{
  report?: ScheduledReport | null
}>()

const emit = defineEmits<{
  saved: []
}>()

const model = defineModel<boolean>({ default: false })

// State
const isOpen = computed({
  get: () => model.value,
  set: (val) => model.value = val
})

const currentSection = ref(0)
const saving = ref(false)
const deliveryMode = ref<'run_now' | 'schedule'>('run_now')

const form = reactive<{
  reportName: string
  description: string
  reportConfig: CompleteDatasetReportConfig
  schedule: {
    frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly'
    dayOfWeek?: number
    dayOfMonth?: number
    monthOfQuarter?: number
    time: string
    timezone: string
  }
  recipients: string[]
  emailTemplate: {
    subject: string
    body: string
    isCustom: boolean
  }
}>({
  reportName: '',
  description: '',
  reportConfig: {
    accounts: [],
    datasets: {
      config: { enabled: false, filters: {} },
      securityHub: { enabled: false, filters: {} },
      cloudtrail: { enabled: false, filters: {} },
      entraUsers: { enabled: false, filters: {} }
    },
    format: 'pdf',
    enableAI: true
  },
  schedule: {
    frequency: 'weekly',
    dayOfWeek: 1, // Monday
    time: '09:00',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  },
  recipients: [],
  emailTemplate: {
    subject: 'AWS Dataset Report - {{reportName}}',
    body: '',
    isCustom: false
  }
})

// Computed
const isEdit = computed(() => !!props.report?.reportId)

const hasAnyDatasetSelected = computed(() => {
  return form.reportConfig.datasets.config?.enabled ||
         form.reportConfig.datasets.securityHub?.enabled ||
         form.reportConfig.datasets.cloudtrail?.enabled ||
         form.reportConfig.datasets.entraUsers?.enabled
})

const recipientsText = computed({
  get: () => form.recipients.join(', '),
  set: (val: string) => {
    form.recipients = val.split(',').map(e => e.trim()).filter(Boolean)
  }
})

const sections = computed(() => [
  { 
    id: 'general', 
    label: 'General Info', 
    icon: 'i-heroicons-information-circle',
    isValid: form.reportName.trim() !== ''
  },
  { 
    id: 'datasets', 
    label: 'Data Sources', 
    icon: 'i-heroicons-circle-stack',
    isValid: hasAnyDatasetSelected.value
  },
  { 
    id: 'accounts', 
    label: 'Target Accounts', 
    icon: 'i-heroicons-users',
    isValid: true // Assuming 'all' is default if empty
  },
  { 
    id: 'preview', 
    label: 'Preview & Run', 
    icon: 'i-heroicons-play-circle',
    isValid: true
  }
])

const datasetOptions = [
  { key: 'config', label: 'AWS Config', description: 'Resources & Compliance', icon: 'i-heroicons-cog-6-tooth' },
  { key: 'securityHub', label: 'Security Hub', description: 'Findings & Vulnerabilities', icon: 'i-heroicons-shield-check' },
  { key: 'cloudtrail', label: 'CloudTrail', description: 'Audit Logs & Activity', icon: 'i-heroicons-document-text' },
  { key: 'entraUsers', label: 'Entra Users', description: 'User Access & Roles', icon: 'i-heroicons-users' }
] as const

const formats = [
  { value: 'pdf', label: 'PDF', icon: 'i-heroicons-document' },
  { value: 'csv', label: 'CSV', icon: 'i-heroicons-table-cells' },
  { value: 'json', label: 'JSON', icon: 'i-heroicons-code-bracket' },
  { value: 'xlsx', label: 'Excel', icon: 'i-heroicons-document-chart-bar' }
] as const

const frequencyOptions = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' }
]

// Methods
function toggleDataset(key: keyof CompleteDatasetSelection) {
  const dataset = form.reportConfig.datasets[key]
  dataset.enabled = !dataset.enabled
}

function close() {
  if (!saving.value) {
    isOpen.value = false
    setTimeout(() => {
      currentSection.value = 0
      resetForm()
    }, 300)
  }
}

async function handleExecute() {
  if (!form.reportName.trim() || !hasAnyDatasetSelected.value) {
    useToast().add({ title: 'Incomplete report', description: 'Add a report name and select at least one dataset', color: 'red' })
    return
  }

  if (deliveryMode.value === 'schedule' && form.recipients.length === 0) {
    useToast().add({ title: 'Recipient required', description: 'Add at least one delivery email address', color: 'red' })
    return
  }

  if (deliveryMode.value === 'schedule' && form.reportConfig.datasets.entraUsers.enabled) {
    useToast().add({
      title: 'Interactive dataset',
      description: 'Entra Users currently requires an interactive session and cannot be scheduled',
      color: 'orange'
    })
    return
  }

  saving.value = true
  try {
    const { createReport, updateReport } = useDatasetReports()

    if (deliveryMode.value === 'run_now') {
      await downloadReportNow()
    } else {
      // Standard Schedule Logic
      if (isEdit.value && props.report) {
        await updateReport(props.report.reportId, form)
      } else {
        await createReport(form)
      }
    }

    emit('saved')
    close()
  } catch (error: any) {
    logger.error('Failed to save report:', error)
    useToast().add({
      title: 'Report failed',
      description: error?.data?.message || error.message || 'Unable to process report',
      color: 'red'
    })
  } finally {
    saving.value = false
  }
}

function resetForm() {
  form.reportName = ''
  form.description = ''
  form.reportConfig = {
    accounts: [],
    datasets: {
      config: { enabled: false, filters: {} },
      securityHub: { enabled: false, filters: {} },
      cloudtrail: { enabled: false, filters: {} },
      entraUsers: { enabled: false, filters: {} }
    },
    format: 'pdf',
    enableAI: true
  }
  form.recipients = []
  currentSection.value = 0
  deliveryMode.value = 'run_now'
}

watch(() => props.report, (report) => {
  if (report) {
    form.reportName = report.reportName
    form.description = report.description || ''
    form.reportConfig = structuredClone(report.reportConfig) as CompleteDatasetReportConfig
    form.schedule = structuredClone(report.schedule)
    form.recipients = [...(report.recipients || [])]
    form.emailTemplate = structuredClone(report.emailTemplate || form.emailTemplate)
    deliveryMode.value = 'schedule'
  }
}, { immediate: true })

async function downloadReportNow() {
  const response = await fetch('/api/dataset-reports/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accountIds: form.reportConfig.accounts,
      reportConfig: form.reportConfig
    })
  })

  if (!response.ok) {
    throw new Error(await response.text() || 'Report export failed')
  }

  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `dataset-report-${new Date().toISOString().slice(0, 10)}.${form.reportConfig.format}`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
</script>
