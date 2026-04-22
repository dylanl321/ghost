<template>
  <div class="space-y-4">
    <div v-if="!supportContext.isAccountReady.value" class="text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
      <Icon name="i-heroicons-information-circle" class="w-4 h-4 inline mr-1" />
      Select an account in the context bar above, or leave empty to analyze all accounts.
    </div>
    <div class="flex gap-4 flex-wrap items-center">
      <span v-if="supportContext.isAccountReady.value" class="text-sm text-gray-600 dark:text-gray-400">
        Analyzing: <span class="font-medium">{{ supportContext.state.accountName || supportContext.state.accountId }}</span>
      </span>
      <UButton color="primary" :loading="loading" @click="fetchSecurityPosture">
        <Icon name="i-heroicons-shield-check" class="w-4 h-4 mr-1" />
        Analyze
      </UButton>
    </div>

    <div v-if="data" class="space-y-4">
      <!-- Risk Score -->
      <div class="flex items-center gap-4">
        <div class="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold" :class="{
          'bg-red-100 text-red-700': data.summary.overallRisk === 'CRITICAL',
          'bg-orange-100 text-orange-700': data.summary.overallRisk === 'HIGH',
          'bg-yellow-100 text-yellow-700': data.summary.overallRisk === 'MEDIUM',
          'bg-blue-100 text-blue-700': data.summary.overallRisk === 'LOW',
          'bg-green-100 text-green-700': data.summary.overallRisk === 'MINIMAL'
        }">
          {{ data.summary.riskScore }}
        </div>
        <div>
          <div class="text-lg font-semibold text-gray-900 dark:text-white">{{ data.summary.overallRisk }} Risk</div>
          <div class="text-sm text-gray-600 dark:text-gray-400">{{ data.summary.totalFindings }} total findings</div>
        </div>
        <div class="ml-auto">
          <UButton size="xs" variant="ghost" color="gray" @click="exportData">
            <Icon name="i-heroicons-arrow-down-tray" class="w-4 h-4 mr-1" />
            Export Report
          </UButton>
        </div>
      </div>

      <!-- Severity breakdown -->
      <div class="grid grid-cols-5 gap-2 text-center">
        <div class="bg-red-50 dark:bg-red-900/20 rounded p-2">
          <div class="text-lg font-bold text-red-600">{{ data.summary.criticalFindings }}</div>
          <div class="text-xs text-gray-500">Critical</div>
        </div>
        <div class="bg-orange-50 dark:bg-orange-900/20 rounded p-2">
          <div class="text-lg font-bold text-orange-600">{{ data.summary.highFindings }}</div>
          <div class="text-xs text-gray-500">High</div>
        </div>
        <div class="bg-yellow-50 dark:bg-yellow-900/20 rounded p-2">
          <div class="text-lg font-bold text-yellow-600">{{ data.summary.mediumFindings }}</div>
          <div class="text-xs text-gray-500">Medium</div>
        </div>
        <div class="bg-blue-50 dark:bg-blue-900/20 rounded p-2">
          <div class="text-lg font-bold text-blue-600">{{ data.summary.lowFindings }}</div>
          <div class="text-xs text-gray-500">Low</div>
        </div>
        <div class="bg-gray-50 dark:bg-gray-800 rounded p-2">
          <div class="text-lg font-bold text-gray-600">{{ data.summary.informationalFindings }}</div>
          <div class="text-xs text-gray-500">Info</div>
        </div>
      </div>

      <!-- Top findings -->
      <div v-if="data.topFindings.length > 0" class="space-y-2">
        <div class="flex items-center justify-between">
          <h4 class="font-medium text-gray-900 dark:text-white">Top Findings</h4>
          <span class="text-xs text-gray-500">Showing {{ Math.min(showAll ? data.topFindings.length : 5, data.topFindings.length) }} of {{ data.topFindings.length }}</span>
        </div>
        <div v-for="finding in displayedFindings" :key="finding.id" class="bg-gray-50 dark:bg-gray-800/50 rounded p-2 text-sm">
          <div class="flex items-center gap-2">
            <span class="px-1.5 py-0.5 rounded text-xs font-medium shrink-0" :class="{
              'bg-red-100 text-red-800': finding.severity === 'CRITICAL',
              'bg-orange-100 text-orange-800': finding.severity === 'HIGH',
              'bg-yellow-100 text-yellow-800': finding.severity === 'MEDIUM',
              'bg-blue-100 text-blue-800': finding.severity === 'LOW'
            }">
              {{ finding.severity }}
            </span>
            <span class="text-gray-900 dark:text-white truncate">{{ finding.title }}</span>
          </div>
          <div v-if="finding.recommendation" class="text-xs text-gray-500 mt-1 pl-2 border-l-2 border-gray-200 dark:border-gray-700">
            {{ finding.recommendation }}
          </div>
          <!-- Resource ID + actions for finding -->
          <div v-if="finding.resourceId" class="flex items-center gap-2 mt-1.5 pl-2">
            <span class="text-xs font-mono text-gray-400 cursor-pointer hover:text-primary-500 transition-colors" @click="copyText(finding.resourceId)">
              {{ finding.resourceId }}
              <Icon name="i-heroicons-clipboard" class="w-3 h-3 inline ml-0.5 opacity-50" />
            </span>
            <UButton v-if="finding.resourceId?.startsWith('i-')" size="xs" variant="ghost" color="emerald" class="!px-1 !py-0" @click="$emit('navigateTool', 'instance-health', { instanceId: finding.resourceId })">
              <Icon name="i-heroicons-heart" class="w-3 h-3" />
            </UButton>
          </div>
        </div>
        <UButton v-if="data.topFindings.length > 5" size="xs" variant="ghost" @click="showAll = !showAll">
          {{ showAll ? 'Show Less' : `Show All (${data.topFindings.length})` }}
        </UButton>
      </div>

      <!-- Recommendations -->
      <div v-if="data.recommendations?.length > 0" class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
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
const emit = defineEmits<{ navigateTool: [toolId: string, params: Record<string, string>] }>()

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.add({ title: 'Copied to clipboard', icon: 'i-heroicons-clipboard-document-check', color: 'green', timeout: 2000 })
  } catch { /* silent */ }
}

const loading = ref(false)
const data = ref<any>(null)
const error = ref('')
const showAll = ref(false)

const displayedFindings = computed(() => {
  if (!data.value?.topFindings) return []
  return showAll.value ? data.value.topFindings : data.value.topFindings.slice(0, 5)
})

async function fetchSecurityPosture() {
  loading.value = true; error.value = ''; data.value = null
  try {
    const response = await $fetch('/api/support/security-posture', {
      params: { accountId: supportContext.isAccountReady.value ? supportContext.state.accountId : undefined, environment: supportContext.state.environment }
    })
    data.value = (response as any).data
  } catch (err: any) {
    error.value = err.data?.error?.message || err.message || 'Failed to fetch security posture'
  } finally { loading.value = false }
}

function exportData() {
  if (!data.value) return
  const blob = new Blob([JSON.stringify(data.value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = `security-posture-${supportContext.state.accountId || 'all'}-${Date.now()}.json`; a.click()
  URL.revokeObjectURL(url)
  toast.add({ title: 'Security report exported', icon: 'i-heroicons-arrow-down-tray', color: 'green', timeout: 2000 })
}
</script>
