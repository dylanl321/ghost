<template>
  <div class="space-y-6">
    <!-- Recipients by Type -->
    <div>
      <h4 class="text-sm font-medium text-gray-900 dark:text-white mb-3">Recipients by Alert Type</h4>
      <div v-if="recipientsByType && recipientsByType.length > 0" class="space-y-2">
        <div
          v-for="config in recipientsByType"
          :key="config.config_section"
          class="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg"
        >
          <div class="flex items-center gap-2 mb-2">
            <span class="text-xs font-medium px-2 py-0.5 rounded" :class="getAlertTypeClass(config.alert_type)">
              {{ config.alert_type }}
            </span>
            <span v-if="config.level" class="text-xs font-medium px-2 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">
              {{ config.level }}
            </span>
          </div>
          <div class="text-xs space-y-1">
            <div><span class="text-gray-500">TO:</span> <span class="font-mono">{{ (config.to || []).join(', ') }}</span></div>
            <div v-if="config.cc && config.cc.length"><span class="text-gray-500">CC:</span> <span class="font-mono">{{ config.cc.join(', ') }}</span></div>
          </div>
        </div>
      </div>
      <div v-else class="text-gray-500 dark:text-gray-400 text-sm">No recipient configurations.</div>
    </div>

    <!-- Static Recipients -->
    <div v-if="staticRecipients && staticRecipients.mappings">
      <h4 class="text-sm font-medium text-gray-900 dark:text-white mb-3">Static Email Mappings</h4>
      <div class="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
        <dl class="space-y-1 text-xs">
          <div v-for="(email, role) in staticRecipients.mappings" :key="role" class="flex justify-between">
            <dt class="text-gray-600 dark:text-gray-400">{{ role }}</dt>
            <dd class="font-mono">{{ email }}</dd>
          </div>
        </dl>
      </div>
    </div>

    <!-- LOB Recipients Summary -->
    <div v-if="lobRecipients && lobRecipients.length > 0">
      <h4 class="text-sm font-medium text-gray-900 dark:text-white mb-3">LOB Recipients ({{ lobRecipients.length }})</h4>
      <div class="flex flex-wrap gap-2">
        <span
          v-for="lob in lobRecipients"
          :key="lob.lob_name"
          class="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded"
        >
          {{ lob.lob_name }}
        </span>
      </div>
    </div>

    <!-- Account Recipients Summary -->
    <div v-if="accountRecipients && accountRecipients.length > 0">
      <h4 class="text-sm font-medium text-gray-900 dark:text-white mb-3">Account-Specific Recipients ({{ accountRecipients.length }})</h4>
      <div class="flex flex-wrap gap-2">
        <span
          v-for="acct in accountRecipients"
          :key="acct.config_scope"
          class="text-xs px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded font-mono"
        >
          {{ acct.config_scope }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  recipientsByType: Array<Record<string, any>> | null
  staticRecipients: Record<string, any> | null
  lobRecipients: Array<Record<string, any>> | null
  accountRecipients: Array<Record<string, any>> | null
}>()

function getAlertTypeClass(type: string): string {
  const classes: Record<string, string> = {
    FORECAST: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
    ACTUAL: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
    MONTHLY: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
    ANOMALY: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
  }
  return classes[type] || 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
}
</script>
