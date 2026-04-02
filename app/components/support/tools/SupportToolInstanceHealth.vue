<template>
  <div class="space-y-4">
    <div v-if="!supportContext.isAccountReady.value" class="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
      <Icon name="i-heroicons-information-circle" class="w-4 h-4 inline mr-1" />
      Select an account in the context bar above to browse instances.
    </div>
    <div class="flex gap-4 flex-wrap">
      <SupportInstanceSelector v-model="instanceId" placeholder="Select instance" class="flex-1 min-w-[200px]" />
      <UButton color="primary" :loading="loading" :disabled="!instanceId || !supportContext.isAccountReady.value" @click="fetchInstanceHealth">
        <Icon name="i-heroicons-heart" class="w-4 h-4 mr-1" />
        Analyze
      </UButton>
    </div>

    <div v-if="data" class="space-y-4">
      <!-- Health Score -->
      <div class="flex items-center gap-4">
        <div class="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold" :class="{
          'bg-green-100 text-green-700': data.healthStatus === 'HEALTHY',
          'bg-yellow-100 text-yellow-700': data.healthStatus === 'WARNING',
          'bg-red-100 text-red-700': data.healthStatus === 'CRITICAL',
          'bg-gray-100 text-gray-500': data.healthStatus === 'UNKNOWN'
        }">
          {{ data.healthScore }}
        </div>
        <div>
          <div class="text-xl font-semibold text-gray-900 dark:text-white">{{ data.healthStatus }}</div>
          <div class="text-sm text-gray-600 dark:text-gray-400">{{ data.instanceName || data.instanceId }}</div>
          <div v-if="data.partialData" class="text-xs text-yellow-600 flex items-center gap-1">
            <Icon name="i-heroicons-exclamation-triangle" class="w-3.5 h-3.5" />
            Some data unavailable
          </div>
        </div>
        <div class="ml-auto">
          <UButton size="xs" variant="ghost" color="gray" @click="exportData">
            <Icon name="i-heroicons-arrow-down-tray" class="w-4 h-4 mr-1" />
            Export Report
          </UButton>
        </div>
      </div>

      <!-- Health Components Grid -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
          <div class="text-xs text-gray-500 mb-1">Patches</div>
          <div class="font-semibold" :class="{
            'text-green-600': data.patchCompliance.status === 'COMPLIANT',
            'text-red-600': ['NON_COMPLIANT', 'FAILED'].includes(data.patchCompliance.status),
            'text-yellow-600': data.patchCompliance.status === 'PENDING',
            'text-gray-500': data.patchCompliance.status === 'UNKNOWN'
          }">
            {{ data.patchCompliance.status }}
          </div>
          <div class="text-xs text-gray-500">{{ data.patchCompliance.missingCount }} missing</div>
        </div>
        <div class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
          <div class="text-xs text-gray-500 mb-1">Security</div>
          <div class="font-semibold">
            <span class="text-red-600">{{ data.securityFindings.critical }}</span>
            <span class="text-gray-400 mx-1">/</span>
            <span class="text-orange-600">{{ data.securityFindings.high }}</span>
          </div>
          <div class="text-xs text-gray-500">Critical / High</div>
        </div>
        <div class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
          <div class="text-xs text-gray-500 mb-1">Vulnerabilities</div>
          <div class="font-semibold">
            <span class="text-red-600">{{ data.vulnerabilities.critical }}</span>
            <span class="text-gray-400 mx-1">/</span>
            <span class="text-orange-600">{{ data.vulnerabilities.high }}</span>
          </div>
          <div class="text-xs text-gray-500">Critical / High</div>
        </div>
        <div class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
          <div class="text-xs text-gray-500 mb-1">Alarms</div>
          <div class="font-semibold">
            <span :class="data.alarms.inAlarm > 0 ? 'text-red-600' : 'text-green-600'">{{ data.alarms.inAlarm }}</span>
            <span class="text-gray-400 mx-1">/</span>
            <span class="text-green-600">{{ data.alarms.ok }}</span>
          </div>
          <div class="text-xs text-gray-500">Alarm / OK</div>
        </div>
      </div>

      <!-- Recommendations -->
      <div v-if="data.recommendations.length > 0" class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
        <h4 class="font-medium text-blue-800 dark:text-blue-200 mb-2">Recommendations</h4>
        <ul class="text-sm text-blue-700 dark:text-blue-300 space-y-1">
          <li v-for="(rec, i) in data.recommendations" :key="i" class="flex items-start gap-2">
            <Icon name="i-heroicons-arrow-right" class="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{{ rec }}</span>
          </li>
        </ul>
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

const instanceId = ref('')
const loading = ref(false)
const data = ref<any>(null)
const error = ref('')

async function fetchInstanceHealth() {
  if (!instanceId.value || !supportContext.isAccountReady.value) { error.value = 'Both Instance ID and Account selection are required'; return }
  loading.value = true; error.value = ''; data.value = null
  try {
    const response = await $fetch('/api/support/instance-health', {
      params: { instanceId: instanceId.value, accountId: supportContext.state.accountId, environment: supportContext.state.environment }
    })
    data.value = (response as any).data
  } catch (err: any) {
    error.value = err.data?.error?.message || err.message || 'Failed to fetch instance health'
  } finally { loading.value = false }
}

function exportData() {
  if (!data.value) return
  const blob = new Blob([JSON.stringify(data.value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = `instance-health-${instanceId.value}-${Date.now()}.json`; a.click()
  URL.revokeObjectURL(url)
  toast.add({ title: 'Health report exported', icon: 'i-heroicons-arrow-down-tray', color: 'green', timeout: 2000 })
}
</script>
