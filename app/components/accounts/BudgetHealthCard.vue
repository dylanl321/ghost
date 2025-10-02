<template>
  <UCard class="bg-gray-900 border border-gray-800">
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-heroicons-chart-pie" class="text-blue-500 w-5 h-5" />
        <h3 class="font-semibold text-lg">Budget Health</h3>
      </div>
    </template>

    <div v-if="loading" class="flex items-center justify-center py-8">
      <UIcon
        name="i-heroicons-arrow-path"
        class="w-6 h-6 animate-spin text-gray-400"
      />
    </div>

    <div v-else class="space-y-4">
      <!-- Progress Bar -->
      <div>
        <div class="flex justify-between items-baseline mb-2">
          <span class="text-sm text-gray-400">Budget Utilization</span>
          <span :class="utilizationColorClass" class="text-2xl font-bold">
            {{ utilizationPercent }}%
          </span>
        </div>
        <div class="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
          <div
            :class="utilizationBgClass"
            class="h-3 rounded-full transition-all duration-500"
            :style="{ width: Math.min(utilizationPercent, 100) + '%' }"
          />
        </div>
      </div>

      <!-- Key Metrics Grid -->
      <div class="grid grid-cols-2 gap-4">
        <div class="bg-gray-800/50 rounded-lg p-3">
          <div class="text-xs text-gray-400 mb-1">Monthly Budget</div>
          <div class="text-lg font-semibold text-white">
            {{ formatCurrency(budget) }}
          </div>
        </div>

        <div class="bg-gray-800/50 rounded-lg p-3">
          <div class="text-xs text-gray-400 mb-1">Current Spend</div>
          <div class="text-lg font-semibold text-blue-400">
            {{ formatCurrency(currentSpend) }}
          </div>
        </div>

        <div class="bg-gray-800/50 rounded-lg p-3">
          <div class="text-xs text-gray-400 mb-1">Daily Burn Rate</div>
          <div class="text-lg font-semibold text-purple-400">
            {{ formatCurrency(burnRate) }}/day
          </div>
        </div>

        <div class="bg-gray-800/50 rounded-lg p-3">
          <div class="text-xs text-gray-400 mb-1">Projected MTD</div>
          <div :class="projectedColorClass" class="text-lg font-semibold">
            {{ formatCurrency(projectedSpend) }}
          </div>
        </div>
      </div>

      <!-- Simple Forecast Timeline -->
      <div
        v-if="forecastTimeline.length > 0 && budget > 0"
        class="bg-gray-800/50 rounded-lg p-4"
      >
        <div class="flex items-center justify-between mb-4">
          <div class="text-xs font-medium text-gray-300">Spend Projection</div>
          <div class="text-xs text-gray-400">
            Budget: {{ formatCurrency(budget) }}
          </div>
        </div>

        <!-- Horizontal Timeline -->
        <div class="relative px-2 pb-8">
          <!-- Timeline line (grey) -->
          <div class="absolute left-2 right-2 top-1.5 h-0.5 bg-gray-700" />

          <!-- Date markers -->
          <div class="relative flex justify-between">
            <div
              v-for="(point, index) in forecastTimeline"
              :key="point.date"
              class="flex flex-col items-center"
            >
              <!-- Dot marker -->
              <div
                :class="
                  point.exceeds
                    ? 'bg-red-500 ring-2 ring-red-900'
                    : 'bg-green-500'
                "
                class="w-3.5 h-3.5 rounded-full z-10 relative"
              />
              <!-- Date label -->
              <div class="text-[10px] text-gray-400 mt-2 whitespace-nowrap">
                {{ point.label }}
              </div>
              <!-- Amount -->
              <div
                class="text-[10px] font-medium mt-0.5 whitespace-nowrap"
                :class="point.exceeds ? 'text-red-400' : 'text-gray-300'"
              >
                {{ formatCurrency(point.cumulative) }}
              </div>
            </div>
          </div>
          <!-- Budget exceed marker -->
          <div
            v-if="exactExceedPosition !== null && budgetExceedDate && !exceedDayMatchesDot"
            class="absolute left-2 right-2 top-1.5 z-20"
          >
            <div
              class="absolute -translate-y-1/2 -translate-x-1/2 cursor-help"
              :style="{ left: markerLeftPosition }"
            >
              <UTooltip
                :text="`Budget exceeded on ${budgetExceedDate}`"
                :popper="{ placement: 'top' }"
              >
                <div
                  class="bg-gray-800 rounded-full p-0.5 ring-2 ring-orange-500/40 hover:ring-orange-500/60 transition-all"
                >
                  <UIcon
                    name="i-heroicons-exclamation-triangle-solid"
                    class="w-3.5 h-3.5 text-orange-400"
                  />
                </div>
              </UTooltip>
            </div>
          </div>
        </div>
      </div>

      <!-- Warning/Status Message -->
      <div
        v-if="statusMessage"
        :class="statusBgClass"
        class="rounded-lg p-3 text-sm"
      >
        <div class="flex items-start gap-2">
          <UIcon :name="statusIcon" class="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{{ statusMessage }}</span>
        </div>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
const props = defineProps<{
  budget: number;
  currentSpend: number;
  forecastData: any;
  loading?: boolean;
}>();

// Calculate days in current month and current day
const now = new Date();
const currentDay = now.getDate();
const daysInMonth = new Date(
  now.getFullYear(),
  now.getMonth() + 1,
  0
).getDate();

// Calculate metrics
const utilizationPercent = computed(() => {
  if (props.budget === 0) return 0;
  return Math.round((props.currentSpend / props.budget) * 100);
});

// Use AWS forecast data for burn rate (more accurate)
const burnRate = computed(() => {
  if (currentDay === 0) return 0;
  return props.currentSpend / currentDay;
});

// Use AWS Cost Explorer forecast for projected spend
const projectedSpend = computed(() => {
  // If we have forecast data from AWS, use it (current spend + forecast for rest of month)
  if (props.forecastData?.forecast?.total?.Amount) {
    const forecastRemaining = parseFloat(
      props.forecastData.forecast.total.Amount
    );
    return props.currentSpend + forecastRemaining;
  }

  // Fallback to simple calculation if no forecast data
  return burnRate.value * daysInMonth;
});

// Build simple forecast timeline from AWS data (weekly snapshots)
const forecastTimeline = computed(() => {
  if (!props.forecastData?.forecast?.forecastResultsByTime) return [];

  const timeline: Array<{
    date: string;
    label: string;
    cumulative: number;
    exceeds: boolean;
  }> = [];

  let cumulative = props.currentSpend;

  // Get forecast periods from AWS (daily data)
  const periods = props.forecastData.forecast.forecastResultsByTime || [];

  // Show weekly snapshots (every 7th day) plus the last day
  periods.forEach((period: any, index: number) => {
    const meanValue = parseFloat(period.MeanValue || "0");
    cumulative += meanValue;

    // Show every 7th day or the last day
    const isWeekMark = (index + 1) % 7 === 0;
    const isLastDay = index === periods.length - 1;

    if (isWeekMark || isLastDay) {
      const endDate = new Date(period.TimePeriod?.End || "");
      const label = endDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });

      timeline.push({
        date: period.TimePeriod?.End || "",
        label,
        cumulative,
        exceeds: cumulative > props.budget,
      });
    }
  });

  return timeline;
});

// Find EXACT day when budget will be exceeded (not just weekly checkpoints)
const exactBudgetExceed = computed(() => {
  if (!props.forecastData?.forecast?.forecastResultsByTime) return null;

  let cumulative = props.currentSpend;
  const periods = props.forecastData.forecast.forecastResultsByTime || [];

  for (let i = 0; i < periods.length; i++) {
    const period = periods[i];
    const meanValue = parseFloat(period.MeanValue || "0");
    cumulative += meanValue;

    if (cumulative > props.budget) {
      const endDate = new Date(period.TimePeriod?.End || "");
      return {
        date: period.TimePeriod?.End || "",
        label: endDate.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        dayIndex: i,
        totalDays: periods.length,
      };
    }
  }

  return null;
});

// Calculate position relative to the DOTS (not days) since dots are evenly spaced
const exactExceedPosition = computed(() => {
  if (!exactBudgetExceed.value || forecastTimeline.value.length === 0)
    return null;

  const exceedDayIndex = exactBudgetExceed.value.dayIndex;
  const periods = props.forecastData?.forecast?.forecastResultsByTime || [];

  // Find which two dots the exceed date falls between
  let prevDotIndex = -1;
  let nextDotIndex = -1;
  let prevDayIndex = -1;
  let nextDayIndex = -1;

  // Build a map of dot positions to their day indices
  const dotDayIndices: number[] = [];
  periods.forEach((period: any, dayIdx: number) => {
    const isWeekMark = (dayIdx + 1) % 7 === 0;
    const isLastDay = dayIdx === periods.length - 1;
    if (isWeekMark || isLastDay) {
      dotDayIndices.push(dayIdx);
    }
  });

  // Find surrounding dots
  for (let i = 0; i < dotDayIndices.length; i++) {
    if (dotDayIndices[i] >= exceedDayIndex) {
      nextDotIndex = i;
      nextDayIndex = dotDayIndices[i];
      if (i > 0) {
        prevDotIndex = i - 1;
        prevDayIndex = dotDayIndices[i - 1];
      }
      break;
    }
  }

  // If exceed is before first dot or after last dot
  if (prevDotIndex === -1) return 0;
  if (nextDotIndex === -1) return 100;

  // Calculate position between the two dots
  const daysBetweenDots = nextDayIndex - prevDayIndex;
  const daysFromPrevDot = exceedDayIndex - prevDayIndex;
  const proportionBetweenDots = daysFromPrevDot / daysBetweenDots;

  // Dots are evenly spaced, so calculate position
  const dotSpacing = 100 / (forecastTimeline.value.length - 1);
  const position =
    prevDotIndex * dotSpacing + proportionBetweenDots * dotSpacing;

  return position;
});

const budgetExceedDate = computed(() => {
  return exactBudgetExceed.value ? exactBudgetExceed.value.label : null;
});

// Check if the exceed day matches one of the displayed dots
const exceedDayMatchesDot = computed(() => {
  if (!exactBudgetExceed.value) return false;

  const exceedDate = exactBudgetExceed.value.date;
  return forecastTimeline.value.some((point) => point.date === exceedDate);
});

// Calculate the left position for the marker (just use percentage, container handles padding)
const markerLeftPosition = computed(() => {
  if (exactExceedPosition.value === null) return '0%';
  return `${exactExceedPosition.value}%`;
});

// Color coding based on utilization
const utilizationColorClass = computed(() => {
  const util = utilizationPercent.value;
  if (util >= 100) return "text-red-400";
  if (util >= 90) return "text-yellow-400";
  if (util >= 80) return "text-orange-400";
  return "text-green-400";
});

const utilizationBgClass = computed(() => {
  const util = utilizationPercent.value;
  if (util >= 100) return "bg-red-500";
  if (util >= 90) return "bg-yellow-500";
  if (util >= 80) return "bg-orange-500";
  return "bg-green-500";
});

const projectedColorClass = computed(() => {
  if (projectedSpend.value > props.budget) return "text-red-400";
  if (projectedSpend.value > props.budget * 0.95) return "text-yellow-400";
  return "text-green-400";
});

// Status message
const statusMessage = computed(() => {
  const projected = projectedSpend.value;
  const budget = props.budget;

  if (budget === 0) {
    return "No budget set for this account";
  }

  if (projected > budget * 1.2) {
    return `Projected to exceed budget by ${formatCurrency(
      projected - budget
    )} (${Math.round(((projected - budget) / budget) * 100)}%)`;
  }
  if (projected > budget) {
    return `On track to exceed budget by ${formatCurrency(projected - budget)}`;
  }
  if (utilizationPercent.value >= 90) {
    return `${100 - utilizationPercent.value}% of budget remaining with ${
      daysInMonth - currentDay
    } days left`;
  }
  if (projected < budget * 0.5) {
    return `Tracking well below budget - projected ${Math.round(
      (projected / budget) * 100
    )}% utilization`;
  }
  return `On track for ${Math.round(
    (projected / budget) * 100
  )}% budget utilization`;
});

const statusBgClass = computed(() => {
  const projected = projectedSpend.value;
  const budget = props.budget;

  if (projected > budget)
    return "bg-red-900/20 text-red-300 border border-red-800";
  if (utilizationPercent.value >= 90)
    return "bg-yellow-900/20 text-yellow-300 border border-yellow-800";
  return "bg-blue-900/20 text-blue-300 border border-blue-800";
});

const statusIcon = computed(() => {
  const projected = projectedSpend.value;
  if (projected > props.budget) return "i-heroicons-exclamation-triangle";
  if (utilizationPercent.value >= 90) return "i-heroicons-exclamation-circle";
  return "i-heroicons-information-circle";
});

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};
</script>
