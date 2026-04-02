<template>
  <div class="space-y-4">
    <UTextarea v-model="query" placeholder="Describe what you're looking for in natural language (e.g., 'find the instance running payment service' or 'show me prod instances in finance account')" :rows="2" />
    <div class="flex gap-4 flex-wrap items-center">
      <USelect v-model="environment" :options="environmentOptions" class="w-40" />
      <UButton color="primary" :loading="loading" :disabled="!query.trim()" @click="runSmartDiscovery">
        <Icon name="i-heroicons-sparkles" class="w-4 h-4 mr-1" />
        Discover
      </UButton>
      <div class="flex items-center gap-2 text-xs text-gray-400">
        <Icon name="i-heroicons-light-bulb" class="w-3.5 h-3.5" />
        <span>Uses AI to interpret your request and search across accounts, instances, and resources.</span>
      </div>
    </div>

    <div v-if="results.length > 0" class="space-y-3">
      <div class="flex items-center justify-between text-sm">
        <span class="text-gray-600 dark:text-gray-400">
          Found {{ results.length }} results
          <span v-if="confidence" class="ml-2 text-indigo-600">({{ confidence }}% confidence)</span>
        </span>
        <UButton size="xs" variant="ghost" color="gray" @click="exportResults">
          <Icon name="i-heroicons-arrow-down-tray" class="w-4 h-4 mr-1" />
          Export
        </UButton>
      </div>
      <div class="space-y-2">
        <div v-for="result in results" :key="result.id" class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors">
          <div class="flex items-center gap-2 mb-1">
            <span class="text-xs px-2 py-0.5 rounded" :class="{
              'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300': result.type === 'account',
              'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300': result.type === 'instance',
              'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300': result.type === 'resource'
            }">
              {{ result.type }}
            </span>
            <span class="font-medium text-gray-900 dark:text-white">{{ result.name }}</span>
            <span class="text-xs text-gray-500">({{ result.confidence }}% match)</span>
          </div>
          <div class="text-xs text-gray-600 dark:text-gray-400">
            <span class="font-mono">{{ result.id }}</span>
            <span v-if="result.matchReason" class="ml-2 italic">- {{ result.matchReason }}</span>
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
const environmentOptions = [
  { label: 'GovCloud', value: 'govcloud' },
  { label: 'Commercial', value: 'commercial' }
]

const query = ref('')
const environment = ref<'commercial' | 'govcloud'>('govcloud')
const loading = ref(false)
const results = ref<any[]>([])
const confidence = ref(0)
const error = ref('')

async function runSmartDiscovery() {
  if (!query.value.trim()) { error.value = 'Please describe what you want to find'; return }
  loading.value = true; error.value = ''; results.value = []
  try {
    const response = await $fetch('/api/support/ai-resource-discovery', { method: 'POST', body: { query: query.value, environment: environment.value } })
    const data = (response as any).data
    results.value = data.results || []; confidence.value = data.confidence || 0
  } catch (err: any) {
    error.value = err.data?.error?.message || err.message || 'Failed to discover resources'
  } finally { loading.value = false }
}

function exportResults() {
  if (!results.value.length) return
  const blob = new Blob([JSON.stringify(results.value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = `smart-discovery-${Date.now()}.json`; a.click()
  URL.revokeObjectURL(url)
  toast.add({ title: 'Results exported', icon: 'i-heroicons-arrow-down-tray', color: 'green', timeout: 2000 })
}
</script>
