<template>
  <div class="max-w-7xl mx-auto p-6">
    <div class="flex items-center justify-between mb-6"><div><h1 class="text-2xl font-semibold">MCP Usage</h1><p class="text-sm text-gray-500">Metadata-only organization and team usage.</p></div><UButton icon="i-heroicons-arrow-path" :loading="loading" @click="load" /></div>
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6"><UCard><div class="text-xs text-gray-500">Tool calls</div><div class="text-2xl font-semibold">{{ summary?.total ?? 0 }}</div></UCard><UCard><div class="text-xs text-gray-500">Success rate</div><div class="text-2xl font-semibold">{{ percent(summary?.successRate) }}</div></UCard><UCard><div class="text-xs text-gray-500">Average latency</div><div class="text-2xl font-semibold">{{ summary?.averageLatencyMs ?? 0 }}ms</div></UCard><UCard><div class="text-xs text-gray-500">Fallbacks</div><div class="text-2xl font-semibold">{{ summary?.fallbackCount ?? 0 }}</div></UCard></div>
    <UCard><template #header><h2 class="font-semibold">Tool Adoption</h2></template><UTable :rows="summary?.byTool || []" :columns="columns" /></UCard>
  </div>
</template>
<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'auth-permission', permission: 'admin', title: 'MCP Usage' })
const loading = ref(false)
const summary = ref<any>(null)
const columns = [{ key: 'tool', label: 'Tool' }, { key: 'count', label: 'Calls' }, { key: 'successRate', label: 'Success rate' }]
const percent = (value?: number) => `${Math.round((value || 0) * 100)}%`
async function load() { loading.value = true; try { const response = await $fetch<any>('/api/admin/mcp-usage/overview'); summary.value = response.data } finally { loading.value = false } }
onMounted(load)
</script>
