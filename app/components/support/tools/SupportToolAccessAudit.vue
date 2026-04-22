<template>
  <div class="space-y-4">
    <div v-if="!supportContext.isAccountReady.value" class="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
      <Icon name="i-heroicons-information-circle" class="w-4 h-4 inline mr-1" />
      Select an account in the context bar above to audit access.
    </div>
    <div class="flex gap-4 flex-wrap">
      <UInput v-model="resourceId" placeholder="Resource ID (e.g., i-1234567890abcdef0)" class="w-64" />
      <UInput v-model="userName" placeholder="IAM user or role name" class="w-64" />
      <USelect v-model="hoursBack" :options="hoursBackOptions" class="w-40" />
      <UButton color="primary" :loading="loading" :disabled="!supportContext.isAccountReady.value || (!resourceId && !userName)" @click="fetchAccessAudit">
        <Icon name="i-heroicons-eye" class="w-4 h-4 mr-1" />
        Audit
      </UButton>
    </div>
    <div class="flex items-center gap-2 text-xs text-gray-400">
      <Icon name="i-heroicons-light-bulb" class="w-3.5 h-3.5" />
      <span>Search CloudTrail events by resource ID or IAM identity. At least one filter is required.</span>
    </div>

    <div v-if="data" class="space-y-4">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-center">
          <div class="text-2xl font-bold text-blue-600">{{ data.summary.totalEvents }}</div>
          <div class="text-xs text-gray-500">Total Events</div>
        </div>
        <div class="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 text-center">
          <div class="text-2xl font-bold text-purple-600">{{ data.summary.uniqueUsers }}</div>
          <div class="text-xs text-gray-500">Unique Users</div>
        </div>
        <div class="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
          <div class="text-2xl font-bold text-green-600">{{ data.summary.readEvents }}</div>
          <div class="text-xs text-gray-500">Read Events</div>
        </div>
        <div class="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-3 text-center">
          <div class="text-2xl font-bold text-orange-600">{{ data.summary.writeEvents }}</div>
          <div class="text-xs text-gray-500">Write Events</div>
        </div>
      </div>

      <div v-if="data.anomalies.length > 0" class="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3">
        <h4 class="font-medium text-yellow-800 dark:text-yellow-200 mb-2">
          <Icon name="i-heroicons-exclamation-triangle" class="w-4 h-4 inline mr-1" />
          Anomalies Detected
        </h4>
        <ul class="text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
          <li v-for="(anomaly, i) in data.anomalies" :key="i" class="flex items-start gap-2">
            <Icon name="i-heroicons-arrow-right" class="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{{ anomaly }}</span>
          </li>
        </ul>
      </div>

      <div v-if="data.topUsers.length > 0" class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
        <div class="flex items-center justify-between mb-2">
          <h4 class="font-medium text-gray-900 dark:text-white">Top Users</h4>
          <UButton size="xs" variant="ghost" color="gray" @click="exportData">
            <Icon name="i-heroicons-arrow-down-tray" class="w-4 h-4 mr-1" />
            Export
          </UButton>
        </div>
        <div class="space-y-2">
          <div v-for="user in data.topUsers.slice(0, 10)" :key="user.user" class="flex items-center justify-between text-sm">
            <span class="text-gray-600 dark:text-gray-400 truncate font-mono text-xs cursor-pointer hover:text-primary-500 transition-colors" @click="copyText(user.user)">
              {{ user.user }}
              <Icon name="i-heroicons-clipboard" class="w-3 h-3 inline ml-0.5 opacity-50" />
            </span>
            <div class="flex items-center gap-2">
              <div class="w-24 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                <div class="bg-blue-500 h-1.5 rounded-full" :style="{ width: `${(user.eventCount / data.summary.totalEvents) * 100}%` }" />
              </div>
              <span class="text-gray-900 dark:text-white font-medium w-16 text-right">{{ user.eventCount }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="error" class="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
      <div class="flex items-center gap-2 text-red-600 dark:text-red-400">
        <Icon name="i-heroicons-exclamation-triangle" class="w-5 h-5" />
        <span>{{ error }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const toast = useToast()
const supportContext = useSupportContext()

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.add({ title: 'Copied to clipboard', icon: 'i-heroicons-clipboard-document-check', color: 'green', timeout: 2000 })
  } catch { /* silent */ }
}

const hoursBackOptions = [
  { label: 'Last 1 hour', value: 1 },
  { label: 'Last 6 hours', value: 6 },
  { label: 'Last 24 hours', value: 24 },
  { label: 'Last 72 hours', value: 72 },
  { label: 'Last 7 days', value: 168 }
]

const resourceId = ref('')
const userName = ref('')
const hoursBack = ref(24)
const loading = ref(false)
const data = ref<any>(null)
const error = ref('')

async function fetchAccessAudit() {
  if (!supportContext.isAccountReady.value) { error.value = 'Account selection is required'; return }
  if (!resourceId.value && !userName.value) { error.value = 'Either Resource ID or User name is required'; return }
  loading.value = true; error.value = ''; data.value = null
  try {
    const response = await $fetch('/api/support/access-audit', {
      params: { accountId: supportContext.state.accountId, resourceId: resourceId.value || undefined, userName: userName.value || undefined, environment: supportContext.state.environment, hoursBack: hoursBack.value }
    })
    data.value = (response as any).data
  } catch (err: any) {
    error.value = err.data?.error?.message || err.message || 'Failed to fetch access audit'
  } finally { loading.value = false }
}

function exportData() {
  if (!data.value) return
  const blob = new Blob([JSON.stringify(data.value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = `access-audit-${supportContext.state.accountId}-${Date.now()}.json`; a.click()
  URL.revokeObjectURL(url)
  toast.add({ title: 'Audit data exported', icon: 'i-heroicons-arrow-down-tray', color: 'green', timeout: 2000 })
}
</script>
