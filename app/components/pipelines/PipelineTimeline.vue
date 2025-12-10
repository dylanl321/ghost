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

        <!-- Repository column (clickable link to admin repo page) -->
        <template #repository-data="{ row }">
          <ClientOnly>
            <NuxtLink
              v-if="isAdmin && row.job_url"
              :to="getRepositoryUrl(row.job_url)"
              class="flex items-center gap-2 text-blue-400 hover:text-blue-300"
            >
              <UIcon name="i-heroicons-folder" class="w-4 h-4" />
              <span class="text-sm">{{ getRepositoryName(row.job_url) }}</span>
            </NuxtLink>
            <div v-else class="flex items-center gap-2">
              <UIcon name="i-heroicons-folder" class="w-4 h-4 text-gray-400" />
              <span class="text-sm text-gray-300">{{ getRepositoryName(row.job_url) }}</span>
            </div>
          </ClientOnly>
        </template>

        <!-- Pipeline ID (clickable link to admin detail page) -->
        <template #pipeline_id-data="{ row }">
          <ClientOnly>
            <NuxtLink
              v-if="isAdmin"
              :to="getPipelineDetailUrl(row)"
              class="text-blue-400 hover:text-blue-300 font-mono text-xs"
            >
              #{{ row.pipeline_id }}
            </NuxtLink>
            <code v-else class="text-xs text-gray-400 bg-gray-800 px-2 py-1 rounded">
              #{{ row.pipeline_id }}
            </code>
          </ClientOnly>
        </template>

        <!-- Account count -->
        <template #account_count-data="{ row }">
          <UTooltip
            v-if="row.account_count === 0"
            text="This pipeline run targeted all accounts"
          >
            <UBadge color="blue" variant="subtle" size="sm">
              All
            </UBadge>
          </UTooltip>
          <UBadge v-else color="gray" variant="subtle" size="sm">
            {{ row.account_count }}
          </UBadge>
        </template>

        <!-- Author column with badge -->
        <template #commit_author-data="{ row }">
          <PipelinesAuthorBadge
            v-if="row.commit_author"
            :author-field="row.commit_author"
            :show-contact-icons="false"
            :max-name-length="20"
          />
          <span v-else class="text-xs text-gray-400">Unknown</span>
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
import PipelinesAuthorBadge from './AuthorBadge.vue'

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

const { isAdmin } = useUserRoles()

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
    key: 'commit_author',
    label: 'Author',
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

function getRepositoryPath(jobUrl: string): string {
  return getRepositoryName(jobUrl)
}

function getRepositoryUrl(jobUrl: string): string {
  const repoPath = getRepositoryPath(jobUrl)
  if (repoPath === 'Unknown') return '#'
  return `/admin/pipelines/${encodeURIComponent(repoPath)}`
}

function getPipelineDetailUrl(row: PipelineRun): string {
  const repoPath = getRepositoryPath(row.job_url)
  if (repoPath === 'Unknown') return '#'
  return `/admin/pipelines/${encodeURIComponent(repoPath)}/${row.pipeline_id}`
}
</script>
