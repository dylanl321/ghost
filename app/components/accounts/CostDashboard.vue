<!-- components/CostDashboard.vue -->

<template>
  <div class="h-full flex flex-col">

      <!-- Chart container with flex-1 to take remaining space -->
      <div class="flex-1 min-h-0 relative">
        <div v-if="isLoading" class="absolute inset-0 flex items-center justify-center bg-gray-900/50 z-10">
          <UIcon name="i-heroicons-arrow-path" class="animate-spin h-8 w-8" />
        </div>
        <div v-else-if="!chartData?.datasets?.[0]?.data?.length" class="flex items-center justify-center h-full">
          <p class="text-gray-400">No cost data available</p>
        </div>
        <div v-else class="h-full">
          <LineChart 
            :chart-data="chartData"
            :options="chartOptions"
            height="100%"
          />
        </div>
      </div>
      <!-- <template #fallback>
        <div class="flex-1 min-h-0 flex items-center justify-center">
          <div class="animate-pulse bg-gray-800 rounded-lg w-full h-full" />
        </div>
      </template> -->


    <!-- Cost Summary with fixed height -->
    <div class="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-700 h-[80px]">
      <div class="flex flex-col justify-center">
        <p class="text-sm text-gray-400">Total Cost</p>
        <p class="text-xl font-semibold truncate">{{ formatCurrency(totalCost) }}</p>
      </div>
      <div class="flex flex-col justify-center">
        <p class="text-sm text-gray-400">Average Daily</p>
        <p class="text-xl font-semibold truncate">{{ formatCurrency(averageCost) }}</p>
      </div>
      <div class="flex flex-col justify-center">
        <p class="text-sm text-gray-400">Peak Cost</p>
        <p class="text-xl font-semibold truncate">{{ formatCurrency(peakCost) }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { format, parseISO } from 'date-fns';
import { useTimeframeStore } from '~/stores/timeframe';
import LineChart from '~/components/accounts/charts/LineChart.vue';
import { Chart } from 'chart.js/auto';

interface CostDataItem {
  date: string;
  cost: number;
  estimated: boolean;
}

interface ChartDataset {
  label: string;
  data: number[];
  borderColor: string;
  backgroundColor: string | ((context: any) => string);
  borderWidth: number;
  fill: boolean;
  tension: number;
}

interface ChartData {
  labels: string[];
  datasets: ChartDataset[];
}

const props = defineProps<{
  accountId?: string;
  chartData?: CostDataItem[];
  organizationView?: boolean;
}>();

const emit = defineEmits<{
  error: [error: Error];
}>();

const timeframeStore = useTimeframeStore();
const isLoading = ref(false);
const costData = ref([]);

const initialChartData = {
  labels: [],
  datasets: [
    {
      label: 'Daily Cost',
      data: [],
      borderColor: 'rgb(147, 51, 234)',
      backgroundColor: 'rgba(147, 51, 234, 0.2)',
      borderWidth: 2,
      fill: true,
      tension: 0.4,
    }
  ]
};

const chartData = ref({ ...initialChartData });

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
};

// Cost metrics computations
const totalCost = computed(() => {
  const data = props.organizationView ? props.chartData : costData.value;
  return data?.reduce((sum, item) => sum + item.cost, 0) || 0;
});

const averageCost = computed(() => {
  const data = props.organizationView ? props.chartData : costData.value;
  return data?.length ? totalCost.value / data.length : 0;
});

const peakCost = computed(() => {
  const data = props.organizationView ? props.chartData : costData.value;
  return data?.length ? Math.max(...data.map(item => item.cost)) : 0;
});

const fetchCostData = async () => {
  isLoading.value = true;
  try {
    const { start, end } = timeframeStore.formattedDateRange;
    
    // Safe URL construction to prevent errors in SSR or when window is not defined
    let baseUrl = '/api/get-cost-details';
    try {
      baseUrl = new URL('/api/get-cost-details', window?.location?.origin || 'http://localhost').toString();
    } catch (e) {
      console.warn('URL construction error, using fallback path:', e);
    }
    
    // Build the query string manually if URL construction fails
    const params = new URLSearchParams();
    params.append('startDate', start);
    params.append('endDate', end);
    if (props.accountId) {
      params.append('accountId', props.accountId);
    }
    
    const url = `${baseUrl}?${params.toString()}`;
    
    // Add error handling for fetch call
    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      if (!Array.isArray(data)) {
        throw new Error('Invalid data format received');
      }

      costData.value = data;

      if (data.length > 0) {
        chartData.value = {
          labels: data.map(item => format(parseISO(item.date), 'MMM dd')),
          datasets: [{
            ...initialChartData.datasets[0],
            data: data.map(item => item.cost)
          }]
        };
      }
    } catch (fetchError) {
      emit('error', new Error(`API request failed: ${fetchError.message}`));
      throw fetchError;
    }
  } catch (error) {
    console.error('Error fetching cost data:', error);
    chartData.value = { ...initialChartData };
    // Generate mock data if in development mode
    if (process.dev) {
      generateMockData();
    }
  } finally {
    isLoading.value = false;
  }
};

// Generate mock data for development and error states
const generateMockData = () => {
  console.log('Generating mock cost data');
  const mockData = [];
  const today = new Date();
  const { startDateObj, endDateObj } = timeframeStore;
  
  // Get the date range from the timeframe store
  let currentDate = new Date(startDateObj);
  
  // Generate random cost data for each day in the range
  while (currentDate <= endDateObj) {
    // Higher costs during weekdays, lower on weekends
    const dayOfWeek = currentDate.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const baseCost = isWeekend ? 500 : 1200;
    
    mockData.push({
      date: currentDate.toISOString().split('T')[0],
      cost: baseCost + Math.random() * baseCost * 0.5,
      estimated: currentDate > today
    });
    
    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  costData.value = mockData;
  
  // Update chart data
  chartData.value = {
    labels: mockData.map(item => format(parseISO(item.date), 'MMM dd')),
    datasets: [{
      ...initialChartData.datasets[0],
      data: mockData.map(item => item.cost),
      borderColor: 'rgb(147, 51, 234)',
      backgroundColor: 'rgba(147, 51, 234, 0.2)',
      borderWidth: 2,
      fill: true,
      tension: 0.4,
    }]
  };
};

// Enhanced chart options
const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: {
    mode: 'index',
    intersect: false,
  },
  scales: {
    x: {
      grid: {
        display: false,
        drawBorder: false
      },
      ticks: {
        color: 'rgba(255, 255, 255, 0.7)',
        padding: 8
      },
      border: {
        display: false
      }
    },
    y: {
      grid: {
        color: 'rgba(255, 255, 255, 0.1)',
        drawBorder: false
      },
      ticks: {
        color: 'rgba(255, 255, 255, 0.7)',
        padding: 8,
        callback: (value) => formatCurrency(value)
      },
      border: {
        display: false
      }
    }
  },
  plugins: {
    backgroundBar: {
      beforeDraw(chart) {
        const { ctx, chartArea, scales } = chart;
        if (!chartArea) return;

        // Draw weekend backgrounds
        ctx.save();
        const data = props.chartData || [];
        data.forEach((item, index) => {
          if (!item?.date) return;
          const date = parseISO(item.date);
          const dayOfWeek = date.getDay();
          if (dayOfWeek === 0 || dayOfWeek === 6) { // Weekend
            const x = scales.x.getPixelForValue(index);
            const nextX = scales.x.getPixelForValue(index + 1);
            const barWidth = nextX - x || scales.x.getPixelForValue(1) - scales.x.getPixelForValue(0);
            
            // Only fill the chart area, not the axis areas
            ctx.fillStyle = 'rgba(75, 85, 99, 0.15)'; // Lighter gray for better visibility
            ctx.fillRect(
              x - barWidth / 2,
              chartArea.top,
              barWidth,
              chartArea.height
            );

            // Add a subtle label at the top
            ctx.fillStyle = 'rgba(75, 85, 99, 0.5)';
            ctx.font = '10px system-ui';
            ctx.textAlign = 'center';
            ctx.fillText(
              dayOfWeek === 0 ? 'Sun' : 'Sat',
              x,
              chartArea.top - 5
            );
          }
        });
        ctx.restore();
      }
    },
    legend: {
      display: false
    },
    tooltip: {
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      titleColor: 'rgba(255, 255, 255, 0.9)',
      bodyColor: 'rgba(255, 255, 255, 0.9)',
      callbacks: {
        label: (context) => {
          return formatCurrency(context.parsed.y);
        }
      }
    },
  }
};

// Move Chart registration to onMounted
let Chart: any;

onMounted(async () => {
  const { Chart: ChartJS } = await import('chart.js/auto');
  Chart = ChartJS;
  
  // Register the custom plugin
  Chart.register({
    id: 'backgroundBar',
    beforeDraw: (chart: any) => {
      const plugin = chart.config.options.plugins.backgroundBar;
      if (plugin && typeof plugin.beforeDraw === 'function') {
        plugin.beforeDraw(chart);
      }
    },
  });
});

// Watch for changes in accountId or timeframe
watch(
  [() => props.accountId, () => timeframeStore.formattedDateRange],
  () => {
    if (!props.organizationView && props.accountId) {
      fetchCostData();
    }
  },
  { immediate: true }
);

// Only fetch data if we're not in organization view
const fetchData = async () => {
  if (props.organizationView || props.chartData) return;
  // ... existing fetch logic for account-specific view ...
};

// Use provided data or fetched data
const displayData = computed(() => {
  return props.chartData || costData.value;
});

// Add console logs to track data flow
watch(() => props.chartData, (newData) => {
  console.log('Chart data changed:', newData);
  if (newData?.length) {
    chartData.value = {
      labels: newData.map(item => format(parseISO(item.date), 'MMM dd')),
      datasets: [{
        label: 'Daily Cost',
        data: newData.map(item => item.cost),
        borderColor: 'rgb(147, 51, 234)',
        backgroundColor: (context) => {
          const ctx = context.chart.ctx;
          const gradient = ctx.createLinearGradient(0, 0, 0, 400);
          gradient.addColorStop(0, 'rgba(147, 51, 234, 0.5)');
          gradient.addColorStop(1, 'rgba(147, 51, 234, 0)');
          return gradient;
        },
        borderWidth: 2,
        fill: true,
        tension: 0.4,
      }]
    };
    console.log('Updated chart data:', chartData.value);
  }
}, { immediate: true });

const updateChartData = (data) => {
  console.log('Updating chart with data:', data);
  chartData.value = {
    labels: data.map(item => format(parseISO(item.date), 'MMM dd')),
    datasets: [{
      ...initialChartData.datasets[0],
      data: data.map(item => item.cost)
    }]
  };
  console.log('New chart data:', chartData.value);
};
</script>

<style scoped>
.h-full {
  height: 100%;
}

/* Ensure text doesn't overflow */
.truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
