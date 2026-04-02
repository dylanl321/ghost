<template>
  <div class="space-y-4">
    <div v-if="!supportContext.isAccountReady.value" class="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
      <Icon name="i-heroicons-information-circle" class="w-4 h-4 inline mr-1" />
      Select an account in the context bar above to check patch compliance.
    </div>
    <div class="flex gap-4 flex-wrap">
      <SupportInstanceSelector v-model="instanceId" placeholder="Select instance (optional)" no-account-placeholder="Enter instance ID (optional)" class="flex-1 min-w-[200px]" />
      <UButton color="primary" :loading="loading" :disabled="!supportContext.isAccountReady.value" @click="fetchPatchCompliance">
        <Icon name="i-heroicons-arrow-path" class="w-4 h-4 mr-1" />
        Check
      </UButton>
    </div>

    <div v-if="data" class="space-y-4">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
          <div class="text-2xl font-bold text-green-600">{{ data.summary?.compliantInstances || 0 }}</div>
          <div class="text-xs text-gray-500">Compliant</div>
        </div>
        <div class="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 text-center">
          <div class="text-2xl font-bold text-red-600">{{ data.summary?.nonCompliantInstances || 0 }}</div>
          <div class="text-xs text-gray-500">Non-Compliant</div>
        </div>
        <div class="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3 text-center">
          <div class="text-2xl font-bold text-yellow-600">{{ data.summary?.totalMissingPatches || 0 }}</div>
          <div class="text-xs text-gray-500">Missing Patches</div>
        </div>
        <div class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-center">
          <div class="text-2xl font-bold text-blue-600">{{ data.summary?.compliancePercentage || 0 }}%</div>
          <div class="text-xs text-gray-500">Compliance</div>
        </div>
      </div>

      <!-- Compliance bar -->
      <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
        <div class="h-2 rounded-full transition-all duration-500" :class="{
          'bg-green-500': (data.summary?.compliancePercentage || 0) >= 90,
          'bg-yellow-500': (data.summary?.compliancePercentage || 0) >= 70 && (data.summary?.compliancePercentage || 0) < 90,
          'bg-red-500': (data.summary?.compliancePercentage || 0) < 70
        }" :style="{ width: `${data.summary?.compliancePercentage || 0}%` }" />
      </div>

      <div v-if="data.recommendations?.length > 0" class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
        <h4 class="font-medium text-gray-900 dark:text-white mb-2">Recommendations</h4>
        <ul class="text-sm text-gray-600 dark:text-gray-400 space-y-1">
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
const supportContext = useSupportContext()

const instanceId = ref('')
const loading = ref(false)
const data = ref<any>(null)
const error = ref('')

async function fetchPatchCompliance() {
  if (!supportContext.isAccountReady.value) { error.value = 'Account selection is required'; return }
  loading.value = true; error.value = ''; data.value = null
  try {
    const response = await $fetch('/api/support/patch-compliance', {
      params: { accountId: supportContext.state.accountId, instanceId: instanceId.value || undefined, environment: supportContext.state.environment }
    })
    data.value = (response as any).data
  } catch (err: any) {
    error.value = err.data?.error?.message || err.message || 'Failed to fetch patch compliance'
  } finally { loading.value = false }
}
</script>
