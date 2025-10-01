<!-- components/DoughnutChart.vue -->
<template>
  <Doughnut :data="chartData" :options="options" />
</template>

<script setup>
import { Doughnut } from 'vue-chartjs';
import {
  Chart as ChartJS,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';

ChartJS.register(
  Title,
  Tooltip,
  Legend,
  ArcElement
);

const props = defineProps({
  chartData: {
    type: Object,
    required: true,
  },
  options: {
    type: Object,
    required: true,
  },
});
</script>