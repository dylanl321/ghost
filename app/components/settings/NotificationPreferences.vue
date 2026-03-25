<template>
  <div class="space-y-4">
    <!-- Budget Alerts -->
    <UCard>
      <template #header>
        <div class="flex items-center gap-3">
          <div class="p-2 rounded-lg bg-yellow-50 dark:bg-yellow-900/20">
            <UIcon name="i-heroicons-currency-dollar" class="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
          </div>
          <div>
            <h3 class="text-base font-semibold text-gray-900 dark:text-white">Budget Alerts</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400">Notifications for cost thresholds and anomalies</p>
          </div>
        </div>
      </template>

      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <div class="font-medium text-gray-900 dark:text-white">Budget Threshold Warnings</div>
            <p class="text-sm text-gray-500 dark:text-gray-400">Alert when account exceeds 80%, 90%, or 100% of budget</p>
          </div>
          <UToggle v-model="prefs.budgetThresholdWarnings" />
        </div>

        <div class="flex items-center justify-between">
          <div>
            <div class="font-medium text-gray-900 dark:text-white">Daily Cost Anomaly Alerts</div>
            <p class="text-sm text-gray-500 dark:text-gray-400">Detect and alert on unusual daily spending patterns</p>
          </div>
          <UToggle v-model="prefs.dailyCostAnomalyAlerts" />
        </div>

        <div class="flex items-center justify-between">
          <div>
            <div class="font-medium text-gray-900 dark:text-white">Monthly Cost Summary</div>
            <p class="text-sm text-gray-500 dark:text-gray-400">Receive a monthly summary of your cloud spend</p>
          </div>
          <UToggle v-model="prefs.monthlyCostSummary" />
        </div>
      </div>
    </UCard>

    <!-- Security Alerts -->
    <UCard>
      <template #header>
        <div class="flex items-center gap-3">
          <div class="p-2 rounded-lg bg-red-50 dark:bg-red-900/20">
            <UIcon name="i-heroicons-shield-exclamation" class="w-5 h-5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h3 class="text-base font-semibold text-gray-900 dark:text-white">Security Alerts</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400">Notifications for security findings and compliance</p>
          </div>
        </div>
      </template>

      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <div class="font-medium text-gray-900 dark:text-white">Critical/High Severity Findings</div>
            <p class="text-sm text-gray-500 dark:text-gray-400">Alert on critical and high severity security findings</p>
          </div>
          <UToggle v-model="prefs.criticalSecurityFindings" />
        </div>

        <div class="flex items-center justify-between">
          <div>
            <div class="font-medium text-gray-900 dark:text-white">New Compliance Violations</div>
            <p class="text-sm text-gray-500 dark:text-gray-400">Notify when new compliance violations are detected</p>
          </div>
          <UToggle v-model="prefs.complianceViolations" />
        </div>

        <div class="flex items-center justify-between">
          <div>
            <div class="font-medium text-gray-900 dark:text-white">Security Score Changes</div>
            <p class="text-sm text-gray-500 dark:text-gray-400">Alert when your security score changes significantly</p>
          </div>
          <UToggle v-model="prefs.securityScoreChanges" />
        </div>
      </div>
    </UCard>

    <!-- Pipeline Alerts -->
    <UCard>
      <template #header>
        <div class="flex items-center gap-3">
          <div class="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20">
            <UIcon name="i-heroicons-arrow-path" class="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h3 class="text-base font-semibold text-gray-900 dark:text-white">Pipeline Alerts</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400">Notifications for pipeline and deployment events</p>
          </div>
        </div>
      </template>

      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <div class="font-medium text-gray-900 dark:text-white">Pipeline Failure Notifications</div>
            <p class="text-sm text-gray-500 dark:text-gray-400">Notify when a pipeline job fails</p>
          </div>
          <UToggle v-model="prefs.pipelineFailures" />
        </div>

        <div class="flex items-center justify-between">
          <div>
            <div class="font-medium text-gray-900 dark:text-white">Deployment Completion Alerts</div>
            <p class="text-sm text-gray-500 dark:text-gray-400">Notify when deployments complete successfully</p>
          </div>
          <UToggle v-model="prefs.deploymentCompletions" />
        </div>
      </div>
    </UCard>

    <!-- Email Digest -->
    <UCard>
      <template #header>
        <div class="flex items-center gap-3">
          <div class="p-2 rounded-lg bg-pink-50 dark:bg-pink-900/20">
            <UIcon name="i-heroicons-envelope" class="w-5 h-5 text-pink-600 dark:text-pink-400" />
          </div>
          <div>
            <h3 class="text-base font-semibold text-gray-900 dark:text-white">Email Digest</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400">Consolidated email summary of notifications</p>
          </div>
        </div>
      </template>

      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <div class="font-medium text-gray-900 dark:text-white">Enable Email Digest</div>
            <p class="text-sm text-gray-500 dark:text-gray-400">Receive a digest email summarizing your notifications</p>
          </div>
          <UToggle v-model="prefs.emailDigestEnabled" />
        </div>

        <div v-if="prefs.emailDigestEnabled" class="flex items-center justify-between">
          <div>
            <div class="font-medium text-gray-900 dark:text-white">Digest Frequency</div>
            <p class="text-sm text-gray-500 dark:text-gray-400">How often to receive your email digest</p>
          </div>
          <USelectMenu
            v-model="prefs.emailDigestFrequency"
            :options="digestFrequencyOptions"
            option-attribute="label"
            value-attribute="value"
            class="w-36"
          />
        </div>
      </div>
    </UCard>

    <!-- Save Button -->
    <div class="flex justify-end pt-2">
      <UButton
        color="emerald"
        :loading="saving"
        @click="save"
      >
        Save Notification Settings
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
const toast = useToast()
const { setPreference, getPreference } = useUserPreferences()

const defaultPrefs = {
  budgetThresholdWarnings: true,
  dailyCostAnomalyAlerts: true,
  monthlyCostSummary: true,
  criticalSecurityFindings: true,
  complianceViolations: true,
  securityScoreChanges: false,
  pipelineFailures: true,
  deploymentCompletions: false,
  emailDigestEnabled: true,
  emailDigestFrequency: 'weekly'
}

const prefs = reactive({ ...defaultPrefs })
const saving = ref(false)

const digestFrequencyOptions = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' }
]

onMounted(() => {
  const saved = getPreference('notificationPreferences', defaultPrefs)
  Object.assign(prefs, saved)
})

async function save() {
  saving.value = true
  try {
    const success = await setPreference('notificationPreferences', { ...prefs })
    if (success) {
      toast.add({
        title: 'Settings Saved',
        description: 'Your notification preferences have been updated.',
        color: 'green',
        icon: 'i-heroicons-check-circle'
      })
    } else {
      toast.add({
        title: 'Save Failed',
        description: 'Failed to save notification preferences. Please try again.',
        color: 'red',
        icon: 'i-heroicons-x-circle'
      })
    }
  } finally {
    saving.value = false
  }
}
</script>
