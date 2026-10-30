<template>
  <div class="container mx-auto max-w-7xl space-y-6 px-6 py-8">
    <!-- Pipeline Header -->
    <UCard>
      <div class="flex gap-4 items-start justify-between">
        <div class="flex items-start gap-4 flex-1">
          <UIcon name="i-heroicons-arrow-path" class="w-12 h-12 text-blue-500 flex-shrink-0" />
          <div class="flex-1">
            <div class="flex items-center gap-3 mb-2">
              <h1 class="font-semibold text-2xl">Pipeline #{{ pipelineId }}</h1>
              <UBadge
                v-if="pipelineData.status"
                :color="getStatusColor(pipelineData.status)"
                variant="soft"
                size="lg"
              >
                {{ formatStatus(pipelineData.status) }}
              </UBadge>
            </div>
            <p class="text-sm text-gray-400 mb-2">{{ repositoryPath }}</p>
            <div v-if="pipelineData.commit_author" class="text-sm text-gray-400">
              Author: <span class="text-white">{{ pipelineData.commit_author }}</span>
            </div>
          </div>
        </div>
        <UButton
          v-if="pipelineData.job_url"
          :to="pipelineData.job_url"
          target="_blank"
          color="primary"
          variant="soft"
          icon="i-heroicons-arrow-top-right-on-square"
        >
          View in GitLab
        </UButton>
      </div>
    </UCard>

    <!-- Git Commit Info -->
    <UCard v-if="!loading && pipelineData.gitlab?.commit">
      <div class="flex items-start gap-4">
        <UIcon name="i-heroicons-code-bracket" class="w-10 h-10 text-blue-500 flex-shrink-0 mt-1" />
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-2">
            <h3 class="font-semibold text-lg">{{ pipelineData.gitlab.commit.title }}</h3>
            <UBadge color="gray" variant="soft" size="sm" class="font-mono">
              {{ pipelineData.gitlab.commit.short_sha }}
            </UBadge>
          </div>
          <p v-if="pipelineData.gitlab.commit.message && pipelineData.gitlab.commit.message !== pipelineData.gitlab.commit.title"
             class="text-sm text-gray-400 mb-3 whitespace-pre-wrap">
            {{ pipelineData.gitlab.commit.message.split('\n').slice(1).join('\n').trim() }}
          </p>
          <div class="flex items-center gap-4 text-sm">
            <div class="flex items-center gap-2">
              <UIcon name="i-heroicons-user" class="w-4 h-4 text-gray-400" />
              <span class="text-gray-300">{{ pipelineData.gitlab.commit.author_name }}</span>
            </div>
            <div class="flex items-center gap-2">
              <UIcon name="i-heroicons-calendar" class="w-4 h-4 text-gray-400" />
              <span class="text-gray-400">{{ formatDateTime(pipelineData.gitlab.commit.authored_date) }}</span>
            </div>
            <a
              :href="pipelineData.gitlab.commit.web_url"
              target="_blank"
              rel="noopener noreferrer"
              class="text-blue-400 hover:text-blue-300 flex items-center gap-1"
            >
              <span class="text-sm">View commit</span>
              <UIcon name="i-heroicons-arrow-top-right-on-square" class="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </UCard>

    <!-- Merge Request Info -->
    <UCard v-if="!loading && pipelineData.gitlab?.merge_request">
      <div class="flex items-start gap-4">
        <UIcon name="i-heroicons-arrow-path-rounded-square" class="w-10 h-10 text-purple-500 flex-shrink-0 mt-1" />
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-2">
            <h3 class="font-semibold text-lg">!{{ pipelineData.gitlab.merge_request.iid }}</h3>
            <span>{{ pipelineData.gitlab.merge_request.title }}</span>
            <UBadge
              :color="getMRStateColor(pipelineData.gitlab.merge_request.state)"
              variant="soft"
              size="sm"
            >
              {{ pipelineData.gitlab.merge_request.state }}
            </UBadge>
            <UBadge v-if="pipelineData.gitlab.merge_request.draft" color="gray" variant="soft" size="sm">
              Draft
            </UBadge>
          </div>
          <div class="flex items-center gap-4 text-sm mb-2">
            <div class="flex items-center gap-2">
              <span class="text-gray-400">{{ pipelineData.gitlab.merge_request.source_branch }}</span>
              <UIcon name="i-heroicons-arrow-right" class="w-4 h-4 text-gray-500" />
              <span class="text-gray-400">{{ pipelineData.gitlab.merge_request.target_branch }}</span>
            </div>
          </div>
          <div class="flex items-center gap-4 text-sm">
            <div class="flex items-center gap-2">
              <UIcon name="i-heroicons-user" class="w-4 h-4 text-gray-400" />
              <span class="text-gray-300">{{ pipelineData.gitlab.merge_request.author.name }}</span>
            </div>
            <div v-if="pipelineData.gitlab.merge_request.labels.length > 0" class="flex items-center gap-2">
              <UBadge
                v-for="label in pipelineData.gitlab.merge_request.labels.slice(0, 3)"
                :key="label"
                color="blue"
                variant="subtle"
                size="xs"
              >
                {{ label }}
              </UBadge>
            </div>
            <a
              :href="pipelineData.gitlab.merge_request.web_url"
              target="_blank"
              rel="noopener noreferrer"
              class="text-blue-400 hover:text-blue-300 flex items-center gap-1 ml-auto"
            >
              <span class="text-sm">View MR</span>
              <UIcon name="i-heroicons-arrow-top-right-on-square" class="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </UCard>

    <!-- Loading Alert -->
    <UAlert
      v-if="loading"
      color="blue"
      icon="i-heroicons-clock"
      variant="soft"
    >
      <template #title>Loading Pipeline Data</template>
    </UAlert>

    <!-- Error Alert -->
    <UAlert
      v-if="error"
      color="red"
      icon="i-heroicons-exclamation-triangle"
      variant="solid"
      :close-button="{ icon: 'i-heroicons-x-mark', color: 'white', variant: 'link' }"
      @close="error = null"
    >
      <template #title>Failed to Load Pipeline Data</template>
      <template #description>{{ error }}</template>
    </UAlert>

    <!-- Dashboard Content -->
    <div v-if="!loading && !error && pipelineData.pipeline_id" class="space-y-4">
      <!-- Account Success/Failure Summary (for partial_failure status) -->
      <UAlert
        v-if="pipelineData.status === 'partial_failure' && accountStats.total > 0"
        color="orange"
        icon="i-heroicons-exclamation-triangle"
        variant="soft"
      >
        <template #title>Partial Failure: Some Accounts Failed</template>
        <template #description>
          <div class="flex items-center gap-4 mt-2">
            <span class="text-green-400">✓ {{ accountStats.applied }} succeeded</span>
            <span class="text-red-400">✗ {{ accountStats.failed }} failed</span>
            <span v-if="accountStats.pending > 0" class="text-gray-400">⏱ {{ accountStats.pending }} pending</span>
          </div>
        </template>
      </UAlert>

      <!-- Summary Stats -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <UCard>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-400">Duration</p>
              <p class="text-2xl font-bold mt-1">{{ formatDuration(pipelineData.duration_total_seconds) }}</p>
            </div>
            <UIcon name="i-heroicons-clock" class="w-8 h-8 text-orange-500" />
          </div>
        </UCard>

        <UCard>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-400">Accounts Processed</p>
              <p class="text-2xl font-bold mt-1">
                {{ pipelineData.account_count === 0 ? 'All Accounts' : pipelineData.account_count }}
              </p>
            </div>
            <UIcon name="i-heroicons-building-office" class="w-8 h-8 text-purple-500" />
          </div>
        </UCard>

        <UCard>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-400">Job Stage</p>
              <p class="text-xl font-bold mt-1">{{ pipelineData.job_stage || 'N/A' }}</p>
            </div>
            <UIcon name="i-heroicons-squares-2x2" class="w-8 h-8 text-blue-500" />
          </div>
        </UCard>

        <UCard>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-400">Terraform Version</p>
              <p class="text-xl font-bold mt-1">{{ pipelineData.terraform_version || 'N/A' }}</p>
            </div>
            <UIcon name="i-heroicons-code-bracket" class="w-8 h-8 text-green-500" />
          </div>
        </UCard>
      </div>

      <!-- Timeline -->
      <UCard>
        <template #header>
          <h3 class="font-semibold text-lg">Timeline</h3>
        </template>
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p class="text-gray-400">Started</p>
              <p class="text-white font-semibold">{{ formatDateTime(pipelineData.timestamp_start) }}</p>
            </div>
            <div>
              <p class="text-gray-400">Ended</p>
              <p class="text-white font-semibold">{{ formatDateTime(pipelineData.timestamp_end) }}</p>
            </div>
          </div>
        </div>
      </UCard>

      <!-- Account Plans Table -->
      <UCard v-if="accountPlans.length > 0">
        <template #header>
          <h3 class="font-semibold text-lg">Account Plans ({{ accountPlans.length }})</h3>
        </template>
        <UTable :rows="accountPlans" :columns="accountPlanColumns">
          <!-- Account Name -->
          <template #account_name-data="{ row }">
            <div>
              <div class="font-semibold text-white">{{ row.account_name }}</div>
              <div class="text-xs text-gray-400 font-mono">{{ row.account_id }}</div>
            </div>
          </template>

          <!-- Changes -->
          <template #changes_total-data="{ row }">
            <div class="flex items-center gap-2">
              <UBadge color="gray" variant="subtle" size="sm">
                {{ row.changes_total }} total
              </UBadge>
            </div>
          </template>

          <!-- Change Details -->
          <template #change_details-data="{ row }">
            <div class="flex gap-2 text-xs">
              <span v-if="row.changes_create > 0" class="text-green-400">+{{ row.changes_create }}</span>
              <span v-if="row.changes_update > 0" class="text-blue-400">~{{ row.changes_update }}</span>
              <span v-if="row.changes_destroy > 0" class="text-red-400">-{{ row.changes_destroy }}</span>
            </div>
          </template>

          <!-- Status -->
          <template #plan_status-data="{ row }">
            <UBadge
              :color="getPlanStatusColor(row.plan_status)"
              variant="soft"
              size="sm"
            >
              {{ formatPlanStatus(row.plan_status) }}
            </UBadge>
          </template>

          <!-- Completed/Failed At -->
          <template #completed_at-data="{ row }">
            <div class="text-sm">
              <div v-if="row.plan_status === 'applied' && row.applied_at" class="text-gray-300">
                {{ formatDateTime(row.applied_at) }}
              </div>
              <div v-else-if="row.plan_status === 'failed' && row.failed_at" class="text-red-400">
                {{ formatDateTime(row.failed_at) }}
              </div>
              <div v-else class="text-gray-500">-</div>
              <div v-if="row.failure_reason" class="text-xs text-red-300 mt-1 max-w-xs truncate" :title="row.failure_reason">
                {{ row.failure_reason }}
              </div>
            </div>
          </template>
        </UTable>
      </UCard>

      <!-- Resource Statistics (or info card if no data) -->
      <UCard v-if="accountPlans.length > 0 && resourceStats.totalResources === 0">
        <template #header>
          <h3 class="font-semibold text-lg">Resource Changes</h3>
        </template>
        <div class="text-center py-8">
          <UIcon name="i-heroicons-information-circle" class="w-12 h-12 text-blue-500 mx-auto mb-4" />
          <p class="text-gray-400 mb-2">Resource changes are tracked per-account</p>
          <p class="text-sm text-gray-500">View resource details on individual account pages</p>
        </div>
      </UCard>

      <div v-if="resourceStats.totalResources > 0" class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <!-- Resources by Action -->
        <UCard>
          <template #header>
            <h3 class="font-semibold text-lg">Resources by Action ({{ resourceStats.totalResources }} total)</h3>
          </template>
          <div class="space-y-3">
            <div
              v-for="item in resourceStats.byAction"
              :key="item.action"
              class="flex items-center justify-between"
            >
              <div class="flex items-center gap-2">
                <UIcon
                  :name="getActionIcon(item.action)"
                  :class="getActionColor(item.action)"
                  class="w-5 h-5"
                />
                <span class="capitalize">{{ item.action }}</span>
              </div>
              <UBadge color="gray" variant="subtle">
                {{ item.count }}
              </UBadge>
            </div>
          </div>
        </UCard>

        <!-- Top Resource Types -->
        <UCard>
          <template #header>
            <h3 class="font-semibold text-lg">Top Resource Types</h3>
          </template>
          <div class="space-y-3">
            <div
              v-for="item in resourceStats.byType"
              :key="item.type"
              class="flex items-center justify-between"
            >
              <span class="text-sm font-mono text-gray-300">{{ item.type }}</span>
              <UBadge color="gray" variant="subtle">
                {{ item.count }}
              </UBadge>
            </div>
          </div>
        </UCard>
      </div>

      <!-- Error Statistics -->
      <div v-if="errorStats.totalErrors > 0" class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <!-- Errors by Category -->
        <UCard>
          <template #header>
            <h3 class="font-semibold text-lg text-red-400">Errors by Category ({{ errorStats.totalErrors }} total)</h3>
          </template>
          <div class="space-y-3">
            <div
              v-for="item in errorStats.byCategory"
              :key="item.category"
              class="flex items-center justify-between"
            >
              <span class="text-sm">{{ item.category }}</span>
              <UBadge color="red" variant="soft">
                {{ item.count }}
              </UBadge>
            </div>
          </div>
        </UCard>

        <!-- Errors by Severity -->
        <UCard>
          <template #header>
            <h3 class="font-semibold text-lg text-red-400">Errors by Severity</h3>
          </template>
          <div class="space-y-3">
            <div
              v-for="item in errorStats.bySeverity"
              :key="item.severity"
              class="flex items-center justify-between"
            >
              <span class="text-sm capitalize">{{ item.severity }}</span>
              <UBadge
                :color="getSeverityColor(item.severity)"
                variant="soft"
              >
                {{ item.count }}
              </UBadge>
            </div>
          </div>
        </UCard>
      </div>

      <!-- Accounts Targeted -->
      <UCard v-if="accountsList.length > 0">
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="font-semibold text-lg">Accounts Targeted ({{ accountsList.length }})</h3>
            <UButton
              size="xs"
              variant="ghost"
              @click="showAllAccounts = !showAllAccounts"
            >
              {{ showAllAccounts ? 'Show Less' : 'Show All' }}
            </UButton>
          </div>
        </template>
        <div class="flex flex-wrap gap-2">
          <UBadge
            v-for="(account, index) in (showAllAccounts ? accountsList : accountsList.slice(0, 20))"
            :key="account"
            color="gray"
            variant="soft"
            size="sm"
          >
            {{ account }}
          </UBadge>
          <UBadge v-if="!showAllAccounts && accountsList.length > 20" color="blue" variant="soft" size="sm">
            +{{ accountsList.length - 20 }} more
          </UBadge>
        </div>
      </UCard>

      <!-- Detailed Resource Changes Table -->
      <UCard v-if="detailedResources.length > 0">
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="font-semibold text-lg">Resource Changes ({{ detailedResources.length }})</h3>
            <UInput
              v-model="resourceSearchQuery"
              icon="i-heroicons-magnifying-glass"
              placeholder="Search resources..."
              size="sm"
              class="w-64"
            />
          </div>
        </template>
        <UTable :rows="filteredResources" :columns="resourceColumns">
          <!-- Resource Address -->
          <template #resource_address-data="{ row }">
            <div class="font-mono text-xs text-gray-300 max-w-md truncate" :title="row.resource_address">
              {{ row.resource_address }}
            </div>
          </template>

          <!-- Resource Type -->
          <template #resource_type-data="{ row }">
            <UBadge color="blue" variant="soft" size="xs">
              {{ row.resource_type }}
            </UBadge>
          </template>

          <!-- Action -->
          <template #change_action-data="{ row }">
            <div class="flex items-center gap-2">
              <UIcon
                :name="getActionIcon(row.change_action)"
                :class="getActionColor(row.change_action)"
                class="w-4 h-4"
              />
              <span class="capitalize text-sm">{{ row.change_action }}</span>
            </div>
          </template>

          <!-- Module -->
          <template #module_name-data="{ row }">
            <span class="text-sm text-gray-400">{{ row.module_name || 'root' }}</span>
          </template>

          <!-- Status -->
          <template #apply_success-data="{ row }">
            <UBadge
              v-if="row.applied"
              :color="row.apply_success ? 'green' : 'red'"
              variant="soft"
              size="xs"
            >
              {{ row.apply_success ? 'Applied' : 'Failed' }}
            </UBadge>
            <UBadge v-else color="gray" variant="subtle" size="xs">
              Pending
            </UBadge>
          </template>
        </UTable>
      </UCard>

      <!-- Detailed Error Messages -->
      <UCard v-if="detailedErrors.length > 0">
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="font-semibold text-lg text-red-400">Error Details ({{ detailedErrors.length }})</h3>
            <USelectMenu
              v-model="errorFilter"
              :options="errorFilterOptions"
              size="sm"
            />
          </div>
        </template>
        <div class="space-y-4">
          <div
            v-for="(errorItem, index) in filteredErrors"
            :key="index"
            class="p-4 bg-red-900/20 border border-red-500/30 rounded-lg"
          >
            <div class="flex items-start justify-between mb-2">
              <div class="flex items-center gap-2">
                <UBadge :color="getSeverityColor(errorItem.error_severity)" variant="soft" size="sm">
                  {{ errorItem.error_severity }}
                </UBadge>
                <UBadge color="gray" variant="subtle" size="sm">
                  {{ errorItem.error_category }}
                </UBadge>
                <span class="text-xs text-gray-400">{{ errorItem.error_phase }}</span>
              </div>
              <div class="text-xs text-gray-500">
                {{ formatDateTime(errorItem.timestamp) }}
              </div>
            </div>
            <div class="flex items-center gap-2 mb-2">
              <UIcon name="i-heroicons-building-office" class="w-4 h-4 text-gray-400" />
              <span class="text-sm text-gray-300">{{ errorItem.account_id }}</span>
              <span v-if="errorItem.error_resource_type" class="text-xs text-gray-500">
                ({{ errorItem.error_resource_type }})
              </span>
            </div>
            <pre class="text-xs text-red-300 font-mono whitespace-pre-wrap bg-black/30 p-3 rounded overflow-x-auto">{{ errorItem.error_message }}</pre>
          </div>
        </div>
      </UCard>

      <!-- Job Details -->
      <UCard>
        <template #header>
          <h3 class="font-semibold text-lg">Job Details</h3>
        </template>
        <div class="space-y-3">
          <div class="flex justify-between items-center py-2 border-b border-gray-700">
            <span class="text-gray-400">Pipeline ID</span>
            <span class="text-white font-mono">{{ pipelineData.pipeline_id }}</span>
          </div>
          <div class="flex justify-between items-center py-2 border-b border-gray-700">
            <span class="text-gray-400">Job ID</span>
            <span class="text-white font-mono">{{ pipelineData.job_id }}</span>
          </div>
          <div class="flex justify-between items-center py-2 border-b border-gray-700">
            <span class="text-gray-400">Job Name</span>
            <span class="text-white">{{ pipelineData.job_name }}</span>
          </div>
          <div class="flex justify-between items-center py-2 border-b border-gray-700">
            <span class="text-gray-400">Job Stage</span>
            <span class="text-white">{{ pipelineData.job_stage }}</span>
          </div>
          <div class="flex justify-between items-center py-2">
            <span class="text-gray-400">Job URL</span>
            <a
              v-if="pipelineData.job_url"
              :href="pipelineData.job_url"
              target="_blank"
              rel="noopener noreferrer"
              class="text-blue-400 hover:text-blue-300 flex items-center gap-1"
            >
              <span class="text-sm">View Job Log in GitLab</span>
              <UIcon name="i-heroicons-arrow-top-right-on-square" class="w-4 h-4" />
            </a>
          </div>
        </div>
      </UCard>
    </div>

    <!-- Empty State -->
    <div v-if="!loading && !error && !pipelineData.pipeline_id" class="text-center py-12">
      <UIcon name="i-heroicons-exclamation-circle" class="w-16 h-16 text-gray-500 mx-auto mb-4" />
      <p class="text-xl text-gray-400 mb-2">Pipeline Not Found</p>
      <p class="text-sm text-gray-500">
        No pipeline data found for ID {{ pipelineId }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { parseGitLabUrl } from '~/utils/gitlab-url-parser'

const logger = createLogger('Pipeline Details')

// Admin-only access control
definePageMeta({
  keepalive: false,
  layout: 'admin',
  middleware: 'auth-permission',
  permission: 'admin.logs'
})

const route = useRoute()
const repoId = route.params.repoId as string
const pipelineId = route.params.pipelineId as string
const projectName = repoId // Now using project name directly as the URL parameter

// Computed property for repository path display
const repositoryPath = computed(() => {
  return repoId || 'Unknown Repository'
})

const loading = ref(true)
const error = ref<string | null>(null)
const pipelineData = ref<any>({})
const accountPlans = ref<any[]>([])
const accountStats = ref<any>({})
const resourceStats = ref<any>({})
const errorStats = ref<any>({})
const detailedResources = ref<any[]>([])
const detailedErrors = ref<any[]>([])

// UI state
const showAllAccounts = ref(false)
const resourceSearchQuery = ref('')
const errorFilter = ref('all')

const errorFilterOptions = [
  { label: 'All Errors', value: 'all' },
  { label: 'Critical', value: 'critical' },
  { label: 'Error', value: 'error' },
  { label: 'Warning', value: 'warning' }
]

const accountsList = computed(() => {
  if (!pipelineData.value.accounts_processed) return []

  if (Array.isArray(pipelineData.value.accounts_processed)) {
    return pipelineData.value.accounts_processed
  } else if (typeof pipelineData.value.accounts_processed === 'string') {
    return pipelineData.value.accounts_processed.split(',').map((acc: string) => acc.trim())
  }

  return []
})

// Filter resources by search query
const filteredResources = computed(() => {
  if (!resourceSearchQuery.value) return detailedResources.value

  const query = resourceSearchQuery.value.toLowerCase()
  return detailedResources.value.filter((resource: any) => {
    return (
      resource.resource_address?.toLowerCase().includes(query) ||
      resource.resource_type?.toLowerCase().includes(query) ||
      resource.module_name?.toLowerCase().includes(query) ||
      resource.account_id?.toLowerCase().includes(query)
    )
  })
})

// Filter errors by severity
const filteredErrors = computed(() => {
  if (errorFilter.value === 'all') return detailedErrors.value

  return detailedErrors.value.filter((error: any) => {
    return error.error_severity?.toLowerCase() === errorFilter.value.toLowerCase()
  })
})

// Fetch pipeline data with comprehensive details
async function fetchPipelineData() {
  loading.value = true
  error.value = null

  try {
    // Use the comprehensive details endpoint with GitLab enrichment
    const response = await fetch(`/api/pipelines/${pipelineId}/details?enrich=true`)

    logger.info('API response status:', response.status)

    if (response.status === 404) {
      // Pipeline not found
      pipelineData.value = {}
      loading.value = false
      return
    }

    if (!response.ok) {
      const errorText = await response.text()
      logger.error('API error response:', errorText)
      throw new Error('Failed to fetch pipeline data')
    }

    const result = await response.json()

    if (!result.success) {
      throw new Error(result.message || 'Failed to fetch pipeline data')
    }

    logger.info('Pipeline comprehensive data found:', result.data)
    logger.info('GitLab enrichment data:', result.data.pipeline?.gitlab)

    // Destructure the comprehensive response
    pipelineData.value = result.data.pipeline
    accountPlans.value = result.data.accountPlans
    accountStats.value = result.data.accountStats
    resourceStats.value = result.data.resourceStats
    errorStats.value = result.data.errorStats

    // Debug: Log resource stats
    logger.info('Resource Stats:', resourceStats.value)
    logger.info('Total Resources:', resourceStats.value?.totalResources)

    // Fetch detailed resources and errors in parallel
    const [resourcesResponse, errorsResponse] = await Promise.all([
      fetch(`/api/pipelines/${pipelineId}/resources`),
      fetch(`/api/pipelines/${pipelineId}/errors`)
    ])

    if (resourcesResponse.ok) {
      const resourcesResult = await resourcesResponse.json()
      if (resourcesResult.success) {
        detailedResources.value = resourcesResult.data || []
      }
    }

    if (errorsResponse.ok) {
      const errorsResult = await errorsResponse.json()
      if (errorsResult.success) {
        detailedErrors.value = errorsResult.data || []
      }
    }

  } catch (err: any) {
    logger.error('Error fetching pipeline data:', err)
    error.value = err.message || 'An unexpected error occurred'
  } finally {
    loading.value = false
  }
}

// Table columns for account plans
const accountPlanColumns = [
  { key: 'account_name', label: 'Account', sortable: true },
  { key: 'changes_total', label: 'Total Changes', sortable: true },
  { key: 'change_details', label: 'Details', sortable: false },
  { key: 'plan_status', label: 'Status', sortable: true },
  { key: 'completed_at', label: 'Completed / Failed At', sortable: true }
]

// Table columns for resources
const resourceColumns = [
  { key: 'resource_address', label: 'Resource', sortable: true },
  { key: 'resource_type', label: 'Type', sortable: true },
  { key: 'change_action', label: 'Action', sortable: true },
  { key: 'module_name', label: 'Module', sortable: true },
  { key: 'apply_success', label: 'Status', sortable: true }
]

// Initial load
onMounted(() => {
  fetchPipelineData()
})

// Use date formatter composable for timezone-aware formatting
const { formatDateTime: formatDateTimeWithTz, formatDuration: formatDurationWithTz } = useDateFormatter()

// Formatting helpers
function formatDuration(seconds: number): string {
  return formatDurationWithTz(seconds)
}

function formatDateTime(timestamp: string): string {
  return formatDateTimeWithTz(timestamp)
}

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

// Helper functions for resource and error display
function getActionIcon(action: string): string {
  switch (action.toLowerCase()) {
    case 'create':
      return 'i-heroicons-plus-circle'
    case 'update':
      return 'i-heroicons-arrow-path'
    case 'delete':
    case 'destroy':
      return 'i-heroicons-trash'
    default:
      return 'i-heroicons-question-mark-circle'
  }
}

function getActionColor(action: string): string {
  switch (action.toLowerCase()) {
    case 'create':
      return 'text-green-500'
    case 'update':
      return 'text-blue-500'
    case 'delete':
    case 'destroy':
      return 'text-red-500'
    default:
      return 'text-gray-500'
  }
}

function getSeverityColor(severity: string): string {
  switch (severity.toLowerCase()) {
    case 'critical':
      return 'red'
    case 'error':
      return 'orange'
    case 'warning':
      return 'yellow'
    default:
      return 'gray'
  }
}

function getMRStateColor(state: string): string {
  switch (state.toLowerCase()) {
    case 'merged':
      return 'purple'
    case 'opened':
    case 'open':
      return 'green'
    case 'closed':
      return 'red'
    case 'locked':
      return 'gray'
    default:
      return 'gray'
  }
}

function getPlanStatusColor(status: string): string {
  switch (status?.toLowerCase()) {
    case 'applied':
      return 'green'
    case 'failed':
      return 'red'
    case 'pending':
      return 'yellow'
    case 'expired':
      return 'gray'
    default:
      return 'gray'
  }
}

function formatPlanStatus(status: string): string {
  if (!status) return 'Unknown'
  return status.charAt(0).toUpperCase() + status.slice(1)
}
</script>
