<template>
  <div class="space-y-4">
    <!-- Account Required Notice -->
    <div v-if="!supportContext.isAccountReady.value" class="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
      <Icon name="i-heroicons-information-circle" class="w-4 h-4 inline mr-1" />
      Select an account in the context bar above to generate a health summary.
    </div>

    <!-- Controls -->
    <div class="flex items-center gap-3 flex-wrap">
      <div class="flex gap-2 flex-wrap">
        <UButton
          v-for="cat in categoryOptions"
          :key="cat.value"
          size="xs"
          :color="selectedCategories.includes(cat.value) ? 'primary' : 'gray'"
          @click="toggleCategory(cat.value)"
        >
          <Icon :name="cat.icon" class="w-3.5 h-3.5 mr-1" />
          {{ cat.label }}
        </UButton>
      </div>
      <UButton
        color="primary"
        :loading="loading"
        :disabled="!supportContext.isAccountReady.value"
        @click="generateSummary"
      >
        <Icon name="i-heroicons-sparkles" class="w-4 h-4 mr-1" />
        Generate Summary
      </UButton>
    </div>

    <!-- Results -->
    <div v-if="result" class="space-y-4">
      <!-- Health Score Header -->
      <div class="flex items-center gap-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
        <div
          class="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold shrink-0"
          :class="{
            'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300': result.overallHealth === 'healthy',
            'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300': result.overallHealth === 'warning',
            'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300': result.overallHealth === 'critical'
          }"
        >
          {{ result.healthScore }}
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            <span class="text-lg font-semibold text-gray-900 dark:text-white uppercase">{{ result.overallHealth }}</span>
            <span class="text-xs text-gray-500">{{ result.accountName || result.accountId }}</span>
          </div>
          <p class="text-sm text-gray-600 dark:text-gray-400">{{ result.executiveSummary }}</p>
          <div class="text-xs text-gray-400 mt-1">Generated {{ formatTime(result.generatedAt) }}</div>
        </div>
        <UButton size="xs" variant="ghost" color="gray" @click="exportResult">
          <Icon name="i-heroicons-arrow-down-tray" class="w-4 h-4 mr-1" />
          Export
        </UButton>
      </div>

      <!-- Category Cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div
          v-for="(data, key) in result.categories"
          :key="key"
          class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 space-y-2"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <Icon :name="categoryIconMap[key as string] || 'i-heroicons-tag'" class="w-4 h-4" :class="statusColor(data.status)" />
              <span class="font-medium text-gray-900 dark:text-white capitalize text-sm">{{ key }}</span>
            </div>
            <span
              class="text-xs px-2 py-0.5 rounded"
              :class="{
                'bg-green-100 text-green-700': data.status === 'good',
                'bg-yellow-100 text-yellow-700': data.status === 'warning',
                'bg-red-100 text-red-700': data.status === 'critical'
              }"
            >
              {{ data.status }}
            </span>
          </div>
          <p class="text-xs text-gray-500 dark:text-gray-400">{{ data.summary }}</p>

          <!-- Extra metrics per category -->
          <div v-if="data.complianceRate !== undefined" class="text-xs text-gray-500">
            Compliance: <span class="font-medium">{{ data.complianceRate }}%</span>
          </div>
          <div v-if="data.trend" class="text-xs text-gray-500">
            Trend: <span class="font-medium">{{ data.trend }}</span>
          </div>
          <div v-if="data.riskLevel" class="text-xs text-gray-500">
            Risk: <span class="font-medium capitalize">{{ data.riskLevel }}</span>
          </div>

          <!-- Key Findings -->
          <ul v-if="data.keyFindings?.length" class="text-xs space-y-0.5">
            <li v-for="(finding, i) in data.keyFindings.slice(0, showAllFindings[key as string] ? undefined : 3)" :key="i" class="flex items-start gap-1.5 text-gray-600 dark:text-gray-400">
              <Icon name="i-heroicons-minus" class="w-3 h-3 mt-0.5 shrink-0" />
              <span>{{ finding }}</span>
            </li>
          </ul>
          <UButton
            v-if="data.keyFindings?.length > 3"
            size="xs"
            variant="ghost"
            color="gray"
            @click="showAllFindings[key as string] = !showAllFindings[key as string]"
          >
            {{ showAllFindings[key as string] ? 'Show less' : `+${data.keyFindings.length - 3} more` }}
          </UButton>
        </div>
      </div>

      <!-- Top Recommendations -->
      <div v-if="result.topRecommendations?.length" class="space-y-2">
        <h4 class="font-medium text-gray-900 dark:text-white text-sm">Top Recommendations</h4>
        <div
          v-for="(rec, i) in result.topRecommendations"
          :key="i"
          class="flex items-start gap-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3"
        >
          <span
            class="text-xs px-1.5 py-0.5 rounded font-medium shrink-0 mt-0.5"
            :class="{
              'bg-red-100 text-red-700': rec.priority === 'critical',
              'bg-orange-100 text-orange-700': rec.priority === 'high',
              'bg-yellow-100 text-yellow-700': rec.priority === 'medium',
              'bg-gray-100 text-gray-700': rec.priority === 'low'
            }"
          >
            {{ rec.priority }}
          </span>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium text-gray-900 dark:text-white">{{ rec.action }}</div>
            <div class="text-xs text-gray-500 mt-0.5">{{ rec.impact }}</div>
          </div>
          <UButton
            v-if="rec.tool && toolIdMap[rec.tool]"
            size="xs"
            color="primary"
            variant="soft"
            @click="$emit('navigateTool', toolIdMap[rec.tool] || rec.tool, {})"
          >
            <Icon name="i-heroicons-arrow-top-right-on-square" class="w-3.5 h-3.5 mr-1" />
            Open
          </UButton>
        </div>
      </div>

      <!-- Next Steps -->
      <div v-if="result.nextSteps?.length" class="bg-gray-50 dark:bg-gray-800/30 rounded-lg p-3">
        <h4 class="font-medium text-gray-700 dark:text-gray-300 mb-2 text-sm">Next Steps</h4>
        <ol class="text-sm text-gray-600 dark:text-gray-400 space-y-1 list-decimal list-inside">
          <li v-for="(step, i) in result.nextSteps" :key="i">{{ step }}</li>
        </ol>
      </div>
    </div>

    <!-- Error -->
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

const categoryOptions = [
  { value: 'security', label: 'Security', icon: 'i-heroicons-shield-check' },
  { value: 'cost', label: 'Cost', icon: 'i-heroicons-currency-dollar' },
  { value: 'compliance', label: 'Compliance', icon: 'i-heroicons-clipboard-document-check' },
  { value: 'resources', label: 'Resources', icon: 'i-heroicons-rectangle-stack' },
  { value: 'recommendations', label: 'Recommendations', icon: 'i-heroicons-light-bulb' },
]

const categoryIconMap: Record<string, string> = {
  security: 'i-heroicons-shield-check',
  cost: 'i-heroicons-currency-dollar',
  compliance: 'i-heroicons-clipboard-document-check',
  resources: 'i-heroicons-rectangle-stack',
}

// Map AI recommendation tool names to our tool IDs
const toolIdMap: Record<string, string> = {
  'ip-lookup': 'ip-lookup',
  'instance-health': 'instance-health',
  'security-posture': 'security-posture',
  'patch-compliance': 'patch-compliance',
  'cost-anomalies': 'cost-anomalies',
  'access-audit': 'access-audit',
  'cloudwatch-logs': 'cloudwatch-logs',
  'resource-search': 'resource-search',
}

const selectedCategories = ref<string[]>(['security', 'cost', 'compliance', 'resources', 'recommendations'])
const loading = ref(false)
const result = ref<any>(null)
const error = ref('')
const showAllFindings = reactive<Record<string, boolean>>({})

function toggleCategory(cat: string) {
  const idx = selectedCategories.value.indexOf(cat)
  if (idx >= 0) selectedCategories.value.splice(idx, 1)
  else selectedCategories.value.push(cat)
}

function statusColor(status: string) {
  if (status === 'good') return 'text-green-500'
  if (status === 'warning') return 'text-yellow-500'
  if (status === 'critical') return 'text-red-500'
  return 'text-gray-500'
}

function formatTime(iso: string) {
  if (!iso) return ''
  return new Date(iso).toLocaleString()
}

async function generateSummary() {
  if (!supportContext.isAccountReady.value) return
  loading.value = true; error.value = ''; result.value = null
  try {
    const response = await $fetch('/api/support/ai-account-summary', {
      method: 'POST',
      body: {
        accountId: supportContext.state.accountId,
        accountName: supportContext.state.accountName,
        environment: supportContext.state.environment,
        includeCategories: selectedCategories.value,
      }
    })
    result.value = (response as any).data
  } catch (err: any) {
    error.value = err.data?.error?.message || err.message || 'Failed to generate account summary'
  } finally { loading.value = false }
}

function exportResult() {
  if (!result.value) return
  const blob = new Blob([JSON.stringify(result.value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = `account-summary-${result.value.accountId}-${Date.now()}.json`; a.click()
  URL.revokeObjectURL(url)
  toast.add({ title: 'Summary exported', icon: 'i-heroicons-arrow-down-tray', color: 'green', timeout: 2000 })
}
</script>
