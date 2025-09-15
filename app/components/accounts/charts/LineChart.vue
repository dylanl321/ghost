<!-- components/LineChart.vue -->
<template>
  <ClientOnly>
    <div v-if="chartComponent" class="h-full">
      <component 
        :is="chartComponent"
        :data="chartData"
        :options="options"
        :height="height"
      />
    </div>
    <template #fallback>
      <div class="h-full flex items-center justify-center">
        <div class="animate-pulse bg-gray-800 rounded-lg w-full h-full" />
      </div>
    </template>
  </ClientOnly>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { markRaw } from 'vue';

const chartComponent = ref(null);

onMounted(async () => {
  const { Line } = await import('vue-chartjs');
  const { 
    Chart,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler
  } = await import('chart.js');

  Chart.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler
  );

  chartComponent.value = markRaw(Line);
});

defineProps({
  chartData: {
    type: Object,
    required: true
  },
  options: {
    type: Object,
    default: () => ({})
  },
  height: {
    type: [String, Number],
    default: null
  }
});
</script>

<style scoped>
.chart-container {
  position: relative;
  width: 100%;
  margin: 0;
  padding: 0;
}
</style>