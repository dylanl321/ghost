<template>
  <div class="space-y-4">
    <div class="flex gap-4">
      <UInput v-model="query" placeholder="Enter instance ID, name, or IP" class="flex-1" @keyup.enter="searchInstance" />
      <USelect v-model="environment" :options="environmentOptions" class="w-40" />
      <UButton color="primary" :loading="loading" :disabled="!query.trim()" @click="searchInstance">
        <Icon name="i-heroicons-magnifying-glass" class="w-4 h-4 mr-1" />
        Search
      </UButton>
    </div>

    <div class="flex items-center gap-2 text-xs text-gray-400">
      <Icon name="i-heroicons-light-bulb" class="w-3.5 h-3.5" />
      <span>Search by instance ID (i-xxx), Name tag, or private/public IP address.</span>
    </div>

    <div v-if="result" class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 space-y-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <Icon :name="result.found ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'" :class="result.found ? 'text-green-500' : 'text-gray-400'" class="w-5 h-5" />
          <span class="font-medium text-gray-900 dark:text-white">
            {{ result.found ? 'Instance Found' : 'No Instance Found' }}
          </span>
        </div>
        <UButton v-if="result.found" size="xs" variant="ghost" color="gray" @click="exportResult">
          <Icon name="i-heroicons-arrow-down-tray" class="w-4 h-4" />
        </UButton>
      </div>

      <div v-if="result.found && result.resource" class="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span class="text-gray-500">Instance ID:</span>
          <span class="ml-2 text-gray-900 dark:text-white font-mono text-xs cursor-pointer hover:text-primary-500 transition-colors" @click="copyText(result.resource.resourceId)">
            {{ result.resource.resourceId }}
            <Icon name="i-heroicons-clipboard" class="w-3 h-3 inline ml-1 opacity-50" />
          </span>
        </div>
        <div>
          <span class="text-gray-500">Name:</span>
          <span class="ml-2 text-gray-900 dark:text-white">{{ result.resource.resourceName }}</span>
        </div>
        <div>
          <span class="text-gray-500">Account:</span>
          <span class="ml-2 text-gray-900 dark:text-white">{{ result.account?.name || result.resource.accountId }}</span>
        </div>
        <div>
          <span class="text-gray-500">Region:</span>
          <span class="ml-2 text-gray-900 dark:text-white">{{ result.resource.region }}</span>
        </div>
        <div v-if="result.resource.configuration?.instanceType">
          <span class="text-gray-500">Type:</span>
          <span class="ml-2 text-gray-900 dark:text-white">{{ result.resource.configuration.instanceType }}</span>
        </div>
        <div v-if="result.resource.configuration?.state">
          <span class="text-gray-500">State:</span>
          <span class="ml-2 px-2 py-0.5 rounded text-xs" :class="{
            'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200': result.resource.configuration.state === 'running',
            'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200': result.resource.configuration.state === 'stopped',
            'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200': !['running', 'stopped'].includes(result.resource.configuration.state)
          }">
            {{ result.resource.configuration.state }}
          </span>
        </div>
        <div v-if="result.resource.configuration?.privateIpAddress">
          <span class="text-gray-500">Private IP:</span>
          <span class="ml-2 text-gray-900 dark:text-white font-mono text-xs cursor-pointer hover:text-primary-500 transition-colors" @click="copyText(result.resource.configuration.privateIpAddress)">
            {{ result.resource.configuration.privateIpAddress }}
            <Icon name="i-heroicons-clipboard" class="w-3 h-3 inline ml-1 opacity-50" />
          </span>
        </div>
        <div v-if="result.resource.configuration?.publicIpAddress">
          <span class="text-gray-500">Public IP:</span>
          <span class="ml-2 text-gray-900 dark:text-white font-mono text-xs cursor-pointer hover:text-primary-500 transition-colors" @click="copyText(result.resource.configuration.publicIpAddress)">
            {{ result.resource.configuration.publicIpAddress }}
            <Icon name="i-heroicons-clipboard" class="w-3 h-3 inline ml-1 opacity-50" />
          </span>
        </div>
      </div>

      <!-- Cross-Tool Actions -->
      <div v-if="result.found && result.resource" class="pt-3 border-t border-gray-200 dark:border-gray-700">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-xs text-gray-400 mr-1">Actions:</span>
          <UButton size="xs" color="blue" variant="soft" :to="`/account/${result.resource.accountId}/instance/${result.resource.resourceId}?environment=${environment}`">
            <Icon name="i-heroicons-server" class="w-3.5 h-3.5 mr-1" />
            View Details
          </UButton>
          <UButton size="xs" color="emerald" variant="soft" @click="$emit('navigateTool', 'instance-health', { instanceId: result.resource.resourceId })">
            <Icon name="i-heroicons-heart" class="w-3.5 h-3.5 mr-1" />
            Check Health
          </UButton>
          <UButton size="xs" color="orange" variant="soft" @click="$emit('navigateTool', 'cloudwatch-logs', {})">
            <Icon name="i-heroicons-document-text" class="w-3.5 h-3.5 mr-1" />
            View Logs
          </UButton>
          <UButton size="xs" color="violet" variant="soft" @click="$emit('navigateTool', 'access-audit', { resourceId: result.resource.resourceId })">
            <Icon name="i-heroicons-eye" class="w-3.5 h-3.5 mr-1" />
            Audit Access
          </UButton>
          <UButton size="xs" color="red" variant="soft" @click="$emit('navigateTool', 'security-posture', {})">
            <Icon name="i-heroicons-shield-check" class="w-3.5 h-3.5 mr-1" />
            Security
          </UButton>
          <UButton size="xs" color="gray" variant="soft" @click="openConsole">
            <Icon name="i-heroicons-arrow-top-right-on-square" class="w-3.5 h-3.5 mr-1" />
            AWS Console
          </UButton>
        </div>
        <!-- CLI Hint -->
        <div class="mt-2 text-xs text-gray-400 font-mono bg-gray-100 dark:bg-gray-800 rounded px-2 py-1 cursor-pointer hover:text-gray-600 transition-colors" @click="copyText(`aws ec2 describe-instances --instance-ids ${result.resource.resourceId} --region ${result.resource.region}`)">
          $ aws ec2 describe-instances --instance-ids {{ result.resource.resourceId }} --region {{ result.resource.region }}
          <Icon name="i-heroicons-clipboard" class="w-3 h-3 inline ml-1" />
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
const emit = defineEmits<{ navigateTool: [toolId: string, params: Record<string, string>] }>()

const environmentOptions = [
  { label: 'GovCloud', value: 'govcloud' },
  { label: 'Commercial', value: 'commercial' }
]

const query = ref('')
const environment = ref<'commercial' | 'govcloud'>('govcloud')
const loading = ref(false)
const result = ref<any>(null)
const error = ref('')

async function searchInstance() {
  if (!query.value.trim()) { error.value = 'Please enter an instance ID, name, or IP'; return }
  loading.value = true; error.value = ''; result.value = null
  const isIP = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(query.value.trim())
  try {
    const response = await $fetch('/api/support/ip-lookup', {
      params: { ip: isIP ? query.value.trim() : undefined, instanceId: !isIP ? query.value.trim() : undefined, environment: environment.value }
    })
    result.value = (response as any).data
  } catch (err: any) {
    error.value = err.data?.error?.message || err.message || 'Failed to lookup instance'
  } finally { loading.value = false }
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.add({ title: 'Copied to clipboard', icon: 'i-heroicons-clipboard-document-check', color: 'green', timeout: 2000 })
  } catch { /* silent */ }
}

function openConsole() {
  if (!result.value?.resource) return
  const r = result.value.resource
  const region = r.region || 'us-east-1'
  const url = `https://${region}.console.aws.amazon.com/ec2/home?region=${region}#InstanceDetails:instanceId=${r.resourceId}`
  window.open(url, '_blank', 'noopener')
}

function exportResult() {
  if (!result.value) return
  const blob = new Blob([JSON.stringify(result.value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = `instance-lookup-${query.value}-${Date.now()}.json`; a.click()
  URL.revokeObjectURL(url)
  toast.add({ title: 'Results exported', icon: 'i-heroicons-arrow-down-tray', color: 'green', timeout: 2000 })
}
</script>
