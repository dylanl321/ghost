<template>
  <div class="max-w-5xl mx-auto p-6"><div class="mb-6"><h1 class="text-2xl font-semibold">My MCP Usage</h1><p class="text-sm text-gray-500">Your private GHOST MCP activity history.</p></div><div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6"><UCard><div class="text-xs text-gray-500">Calls</div><div class="text-2xl font-semibold">{{ data?.summary.total ?? 0 }}</div></UCard><UCard><div class="text-xs text-gray-500">Success rate</div><div class="text-2xl font-semibold">{{ percent(data?.summary.successRate) }}</div></UCard><UCard><div class="text-xs text-gray-500">Average latency</div><div class="text-2xl font-semibold">{{ data?.summary.averageLatencyMs ?? 0 }}ms</div></UCard></div><UCard><template #header><h2 class="font-semibold">Recent activity</h2></template><UTable :rows="data?.history || []" :columns="columns" /></UCard></div>
</template>
<script setup lang="ts">
definePageMeta({ middleware: 'auth', title: 'My MCP Usage' })
const data = ref<any>(null)
const columns = [{ key: 'timestamp', label: 'Time' }, { key: 'tool', label: 'Tool' }, { key: 'status', label: 'Status' }, { key: 'durationMs', label: 'Latency' }]
const percent = (value?: number) => `${Math.round((value || 0) * 100)}%`
onMounted(async () => { const response = await $fetch<any>('/api/mcp-usage/me'); data.value = response.data })
</script>
