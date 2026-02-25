<template>
  <UCard class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-chart-pie" class="text-blue-500 w-5 h-5" />
          <h3 class="font-semibold text-lg text-gray-900 dark:text-white">GDMS Forecast Health</h3>
        </div>
        <UButton
          to="/support/docs?topic=gdms-forecast-health"
          variant="ghost"
          size="xs"
          icon="i-heroicons-question-mark-circle"
          class="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
        >
          Help
        </UButton>
      </div>
    </template>

    <div v-if="loading" class="flex items-center justify-center py-8">
      <UIcon
        name="i-heroicons-arrow-path"
        class="w-6 h-6 animate-spin text-gray-500 dark:text-gray-400"
      />
    </div>

    <div v-else class="space-y-4">
      <!-- Progress Bar -->
      <div>
        <div class="flex justify-between items-baseline mb-2">
          <span class="text-sm text-gray-600 dark:text-gray-400">GDMS Forecast Utilization</span>
          <span :class="utilizationColorClass" class="text-2xl font-bold">
            {{ utilizationPercent }}%
          </span>
        </div>
        <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
          <div
            :class="utilizationBgClass"
            class="h-3 rounded-full transition-all duration-500"
            :style="{ width: Math.min(utilizationPercent, 100) + '%' }"
          />
        </div>
      </div>

      <!-- Key Metrics Grid -->
      <div class="grid grid-cols-2 gap-4">
        <div class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
          <div class="text-xs text-gray-600 dark:text-gray-400 mb-1">Monthly GDMS Forecast</div>
          <div class="text-lg font-semibold text-gray-900 dark:text-white">
            {{ formatCurrency(budget, 0) }}
          </div>
        </div>

        <div class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
          <div class="text-xs text-gray-600 dark:text-gray-400 mb-1">Current Spend</div>
          <div class="text-lg font-semibold text-blue-600 dark:text-blue-400">
            {{ formatCurrency(currentSpend, 0) }}
          </div>
        </div>

        <div class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
          <div class="text-xs text-gray-600 dark:text-gray-400 mb-1">Daily Burn Rate</div>
          <div class="text-lg font-semibold text-purple-600 dark:text-purple-400">
            {{ formatCurrency(burnRate, 0) }}/day
          </div>
        </div>

        <div class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
          <div class="text-xs text-gray-600 dark:text-gray-400 mb-1">AWS Projected MTD</div>
          <div :class="projectedColorClass" class="text-lg font-semibold">
            {{ formatCurrency(projectedSpend, 0) }}
          </div>
        </div>
      </div>

      <!-- Simple Forecast Timeline -->
      <div
        v-if="forecastTimeline.length > 0 && budget > 0"
        class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4"
      >
        <div class="flex items-center justify-between mb-4">
          <div class="text-xs font-medium text-gray-700 dark:text-gray-300">AWS Spend Projection</div>
          <div class="text-xs text-gray-600 dark:text-gray-400">
            GDMS Forecast: {{ formatCurrency(budget, 0) }}
          </div>
        </div>

        <!-- Horizontal Timeline -->
        <div class="relative px-2 pb-8">
          <!-- Timeline line (grey) -->
          <div class="absolute left-2 right-2 top-1.5 h-0.5 bg-gray-200 dark:bg-gray-700" />

          <!-- Date markers -->
          <div class="relative flex justify-between">
            <div
              v-for="point in forecastTimeline"
              :key="point.date"
              class="flex flex-col items-center"
            >
              <!-- Dot marker -->
              <div
                :class="[
                  point.exceeds ? 'bg-red-500' : 'bg-green-500',
                  point.isToday ? 'ring-2 ring-blue-400 shadow-lg' : point.exceeds ? 'ring-2 ring-red-900' : ''
                ]"
                class="w-3.5 h-3.5 rounded-full z-10 relative"
              />
              <!-- Date label -->
              <div
                class="text-[10px] mt-2 whitespace-nowrap"
                :class="point.isToday ? 'text-blue-600 dark:text-blue-400 font-semibold' : 'text-gray-500 dark:text-gray-400'"
              >
                {{ point.label }}
              </div>
              <!-- Amount -->
              <div
                class="text-[10px] font-medium mt-0.5 whitespace-nowrap"
                :class="point.isToday ? 'text-blue-600 dark:text-blue-300' : point.exceeds ? 'text-red-500 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'"
              >
                {{ formatCurrency(point.cumulative, 0) }}
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
                :text="budgetExceedTooltipText"
                :popper="{ placement: 'top' }"
              >
                <div
                  class="bg-white dark:bg-gray-800 rounded-full p-0.5 ring-2 ring-orange-500/40 hover:ring-orange-500/60 transition-all"
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
interface DailyCost {
  date: string;
  cost: number;
}

const props = defineProps<{
  budget: number;
  currentSpend: number;
  forecastData: any;
  dailyCosts?: DailyCost[];
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
  if (props.forecastData?.projection?.total?.Amount) {
    const forecastRemaining = parseFloat(
      props.forecastData.projection.total.Amount
    );
    return props.currentSpend + forecastRemaining;
  }

  // Fallback to simple calculation if no forecast data
  return burnRate.value * daysInMonth;
});

// Find EXACT day when budget was/will be exceeded (checking both historical and forecast data)
// This must be defined before forecastTimeline since timeline uses it
const exactBudgetExceed = computed(() => {
  if (props.budget === 0) return null;

  // First check historical data to see if budget was already exceeded (current month only)
  if (props.dailyCosts && props.dailyCosts.length > 0) {
    let cumulative = 0;

    // Filter to only include dates from the current month
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const sortedDailyCosts = [...props.dailyCosts]
      .filter((day) => {
        const dayDate = new Date(day.date);
        return dayDate >= currentMonthStart && dayDate <= currentMonthEnd;
      })
      .sort((a, b) =>
        new Date(a.date).getTime() - new Date(b.date).getTime()
      );

    for (let i = 0; i < sortedDailyCosts.length; i++) {
      const dayCost = sortedDailyCosts[i];
      if (!dayCost) continue;

      cumulative += dayCost.cost;

      if (cumulative > props.budget) {
        const endDate = new Date(dayCost.date);
        return {
          date: dayCost.date,
          label: endDate.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }),
          dayIndex: i,
          isHistorical: true,
        };
      }
    }
  }

  // If not exceeded yet, check forecast data (current month only)
  if (!props.forecastData?.projection?.forecastResultsByTime) return null;

  let cumulative = props.currentSpend;
  const periods = props.forecastData.projection.forecastResultsByTime || [];

  // Filter to only include periods within current month
  const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const filteredPeriods = periods.filter((period: any) => {
    const endDate = new Date(period.TimePeriod?.End || "");
    return endDate <= currentMonthEnd;
  });

  for (let i = 0; i < filteredPeriods.length; i++) {
    const period = filteredPeriods[i];
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
        totalDays: filteredPeriods.length,
        isHistorical: false,
      };
    }
  }

  return null;
});

// Build timeline from historical daily costs + forecast data
const forecastTimeline = computed(() => {
  const timeline: Array<{
    date: string;
    label: string;
    cumulative: number;
    exceeds: boolean;
    isToday?: boolean;
  }> = [];

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfMonthStr = startOfMonth.toISOString().split('T')[0];

  // Build cumulative costs from historical daily data (current month only)
  if (props.dailyCosts && props.dailyCosts.length > 0) {
    let cumulative = 0;

    // Filter to only include dates from the current month, then sort
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const sortedDailyCosts = [...props.dailyCosts]
      .filter((day) => {
        const dayDate = new Date(day.date);
        return dayDate >= currentMonthStart && dayDate <= currentMonthEnd;
      })
      .sort((a, b) =>
        new Date(a.date).getTime() - new Date(b.date).getTime()
      );

    // Add start of month marker if historical data doesn't start on day 1
    const hasStartOfMonth = sortedDailyCosts.some(day => day?.date === startOfMonthStr);
    if (!hasStartOfMonth && sortedDailyCosts.length > 0) {
      timeline.push({
        date: startOfMonthStr,
        label: startOfMonth.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        cumulative: 0,
        exceeds: false,
      });
    }

    sortedDailyCosts.forEach((day, index) => {
      cumulative += day.cost;

      // Show every 3rd day for historical data, but skip if very close to "Today"
      const dayDate = new Date(day.date);
      const isEvery3Days = (index + 1) % 3 === 0;
      const isLastHistoricalDay = index === sortedDailyCosts.length - 1;

      // Don't show dots that are too close to today (within 1 day)
      const daysDiff = Math.abs((now.getTime() - dayDate.getTime()) / (1000 * 60 * 60 * 24));
      const tooCloseToToday = daysDiff < 1;

      if ((isEvery3Days || isLastHistoricalDay) && !tooCloseToToday) {
        timeline.push({
          date: day.date,
          label: dayDate.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          cumulative,
          exceeds: cumulative > props.budget, // Red if cumulative spend exceeds budget
        });
      }
    });
  } else {
    // No historical data, add start of month marker
    timeline.push({
      date: startOfMonthStr,
      label: startOfMonth.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      cumulative: 0,
      exceeds: false,
    });
  }

  // Add today's actual spend
  const todayDateStr = now.toISOString().split('T')[0] || '';

  timeline.push({
    date: todayDateStr,
    label: "Today",
    cumulative: props.currentSpend,
    exceeds: props.currentSpend > props.budget, // Red if current spend exceeds budget
    isToday: true,
  });

  // Add forecast periods if available (only for current month)
  if (props.forecastData?.projection?.forecastResultsByTime) {
    let cumulative = props.currentSpend;
    const periods = props.forecastData.projection.forecastResultsByTime || [];

    // Filter to only include periods within current month
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const filteredPeriods = periods.filter((period: any) => {
      const endDate = new Date(period.TimePeriod?.End || "");
      return endDate <= currentMonthEnd;
    });

    // Show every 3rd day from forecast plus the last day
    filteredPeriods.forEach((period: any, index: number) => {
      const meanValue = parseFloat(period.MeanValue || "0");
      cumulative += meanValue;

      // Show every 3rd day or the last day
      const isEvery3Days = (index + 1) % 3 === 0;
      const isLastDay = index === filteredPeriods.length - 1;

      if (isEvery3Days || isLastDay) {
        const endDate = new Date(period.TimePeriod?.End || "");
        const label = endDate.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });

        timeline.push({
          date: period.TimePeriod?.End || "",
          label,
          cumulative,
          exceeds: cumulative > props.budget, // Red if projected cumulative exceeds budget
        });
      }
    });
  }

  return timeline;
});

// Calculate position for the exceed marker on the timeline
const exactExceedPosition = computed(() => {
  if (!exactBudgetExceed.value || forecastTimeline.value.length === 0)
    return null;

  const exceedDate = new Date(exactBudgetExceed.value.date).getTime();
  const timeline = forecastTimeline.value;

  // Find the two timeline dots that the exceed date falls between
  let prevDot = null;
  let nextDot = null;
  let prevIndex = -1;
  let nextIndex = -1;

  for (let i = 0; i < timeline.length; i++) {
    const timelineItem = timeline[i];
    if (!timelineItem) continue;

    const dotDate = new Date(timelineItem.date).getTime();

    if (dotDate <= exceedDate) {
      prevDot = timelineItem;
      prevIndex = i;
    }
    if (dotDate >= exceedDate && nextDot === null) {
      nextDot = timelineItem;
      nextIndex = i;
      break;
    }
  }

  // If exceed date is before first dot or after last dot
  if (!prevDot) return 0;
  if (!nextDot) return 100;

  // If exceed date exactly matches a dot, return that dot's position
  if (prevIndex === nextIndex) {
    return (prevIndex / (timeline.length - 1)) * 100;
  }

  // Calculate position by interpolating between the two dots based on dates
  const prevDate = new Date(prevDot.date).getTime();
  const nextDate = new Date(nextDot.date).getTime();
  const dateRange = nextDate - prevDate;
  const exceedOffset = exceedDate - prevDate;
  const proportionBetweenDots = dateRange > 0 ? exceedOffset / dateRange : 0;

  // Dots are evenly spaced on the timeline
  const dotSpacing = 100 / (timeline.length - 1);
  const position = prevIndex * dotSpacing + proportionBetweenDots * dotSpacing;

  return Math.max(0, Math.min(100, position)); // Clamp between 0-100
});

const budgetExceedDate = computed(() => {
  return exactBudgetExceed.value ? exactBudgetExceed.value.label : null;
});

// Tooltip text for budget exceed marker
const budgetExceedTooltipText = computed(() => {
  if (!exactBudgetExceed.value || !budgetExceedDate.value) return '';

  if (exactBudgetExceed.value.isHistorical) {
    return `GDMS Forecast exceeded on ${budgetExceedDate.value}`;
  } else {
    return `Projected by AWS to exceed on ${budgetExceedDate.value}`;
  }
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
    return "No GDMS forecast set for this account";
  }

  if (projected > budget * 1.2) {
    return `AWS projection shows exceeding GDMS forecast by ${formatCurrency(
      projected - budget, 0
    )} (${Math.round(((projected - budget) / budget) * 100)}%)`;
  }
  if (projected > budget) {
    return `AWS projection shows exceeding GDMS forecast by ${formatCurrency(projected - budget, 0)}`;
  }
  if (utilizationPercent.value >= 90) {
    return `${100 - utilizationPercent.value}% of GDMS forecast remaining with ${
      daysInMonth - currentDay
    } days left`;
  }
  if (projected < budget * 0.5) {
    return `Tracking well below GDMS forecast - projected ${Math.round(
      (projected / budget) * 100
    )}% utilization`;
  }
  return `On track for ${Math.round(
    (projected / budget) * 100
  )}% GDMS forecast utilization`;
});

const statusBgClass = computed(() => {
  const projected = projectedSpend.value;
  const budget = props.budget;

  if (projected > budget)
    return "bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-800";
  if (utilizationPercent.value >= 90)
    return "bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 border border-yellow-300 dark:border-yellow-800";
  return "bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-800";
});

const statusIcon = computed(() => {
  const projected = projectedSpend.value;
  if (projected > props.budget) return "i-heroicons-exclamation-triangle";
  if (utilizationPercent.value >= 90) return "i-heroicons-exclamation-circle";
  return "i-heroicons-information-circle";
});
</script>
