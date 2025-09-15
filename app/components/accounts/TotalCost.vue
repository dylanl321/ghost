<template>
  <div class="h-full">
    <div class="flex justify-between items-center mb-4">
      <h2 class="text-xl font-bold">Total AWS Costs</h2>
      <div class="flex space-x-4">
        <UPopover :popper="{ placement: 'bottom-start' }">
          <UButton icon="i-heroicons-calendar-days-20-solid">
            {{ format(selected.start, 'd MMM, yyy') }} - {{ format(selected.end, 'd MMM, yyy') }}
          </UButton>
          <template #panel="{ close }">
            <div class="flex items-center sm:divide-x divide-gray-200 dark:divide-gray-800">
              <div class="hidden sm:flex flex-col py-4">
                <UButton v-for="(range, index) in ranges" :key="index" :label="range.label" color="gray" variant="ghost"
                  class="rounded-none px-6"
                  :class="[isRangeSelected(range.duration) ? 'bg-gray-100 dark:bg-gray-800' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50']"
                  truncate @click="selectRange(range.duration)" />
              </div>

              <DatePicker v-model="selected" @close="close" />
            </div>
          </template>
        </UPopover>
        <UButton @click="fetchCostData" color="primary">Update</UButton>
      </div>
    </div>
    <div class="h-[calc(100%-3rem)]">
      <LineChart v-if="isDataReady" :chart-data="chartData" :options="chartOptions" />
      <div v-else class="flex items-center justify-center h-full">
        <p class="text-gray-400">No cost data available</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { Chart as ChartJS, Title, Tooltip, Legend, LineElement, CategoryScale, LinearScale, PointElement } from 'chart.js'
import { sub, format, isSameDay, type Duration, parseISO } from 'date-fns'
import DatePicker from '../ui/DatePicker.vue'
import LineChart from '~/components/accounts/charts/LineChart.vue';

// Define props first
const props = defineProps({
  accountId: {
    type: String,
    required: true
  }
});

// Register Chart.js components
ChartJS.register(Title, Tooltip, Legend, LineElement, CategoryScale, LinearScale, PointElement);

// Add console log to check props
console.log('TotalCost component props:', props);

const ranges = [
  { label: 'Last 7 days', duration: { days: 7 } },
  { label: 'Last 14 days', duration: { days: 14 } },
  { label: 'Last 30 days', duration: { days: 30 } },
  { label: 'Last 3 months', duration: { months: 3 } },
  { label: 'Last 6 months', duration: { months: 6 } },
  { label: 'Last year', duration: { years: 1 } }
]

const selected = ref({ start: sub(new Date(), { days: 14 }), end: new Date() })

function isRangeSelected(duration: Duration) {
  return isSameDay(selected.value.start, sub(new Date(), duration)) && isSameDay(selected.value.end, new Date())
}

function selectRange(duration: Duration) {
  selected.value = { start: sub(new Date(), duration), end: new Date() }
}

const initialChartData = {
  labels: [],
  datasets: [
    {
      label: 'Daily AWS Cost (USD)',
      backgroundColor: 'rgba(139, 92, 246, 0.2)',
      borderColor: 'rgb(139, 92, 246)',
      data: [],
      borderWidth: 2,
      fill: true,
      tension: 0.4,
    }
  ]
};

const chartData = ref({ ...initialChartData });

// Add computed property to check if data is ready
const isDataReady = computed(() => {
  return chartData.value?.labels?.length > 0 &&
    chartData.value?.datasets?.[0]?.data?.length > 0;
});

const chartOptions = ref({
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    x: {
      type: 'category',
      title: {
        display: true,
        text: 'Date',
        color: '#ffffff',
      },
      ticks: {
        color: '#ffffff',
      },
    },
    y: {
      beginAtZero: true,
      title: {
        display: true,
        text: 'Cost (USD)',
        color: '#ffffff',
      },
      ticks: {
        callback: (value) => `$${value}`,
        color: '#ffffff',
      },
    },
  },
  plugins: {
    legend: {
      labels: {
        color: '#ffffff',
      },
    },
    tooltip: {
      callbacks: {
        label: (context) => {
          let label = context.dataset.label || '';
          if (label) {
            label += ': ';
          }
          if (context.parsed.y !== null) {
            label += `$${context.parsed.y}`;
          }
          return label;
        },
      },
    },
  },
});

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
};

const fetchCostData = async () => {
  if (!selected.value || !selected.value.start || !selected.value.end) {
    console.error('Start date or end date is not defined.')
    return;
  }

  try {
    const startDate = format(selected.value.start, 'yyyy-MM-dd');
    const endDate = format(selected.value.end, 'yyyy-MM-dd');

    console.log('Fetching cost data:', { accountId: props.accountId, startDate, endDate });

    const response = await fetch(
      `/api/get-cost-details?accountId=${props.accountId}&startDate=${startDate}&endDate=${endDate}`
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('Received data:', data);

    // Check if data is an error response
    if (data.error) {
      console.error('API Error:', data.error, data.details);
      chartData.value = { ...initialChartData };
      return;
    }

    // Ensure data is an array and has content
    if (!Array.isArray(data)) {
      console.error('Invalid data format received');
      chartData.value = { ...initialChartData };
      return;
    }

    // Filter out any invalid entries and ensure required properties exist
    const validData = data.filter(item =>
      item &&
      typeof item.date === 'string' &&
      typeof item.cost === 'number'
    );

    if (validData.length === 0) {
      console.log('No valid data available');
      chartData.value = { ...initialChartData };
      return;
    }

    // Create new chart data with validated data
    const newChartData = {
      labels: validData.map(item => format(parseISO(item.date), 'MMM dd')),
      datasets: [
        {
          ...initialChartData.datasets[0],
          data: validData.map(item => item.cost),
          borderColor: 'rgb(139, 92, 246)',
          backgroundColor: (context) => {
            const ctx = context.chart.ctx;
            const gradient = ctx.createLinearGradient(0, 0, 0, 400);
            gradient.addColorStop(0, 'rgba(139, 92, 246, 0.5)');
            gradient.addColorStop(1, 'rgba(139, 92, 246, 0)');
            return gradient;
          }
        },
      ],
    };

    chartOptions.value = {
      ...chartOptions.value,
      scales: {
        ...chartOptions.value.scales,
        y: {
          ...chartOptions.value.scales.y,
          ticks: {
            callback: (value) => formatCurrency(value),
            color: '#ffffff',
          }
        }
      },
      plugins: {
        ...chartOptions.value.plugins,
        tooltip: {
          ...chartOptions.value.plugins.tooltip,
          callbacks: {
            label: (context) => {
              let label = context.dataset.label || '';
              if (label) label += ': ';
              if (context.parsed.y !== null) {
                label += formatCurrency(context.parsed.y);
              }
              return label;
            }
          }
        }
      }
    };

    console.log('New chart data:', newChartData);
    chartData.value = newChartData;
  } catch (error) {
    console.error('Error fetching cost data:', error);
    chartData.value = { ...initialChartData };
  }
};

// Call fetchCostData when accountId changes
watch(() => props.accountId, (newId) => {
  if (newId) {
    fetchCostData();
  }
}, { immediate: true });

// Also call fetchCostData when selected dates change
watch(selected, () => {
  if (props.accountId) {
    fetchCostData();
  }
}, { deep: true });

onMounted(() => {
  fetchCostData()
})
</script>

<style scoped>
.flex {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.mb-6 {
  margin-bottom: 1.5rem;
}

.text-xl {
  font-size: 1.25rem;
}

.font-bold {
  font-weight: 700;
}

.space-x-4> :not(:last-child) {
  margin-right: 1rem;
}

.bg-gray-200 {
  background-color: #e5e7eb;
}

.dark\:bg-gray-800 {
  background-color: #1f2937;
}

.rounded-none {
  border-radius: 0;
}

.px-6 {
  padding-left: 1.5rem;
  padding-right: 1.5rem;
}

.hover\:bg-gray-50:hover {
  background-color: #f9fafb;
}

.dark\:hover\:bg-gray-800\/50:hover {
  background-color: rgba(31, 41, 55, 0.5);
}
</style>