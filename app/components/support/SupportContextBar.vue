<template>
  <UCard class="bg-white dark:bg-gray-800">
    <div class="space-y-4">
      <!-- Mode Toggle -->
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-4">
          <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Mode:</span>
          <div class="flex items-center gap-2">
            <UButton
              :color="context.state.mode === 'global' ? 'primary' : 'gray'"
              size="sm"
              @click="context.setMode('global')"
            >
              <Icon name="i-heroicons-globe-alt" class="w-4 h-4 mr-1" />
              Global Search
            </UButton>
            <UButton
              :color="context.state.mode === 'account' ? 'primary' : 'gray'"
              size="sm"
              @click="context.setMode('account')"
            >
              <Icon name="i-heroicons-building-office" class="w-4 h-4 mr-1" />
              Account Focus
            </UButton>
          </div>
        </div>

        <!-- Environment selector (always visible) -->
        <div class="flex items-center gap-2">
          <span class="text-sm text-gray-500">Environment:</span>
          <USelect
            :model-value="context.state.environment"
            :options="environmentOptions"
            class="w-36"
            @update:model-value="(val: string) => context.setEnvironment(val as 'commercial' | 'govcloud')"
          />
        </div>
      </div>

      <!-- Account Selection (only in Account Focus mode) -->
      <div v-if="context.state.mode === 'account'" class="flex items-center gap-4">
        <div class="flex-1 max-w-md">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Account
          </label>
          <SupportAccountSelector
            :model-value="context.state.accountId"
            :environment="context.state.environment"
            placeholder="Select an account to enable tools"
            @update:model-value="handleAccountChange"
          />
        </div>

        <!-- Account name display -->
        <div v-if="context.state.accountName" class="text-sm text-gray-600 dark:text-gray-400 pt-5">
          <span class="font-medium">{{ context.state.accountName }}</span>
        </div>
      </div>

      <!-- Resource Counts (only when account selected) -->
      <div
        v-if="context.state.mode === 'account' && context.state.accountId"
        class="flex items-center gap-3 pt-2 border-t border-gray-200 dark:border-gray-700"
      >
        <span class="text-sm text-gray-500">Resources:</span>

        <!-- Instances badge -->
        <UBadge
          :color="context.isLoading.value ? 'gray' : (context.resourceCounts.value.instances > 0 ? 'blue' : 'gray')"
          variant="soft"
          class="cursor-default"
        >
          <Icon
            v-if="context.state.instancesLoading"
            name="i-heroicons-arrow-path"
            class="w-3 h-3 mr-1 animate-spin"
          />
          <Icon v-else name="i-heroicons-server" class="w-3 h-3 mr-1" />
          {{ context.state.instancesLoading ? 'Loading...' : `${context.resourceCounts.value.instances} Instances` }}
        </UBadge>

        <!-- Running/Stopped breakdown -->
        <template v-if="!context.state.instancesLoading && context.resourceCounts.value.instances > 0">
          <span class="text-xs text-gray-400">
            ({{ context.resourceCounts.value.runningInstances }} running,
            {{ context.resourceCounts.value.stoppedInstances }} stopped)
          </span>
        </template>

        <!-- Log groups badge -->
        <UBadge
          :color="context.isLoading.value ? 'gray' : (context.resourceCounts.value.logGroups > 0 ? 'orange' : 'gray')"
          variant="soft"
          class="cursor-default"
        >
          <Icon
            v-if="context.state.logGroupsLoading"
            name="i-heroicons-arrow-path"
            class="w-3 h-3 mr-1 animate-spin"
          />
          <Icon v-else name="i-heroicons-document-text" class="w-3 h-3 mr-1" />
          {{ context.state.logGroupsLoading ? 'Loading...' : `${context.resourceCounts.value.logGroups} Log Groups` }}
        </UBadge>

        <!-- Refresh button -->
        <UButton
          v-if="!context.isLoading.value"
          size="xs"
          variant="ghost"
          color="gray"
          @click="context.loadResources"
        >
          <Icon name="i-heroicons-arrow-path" class="w-4 h-4" />
        </UButton>

        <!-- Error indicators -->
        <UTooltip v-if="context.state.instancesError" :text="context.state.instancesError">
          <Icon name="i-heroicons-exclamation-triangle" class="w-4 h-4 text-yellow-500" />
        </UTooltip>
        <UTooltip v-if="context.state.logGroupsError" :text="context.state.logGroupsError">
          <Icon name="i-heroicons-exclamation-triangle" class="w-4 h-4 text-yellow-500" />
        </UTooltip>
      </div>

      <!-- Helper text when no account selected -->
      <div
        v-if="context.state.mode === 'account' && !context.state.accountId"
        class="text-sm text-gray-500 dark:text-gray-400 italic"
      >
        Select an account above to enable account-specific tools and preload resources.
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
const context = useSupportContext()

const environmentOptions = [
  { label: 'GovCloud', value: 'govcloud' },
  { label: 'Commercial', value: 'commercial' }
]

function handleAccountChange(accountId: string) {
  context.setAccount(accountId)
}
</script>
