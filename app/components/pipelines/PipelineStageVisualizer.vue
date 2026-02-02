<template>
  <div class="pipeline-stage-visualizer">
    <div class="flex items-center gap-2 overflow-x-auto pb-4">
      <div
        v-for="(stage, index) in stages"
        :key="stage.id"
        class="flex items-center"
      >
        <!-- Stage Circle with Icon -->
        <div class="flex flex-col items-center min-w-[80px]">
          <div
            :class="[
              'stage-circle relative flex items-center justify-center rounded-full transition-all duration-300 cursor-pointer hover:scale-110',
              getStageClass(stage.status),
              stage.clickable !== false ? 'cursor-pointer' : 'cursor-default'
            ]"
            :style="{ width: circleSize + 'px', height: circleSize + 'px' }"
            @click="handleStageClick(stage)"
          >
            <!-- Status Icon -->
            <UIcon
              :name="getStageIcon(stage.status)"
              :class="['transition-all', getIconClass(stage.status)]"
              :style="{ fontSize: iconSize + 'px' }"
            />

            <!-- Pulse animation for running status -->
            <div
              v-if="stage.status === 'running'"
              class="absolute inset-0 rounded-full animate-ping opacity-50"
              :class="getStageClass('running')"
            />
          </div>

          <!-- Stage Label -->
          <div class="mt-2 text-center">
            <div class="text-xs font-semibold text-white whitespace-nowrap">
              {{ stage.name }}
            </div>
            <div v-if="stage.duration" class="text-xs text-gray-400 whitespace-nowrap">
              {{ formatDuration(stage.duration) }}
            </div>
          </div>
        </div>

        <!-- Connector Line -->
        <div
          v-if="index < stages.length - 1"
          :class="[
            'connector-line h-1 mx-2 transition-all duration-300',
            getConnectorClass(stage.status, stages[index + 1].status)
          ]"
          :style="{ width: connectorWidth + 'px' }"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface PipelineStage {
  id: string | number
  name: string
  status: 'success' | 'failure' | 'partial_failure' | 'running' | 'pending' | 'skipped' | 'canceled'
  duration?: number // in seconds
  clickable?: boolean
  data?: any // additional data for click handler
}

interface Props {
  stages: PipelineStage[]
  circleSize?: number
  iconSize?: number
  connectorWidth?: number
}

const props = withDefaults(defineProps<Props>(), {
  circleSize: 48,
  iconSize: 24,
  connectorWidth: 40
})

const emit = defineEmits<{
  stageClick: [stage: PipelineStage]
}>()

// Get the CSS class for a stage based on its status
function getStageClass(status: string): string {
  switch (status) {
    case 'success':
      return 'bg-green-500/20 border-2 border-green-500 shadow-green-500/50 shadow-lg'
    case 'failure':
      return 'bg-red-500/20 border-2 border-red-500 shadow-red-500/50 shadow-lg'
    case 'partial_failure':
      return 'bg-orange-500/20 border-2 border-orange-500 shadow-orange-500/50 shadow-lg'
    case 'running':
      return 'bg-blue-500/20 border-2 border-blue-500 shadow-blue-500/50 shadow-lg'
    case 'pending':
      return 'bg-gray-500/20 border-2 border-gray-500'
    case 'skipped':
      return 'bg-gray-700/20 border-2 border-gray-700'
    case 'canceled':
      return 'bg-gray-600/20 border-2 border-gray-600'
    default:
      return 'bg-gray-500/20 border-2 border-gray-500'
  }
}

// Get the icon for a stage based on its status
function getStageIcon(status: string): string {
  switch (status) {
    case 'success':
      return 'i-heroicons-check-circle'
    case 'failure':
      return 'i-heroicons-x-circle'
    case 'partial_failure':
      return 'i-heroicons-exclamation-circle'
    case 'running':
      return 'i-heroicons-arrow-path'
    case 'pending':
      return 'i-heroicons-clock'
    case 'skipped':
      return 'i-heroicons-forward'
    case 'canceled':
      return 'i-heroicons-stop-circle'
    default:
      return 'i-heroicons-question-mark-circle'
  }
}

// Get the icon color class
function getIconClass(status: string): string {
  switch (status) {
    case 'success':
      return 'text-green-400'
    case 'failure':
      return 'text-red-400'
    case 'partial_failure':
      return 'text-orange-400'
    case 'running':
      return 'text-blue-400 animate-spin'
    case 'pending':
      return 'text-gray-400'
    case 'skipped':
      return 'text-gray-500'
    case 'canceled':
      return 'text-gray-500'
    default:
      return 'text-gray-400'
  }
}

// Get the connector line class based on adjacent stage statuses
function getConnectorClass(currentStatus: string, nextStatus: string): string {
  // If current stage is successful, show green connector
  if (currentStatus === 'success') {
    return 'bg-green-500'
  }
  // If current stage failed, show red connector
  if (currentStatus === 'failure') {
    return 'bg-red-500'
  }
  // If current stage partially failed, show orange connector
  if (currentStatus === 'partial_failure') {
    return 'bg-orange-500'
  }
  // If current stage is running, show blue connector
  if (currentStatus === 'running') {
    return 'bg-blue-500'
  }
  // Otherwise show gray for pending/skipped
  return 'bg-gray-600'
}

// Format duration in seconds to readable format
function formatDuration(seconds: number): string {
  if (!seconds || seconds < 0) return '0s'

  if (seconds < 60) {
    return `${Math.round(seconds)}s`
  }

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.round(seconds % 60)

  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`
  }

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60

  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`
}

// Handle stage click
function handleStageClick(stage: PipelineStage) {
  if (stage.clickable !== false) {
    emit('stageClick', stage)
  }
}
</script>

<style scoped>
.pipeline-stage-visualizer {
  position: relative;
}

.stage-circle {
  position: relative;
  z-index: 10;
}

.connector-line {
  position: relative;
  z-index: 5;
}

/* Smooth scroll for horizontal overflow */
.overflow-x-auto::-webkit-scrollbar {
  height: 6px;
}

.overflow-x-auto::-webkit-scrollbar-track {
  background: var(--ghost-scrollbar-track);
  border-radius: 3px;
}

.overflow-x-auto::-webkit-scrollbar-thumb {
  background: var(--ghost-scrollbar-thumb);
  border-radius: 3px;
}

.overflow-x-auto::-webkit-scrollbar-thumb:hover {
  background: var(--ghost-scrollbar-thumb-hover);
}
</style>
