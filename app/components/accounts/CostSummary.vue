<template>
  <UCard class="bg-gray-900 border border-gray-700">
    <template #header>
      <div class="flex justify-between items-center">
        <h3 class="text-lg font-semibold">Cost Summary</h3>
        <div class="flex items-center gap-2 text-xs text-gray-400">
          <UIcon name="i-heroicons-sparkles" class="text-purple-400" />
          Powered by AI
        </div>
      </div>
    </template>
    <div v-if="costSummaryPending" class="flex justify-center py-8">
      <UIcon name="i-heroicons-arrow-path" class="animate-spin h-8 w-8" />
    </div>
    <div v-else-if="error" class="p-4 text-red-400">
      {{ error }}
    </div>
    <div v-else class="prose prose-invert max-w-none">
      <div class="p-4 rounded-lg bg-gray-800/50 border border-gray-700">
        <div v-html="costSummary"></div>
      </div>
      <div class="mt-4 flex gap-4 text-sm text-gray-400">
        <div class="flex items-center gap-1">
          <UIcon name="i-heroicons-calendar" />
          <span>Analysis period: {{ dateRange }}</span>
        </div>
        <div class="flex items-center gap-1">
          <UIcon name="i-heroicons-clock" />
          <span>Last updated: {{ formattedLastUpdate }}</span>
        </div>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { format } from 'date-fns';
import { useTimeframeStore } from '~/stores/timeframe';

interface CostSummaryResponse {
  value: string;
  lastUpdated?: string;
  error?: string;
}

const timeframeStore = useTimeframeStore();
const error = ref<string | null>(null);
const costSummary = ref('');
const costSummaryPending = ref(true);
const lastUpdated = ref<Date | null>(null);

const dateRange = computed(() => {
  const { start, end } = timeframeStore.formattedDateRange;
  return `${format(new Date(start), 'MMM dd')} - ${format(new Date(end), 'MMM dd, yyyy')}`;
});

const formattedLastUpdate = computed(() => {
  if (!lastUpdated.value) return 'Just now';
  return format(lastUpdated.value, 'MMM dd, yyyy HH:mm');
});

const getDateRange = () => {
  const { start, end } = timeframeStore.formattedDateRange;
  return {
    startDate: start,
    endDate: end
  };
};

const fetchCostSummary = async () => {
  costSummaryPending.value = true;
  error.value = null;
  
  try {
    const { startDate, endDate } = getDateRange();
    
    const data: CostSummaryResponse = await $fetch('/api/costs/get-cost-summary', {
      params: {
        startDate,
        endDate
      }
    });
    
    if (data.error) {
      throw new Error(data.error);
    }
    
    costSummary.value = data.value.replace(/\n/g, '<br>');
    if (data.lastUpdated) {
      lastUpdated.value = new Date(data.lastUpdated);
    } else {
      lastUpdated.value = new Date();
    }
  } catch (err) {
    console.error('Error fetching cost summary:', err);
    error.value = err instanceof Error ? err.message : 'Failed to fetch cost summary';
  } finally {
    costSummaryPending.value = false;
  }
};

// Watch for timeframe changes with debounce
watch(() => timeframeStore.formattedDateRange, 
  (newRange, oldRange) => {
    // Only fetch if the dates actually changed
    if (!oldRange || 
        newRange.start !== oldRange.start || 
        newRange.end !== oldRange.end) {
      fetchCostSummary();
    }
  }, 
  { 
    immediate: true,
    deep: true 
  }
);
</script>

<style scoped>
.prose :deep(p) {
  margin: 0.75em 0;
}

.prose :deep(p:first-child) {
  margin-top: 0;
}

.prose :deep(p:last-child) {
  margin-bottom: 0;
}
</style> 