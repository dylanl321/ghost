<template>
  <div class="w-80 flex-shrink-0 border-r border-gray-700 h-full min-h-0 flex flex-col overflow-hidden">
    <div class="flex-1 bg-gray-900 flex flex-col min-h-0">
      <div class="flex items-center justify-between p-4 border-b border-gray-700">
        <h2 class="text-lg font-semibold text-white">Account Selector</h2>
        <UButton size="xs" variant="ghost" color="gray" icon="i-heroicons-arrow-path" :loading="isLoading" @click="$emit('refresh')" />
      </div>

      <div class="p-3 border-b border-gray-700">
        <UInput v-model="searchTerm" :placeholder="searchPlaceholder" icon="i-heroicons-magnifying-glass" size="sm">
          <template #trailing>
            <div class="flex items-center gap-1">
              <UTooltip v-if="searchTerm" :text="searchScopeTooltip">
                <UBadge :color="searchScope === 'global' ? 'blue' : 'gray'" size="xs" variant="soft" class="cursor-pointer" @click="$emit('toggle-scope')">
                  {{ searchScope === 'global' ? 'All' : 'Tab' }}
                </UBadge>
              </UTooltip>
              <UButton v-show="searchTerm !== ''" color="gray" variant="link" size="2xs" icon="i-heroicons-x-mark-20-solid" :padded="false" @click="$emit('clear-search')" />
            </div>
          </template>
        </UInput>
      </div>

      <div class="border-b border-gray-700">
        <div class="flex">
          <button v-for="tab in tabs" :key="tab.id" class="flex-1 px-3 py-2 text-xs font-medium border-b-2 transition-colors flex items-center justify-center gap-1" :class="{ 'text-blue-400 border-blue-400 bg-blue-900/20': activeTab === tab.id, 'text-gray-400 border-transparent hover:text-gray-300 hover:border-gray-600': activeTab !== tab.id }" @click="$emit('set-tab', tab.id)">
            <Icon :name="tab.icon" class="w-3 h-3" />
            <span class="leading-none">{{ tab.label }}</span>
          </button>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto min-h-0">
        <slot />
      </div>

      <div class="p-3 border-t border-gray-700 bg-gray-800/50">
        <div class="space-y-2">
          <div class="flex justify-between items-center">
            <span class="text-sm text-gray-300">
              {{ selectedAccounts.length === 0 ? `Showing all ${accountsList.length} accounts` : `${selectedAccounts.length} of ${accountsList.length} selected` }}
            </span>
            <UButton v-show="selectedAccounts.length > 0" size="xs" color="gray" variant="link" @click="$emit('clear-selection')">Clear</UButton>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">

defineProps<{
  isLoading: boolean,
  tabs: Array<{ id: string, label: string, icon: string }>,
  activeTab: string,
  searchTerm: string,
  searchScope: 'tab' | 'global',
  searchPlaceholder: string,
  searchScopeTooltip: string,
  selectedAccounts: string[],
  accountsList: AWSEnclaveData[]
}>()

defineEmits<{
  (e: 'refresh'): void,
  (e: 'clear-selection'): void,
  (e: 'toggle-scope'): void,
  (e: 'clear-search'): void,
  (e: 'set-tab', id: string): void,
}>()
</script>


