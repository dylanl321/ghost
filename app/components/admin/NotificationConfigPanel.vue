<template>
  <div class="space-y-6">
    <!-- System Settings -->
    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <Icon name="i-heroicons-cog-6-tooth" class="w-5 h-5 text-gray-500" />
          <h3 class="text-lg font-semibold">System Settings</h3>
        </div>
      </template>

      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="font-medium text-gray-900 dark:text-white">Notifications Enabled</p>
            <p class="text-sm text-gray-500">Master switch for the notification system</p>
          </div>
          <UToggle v-model="config.notificationsEnabled" @change="saveConfig" />
        </div>

        <div class="flex items-center justify-between">
          <div>
            <p class="font-medium text-gray-900 dark:text-white">Email Digest Enabled</p>
            <p class="text-sm text-gray-500">Send grouped email digests to users</p>
          </div>
          <UToggle v-model="config.digestEnabled" @change="saveConfig" />
        </div>
      </div>
    </UCard>

    <!-- Digest Defaults -->
    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <Icon name="i-heroicons-envelope" class="w-5 h-5 text-gray-500" />
          <h3 class="text-lg font-semibold">Digest Defaults</h3>
        </div>
      </template>

      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Default Frequency</label>
          <USelectMenu v-model="config.defaultDigestFrequency" :options="frequencyOptions" @change="saveConfig" />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Default Delivery Hour</label>
          <USelectMenu v-model="config.defaultDigestHour" :options="hourOptions" @change="saveConfig" />
        </div>
      </div>
    </UCard>

    <!-- Dry-Run Mode -->
    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <Icon name="i-heroicons-beaker" class="w-5 h-5 text-yellow-500" />
          <h3 class="text-lg font-semibold">Dry-Run Mode</h3>
        </div>
      </template>

      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="font-medium text-gray-900 dark:text-white">Enable Dry-Run</p>
            <p class="text-sm text-gray-500">Redirect all notifications to a single admin email instead of individual users</p>
          </div>
          <UToggle v-model="config.dryRunEnabled" @change="saveDryRunConfig" />
        </div>

        <div v-if="config.dryRunEnabled" class="space-y-4">
          <div
            class="flex items-center gap-3 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800"
          >
            <UIcon name="i-heroicons-exclamation-triangle" class="w-5 h-5 text-yellow-600 flex-shrink-0" />
            <p class="text-sm text-yellow-700 dark:text-yellow-300">
              All notifications will be redirected to the email below. No individual users will receive notifications until dry-run is disabled.
            </p>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Redirect To</label>
            <UInput
              v-model="config.dryRunRedirectTo"
              placeholder="admin@example.com"
              icon="i-heroicons-envelope"
              @blur="saveDryRunConfig"
            />
            <p class="text-xs text-gray-400 mt-1">All notifications will be sent to this user ID / email</p>
          </div>
        </div>
      </div>
    </UCard>

    <!-- Test Notification -->
    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <Icon name="i-heroicons-beaker" class="w-5 h-5 text-gray-500" />
          <h3 class="text-lg font-semibold">Test Notification</h3>
        </div>
      </template>

      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
          <UInput v-model="testForm.title" placeholder="Test Notification" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Body</label>
          <UInput v-model="testForm.body" placeholder="This is a test notification..." />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Severity</label>
          <USelectMenu v-model="testForm.severity" :options="severityOptions" />
        </div>
        <UButton icon="i-heroicons-paper-airplane" @click="sendTest" :loading="sendingTest">
          Send Test
        </UButton>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
const emit = defineEmits(['dry-run-changed'])
const toast = useToast()
const loading = ref(false)
const sendingTest = ref(false)

const config = reactive({
  notificationsEnabled: true,
  digestEnabled: true,
  defaultDigestFrequency: 'daily',
  defaultDigestHour: 8,
  dryRunEnabled: false,
  dryRunRedirectTo: ''
})

const testForm = reactive({
  title: 'Test Notification',
  body: 'This is a test notification sent from the admin panel.',
  severity: 'info'
})

const frequencyOptions = [
  { label: 'Daily', value: 'daily' },
  { label: 'Weekly', value: 'weekly' }
]

const hourOptions = Array.from({ length: 24 }, (_, i) => {
  const hour = i === 0 ? '12:00 AM' : i < 12 ? `${i}:00 AM` : i === 12 ? '12:00 PM' : `${i - 12}:00 PM`
  return { label: hour, value: i }
})

const severityOptions = [
  { label: 'Info', value: 'info' },
  { label: 'Warning', value: 'warning' },
  { label: 'Critical', value: 'critical' }
]

async function loadConfig() {
  loading.value = true
  try {
    const { data } = await useFetch('/api/admin/user-notifications/config')
    const result = data.value as any
    if (result?.success) {
      config.notificationsEnabled = result.data.notificationsEnabled
      config.digestEnabled = result.data.digestEnabled
      config.defaultDigestFrequency = result.data.defaultDigestFrequency
      config.defaultDigestHour = result.data.defaultDigestHour
      config.dryRunEnabled = result.data.dryRunEnabled
      config.dryRunRedirectTo = result.data.dryRunRedirectTo || ''
    }
  } catch {
    // Use defaults
  } finally {
    loading.value = false
  }
}

async function saveConfig() {
  try {
    await $fetch('/api/admin/user-notifications/config', {
      method: 'PUT',
      body: {
        notificationsEnabled: config.notificationsEnabled,
        digestEnabled: config.digestEnabled,
        defaultDigestFrequency: config.defaultDigestFrequency,
        defaultDigestHour: config.defaultDigestHour,
        dryRunEnabled: config.dryRunEnabled,
        dryRunRedirectTo: config.dryRunRedirectTo
      }
    })
    toast.add({ title: 'Configuration saved', color: 'green' })
  } catch (err: any) {
    toast.add({ title: 'Failed to save config', description: err.message, color: 'red' })
  }
}

async function saveDryRunConfig() {
  try {
    await $fetch('/api/admin/user-notifications/config', {
      method: 'PUT',
      body: {
        dryRunEnabled: config.dryRunEnabled,
        dryRunRedirectTo: config.dryRunRedirectTo
      }
    })
    toast.add({ title: 'Dry-run configuration saved', color: 'green' })
    emit('dry-run-changed')
  } catch (err: any) {
    toast.add({ title: 'Failed to save dry-run config', description: err.message, color: 'red' })
  }
}

async function sendTest() {
  sendingTest.value = true
  try {
    const result = await $fetch('/api/admin/user-notifications/test', {
      method: 'POST',
      body: testForm
    }) as any

    if (result?.success) {
      toast.add({
        title: 'Test notification sent',
        description: `ID: ${result.data.notificationId}`,
        color: 'green'
      })
    }
  } catch (err: any) {
    toast.add({ title: 'Failed to send test', description: err.message, color: 'red' })
  } finally {
    sendingTest.value = false
  }
}

onMounted(() => {
  loadConfig()
})
</script>
