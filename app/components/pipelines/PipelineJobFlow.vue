<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <h3 class="font-semibold text-lg">{{ title }}</h3>
        <UBadge color="gray" variant="soft">
          {{ jobs.length }} {{ jobs.length === 1 ? 'job' : 'jobs' }}
        </UBadge>
      </div>
    </template>

    <div v-if="jobs.length === 0" class="text-center py-8 text-gray-400">
      No jobs found
    </div>

    <div v-else class="space-y-6">
      <!-- Group jobs by stage -->
      <div
        v-for="(stageJobs, stageName) in jobsByStage"
        :key="stageName"
        class="stage-group"
      >
        <!-- Stage Header -->
        <div class="flex items-center gap-3 mb-3">
          <div class="flex-1 h-px bg-gray-700" />
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-squares-2x2" class="w-4 h-4 text-gray-400" />
            <span class="text-sm font-semibold text-gray-300 uppercase tracking-wide">
              {{ stageName }}
            </span>
            <UBadge color="gray" variant="subtle" size="xs">
              {{ stageJobs.length }}
            </UBadge>
          </div>
          <div class="flex-1 h-px bg-gray-700" />
        </div>

        <!-- Jobs in this stage -->
        <div class="flex flex-wrap gap-3">
          <div
            v-for="job in stageJobs"
            :key="job.id"
            :class="[
              'job-card relative p-4 rounded-lg border-2 transition-all duration-200',
              'hover:scale-105 hover:shadow-lg',
              job.clickable !== false ? 'cursor-pointer' : 'cursor-default',
              getJobCardClass(job.status)
            ]"
            class="min-w-[200px] max-w-[280px] flex-1"
            @click="handleJobClick(job)"
          >
            <!-- Status indicator dot -->
            <div class="absolute top-2 right-2">
              <div
                :class="['w-3 h-3 rounded-full', getStatusDotClass(job.status)]"
              />
            </div>

            <!-- Job Icon and Name -->
            <div class="flex items-start gap-3 mb-3">
              <div
                :class="[
                  'flex items-center justify-center rounded-full p-2',
                  getJobIconBgClass(job.status)
                ]"
              >
                <UIcon
                  :name="getJobIcon(job.status)"
                  :class="['w-5 h-5', getJobIconColorClass(job.status)]"
                />
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-semibold text-sm text-white truncate" :title="job.name">
                  {{ job.name }}
                </div>
                <div v-if="job.stage" class="text-xs text-gray-400">
                  {{ job.stage }}
                </div>
              </div>
            </div>

            <!-- Job Details -->
            <div class="space-y-2 text-xs">
              <!-- Status -->
              <div class="flex items-center justify-between">
                <span class="text-gray-400">Status</span>
                <UBadge
                  :color="getStatusBadgeColor(job.status)"
                  variant="soft"
                  size="xs"
                >
                  {{ formatStatus(job.status) }}
                </UBadge>
              </div>

              <!-- Duration -->
              <div v-if="job.duration" class="flex items-center justify-between">
                <span class="text-gray-400">Duration</span>
                <span class="text-white font-mono">{{ formatDuration(job.duration) }}</span>
              </div>

              <!-- Account Count (if applicable) -->
              <div v-if="job.accountCount !== undefined" class="flex items-center justify-between">
                <span class="text-gray-400">Accounts</span>
                <UBadge color="gray" variant="subtle" size="xs">
                  {{ job.accountCount === 0 ? 'All' : job.accountCount }}
                </UBadge>
              </div>

              <!-- Success/Failure counts for partial failures -->
              <div v-if="job.status === 'partial_failure' && job.successCount !== undefined && job.failureCount !== undefined">
                <div class="flex items-center gap-2 text-xs">
                  <span class="text-green-400">✓ {{ job.successCount }}</span>
                  <span class="text-red-400">✗ {{ job.failureCount }}</span>
                </div>
              </div>

              <!-- Timestamp -->
              <div v-if="job.timestamp" class="flex items-center justify-between">
                <span class="text-gray-400">Started</span>
                <span class="text-gray-300">{{ formatTime(job.timestamp) }}</span>
              </div>
            </div>

            <!-- Running animation -->
            <div
              v-if="job.status === 'running'"
              class="absolute bottom-0 left-0 right-0 h-1 bg-blue-500/30 overflow-hidden"
            >
              <div class="h-full w-1/3 bg-blue-500 animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
interface PipelineJob {
  id: string | number
  name: string
  stage: string
  status: 'success' | 'failure' | 'partial_failure' | 'running' | 'pending' | 'skipped' | 'canceled'
  duration?: number // in seconds
  accountCount?: number
  successCount?: number
  failureCount?: number
  timestamp?: string
  clickable?: boolean
  data?: any // additional data for click handler
}

interface Props {
  jobs: PipelineJob[]
  title?: string
  groupBy?: 'stage' | 'pipeline' // Control whether to group by stage or pipeline ID
}

const props = withDefaults(defineProps<Props>(), {
  title: 'Pipeline Jobs',
  groupBy: 'stage'
})

const emit = defineEmits<{
  jobClick: [job: PipelineJob]
}>()

// Group jobs by stage or pipeline
const jobsByStage = computed(() => {
  const grouped = new Map<string, PipelineJob[]>()

  if (props.groupBy === 'pipeline') {
    // Group by pipeline ID - each pipeline becomes a group
    props.jobs.forEach((job) => {
      // Use the stage field which now contains "Pipeline #XXX"
      const groupKey = job.stage || 'Unknown Pipeline'

      if (!grouped.has(groupKey)) {
        grouped.set(groupKey, [])
      }
      grouped.get(groupKey)!.push(job)
    })
  } else {
    // Group by stage (original behavior)
    props.jobs.forEach((job) => {
      const stage = job.stage || 'default'
      if (!grouped.has(stage)) {
        grouped.set(stage, [])
      }
      grouped.get(stage)!.push(job)
    })
  }

  // Convert to object for template iteration
  return Object.fromEntries(grouped)
})

// Get job card border and background class
function getJobCardClass(status: string): string {
  switch (status) {
    case 'success':
      return 'border-green-500/50 bg-green-500/5 hover:border-green-500'
    case 'failure':
      return 'border-red-500/50 bg-red-500/5 hover:border-red-500'
    case 'partial_failure':
      return 'border-orange-500/50 bg-orange-500/5 hover:border-orange-500'
    case 'running':
      return 'border-blue-500/50 bg-blue-500/5 hover:border-blue-500'
    case 'pending':
      return 'border-gray-500/30 bg-gray-500/5 hover:border-gray-500'
    case 'skipped':
      return 'border-gray-600/30 bg-gray-600/5 hover:border-gray-600'
    case 'canceled':
      return 'border-gray-600/30 bg-gray-600/5 hover:border-gray-600'
    default:
      return 'border-gray-500/30 bg-gray-500/5 hover:border-gray-500'
  }
}

// Get status indicator dot class
function getStatusDotClass(status: string): string {
  switch (status) {
    case 'success':
      return 'bg-green-500 shadow-green-500/50 shadow-lg'
    case 'failure':
      return 'bg-red-500 shadow-red-500/50 shadow-lg'
    case 'partial_failure':
      return 'bg-orange-500 shadow-orange-500/50 shadow-lg'
    case 'running':
      return 'bg-blue-500 shadow-blue-500/50 shadow-lg animate-pulse'
    case 'pending':
      return 'bg-gray-500'
    case 'skipped':
      return 'bg-gray-600'
    case 'canceled':
      return 'bg-gray-600'
    default:
      return 'bg-gray-500'
  }
}

// Get job icon
function getJobIcon(status: string): string {
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
      return 'i-heroicons-cog'
  }
}

// Get job icon background class
function getJobIconBgClass(status: string): string {
  switch (status) {
    case 'success':
      return 'bg-green-500/20'
    case 'failure':
      return 'bg-red-500/20'
    case 'partial_failure':
      return 'bg-orange-500/20'
    case 'running':
      return 'bg-blue-500/20'
    case 'pending':
      return 'bg-gray-500/20'
    case 'skipped':
      return 'bg-gray-600/20'
    case 'canceled':
      return 'bg-gray-600/20'
    default:
      return 'bg-gray-500/20'
  }
}

// Get job icon color class
function getJobIconColorClass(status: string): string {
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

// Get status badge color
function getStatusBadgeColor(status: string): string {
  switch (status) {
    case 'success':
      return 'green'
    case 'failure':
      return 'red'
    case 'partial_failure':
      return 'orange'
    case 'running':
      return 'blue'
    case 'pending':
      return 'gray'
    case 'skipped':
      return 'gray'
    case 'canceled':
      return 'gray'
    default:
      return 'gray'
  }
}

// Format status for display
function formatStatus(status: string): string {
  return status
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
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

// Format timestamp to readable time
function formatTime(timestamp: string): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

// Handle job click
function handleJobClick(job: PipelineJob) {
  if (job.clickable !== false) {
    emit('jobClick', job)
  }
}
</script>

<style scoped>
.job-card {
  position: relative;
  overflow: hidden;
}

.stage-group {
  position: relative;
}

@keyframes shimmer {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(400%);
  }
}
</style>
