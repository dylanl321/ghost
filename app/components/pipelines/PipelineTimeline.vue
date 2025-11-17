<template>
  <UCard>
    <template #header>
      <div class="flex justify-between items-center">
        <div class="text-lg font-semibold">Recent Pipeline Runs</div>
        <UBadge color="gray" variant="soft" size="sm">
          {{ pipelineRuns.length }} {{ pipelineRuns.length === 1 ? 'Run' : 'Runs' }}
        </UBadge>
      </div>
    </template>

    <CenteredLoadingSpinner v-if="loading" />
    <div v-else-if="!pipelineRuns || pipelineRuns.length === 0" class="text-center py-8 text-gray-400">
      No pipeline runs found for this account in the selected time period
    </div>
    <div v-else>
      <UTable
        :rows="pipelineRuns"
        :columns="columns"
        :loading="loading"
      >
        <!-- Status column with colored badge -->
        <template #status-data="{ row }">
          <UBadge
            :color="getStatusColor(row.status)"
            variant="soft"
            size="sm"
          >
            {{ formatStatus(row.status) }}
          </UBadge>
        </template>

        <!-- Duration column with formatted time -->
        <template #duration_total_seconds-data="{ row }">
          <span class="text-gray-300">{{ formatDuration(row.duration_total_seconds) }}</span>
        </template>

        <!-- Timestamp column with formatted date -->
        <template #timestamp_start-data="{ row }">
          <div class="text-sm">
            <div class="text-white">{{ formatDate(row.timestamp_start) }}</div>
            <div class="text-gray-400 text-xs">{{ formatTime(row.timestamp_start) }}</div>
          </div>
        </template>

        <!-- Job name with link to GitLab -->
        <template #job_name-data="{ row }">
          <div class="flex items-center gap-2">
            <span class="text-white">{{ row.job_name }}</span>
            <a
              v-if="row.job_url"
              :href="row.job_url"
              target="_blank"
              rel="noopener noreferrer"
              class="text-blue-400 hover:text-blue-300"
            >
              <UIcon name="i-heroicons-arrow-top-right-on-square" class="w-4 h-4" />
            </a>
          </div>
        </template>

        <!-- Repository column -->
        <template #repository-data="{ row }">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-folder" class="w-4 h-4 text-gray-400" />
            <span class="text-sm text-gray-300">{{ getRepositoryName(row.job_url) }}</span>
          </div>
        </template>

        <!-- Pipeline ID (shortened) -->
        <template #pipeline_id-data="{ row }">
          <code class="text-xs text-gray-400 bg-gray-800 px-2 py-1 rounded">
            #{{ row.pipeline_id }}
          </code>
        </template>

        <!-- Account count -->
        <template #account_count-data="{ row }">
          <UBadge color="gray" variant="subtle" size="sm">
            {{ row.account_count }}
          </UBadge>
        </template>

        <!-- Terraform version -->
        <template #terraform_version-data="{ row }">
          <span class="text-xs text-gray-400">
            {{ row.terraform_version || 'N/A' }}
          </span>
        </template>
      </UTable>
    </div>
  </UCard>
</template>

<script setup lang="ts">
interface PipelineRun {
  pipeline_id: string
  job_id: string
  job_name: string
  job_url: string
  job_stage: string
  timestamp_start: string
  timestamp_end: string
  duration_total_seconds: number
  status: string
  account_count: number
  commit_author: string
  terraform_version: string
}

const props = defineProps<{
  pipelineRuns: PipelineRun[]
  loading: boolean
}>()

const columns = [
  {
    key: 'status',
    label: 'Status',
    sortable: true
  },
  {
    key: 'pipeline_id',
    label: 'Pipeline',
    sortable: false
  },
  {
    key: 'job_name',
    label: 'Job',
    sortable: false
  },
  {
    key: 'repository',
    label: 'Repository',
    sortable: false
  },
  {
    key: 'timestamp_start',
    label: 'Started',
    sortable: true
  },
  {
    key: 'duration_total_seconds',
    label: 'Duration',
    sortable: true
  },
  {
    key: 'account_count',
    label: 'Accounts',
    sortable: true
  },
  {
    key: 'terraform_version',
    label: 'TF Version',
    sortable: false
  }
]

function getStatusColor(status: string): string {
  switch (status) {
    case 'success':
      return 'green'
    case 'failure':
    case 'partial_failure':
      return 'red'
    default:
      return 'gray'
  }
}

function formatStatus(status: string): string {
  return status
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function formatDuration(seconds: number): string {
  if (!seconds) return 'N/A'

  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60

  if (mins > 0) {
    return `${mins}m ${secs}s`
  }
  return `${secs}s`
}

function formatDate(timestamp: string): string {
  if (!timestamp) return 'N/A'
  const date = new Date(timestamp)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

function formatTime(timestamp: string): string {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

function getRepositoryName(jobUrl: string): string {
  if (!jobUrl) return 'Unknown'

  try {
    // Parse GitLab URL: https://gitlab.example.com/group/project/-/jobs/12345
    const url = new URL(jobUrl)
    const pathParts = url.pathname.split('/').filter(Boolean)

    // Find the index of '-' which separates the repo path from the job path
    const dashIndex = pathParts.indexOf('-')

    if (dashIndex === -1 || dashIndex < 2) {
      return 'Unknown'
    }

    // Everything before '-' is the repository path
    const repoParts = pathParts.slice(0, dashIndex)

    // Return the full repository path (group/project)
    return repoParts.join('/')
  } catch {
    return 'Unknown'
  }
}
</script>
