<template>
  <UCard :class="gridClass">
    <template #header>
      <h3 class="font-semibold">{{ title }}</h3>
    </template>
    <client-only>
      <VChart :option="chartOption" :style="{ height: chartHeight }" />
    </client-only>
  </UCard>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  title: string
  type: 'line' | 'bar' | 'pie' | 'area' | 'gauge' | 'scatter' | 'heatmap'
  size: 'small' | 'medium' | 'large' | 'xlarge' | 'full'
  data: any
  responsive?: boolean
  drillDown?: string
}>()

// Grid class based on size with responsive breakpoints
const gridClass = computed(() => {
  switch(props.size) {
    case 'small': return 'col-span-12 sm:col-span-6 md:col-span-3'
    case 'medium': return 'col-span-12 md:col-span-6'
    case 'large': return 'col-span-12 md:col-span-9'
    case 'xlarge': return 'col-span-12'
    case 'full': return 'col-span-12'
    default: return 'col-span-12 md:col-span-6'
  }
})

// Chart height based on size
const chartHeight = computed(() => {
  switch(props.size) {
    case 'small': return '200px'
    case 'medium': return '300px'
    case 'large': return '400px'
    case 'xlarge': return '500px'
    case 'full': return '400px'
    default: return '300px'
  }
})

// Generate chart options based on type
const chartOption = computed<EChartsOption>(() => {
  if (!props.data) return {}
  
  switch(props.type) {
    case 'line':
      return {
        xAxis: {
          type: 'category',
          data: props.data.labels || []
        },
        yAxis: {
          type: 'value'
        },
        series: [{
          type: 'line',
          smooth: true,
          data: props.data.values || []
        }],
        tooltip: {
          trigger: 'axis'
        }
      }
      
    case 'bar':
      return {
        xAxis: {
          type: 'category',
          data: props.data.labels || []
        },
        yAxis: {
          type: 'value'
        },
        series: [{
          type: 'bar',
          data: props.data.values || []
        }],
        tooltip: {
          trigger: 'axis'
        }
      }
      
    case 'pie':
      return {
        series: [{
          type: 'pie',
          radius: '65%',
          data: props.data.items || []
        }],
        tooltip: {
          trigger: 'item'
        }
      }
      
    case 'gauge':
      return {
        series: [{
          type: 'gauge',
          progress: {
            show: true
          },
          detail: {
            formatter: '{value}%'
          },
          data: [{ value: props.data.value || 0, name: props.data.name || '' }]
        }]
      }
      
    case 'scatter':
      return {
        xAxis: {
          type: 'value',
          name: props.data.xLabel || 'X Axis'
        },
        yAxis: {
          type: 'value',
          name: props.data.yLabel || 'Y Axis'
        },
        series: [{
          type: 'scatter',
          data: props.data.points || []
        }],
        tooltip: {
          trigger: 'item'
        }
      }
      
    case 'heatmap':
      return {
        xAxis: {
          type: 'category',
          data: props.data.xLabels || []
        },
        yAxis: {
          type: 'category',
          data: props.data.yLabels || []
        },
        series: [{
          type: 'heatmap',
          data: props.data.values || [],
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: 'rgba(0, 0, 0, 0.5)'
            }
          }
        }],
        tooltip: {
          position: 'top'
        }
      }
      
    default:
      return {}
  }
})
</script>