<template>
  <div class="mx-auto max-w-6xl p-6"><div class="mb-6"><h1 class="text-2xl font-semibold">My MCP Usage</h1><p class="text-sm text-gray-500">Your private GHOST MCP activity history.</p></div><div class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3"><UCard><div class="text-xs text-gray-500">Calls</div><div class="text-2xl font-semibold">{{ data?.summary.total ?? 0 }}</div></UCard><UCard><div class="text-xs text-gray-500">Success rate</div><div class="text-2xl font-semibold">{{ percent(data?.summary.successRate) }}</div></UCard><UCard><div class="text-xs text-gray-500">Average latency</div><div class="text-2xl font-semibold">{{ data?.summary.averageLatencyMs ?? 0 }}ms</div></UCard></div><UAlert v-if="loadError" class="mb-6" color="red" variant="soft" icon="i-heroicons-exclamation-triangle" title="Could not load your MCP usage" :description="loadError"><template #actions><UButton color="red" variant="soft" size="xs" :loading="loading" @click="load">Retry</UButton></template></UAlert><UCard><template #header><h2 class="font-semibold">Recent activity</h2></template><UTable :rows="data?.history || []" :columns="columns" :loading="loading"><template #timestamp-data="{ row }">{{ formatTimestamp(row.timestamp) }}</template><template #tool-data="{ row }"><code class="text-xs">{{ row.tool }}</code></template><template #client-data="{ row }">{{ clientLabel(row.client) }}</template><template #errorCode-data="{ row }"><code v-if="row.errorCode" class="text-xs text-red-600 dark:text-red-400">{{ row.errorCode }}</code><span v-else>-</span></template><template #errorExplanation-data="{ row }"><span class="block max-w-sm whitespace-normal text-xs">{{ row.errorExplanation || '-' }}</span></template><template #durationMs-data="{ row }">{{ row.durationMs }}ms</template></UTable></UCard></div>
</template>
<script setup lang="ts">
definePageMeta({ middleware: 'auth', title: 'My MCP Usage' })
const data = ref<any>(null)
const columns = [{ key: 'timestamp', label: 'Time' }, { key: 'tool', label: 'Tool' }, { key: 'client', label: 'Client' }, { key: 'source', label: 'Source' }, { key: 'status', label: 'Status' }, { key: 'errorCode', label: 'Error' }, { key: 'errorExplanation', label: 'Explanation' }, { key: 'durationMs', label: 'Latency' }]
const percent = (value?: number) => `${Math.round((value || 0) * 100)}%`
const formatTimestamp = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
const clientLabel = (value: string) => ({ codex_desktop: 'Codex Desktop', codex_cli: 'Codex CLI', codex_unknown: 'Codex surface unknown', claude_code: 'Claude Code', chatgpt: 'ChatGPT', other: 'Other', unknown: 'Unknown' } as Record<string, string>)[value] || 'Unknown'
const loading = ref(false)
const loadError = ref('')
async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const response = await $fetch<any>('/api/mcp-usage/me')
    data.value = response.data
  } catch (err: any) {
    loadError.value = err?.data?.message || err?.message || 'The usage service did not respond.'
  } finally {
    loading.value = false
  }
}
onMounted(load)
</script>
