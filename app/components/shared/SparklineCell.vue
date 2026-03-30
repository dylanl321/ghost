<template>
  <svg
    v-if="normalizedData.length >= 2"
    :width="width"
    :height="height"
    :viewBox="`0 0 ${width} ${height}`"
    preserveAspectRatio="none"
    class="inline-block align-middle"
  >
    <defs>
      <linearGradient :id="gradientId" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" :stop-color="lineColor" stop-opacity="0.2" />
        <stop offset="100%" :stop-color="lineColor" stop-opacity="0" />
      </linearGradient>
    </defs>
    <!-- Gradient fill area -->
    <polygon
      :points="areaPoints"
      :fill="`url(#${gradientId})`"
    />
    <!-- Trend line -->
    <polyline
      :points="linePoints"
      fill="none"
      :stroke="lineColor"
      stroke-width="1.5"
      stroke-linejoin="round"
      stroke-linecap="round"
    />
  </svg>
  <span v-else class="text-gray-400 text-xs">-</span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  data: number[]
  width?: number
  height?: number
  color?: string
}>(), {
  width: 60,
  height: 20,
})

// Unique gradient ID per instance
const gradientId = `spark-${Math.random().toString(36).slice(2, 9)}`

const normalizedData = computed(() => {
  if (!props.data || props.data.length === 0) return []
  if (props.data.length === 1) return props.data
  return props.data
})

const lineColor = computed(() => {
  if (props.color) return props.color
  if (normalizedData.value.length < 2) return '#6b7280'
  const first = normalizedData.value[0]
  const last = normalizedData.value[normalizedData.value.length - 1]
  if (last < first) return '#10b981' // green - trending down (costs decreasing)
  if (last > first) return '#ef4444' // red - trending up (costs increasing)
  return '#6b7280' // gray - flat
})

const linePoints = computed(() => {
  const d = normalizedData.value
  if (d.length < 2) return ''
  const min = Math.min(...d)
  const max = Math.max(...d)
  const range = max - min || 1
  const padding = 1
  const w = props.width - padding * 2
  const h = props.height - padding * 2
  const step = w / (d.length - 1)

  return d.map((val, i) => {
    const x = padding + i * step
    // Invert Y: SVG y=0 is top
    const y = padding + h - ((val - min) / range) * h
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
})

const areaPoints = computed(() => {
  if (!linePoints.value) return ''
  const padding = 1
  const bottom = props.height - padding
  // Close the polygon: line points + bottom-right + bottom-left
  const w = props.width - padding * 2
  return `${padding},${bottom} ${linePoints.value} ${padding + w},${bottom}`
})
</script>
