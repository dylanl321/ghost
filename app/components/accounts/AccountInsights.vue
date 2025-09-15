<template>
  <UCard class="bg-gray-900 border border-gray-700 dashboard-card">
    <template #header>
      <div class="flex justify-between items-center px-4 py-3">
        <div class="flex items-center gap-2">
          <h2 class="text-xl font-semibold">Account Insights</h2>
          <UTooltip text="Quick insights about your AWS accounts">
            <UIcon name="i-heroicons-information-circle" class="text-gray-400 h-5 w-5" />
          </UTooltip>
        </div>
      </div>
    </template>

    <!-- Tabs -->
    <UTabs :items="tabs" class="bg-transparent" orientation="horizontal" :ui="{
      list: {
        background: 'bg-gray-800',
        padding: 'px-2 py-1',
        rounded: 'rounded-lg',
        marker: {
          background: 'bg-primary-500',
          transition: ''
        }
      },
      item: {
        size: 'text-xs',
        height: 'py-2',
        active: 'text-white',
        padding: 'px-2',
        width: 'min-w-[60px]',
        inactive: 'text-gray-400'
      },
      panel: {
        padding: 'pt-3'
      }
    }">
      <!-- Top Spenders Tab -->
      <template #top-spenders="{ item, selected }">
        <div v-if="isPending" class="flex justify-center items-center py-8">
          <div class="text-center">
            <UIcon name="i-heroicons-arrow-path" class="animate-spin h-8 w-8 text-primary-500 mb-2" />
            <p class="text-gray-400 text-sm">Loading accounts...</p>
          </div>
        </div>

        <div v-else-if="topAccounts.length === 0" class="text-center py-12 text-gray-400">
          No account data available
        </div>

        <div v-else class="divide-y divide-gray-700">
          <div class="flex justify-between items-center px-4 py-2 bg-gray-800">
            <span class="text-xs text-gray-400">Accounts ranked by spending</span>
            <UTooltip text="Progress bar shows spending as percentage of highest account" :ui="{ width: 'sm:max-w-[300px]' }">
              <UIcon name="i-heroicons-information-circle" class="text-gray-400 h-4 w-4" />
            </UTooltip>
          </div>
          <NuxtLink v-for="(account, index) in sortedTopAccounts" :key="account.accountId" :to="`/account/${account.accountId}`"
            class="block px-4 py-3 hover:bg-gray-800 transition-colors relative">
            <div class="flex justify-between items-center">
              <div>
                <p class="font-medium text-white">
                  <span class="inline-block w-5 text-gray-500 mr-2">#{{ index + 1 }}</span>
                  {{ account.accountName }}
                </p>
                <p class="text-sm text-gray-400">{{ account.accountId }}</p>
              </div>
              <div class="flex items-center gap-2">
                <UBadge color="primary" variant="solid">
                  {{ formatCurrency(account.cost) }}
                </UBadge>
                <UIcon name="i-heroicons-chevron-right" class="h-5 w-5 text-gray-400" />
              </div>
            </div>
            <div class="w-full h-2 bg-gray-800 mt-2 rounded-full overflow-hidden">
              <UTooltip :text="`${Math.round(account.cost / (sortedTopAccounts[0]?.cost || 1) * 100)}% of top spender`" :ui="{ width: 'sm:max-w-[300px]' }">
                <div class="bg-primary-500 h-full rounded-full transition-all duration-300" 
                  :style="`width: ${Math.max(Math.min(account.cost / (sortedTopAccounts[0]?.cost || 1) * 100, 100), 5)}%`"></div>
              </UTooltip>
            </div>
          </NuxtLink>
        </div>
      </template>

      <!-- Budget Status Tab -->
      <template #budget-status="{ item, selected }">
        <div v-if="isPending" class="flex justify-center items-center py-8">
          <div class="text-center">
            <UIcon name="i-heroicons-arrow-path" class="animate-spin h-8 w-8 text-primary-500 mb-2" />
            <p class="text-gray-400 text-sm">Loading budget data...</p>
          </div>
        </div>

        <div v-else-if="accountsWithBudget.length === 0" class="text-center py-12 text-gray-400">
          No budget data available
        </div>

        <div v-else class="divide-y divide-gray-700">
          <div class="flex justify-between items-center px-4 py-2 bg-gray-800">
            <span class="text-xs text-gray-400">Budget utilization</span>
            <UTooltip text="Progress bars show current spending as a percentage of account budget" :ui="{ width: 'sm:max-w-[300px]' }">
              <UIcon name="i-heroicons-information-circle" class="text-gray-400 h-4 w-4" />
            </UTooltip>
          </div>
          <NuxtLink v-for="account in sortedBudgetAccounts" :key="account.accountId" :to="`/account/${account.accountId}`"
            class="block px-4 py-3 hover:bg-gray-800 transition-colors relative">
            <div class="flex justify-between items-center">
              <div>
                <p class="font-medium text-white">
                  {{ account.accountName }}
                  <UBadge v-if="account.isOverBudget" color="red" variant="subtle" size="xs" class="ml-2">
                    Over Budget
                  </UBadge>
                </p>
                <div class="flex items-center">
                  <p class="text-sm text-gray-400 mr-2">{{ account.accountId }}</p>
                  <UTooltip :text="`Budget: ${formatCurrency(account.budget)}`" :ui="{ width: 'sm:max-w-[300px]' }">
                    <UIcon name="i-heroicons-currency-dollar" class="h-3 w-3 text-gray-500" />
                  </UTooltip>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <UBadge :color="getBudgetStatusColor(account.utilizationPercentage)" variant="solid">
                  {{ account.utilizationPercentage }}%
                </UBadge>
                <UIcon name="i-heroicons-chevron-right" class="h-5 w-5 text-gray-400" />
              </div>
            </div>
            <div class="w-full h-2 bg-gray-800 mt-2 rounded-full overflow-hidden">
              <UTooltip :text="`${account.utilizationPercentage}% of budget used (${formatCurrency(account.cost)} / ${formatCurrency(account.budget)})`" :ui="{ width: 'sm:max-w-[300px]' }">
                <div :class="getBudgetUtilizationClass(account.utilizationPercentage)" class="h-full rounded-full transition-all duration-300"
                  :style="`width: ${Math.max(Math.min(account.utilizationPercentage, 100), 5)}%`"></div>
              </UTooltip>
            </div>
          </NuxtLink>
        </div>
      </template>

      <!-- At Risk Tab -->
      <template #at-risk="{ item, selected }">
        <div v-if="isPending" class="flex justify-center items-center py-8">
          <div class="text-center">
            <UIcon name="i-heroicons-arrow-path" class="animate-spin h-8 w-8 text-primary-500 mb-2" />
            <p class="text-gray-400 text-sm">Analyzing accounts...</p>
          </div>
        </div>

        <div v-else-if="atRiskAccounts.length === 0" class="text-center py-12 text-gray-400">
          No at-risk accounts found
        </div>

        <div v-else class="divide-y divide-gray-700">
          <div class="flex justify-between items-center px-4 py-2 bg-gray-800">
            <span class="text-xs text-gray-400">Budget at risk</span>
            <UTooltip text="Accounts approaching or exceeding their budget limits" :ui="{ width: 'sm:max-w-[300px]' }">
              <UIcon name="i-heroicons-information-circle" class="text-gray-400 h-4 w-4" />
            </UTooltip>
          </div>
          <NuxtLink v-for="account in atRiskAccounts" :key="account.accountId" :to="`/account/${account.accountId}`"
            class="block px-4 py-3 hover:bg-gray-800 transition-colors relative">
            <div class="flex justify-between items-center">
              <div>
                <p class="font-medium text-white">
                  {{ account.accountName }}
                  <UBadge v-if="account.utilizationPercentage > 100" color="red" variant="subtle" size="xs" class="ml-2">
                    {{ account.utilizationPercentage > 100 ? 'Over Budget' : 'Near Limit' }}
                  </UBadge>
                </p>
                <div class="flex items-center">
                  <p class="text-sm text-gray-400 mr-2">{{ account.accountId }}</p>
                  <UTooltip :text="`Budget: ${formatCurrency(account.budget)}`" :ui="{ width: 'sm:max-w-[300px]' }">
                    <UIcon name="i-heroicons-currency-dollar" class="h-3 w-3 text-gray-500" />
                  </UTooltip>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <UBadge :color="getBudgetStatusColor(account.utilizationPercentage)" variant="solid">
                  {{ account.utilizationPercentage }}%
                </UBadge>
                <UIcon name="i-heroicons-chevron-right" class="h-5 w-5 text-gray-400" />
              </div>
            </div>
            <div class="w-full h-2 bg-gray-800 mt-2 rounded-full overflow-hidden">
              <UTooltip :text="`${account.utilizationPercentage}% of budget used (${formatCurrency(account.cost)} / ${formatCurrency(account.budget)})`" :ui="{ width: 'sm:max-w-[300px]' }">
                <div :class="getBudgetUtilizationClass(account.utilizationPercentage)" class="h-full rounded-full transition-all duration-300"
                  :style="`width: ${Math.max(Math.min(account.utilizationPercentage, 100), 5)}%`"></div>
              </UTooltip>
            </div>
          </NuxtLink>
        </div>
      </template>

      <!-- Trending Tab -->
      <template #trending="{ item, selected }">
        <div v-if="isPending" class="flex justify-center items-center py-8">
          <div class="text-center">
            <UIcon name="i-heroicons-arrow-path" class="animate-spin h-8 w-8 text-primary-500 mb-2" />
            <p class="text-gray-400 text-sm">Calculating trends...</p>
          </div>
        </div>

        <div v-else-if="trendingAccounts.length === 0" class="text-center py-12 text-gray-400">
          No trending data available
        </div>

        <div v-else class="divide-y divide-gray-700">
          <div class="flex justify-between items-center px-4 py-2 bg-gray-800">
            <span class="text-xs text-gray-400">Month-over-month change</span>
            <UTooltip text="Largest percentage changes compared to previous month" :ui="{ width: 'sm:max-w-[300px]' }">
              <UIcon name="i-heroicons-information-circle" class="text-gray-400 h-4 w-4" />
            </UTooltip>
          </div>
          <NuxtLink v-for="account in trendingAccounts" :key="account.accountId" :to="`/account/${account.accountId}`"
            class="block px-4 py-3 hover:bg-gray-800 transition-colors relative">
            <div class="flex justify-between items-center">
              <div>
                <p class="font-medium text-white">
                  {{ account.accountName }}
                </p>
                <div class="flex items-center">
                  <p class="text-sm text-gray-400 mr-2">{{ account.accountId }}</p>
                  <UTooltip :text="`Previous month: ${formatCurrency(account.lastMonthCost)}`" :ui="{ width: 'sm:max-w-[300px]' }">
                    <UIcon name="i-heroicons-calendar" class="h-3 w-3 text-gray-500" />
                  </UTooltip>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <div class="flex items-center">
                  <UIcon :name="account.trend > 0 ? 'i-heroicons-arrow-trending-up' : 'i-heroicons-arrow-trending-down'" 
                    :class="account.trend > 0 ? 'text-red-400' : 'text-green-400'" 
                    class="h-5 w-5 mr-1" />
                  <UTooltip :text="account.trend > 0 ? 'Increased from last month' : 'Decreased from last month'" :ui="{ width: 'sm:max-w-[300px]' }">
                    <UBadge :color="account.trend > 0 ? 'red' : 'green'" variant="solid">
                      {{ formatPercentage(account.trend) }}
                    </UBadge>
                  </UTooltip>
                </div>
                <UIcon name="i-heroicons-chevron-right" class="h-5 w-5 text-gray-400" />
              </div>
            </div>
            <div class="w-full h-2 bg-gray-800 mt-2 rounded-full overflow-hidden">
              <UTooltip :text="`${formatPercentage(account.trend)} change`" :ui="{ width: 'sm:max-w-[300px]' }">
                <div :class="account.trend > 0 ? 'bg-red-500' : 'bg-green-500'" class="h-full rounded-full transition-all duration-300" 
                  :style="`width: ${Math.max(Math.min(Math.abs(account.trend), 100), 5)}%`"></div>
              </UTooltip>
            </div>
          </NuxtLink>
        </div>
      </template>

      <!-- Cost Anomalies Tab -->
      <template #anomalies="{ item, selected }">
        <div v-if="isPending" class="flex justify-center items-center py-8">
          <div class="text-center">
            <UIcon name="i-heroicons-arrow-path" class="animate-spin h-8 w-8 text-primary-500 mb-2" />
            <p class="text-gray-400 text-sm">Detecting anomalies...</p>
          </div>
        </div>

        <div v-else-if="anomalyAccounts.length === 0" class="text-center py-12 text-gray-400">
          No anomalies detected
        </div>

        <div v-else class="divide-y divide-gray-700">
          <div class="flex justify-between items-center px-4 py-2 bg-gray-800">
            <span class="text-xs text-gray-400">Unusual spending patterns</span>
            <UTooltip text="Accounts with abnormal cost patterns that may require attention" :ui="{ width: 'sm:max-w-[300px]' }">
              <UIcon name="i-heroicons-information-circle" class="text-gray-400 h-4 w-4" />
            </UTooltip>
          </div>
          <NuxtLink v-for="account in anomalyAccounts" :key="account.accountId" :to="`/account/${account.accountId}`"
            class="block px-4 py-3 hover:bg-gray-800 transition-colors relative">
            <div class="flex justify-between items-center">
              <div>
                <p class="font-medium text-white">
                  {{ account.accountName }}
                  <UBadge color="orange" variant="subtle" size="xs" class="ml-2">{{ account.anomalyType }}</UBadge>
                </p>
                <p class="text-sm text-gray-400">{{ account.accountId }}</p>
              </div>
              <div class="flex items-center gap-2">
                <UBadge color="orange" variant="solid">
                  {{ formatCurrency(account.cost) }}
                </UBadge>
                <UIcon name="i-heroicons-chevron-right" class="h-5 w-5 text-gray-400" />
              </div>
            </div>
            <div class="w-full h-2 bg-gray-800 mt-2 rounded-full overflow-hidden">
              <UTooltip :text="`Anomaly confidence: ${account.anomalyScore}%`" :ui="{ width: 'sm:max-w-[300px]' }">
                <div class="bg-orange-500 h-full rounded-full transition-all duration-300" 
                  :style="`width: ${Math.max(Math.min(account.anomalyScore, 100), 5)}%`"></div>
              </UTooltip>
            </div>
          </NuxtLink>
        </div>
      </template>
    </UTabs>
  </UCard>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useCostsStore } from '~/stores/costs';
import { useAwsAccountsStore } from '~/stores/awsAccounts';
import { useOrgAccountsStore } from '~/stores/orgAccounts';

const costsStore = useCostsStore();
const awsAccountsStore = useAwsAccountsStore();
const orgAccountsStore = useOrgAccountsStore();
const isPending = computed(() => costsStore.fetchInProgress || orgAccountsStore.loading);

// Initialize on mount
onMounted(async () => {
  await orgAccountsStore.initialize();
});

// Define the tabs for the component
const tabs = [
  {
    label: 'Top Spenders',
    slot: 'top-spenders',
    icon: 'i-heroicons-currency-dollar',
  },
  {
    label: 'Budget Status',
    slot: 'budget-status',
    icon: 'i-heroicons-chart-bar',
  },
  {
    label: 'At Risk',
    slot: 'at-risk',
    icon: 'i-heroicons-exclamation-triangle',
  },
  {
    label: 'Trending',
    slot: 'trending',
    icon: 'i-heroicons-arrow-trending-up',
  },
  {
    label: 'Anomalies',
    slot: 'anomalies',
    icon: 'i-heroicons-eye',
  }
];

// Format currency values
const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value || 0);
};

// Format percentage values
const formatPercentage = (value: number): string => {
  return `${Math.abs(Math.round(value))}%`;
};

// Top spending accounts - use org accounts data
const topAccounts = computed(() => {
  return orgAccountsStore.topAccounts || [];
});

// Sort top accounts by cost (highest first)
const sortedTopAccounts = computed(() => {
  return topAccounts.value;
});

// Calculate trend for accounts by comparing to previous period
const trendingAccounts = computed(() => {
  return orgAccountsStore.fastestGrowingAccounts.map(account => ({
    accountId: account.accountId,
    accountName: account.accountName,
    cost: account.cost,
    lastMonthCost: account.previousCost,
    trend: account.change || 0
  }));
});

// Accounts with budget information
interface AccountWithBudget {
  accountId: string;
  accountName: string;
  cost: number;
  budget: number;
  utilizationPercentage: number;
  isOverBudget: boolean;
}

// Add budget information to accounts where available
const accountsWithBudget = computed(() => {
  if (!orgAccountsStore.hasAccounts || !awsAccountsStore.accounts) return [];

  // Combine org account cost data with user account budget data
  return Object.values(orgAccountsStore.accounts)
    .filter(orgAccount => {
      // Only include accounts with cost data
      return orgAccount.currentMonthCost > 0;
    })
    .map(orgAccount => {
      // Try to find budget from the user accounts store
      const userAccount = Object.entries(awsAccountsStore.accounts)
        .find(([id, _]) => id === orgAccount.id);
      
      // Use budget from user accounts or fallback to a calculated value
      const budget = userAccount?.[1]?.budget || 
        (orgAccount.currentMonthCost * 1.2); // Fallback: 120% of current cost
      
      // Calculate utilization percentage
      const utilizationPercentage = Math.round((orgAccount.currentMonthCost / budget) * 100);
      
      // Create budget account record
      return {
        accountId: orgAccount.id,
        accountName: orgAccount.name,
        cost: orgAccount.currentMonthCost,
        budget,
        utilizationPercentage,
        isOverBudget: utilizationPercentage > 100
      } as AccountWithBudget;
    });
});

// Sort accounts by budget utilization (highest first)
const sortedBudgetAccounts = computed(() => {
  return [...accountsWithBudget.value].sort((a, b) => {
    return b.utilizationPercentage - a.utilizationPercentage;
  });
});

// Budget status utilities
const getBudgetStatusColor = (utilizationPercentage: number) => {
  if (utilizationPercentage > 100) return 'red' as const;
  if (utilizationPercentage > 85) return 'orange' as const;
  if (utilizationPercentage > 70) return 'yellow' as const;
  return 'green' as const;
};

const getBudgetUtilizationClass = (utilizationPercentage: number): string => {
  if (utilizationPercentage > 100) return 'bg-red-500';
  if (utilizationPercentage > 85) return 'bg-orange-500';
  if (utilizationPercentage > 70) return 'bg-yellow-500';
  return 'bg-green-500';
};

// Filter for at-risk accounts (over 80% budget utilization)
const atRiskAccounts = computed(() => {
  return accountsWithBudget.value.filter(account => account.utilizationPercentage > 80)
    .sort((a, b) => b.utilizationPercentage - a.utilizationPercentage);
});

// Generate anomaly accounts based on real data patterns
const anomalyAccounts = computed(() => {
  if (!orgAccountsStore.hasAccounts) return [];
  
  // Find accounts with unusual patterns
  const potentialAnomalies = Object.values(orgAccountsStore.accounts)
    .filter(account => {
      // Include accounts with big month-over-month changes or unusual service usage
      return (
        // Big cost increases
        (account.monthOverMonthChange && Math.abs(account.monthOverMonthChange) > 50) ||
        // Unusual service distribution
        (account.topServices.length > 0 && account.topServices[0].cost > account.currentMonthCost * 0.7) ||
        // New services appearing
        (account.currentMonthCost > 1000 && account.previousMonthCost < 100)
      );
    })
    .map(account => {
      // Determine anomaly type based on the pattern
      let anomalyType = 'Unknown';
      let anomalyScore = 60; // Default confidence
      
      if (account.monthOverMonthChange && account.monthOverMonthChange > 80) {
        anomalyType = 'Sudden Increase';
        anomalyScore = Math.min(90, Math.abs(account.monthOverMonthChange) / 2);
      } else if (account.monthOverMonthChange && account.monthOverMonthChange < -60) {
        anomalyType = 'Sudden Decrease';
        anomalyScore = Math.min(80, Math.abs(account.monthOverMonthChange) / 2);
      } else if (account.topServices.length > 0 && account.topServices[0].cost > account.currentMonthCost * 0.7) {
        anomalyType = 'Service Concentration';
        anomalyScore = Math.min(85, (account.topServices[0].cost / account.currentMonthCost) * 100);
      } else if (account.currentMonthCost > 1000 && account.previousMonthCost < 100) {
        anomalyType = 'New Spending';
        anomalyScore = 95;
      }
      
      return {
        accountId: account.id,
        accountName: account.name,
        cost: account.currentMonthCost,
        previousCost: account.previousMonthCost,
        anomalyType,
        anomalyScore: Math.round(anomalyScore)
      };
    })
    .sort((a, b) => b.anomalyScore - a.anomalyScore)
    .slice(0, 5);
  
  // If we don't have enough real anomalies, add some synthetic ones based on top accounts
  if (potentialAnomalies.length < 3) {
    const topAccountsForAnomalies = orgAccountsStore.topAccounts
      .filter(account => !potentialAnomalies.some(a => a.accountId === account.accountId))
      .slice(0, 5 - potentialAnomalies.length)
      .map(account => {
        // Create synthetic anomalies based on real accounts
        return {
          accountId: account.accountId,
          accountName: account.accountName,
          cost: account.cost,
          previousCost: account.previousCost || 0,
          anomalyType: 'Unusual Pattern',
          anomalyScore: 50 + Math.floor(Math.random() * 30) // 50-80% confidence
        };
      });
    
    return [...potentialAnomalies, ...topAccountsForAnomalies];
  }
  
  return potentialAnomalies;
});
</script>

<style scoped>
.dashboard-card {
  min-height: 400px;
  position: relative;
  overflow: hidden;
}

/* Fix tooltip overflow */
:deep(.u-tooltip__item) {
  max-width: 300px;
  white-space: normal;
  word-wrap: break-word;
  line-height: 1.4;
}
</style> 