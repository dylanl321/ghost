<template>
  <div class="space-y-4">
    <!-- Problem Input -->
    <div class="space-y-3">
      <UTextarea
        v-model="problem"
        placeholder="Describe the AWS issue you're troubleshooting (e.g., 'EC2 instance i-abc123 is unreachable via SSH' or 'Lambda function timing out when calling DynamoDB')"
        :rows="3"
        autoresize
      />

      <!-- Optional Context -->
      <div class="flex gap-3 flex-wrap">
        <UInput v-model="context.instanceId" placeholder="Instance ID (optional)" size="sm" class="w-44" />
        <UInput v-model="context.service" placeholder="AWS Service (optional)" size="sm" class="w-40" />
        <UButton
          color="primary"
          :loading="loading"
          :disabled="!problem.trim()"
          @click="troubleshoot"
        >
          <Icon name="i-heroicons-sparkles" class="w-4 h-4 mr-1" />
          Diagnose
        </UButton>
      </div>

      <!-- Quick prompts -->
      <div class="flex gap-2 flex-wrap">
        <UButton
          v-for="prompt in quickPrompts"
          :key="prompt.label"
          size="xs"
          color="gray"
          variant="ghost"
          @click="problem = prompt.text"
        >
          {{ prompt.label }}
        </UButton>
      </div>
    </div>

    <!-- Results -->
    <div v-if="result" class="space-y-4">
      <!-- Summary Header -->
      <div class="flex items-center gap-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
        <div
          class="w-14 h-14 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
          :class="{
            'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300': result.severity === 'critical',
            'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300': result.severity === 'high',
            'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300': result.severity === 'medium',
            'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300': result.severity === 'low'
          }"
        >
          {{ result.severity?.toUpperCase() }}
        </div>
        <div class="flex-1 min-w-0">
          <div class="font-semibold text-gray-900 dark:text-white">{{ result.summary }}</div>
          <div class="flex items-center gap-2 mt-1">
            <span class="text-xs px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
              {{ result.category }}
            </span>
          </div>
        </div>
        <UButton size="xs" variant="ghost" color="gray" @click="exportResult">
          <Icon name="i-heroicons-arrow-down-tray" class="w-4 h-4 mr-1" />
          Export
        </UButton>
      </div>

      <!-- Possible Causes -->
      <div v-if="result.possibleCauses?.length" class="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
        <h4 class="font-medium text-amber-800 dark:text-amber-200 mb-2 text-sm">Possible Causes</h4>
        <ul class="text-sm text-amber-700 dark:text-amber-300 space-y-1">
          <li v-for="(cause, i) in result.possibleCauses" :key="i" class="flex items-start gap-2">
            <Icon name="i-heroicons-exclamation-triangle" class="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{{ cause }}</span>
          </li>
        </ul>
      </div>

      <!-- Diagnostic Steps -->
      <div v-if="result.diagnosticSteps?.length" class="space-y-2">
        <h4 class="font-medium text-gray-900 dark:text-white text-sm">Diagnostic Steps</h4>
        <div
          v-for="step in result.diagnosticSteps"
          :key="step.order"
          class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 space-y-2"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 flex items-center justify-center text-xs font-bold">
                {{ step.order }}
              </span>
              <span class="font-medium text-gray-900 dark:text-white text-sm">{{ step.action }}</span>
            </div>
            <!-- Action button to open referenced tool -->
            <UButton
              v-if="toolMap[step.tool]"
              size="xs"
              color="primary"
              variant="soft"
              @click="navigateToTool(step.tool, step.params)"
            >
              <Icon name="i-heroicons-arrow-top-right-on-square" class="w-3.5 h-3.5 mr-1" />
              Open {{ toolMap[step.tool] }}
            </UButton>
          </div>
          <p class="text-xs text-gray-500 dark:text-gray-400">{{ step.description }}</p>
          <div v-if="step.params && Object.keys(step.params).length" class="flex flex-wrap gap-2">
            <span
              v-for="(val, key) in step.params"
              :key="key"
              class="text-xs font-mono px-2 py-0.5 bg-gray-200 dark:bg-gray-700 rounded cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              @click="copyToClipboard(`${val}`)"
            >
              {{ key }}: {{ val }}
            </span>
          </div>
          <p v-if="step.expectedOutcome" class="text-xs text-gray-400 italic">
            Expected: {{ step.expectedOutcome }}
          </p>
        </div>
      </div>

      <!-- Immediate Actions -->
      <div v-if="result.immediateActions?.length" class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
        <h4 class="font-medium text-blue-800 dark:text-blue-200 mb-2 text-sm">Immediate Actions</h4>
        <ul class="text-sm text-blue-700 dark:text-blue-300 space-y-1">
          <li v-for="(action, i) in result.immediateActions" :key="i" class="flex items-start gap-2">
            <Icon name="i-heroicons-bolt" class="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{{ action }}</span>
          </li>
        </ul>
      </div>

      <!-- Escalation -->
      <div v-if="result.escalationPath" class="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/30 rounded-lg p-3">
        <span class="font-medium">Escalation:</span> {{ result.escalationPath }}
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

const problem = ref('')
const context = reactive({ instanceId: '', service: '' })
const loading = ref(false)
const result = ref<any>(null)
const error = ref('')

const quickPrompts = [
  { label: 'SSH unreachable', text: 'EC2 instance is unreachable via SSH, security groups and NACLs look correct' },
  { label: 'High CPU', text: 'Instance showing sustained high CPU utilization above 90%' },
  { label: 'Permission denied', text: 'Getting AccessDenied errors when trying to access S3 bucket from Lambda' },
  { label: 'Cost spike', text: 'Unexpected cost increase in the last 7 days, need to identify the cause' },
]

// Map AI tool names to our dashboard tool IDs
const toolMap: Record<string, string> = {
  'ip-lookup': 'IP Lookup',
  'instance-lookup': 'Instance Lookup',
  'resource-search': 'Resource Search',
  'cloudwatch-logs': 'CloudWatch Logs',
  'smart-discovery': 'Smart Discovery',
  'security-posture': 'Security Posture',
  'patch-compliance': 'Patch Compliance',
  'cost-anomalies': 'Cost Anomalies',
  'access-audit': 'Access Audit',
  'instance-health': 'Instance Health',
}

function navigateToTool(tool: string, params: Record<string, string>) {
  emit('navigateTool', tool, params || {})
}

async function troubleshoot() {
  if (!problem.value.trim()) return
  loading.value = true; error.value = ''; result.value = null
  try {
    const body: any = { problem: problem.value }
    if (context.instanceId || context.service || supportContext.state.accountId) {
      body.context = {
        environment: supportContext.state.environment,
        accountId: supportContext.state.accountId || undefined,
        accountName: supportContext.state.accountName || undefined,
        instanceId: context.instanceId || undefined,
        service: context.service || undefined,
      }
    }
    const response = await $fetch('/api/support/ai-troubleshoot', { method: 'POST', body })
    result.value = (response as any).data
  } catch (err: any) {
    error.value = err.data?.error?.message || err.message || 'Failed to generate troubleshooting plan'
  } finally { loading.value = false }
}

function exportResult() {
  if (!result.value) return
  const blob = new Blob([JSON.stringify(result.value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = `troubleshoot-${Date.now()}.json`; a.click()
  URL.revokeObjectURL(url)
  toast.add({ title: 'Report exported', icon: 'i-heroicons-arrow-down-tray', color: 'green', timeout: 2000 })
}
</script>
