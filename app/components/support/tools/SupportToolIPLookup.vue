<template>
  <div class="space-y-4">
    <!-- Mode Toggle -->
    <div class="flex items-center gap-2">
      <UButton :color="mode === 'manual' ? 'primary' : 'gray'" size="xs" @click="mode = 'manual'">
        <Icon name="i-heroicons-command-line" class="w-3.5 h-3.5 mr-1" />
        Manual Query
      </UButton>
      <UButton :color="mode === 'ai' ? 'primary' : 'gray'" size="xs" @click="mode = 'ai'">
        <Icon name="i-heroicons-sparkles" class="w-3.5 h-3.5 mr-1" />
        AI Assist
      </UButton>
    </div>

    <!-- Manual Mode -->
    <div v-if="mode === 'manual'" class="space-y-4">
      <div class="flex gap-4">
        <UInput v-model="ip" placeholder="Enter IP address (e.g., 10.0.1.25)" class="flex-1" @keyup.enter="searchIP" />
        <USelect v-model="environment" :options="environmentOptions" class="w-40" />
        <UButton color="primary" :loading="loading" :disabled="!ip.trim()" @click="searchIP">
          <Icon name="i-heroicons-magnifying-glass" class="w-4 h-4 mr-1" />
          Search
        </UButton>
      </div>
      <div class="flex items-center gap-2 text-xs text-gray-400">
        <Icon name="i-heroicons-light-bulb" class="w-3.5 h-3.5" />
        <span>Supports IPv4 addresses. Searches EC2 instances and ENIs across all regions.</span>
      </div>
    </div>

    <!-- AI Mode -->
    <div v-else class="space-y-4">
      <UTextarea v-model="aiQuery" placeholder="Describe what you're looking for (e.g., 'Find the instance with IP 10.0.1.25 in the production account')" :rows="2" />
      <div class="flex gap-4">
        <USelect v-model="environment" :options="environmentOptions" class="w-40" />
        <UButton color="primary" :loading="aiLoading" :disabled="!aiQuery.trim()" @click="generateIPQuery">
          <Icon name="i-heroicons-sparkles" class="w-4 h-4 mr-1" />
          Generate Query
        </UButton>
      </div>

      <div v-if="generatedQuery" class="bg-gray-100 dark:bg-gray-800 rounded-lg p-3 space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Generated Query:</span>
          <UButton size="xs" variant="ghost" @click="copyToClipboard(generatedQuery)">
            <Icon name="i-heroicons-clipboard" class="w-4 h-4" />
          </UButton>
        </div>
        <pre class="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{{ generatedQuery }}</pre>
        <p v-if="queryExplanation" class="text-xs text-gray-500 italic">{{ queryExplanation }}</p>
        <UButton color="primary" size="sm" :loading="loading" @click="executeGeneratedIPQuery">
          Execute Query
        </UButton>
      </div>
    </div>

    <!-- Results -->
    <div v-if="result" class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 space-y-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <Icon :name="result.found ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'" :class="result.found ? 'text-green-500' : 'text-gray-400'" class="w-5 h-5" />
          <span class="font-medium text-gray-900 dark:text-white">
            {{ result.found ? 'Resource Found' : 'No Resource Found' }}
          </span>
        </div>
        <UButton v-if="result.found" size="xs" variant="ghost" color="gray" @click="exportResult">
          <Icon name="i-heroicons-arrow-down-tray" class="w-4 h-4 mr-1" />
          Export
        </UButton>
      </div>

      <div v-if="result.found && result.resource" class="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span class="text-gray-500">Account:</span>
          <span class="ml-2 text-gray-900 dark:text-white font-medium">{{ result.account?.name || result.resource.accountId }}</span>
        </div>
        <div>
          <span class="text-gray-500">Resource ID:</span>
          <span class="ml-2 text-gray-900 dark:text-white font-mono text-xs cursor-pointer hover:text-primary-500 transition-colors" @click="copyToClipboard(result.resource.resourceId)">
            {{ result.resource.resourceId }}
            <Icon name="i-heroicons-clipboard" class="w-3 h-3 inline ml-1 opacity-50" />
          </span>
        </div>
        <div>
          <span class="text-gray-500">Type:</span>
          <span class="ml-2 text-gray-900 dark:text-white">{{ result.resource.resourceType }}</span>
        </div>
        <div>
          <span class="text-gray-500">Region:</span>
          <span class="ml-2 text-gray-900 dark:text-white">{{ result.resource.region }}</span>
        </div>
        <div v-if="result.resource.configuration?.vpcId">
          <span class="text-gray-500">VPC:</span>
          <span class="ml-2 text-gray-900 dark:text-white font-mono text-xs cursor-pointer hover:text-primary-500 transition-colors" @click="copyToClipboard(result.resource.configuration.vpcId)">
            {{ result.resource.configuration.vpcId }}
            <Icon name="i-heroicons-clipboard" class="w-3 h-3 inline ml-1 opacity-50" />
          </span>
        </div>
        <div v-if="result.resource.configuration?.instanceType">
          <span class="text-gray-500">Instance Type:</span>
          <span class="ml-2 text-gray-900 dark:text-white">{{ result.resource.configuration.instanceType }}</span>
        </div>
      </div>

      <!-- Tags -->
      <div v-if="result.resource?.configuration?.tags && Object.keys(result.resource.configuration.tags).length > 0" class="pt-2 border-t border-gray-200 dark:border-gray-700">
        <span class="text-sm text-gray-500 block mb-2">Tags:</span>
        <div class="flex flex-wrap gap-2">
          <span v-for="(value, key) in result.resource.configuration.tags" :key="key" class="text-xs px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded text-gray-700 dark:text-gray-300">
            {{ key }}={{ value }}
          </span>
        </div>
      </div>

      <!-- Cross-Tool Actions -->
      <div v-if="result.found && result.resource" class="pt-3 border-t border-gray-200 dark:border-gray-700">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-xs text-gray-400 mr-1">Actions:</span>
          <UButton v-if="result.resource.resourceId?.startsWith('i-')" size="xs" color="emerald" variant="soft" @click="$emit('navigateTool', 'instance-health', { instanceId: result.resource.resourceId })">
            <Icon name="i-heroicons-heart" class="w-3.5 h-3.5 mr-1" />
            Check Health
          </UButton>
          <UButton size="xs" color="violet" variant="soft" @click="$emit('navigateTool', 'access-audit', { resourceId: result.resource.resourceId })">
            <Icon name="i-heroicons-eye" class="w-3.5 h-3.5 mr-1" />
            Audit Access
          </UButton>
          <UButton size="xs" color="red" variant="soft" @click="$emit('navigateTool', 'security-posture', {})">
            <Icon name="i-heroicons-shield-check" class="w-3.5 h-3.5 mr-1" />
            Security
          </UButton>
          <UButton v-if="awsConsoleUrl" size="xs" color="gray" variant="soft" @click="openExternal(awsConsoleUrl)">
            <Icon name="i-heroicons-arrow-top-right-on-square" class="w-3.5 h-3.5 mr-1" />
            AWS Console
          </UButton>
        </div>
        <!-- CLI Hint -->
        <div v-if="result.resource.resourceId?.startsWith('i-')" class="mt-2 text-xs text-gray-400 font-mono bg-gray-100 dark:bg-gray-800 rounded px-2 py-1 cursor-pointer hover:text-gray-600 transition-colors" @click="copyToClipboard(`aws ec2 describe-instances --instance-ids ${result.resource.resourceId} --region ${result.resource.region}`)">
          $ aws ec2 describe-instances --instance-ids {{ result.resource.resourceId }} --region {{ result.resource.region }}
          <Icon name="i-heroicons-clipboard" class="w-3 h-3 inline ml-1" />
        </div>
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
const emit = defineEmits<{ navigateTool: [toolId: string, params: Record<string, string>] }>()

const environmentOptions = [
  { label: 'GovCloud', value: 'govcloud' },
  { label: 'Commercial', value: 'commercial' }
]

const mode = ref<'manual' | 'ai'>('manual')
const ip = ref('')
const environment = ref<'commercial' | 'govcloud'>('govcloud')
const aiQuery = ref('')
const generatedQuery = ref('')
const queryExplanation = ref('')
const loading = ref(false)
const aiLoading = ref(false)
const result = ref<any>(null)
const error = ref('')

async function searchIP() {
  if (!ip.value.trim()) { error.value = 'Please enter an IP address'; return }
  loading.value = true; error.value = ''; result.value = null
  try {
    const response = await $fetch('/api/support/ip-lookup', { params: { ip: ip.value.trim(), environment: environment.value } })
    result.value = (response as any).data
  } catch (err: any) {
    error.value = err.data?.error?.message || err.message || 'Failed to lookup IP'
  } finally { loading.value = false }
}

async function generateIPQuery() {
  if (!aiQuery.value.trim()) { error.value = 'Please describe what you want to find'; return }
  aiLoading.value = true; error.value = ''
  try {
    const response = await $fetch('/api/support/ai-query-generator', {
      method: 'POST',
      body: { naturalLanguageQuery: aiQuery.value, queryType: 'config', context: { environment: environment.value } }
    })
    const data = (response as any).data
    generatedQuery.value = data.generatedQuery
    queryExplanation.value = data.explanation
  } catch (err: any) {
    error.value = err.data?.error?.message || err.message || 'Failed to generate query'
  } finally { aiLoading.value = false }
}

async function executeGeneratedIPQuery() {
  const ipMatch = generatedQuery.value.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/)
  if (ipMatch?.[1]) { ip.value = ipMatch[1]; await searchIP() }
  else { error.value = 'Could not extract IP from generated query. Please use manual mode.' }
}

const awsConsoleUrl = computed(() => {
  if (!result.value?.found || !result.value?.resource) return ''
  const r = result.value.resource
  const region = r.region || 'us-east-1'
  if (r.resourceId?.startsWith('i-')) return `https://${region}.console.aws.amazon.com/ec2/home?region=${region}#InstanceDetails:instanceId=${r.resourceId}`
  if (r.resourceId?.startsWith('eni-')) return `https://${region}.console.aws.amazon.com/ec2/home?region=${region}#NIC:networkInterfaceId=${r.resourceId}`
  return ''
})

function openExternal(url: string) {
  window.open(url, '_blank', 'noopener')
}

function exportResult() {
  if (!result.value) return
  const blob = new Blob([JSON.stringify(result.value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = `ip-lookup-${ip.value}-${Date.now()}.json`; a.click()
  URL.revokeObjectURL(url)
  toast.add({ title: 'Results exported', icon: 'i-heroicons-arrow-down-tray', color: 'green', timeout: 2000 })
}
</script>
