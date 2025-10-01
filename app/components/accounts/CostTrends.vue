<template>
  <UCard class="bg-gray-900 border border-gray-700">
    <template #header>
      <div class="flex justify-between items-center">
        <h3 class="text-lg font-semibold">Cost Trends</h3>
      </div>
    </template>
    <div class="grid grid-cols-3 gap-4 p-4">
      <div class="bg-gray-800/50 rounded-lg p-4">
        <div class="flex items-center justify-between">
          <span class="text-sm text-gray-400">vs Last Month</span>
          <UBadge
            :color="monthlyChange >= 0 ? 'red' : 'green'"
            variant="subtle"
            class="text-xs"
          >
            {{ monthlyChange >= 0 ? '+' : '' }}{{ monthlyChange }}%
          </UBadge>
        </div>
        <p class="text-2xl font-bold mt-2">{{ formatCurrency(monthlyDiff) }}</p>
      </div>
      
      <div class="bg-gray-800/50 rounded-lg p-4">
        <div class="flex items-center justify-between">
          <span class="text-sm text-gray-400">vs Last Week</span>
          <UBadge
            :color="weeklyChange >= 0 ? 'red' : 'green'"
            variant="subtle"
            class="text-xs"
          >
            {{ weeklyChange >= 0 ? '+' : '' }}{{ weeklyChange }}%
          </UBadge>
        </div>
        <p class="text-2xl font-bold mt-2">{{ formatCurrency(weeklyDiff) }}</p>
      </div>

      <div class="bg-gray-800/50 rounded-lg p-4">
        <div class="flex items-center justify-between">
          <span class="text-sm text-gray-400">Trend</span>
          <UBadge
            :color="trend === 'increasing' ? 'red' : trend === 'decreasing' ? 'green' : 'gray'"
            variant="subtle"
            class="text-xs"
          >
            {{ trend }}
          </UBadge>
        </div>
        <!-- <div class="h-[40px] mt-2">
          <SparklineChart :data="sparklineData" />
        </div> -->
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import { computed } from 'vue';
// import SparklineChart from '../charts/SparklineChart.vue';

const props = defineProps({
  costData: {
    type: Array,
    required: true
  }
});

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
};

// Calculate monthly difference
const monthlyDiff = computed(() => {
  if (!props.costData.length) return 0;
  const currentTotal = props.costData.reduce((sum, item) => sum + item.cost, 0);
  const lastMonthTotal = props.costData.reduce((sum, item) => {
    const date = new Date(item.date);
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    return date.getMonth() === lastMonth.getMonth() ? sum + item.cost : sum;
  }, 0);
  return currentTotal - lastMonthTotal;
});

// Calculate weekly difference
const weeklyDiff = computed(() => {
  if (!props.costData.length) return 0;
  const lastWeekStart = new Date();
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  
  const thisWeekCosts = props.costData
    .filter(item => new Date(item.date) > lastWeekStart)
    .reduce((sum, item) => sum + item.cost, 0);
  
  const previousWeekCosts = props.costData
    .filter(item => {
      const date = new Date(item.date);
      return date <= lastWeekStart && date > new Date(lastWeekStart.getTime() - 7 * 24 * 60 * 60 * 1000);
    })
    .reduce((sum, item) => sum + item.cost, 0);
  
  return thisWeekCosts - previousWeekCosts;
});

// Calculate percentage changes
const monthlyChange = computed(() => {
  if (!props.costData.length) return 0;
  const lastMonthTotal = props.costData.reduce((sum, item) => {
    const date = new Date(item.date);
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    return date.getMonth() === lastMonth.getMonth() ? sum + item.cost : sum;
  }, 0);
  return lastMonthTotal ? Math.round((monthlyDiff.value / lastMonthTotal) * 100) : 0;
});

const weeklyChange = computed(() => {
  if (!props.costData.length) return 0;
  const lastWeekStart = new Date();
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  
  const previousWeekCosts = props.costData
    .filter(item => {
      const date = new Date(item.date);
      return date <= lastWeekStart && date > new Date(lastWeekStart.getTime() - 7 * 24 * 60 * 60 * 1000);
    })
    .reduce((sum, item) => sum + item.cost, 0);
  
  return previousWeekCosts ? Math.round((weeklyDiff.value / previousWeekCosts) * 100) : 0;
});

// Calculate trend
const trend = computed(() => {
  if (!props.costData.length) return 'stable';
  const recentCosts = props.costData.slice(-7).map(item => item.cost);
  const average = recentCosts.reduce((sum, cost) => sum + cost, 0) / recentCosts.length;
  const latestCost = recentCosts[recentCosts.length - 1];
  
  if (latestCost > average * 1.05) return 'increasing';
  if (latestCost < average * 0.95) return 'decreasing';
  return 'stable';
});

// // Prepare sparkline data
// const sparklineData = computed(() => {
//   if (!props.costData.length) return [];
//   return props.costData.slice(-14).map(item => item.cost);
// });
// </script> 