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
            <p class="text-sm text-gray-500 dark:text-gray-400">In-app notifications for cost thresholds and anomalies</p>
          </div>
        </div>
      </template>

      <div class="space-y-2">
        <p class="text-sm text-gray-600 dark:text-gray-400">
          Budget alert notifications appear automatically in your notification inbox when cost thresholds are triggered.
        </p>
        <div class="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <UIcon name="i-heroicons-envelope" class="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
          <p class="text-sm text-blue-700 dark:text-blue-300">
            Budget alert emails are managed by the external alert system. Email recipients and thresholds are configured in
            <NuxtLink to="/admin/costs/budget-alerts" class="underline font-medium">Admin &gt; Budget Alerts</NuxtLink>.
          </p>
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
            <p class="text-sm text-gray-500 dark:text-gray-400">In-browser and email notifications for security findings</p>
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
            <p class="text-sm text-gray-500 dark:text-gray-400">In-browser and email notifications for pipeline events</p>
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
            <p class="text-sm text-gray-500 dark:text-gray-400">Consolidated email summary of your notifications</p>
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

        <template v-if="prefs.emailDigestEnabled">
          <div class="flex items-center justify-between">
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

          <div class="flex items-center justify-between">
            <div>
              <div class="font-medium text-gray-900 dark:text-white">Preferred Delivery Time</div>
              <p class="text-sm text-gray-500 dark:text-gray-400">What time to receive your digest (in your timezone)</p>
            </div>
            <USelectMenu
              v-model="prefs.emailDigestTime"
              :options="hourOptions"
              option-attribute="label"
              value-attribute="value"
              class="w-36"
            />
          </div>

          <div v-if="prefs.emailDigestFrequency === 'weekly'" class="flex items-center justify-between">
            <div>
              <div class="font-medium text-gray-900 dark:text-white">Preferred Day</div>
              <p class="text-sm text-gray-500 dark:text-gray-400">Which day of the week to receive your weekly digest</p>
            </div>
            <USelectMenu
              v-model="prefs.emailDigestDay"
              :options="dayOptions"
              option-attribute="label"
              value-attribute="value"
              class="w-36"
            />
          </div>
        </template>
      </div>
    </UCard>

    <!-- Quick Actions -->
    <UCard>
      <template #header>
        <div class="flex items-center gap-3">
          <div class="p-2 rounded-lg bg-gray-50 dark:bg-gray-900/20">
            <UIcon name="i-heroicons-bolt" class="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </div>
          <div>
            <h3 class="text-base font-semibold text-gray-900 dark:text-white">Quick Actions</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400">Temporarily mute or clear all notifications</p>
          </div>
        </div>
      </template>

      <div class="space-y-4">
        <!-- Mute Status -->
        <div v-if="mutedUntil" class="flex items-center justify-between p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-bell-slash" class="w-5 h-5 text-yellow-600" />
            <span class="text-sm text-yellow-800 dark:text-yellow-300">
              Muted until {{ formatMuteTime(mutedUntil) }}
            </span>
          </div>
          <UButton size="xs" variant="ghost" color="yellow" @click="unmute" :loading="muting">
            Unmute
          </UButton>
        </div>

        <div class="flex gap-3">
          <UDropdown :items="muteOptions" :popper="{ placement: 'bottom-start' }">
            <UButton icon="i-heroicons-bell-slash" color="gray" variant="outline" :loading="muting">
              Mute Notifications
            </UButton>
          </UDropdown>

          <UButton icon="i-heroicons-trash" color="red" variant="outline" @click="showClearConfirm = true" :loading="clearing">
            Clear All
          </UButton>
        </div>
      </div>
    </UCard>

    <!-- Clear Confirmation Modal -->
    <UModal v-model="showClearConfirm">
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold">Clear All Notifications</h3>
        </template>
        <p class="text-gray-600 dark:text-gray-400">
          This will permanently delete all your notifications. This action cannot be undone.
        </p>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" @click="showClearConfirm = false">Cancel</UButton>
            <UButton color="red" @click="clearAll" :loading="clearing">Delete All</UButton>
          </div>
        </template>
      </UCard>
    </UModal>

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
import { DEFAULT_NOTIFICATION_PREFERENCES } from '#shared/types/notifications'

const toast = useToast()
const { setPreference, getPreference, initialized } = useUserPreferences()
const { clearAll: clearAllNotifications, muteTemporarily } = useNotifications()

const showClearConfirm = ref(false)
const saving = ref(false)
const muting = ref(false)
const clearing = ref(false)
const mutedUntil = ref<string | null>(null)

// Shared with the server so the page shows what is actually delivered
const defaultPrefs = {
  ...DEFAULT_NOTIFICATION_PREFERENCES,
  mutedUntil: null as string | null
}

const prefs = reactive({ ...defaultPrefs })

const digestFrequencyOptions = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' }
]

const hourOptions = Array.from({ length: 24 }, (_, i) => {
  const label = i === 0 ? '12:00 AM' : i < 12 ? `${i}:00 AM` : i === 12 ? '12:00 PM' : `${i - 12}:00 PM`
  return { value: i, label }
})

const dayOptions = [
  { value: 'monday', label: 'Monday' },
  { value: 'tuesday', label: 'Tuesday' },
  { value: 'wednesday', label: 'Wednesday' },
  { value: 'thursday', label: 'Thursday' },
  { value: 'friday', label: 'Friday' },
  { value: 'saturday', label: 'Saturday' },
  { value: 'sunday', label: 'Sunday' }
]

const muteOptions = [[
  { label: '1 hour', click: () => mute('1h') },
  { label: '4 hours', click: () => mute('4h') },
  { label: 'Until tomorrow', click: () => mute('24h') }
]]

function formatMuteTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })
}

// Wait for saved preferences to load: reading them on mount showed defaults
// on a fresh page load, and saving then overwrote the real settings
watch(initialized, (ready) => {
  if (!ready) return
  const saved = getPreference('notificationPreferences', defaultPrefs)
  Object.assign(prefs, saved)
  mutedUntil.value = prefs.mutedUntil
}, { immediate: true })

async function save() {
  saving.value = true
  try {
    // Mute is changed through its own endpoint; send its current value so a
    // save does not restore a stale one
    const success = await setPreference('notificationPreferences', { ...prefs, mutedUntil: mutedUntil.value })
    if (success) {
      toast.add({ title: 'Settings Saved', description: 'Your notification preferences have been updated.', color: 'green', icon: 'i-heroicons-check-circle' })
    } else {
      toast.add({ title: 'Save Failed', description: 'Failed to save notification preferences.', color: 'red', icon: 'i-heroicons-x-circle' })
    }
  } finally {
    saving.value = false
  }
}

async function mute(duration: '1h' | '4h' | '24h') {
  muting.value = true
  try {
    const result = await muteTemporarily(duration)
    if (result) {
      mutedUntil.value = result
      toast.add({ title: 'Notifications muted', color: 'green' })
    }
  } catch {
    toast.add({ title: 'Failed to mute', color: 'red' })
  } finally {
    muting.value = false
  }
}

async function unmute() {
  muting.value = true
  try {
    await $fetch('/api/notifications/mute', { method: 'POST', body: { unmute: true } })
    mutedUntil.value = null
    toast.add({ title: 'Notifications unmuted', color: 'green' })
  } catch {
    toast.add({ title: 'Failed to unmute', color: 'red' })
  } finally {
    muting.value = false
  }
}

async function clearAll() {
  clearing.value = true
  showClearConfirm.value = false
  try {
    await clearAllNotifications()
    toast.add({ title: 'All notifications cleared', color: 'green' })
  } catch {
    toast.add({ title: 'Failed to clear notifications', color: 'red' })
  } finally {
    clearing.value = false
  }
}
</script>
