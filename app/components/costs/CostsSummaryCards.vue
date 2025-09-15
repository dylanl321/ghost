<template>
  <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
    <div class="bg-gray-900 border border-gray-700 rounded-lg p-4">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-gray-400 text-sm">Total Accounts</p>
          <p class="text-2xl font-bold text-white">{{ totalAccounts }}</p>
        </div>
        <Icon name="i-heroicons-building-office" class="w-8 h-8 text-blue-500" />
      </div>
    </div>

    <div class="bg-gray-900 border border-gray-700 rounded-lg p-4">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-gray-400 text-sm">Total Budget</p>
          <p class="text-2xl font-bold text-white">
            <span v-if="totalBudget > 0">{{ formatCurrency(totalBudget) }}</span>
            <span v-else class="text-gray-500 text-base">N/A</span>
          </p>
        </div>
        <Icon name="i-heroicons-banknotes" class="w-8 h-8" :class="totalBudget > 0 ? 'text-green-500' : 'text-gray-600'" />
      </div>
    </div>

    <div class="bg-gray-900 border border-gray-700 rounded-lg p-4">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-gray-400 text-sm">Total Spend</p>
          <p class="text-2xl font-bold text-white">{{ formatCurrency(totalSpend) }}</p>
        </div>
        <Icon name="i-heroicons-credit-card" class="w-8 h-8 text-orange-500" />
      </div>
    </div>

    <div class="bg-gray-900 border border-gray-700 rounded-lg p-4">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-gray-400 text-sm">Utilization</p>
          <p class="text-2xl font-bold text-white">
            <span v-if="totalBudget > 0">{{ utilization }}%</span>
            <span v-else class="text-gray-500 text-base">N/A</span>
          </p>
        </div>
        <Icon name="i-heroicons-chart-pie" class="w-8 h-8" :class="totalBudget > 0 ? 'text-purple-500' : 'text-gray-600'" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  totalAccounts: number,
  totalBudget: number,
  totalSpend: number,
  utilization: number,
  formatCurrency: (value: number) => string
}>()
</script>


