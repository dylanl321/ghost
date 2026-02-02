<template>
  <UCard>
    <div class="space-y-4">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
            System Health
          </h3>
          <p class="text-sm text-gray-500 dark:text-gray-400">
            Overall system status, dependencies, and resource monitoring
          </p>
        </div>
        <UButton
          icon="i-heroicons-arrow-path"
          label="Check Now"
          color="primary"
          variant="outline"
          :loading="loading"
          @click="checkHealth"
        />
      </div>

      <!-- Loading State -->
      <div v-if="loading && !health" class="flex justify-center py-8">
        <div class="text-center">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mx-auto mb-2"></div>
          <p class="text-sm text-gray-500 dark:text-gray-400">Checking system health...</p>
        </div>
      </div>

      <!-- Health Results -->
      <div v-if="health && !loading" class="space-y-4">
        <!-- Overall Status Banner -->
        <div class="p-4 rounded-lg" :class="getStatusClass(health.data.status)">
          <div class="flex items-center gap-3">
            <UIcon
              :name="getStatusIcon(health.data.status)"
              :class="getStatusIconColor(health.data.status)"
              class="w-6 h-6"
            />
            <div>
              <h4 class="font-semibold" :class="getStatusTextColor(health.data.status)">
                {{ getStatusLabel(health.data.status) }}
              </h4>
              <p class="text-xs" :class="getStatusSubtextColor(health.data.status)">
                Last checked: {{ formatTime(health.data.timestamp) }}
              </p>
            </div>
          </div>
        </div>

        <!-- Warnings -->
        <div v-if="health.data.warnings.length > 0" class="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <h5 class="font-medium text-yellow-900 dark:text-yellow-100 mb-2 flex items-center gap-2">
            <UIcon name="i-heroicons-exclamation-triangle" class="w-5 h-5" />
            Warnings
          </h5>
          <ul class="space-y-1">
            <li
              v-for="(warning, idx) in health.data.warnings"
              :key="idx"
              class="text-sm text-yellow-800 dark:text-yellow-200"
            >
              {{ warning }}
            </li>
          </ul>
        </div>

        <!-- System Metrics -->
        <div class="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
          <h5 class="font-medium text-gray-900 dark:text-white mb-3">System Metrics</h5>
          <div class="space-y-3">
            <!-- Uptime -->
            <div class="flex justify-between items-center">
              <span class="text-sm text-gray-600 dark:text-gray-400">Uptime</span>
              <span class="text-sm font-medium text-gray-900 dark:text-white">{{ health.data.uptime.formatted }}</span>
            </div>

            <!-- Memory -->
            <div>
              <div class="flex justify-between items-center mb-1">
                <span class="text-sm text-gray-600 dark:text-gray-400">Memory Usage</span>
                <span class="text-sm font-medium text-gray-900 dark:text-white">
                  {{ health.data.system.memory.used }} / {{ health.data.system.memory.total }}
                  ({{ health.data.system.memory.percentage }}%)
                </span>
              </div>
              <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  class="h-2 rounded-full"
                  :class="getMemoryBarColor(health.data.system.memory.percentage)"
                  :style="{ width: `${health.data.system.memory.percentage}%` }"
                ></div>
              </div>
            </div>

            <!-- CPU -->
            <div class="flex justify-between items-center">
              <span class="text-sm text-gray-600 dark:text-gray-400">CPU</span>
              <span class="text-sm font-medium text-gray-900 dark:text-white">
                {{ health.data.system.cpu.cores }} cores,
                load: {{ health.data.system.cpu.loadAverage[0].toFixed(2) }}
              </span>
            </div>

            <!-- Platform -->
            <div class="flex justify-between items-center">
              <span class="text-sm text-gray-600 dark:text-gray-400">Platform</span>
              <span class="text-sm font-medium text-gray-900 dark:text-white">
                {{ health.data.system.platform }} ({{ health.data.system.nodeVersion }})
              </span>
            </div>
          </div>
        </div>

        <!-- AWS Environments -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <!-- Commercial -->
          <div class="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
            <div class="flex items-start justify-between mb-3">
              <div class="flex items-center gap-2">
                <UIcon
                  :name="health.data.environments.commercial.configured ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
                  :class="health.data.environments.commercial.configured ? 'text-green-500' : 'text-red-500'"
                  class="w-5 h-5"
                />
                <div>
                  <h5 class="font-medium text-gray-900 dark:text-white">Commercial AWS</h5>
                  <p class="text-xs text-gray-500 dark:text-gray-400">{{ health.data.environments.commercial.region }}</p>
                </div>
              </div>
              <UBadge
                :color="health.data.environments.commercial.configured ? 'green' : 'gray'"
                size="sm"
              >
                {{ health.data.environments.commercial.configured ? 'Configured' : 'Not Configured' }}
              </UBadge>
            </div>

            <!-- Commercial AWS Details -->
            <div v-if="health.data.aws?.commercial" class="space-y-2 text-sm">
              <!-- Identity Status -->
              <div v-if="health.data.aws.commercial.identity">
                <div class="flex items-center gap-2 mb-1">
                  <UIcon
                    :name="health.data.aws.commercial.identity.status === 'active' ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
                    :class="health.data.aws.commercial.identity.status === 'active' ? 'text-green-500' : 'text-red-500'"
                    class="w-4 h-4"
                  />
                  <span class="font-medium text-gray-700 dark:text-gray-300">Identity</span>
                </div>
                <div v-if="health.data.aws.commercial.identity.accountId" class="ml-6 text-xs text-gray-600 dark:text-gray-400">
                  Account: {{ health.data.aws.commercial.identity.accountId }}
                </div>
                <div v-if="health.data.aws.commercial.identity.error" class="ml-6 text-xs text-red-600 dark:text-red-400">
                  {{ health.data.aws.commercial.identity.error }}
                </div>
              </div>

              <!-- DynamoDB -->
              <div>
                <div class="flex items-center gap-2 mb-1">
                  <UIcon
                    :name="health.data.aws.commercial.services.dynamodb.accessible ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
                    :class="health.data.aws.commercial.services.dynamodb.accessible ? 'text-green-500' : 'text-red-500'"
                    class="w-4 h-4"
                  />
                  <span class="font-medium text-gray-700 dark:text-gray-300">DynamoDB</span>
                </div>
                <div v-if="health.data.aws.commercial.services.dynamodb.error" class="ml-6 text-xs text-red-600 dark:text-red-400">
                  {{ health.data.aws.commercial.services.dynamodb.error }}
                </div>
              </div>

              <!-- Organizations -->
              <div>
                <div class="flex items-center gap-2 mb-1">
                  <UIcon
                    :name="health.data.aws.commercial.services.organizations.accessible ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
                    :class="health.data.aws.commercial.services.organizations.accessible ? 'text-green-500' : 'text-red-500'"
                    class="w-4 h-4"
                  />
                  <span class="font-medium text-gray-700 dark:text-gray-300">Organizations</span>
                </div>
                <div v-if="health.data.aws.commercial.services.organizations.organizationId" class="ml-6 text-xs text-gray-600 dark:text-gray-400">
                  {{ health.data.aws.commercial.services.organizations.organizationId }}
                </div>
                <div v-if="health.data.aws.commercial.services.organizations.error" class="ml-6 text-xs text-gray-500 dark:text-gray-500">
                  {{ health.data.aws.commercial.services.organizations.error }}
                </div>
              </div>
            </div>
          </div>

          <!-- GovCloud -->
          <div class="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
            <div class="flex items-start justify-between mb-3">
              <div class="flex items-center gap-2">
                <UIcon
                  :name="health.data.environments.govcloud.configured ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
                  :class="health.data.environments.govcloud.configured ? 'text-green-500' : 'text-red-500'"
                  class="w-5 h-5"
                />
                <div>
                  <h5 class="font-medium text-gray-900 dark:text-white">GovCloud AWS</h5>
                  <p class="text-xs text-gray-500 dark:text-gray-400">{{ health.data.environments.govcloud.region }}</p>
                </div>
              </div>
              <UBadge
                :color="health.data.environments.govcloud.configured ? 'green' : 'gray'"
                size="sm"
              >
                {{ health.data.environments.govcloud.configured ? 'Configured' : 'Not Configured' }}
              </UBadge>
            </div>

            <!-- GovCloud AWS Details -->
            <div v-if="health.data.aws?.govcloud" class="space-y-2 text-sm">
              <!-- Identity Status -->
              <div v-if="health.data.aws.govcloud.identity">
                <div class="flex items-center gap-2 mb-1">
                  <UIcon
                    :name="health.data.aws.govcloud.identity.status === 'active' ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
                    :class="health.data.aws.govcloud.identity.status === 'active' ? 'text-green-500' : 'text-red-500'"
                    class="w-4 h-4"
                  />
                  <span class="font-medium text-gray-700 dark:text-gray-300">Identity</span>
                </div>
                <div v-if="health.data.aws.govcloud.identity.accountId" class="ml-6 text-xs text-gray-600 dark:text-gray-400">
                  Account: {{ health.data.aws.govcloud.identity.accountId }}
                </div>
                <div v-if="health.data.aws.govcloud.identity.error" class="ml-6 text-xs text-red-600 dark:text-red-400">
                  {{ health.data.aws.govcloud.identity.error }}
                </div>
              </div>

              <!-- DynamoDB -->
              <div>
                <div class="flex items-center gap-2 mb-1">
                  <UIcon
                    :name="health.data.aws.govcloud.services.dynamodb.accessible ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
                    :class="health.data.aws.govcloud.services.dynamodb.accessible ? 'text-green-500' : 'text-red-500'"
                    class="w-4 h-4"
                  />
                  <span class="font-medium text-gray-700 dark:text-gray-300">DynamoDB</span>
                </div>
                <div v-if="health.data.aws.govcloud.services.dynamodb.error" class="ml-6 text-xs text-red-600 dark:text-red-400">
                  {{ health.data.aws.govcloud.services.dynamodb.error }}
                </div>
              </div>

              <!-- Organizations -->
              <div>
                <div class="flex items-center gap-2 mb-1">
                  <UIcon
                    :name="health.data.aws.govcloud.services.organizations.accessible ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
                    :class="health.data.aws.govcloud.services.organizations.accessible ? 'text-green-500' : 'text-red-500'"
                    class="w-4 h-4"
                  />
                  <span class="font-medium text-gray-700 dark:text-gray-300">Organizations</span>
                </div>
                <div v-if="health.data.aws.govcloud.services.organizations.organizationId" class="ml-6 text-xs text-gray-600 dark:text-gray-400">
                  {{ health.data.aws.govcloud.services.organizations.organizationId }}
                </div>
                <div v-if="health.data.aws.govcloud.services.organizations.error" class="ml-6 text-xs text-gray-500 dark:text-gray-500">
                  {{ health.data.aws.govcloud.services.organizations.error }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Cache Statistics -->
        <div v-if="health.data.cache" class="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
          <h5 class="font-medium text-gray-900 dark:text-white mb-3">Cache Performance</h5>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div class="text-sm text-gray-600 dark:text-gray-400 mb-1">Organization Cache</div>
              <div class="text-xs text-gray-500 dark:text-gray-500">
                Entries: {{ health.data.cache.organization.entries }}
              </div>
              <div class="text-xs text-gray-500 dark:text-gray-500">
                Hit Rate: {{ (health.data.cache.organization.hitRate * 100).toFixed(1) }}%
              </div>
            </div>
            <div>
              <div class="text-sm text-gray-600 dark:text-gray-400 mb-1">Account Cache</div>
              <div class="text-xs text-gray-500 dark:text-gray-500">
                Entries: {{ health.data.cache.account.entries }}
              </div>
              <div class="text-xs text-gray-500 dark:text-gray-500">
                Hit Rate: {{ (health.data.cache.account.hitRate * 100).toFixed(1) }}%
              </div>
            </div>
            <div>
              <div class="text-sm text-gray-600 dark:text-gray-400 mb-1">Cost Cache</div>
              <div class="text-xs text-gray-500 dark:text-gray-500">
                Entries: {{ health.data.cache.cost.entries }}
              </div>
              <div class="text-xs text-gray-500 dark:text-gray-500">
                Hit Rate: {{ (health.data.cache.cost.hitRate * 100).toFixed(1) }}%
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Error State -->
      <UAlert
        v-if="error"
        icon="i-heroicons-exclamation-triangle"
        color="red"
        variant="soft"
        :title="error"
        :close-button="{ icon: 'i-heroicons-x-mark-20-solid', color: 'red', variant: 'link' }"
        @close="error = null"
      />
    </div>
  </UCard>
</template>

<script setup lang="ts">
interface HealthResponse {
  success: boolean
  data: {
    status: 'healthy' | 'degraded' | 'unhealthy'
    timestamp: string
    uptime: {
      seconds: number
      formatted: string
    }
    system: {
      platform: string
      nodeVersion: string
      memory: {
        used: string
        total: string
        percentage: number
      }
      cpu: {
        cores: number
        loadAverage: number[]
      }
    }
    environments: {
      commercial: {
        configured: boolean
        hasSessionToken: boolean
        region: string
      }
      govcloud: {
        configured: boolean
        hasSessionToken: boolean
        region: string
      }
    }
    aws?: {
      commercial?: {
        identity: {
          accountId: string | null
          arn: string | null
          userId: string | null
          status: 'active' | 'expired' | 'error'
          error?: string | null
        }
        services: {
          dynamodb: {
            accessible: boolean
            tableExists: boolean
            error: string | null
          }
          organizations: {
            accessible: boolean
            organizationId: string | null
            error: string | null
          }
        }
      }
      govcloud?: {
        identity: {
          accountId: string | null
          arn: string | null
          userId: string | null
          status: 'active' | 'expired' | 'error'
          error?: string | null
        }
        services: {
          dynamodb: {
            accessible: boolean
            tableExists: boolean
            error: string | null
          }
          organizations: {
            accessible: boolean
            organizationId: string | null
            error: string | null
          }
        }
      }
    }
    cache?: {
      organization: {
        entries: number
        hitRate: number
      }
      account: {
        entries: number
        hitRate: number
      }
      cost: {
        entries: number
        hitRate: number
      }
    }
    warnings: string[]
  }
}

const loading = ref(false)
const error = ref<string | null>(null)
const health = ref<HealthResponse | null>(null)

// Check health on mount
onMounted(() => {
  checkHealth()
})

async function checkHealth() {
  loading.value = true
  error.value = null

  try {
    const response = await $fetch('/api/health/ready')
    health.value = response as HealthResponse
  } catch (e: any) {
    error.value = e.data?.message || e.message || 'Failed to check system health'
    console.error('Error checking system health:', e)
  } finally {
    loading.value = false
  }
}

function getStatusClass(status: string): string {
  switch (status) {
    case 'healthy':
      return 'bg-green-50 dark:bg-green-900/20'
    case 'degraded':
      return 'bg-yellow-50 dark:bg-yellow-900/20'
    case 'unhealthy':
      return 'bg-red-50 dark:bg-red-900/20'
    default:
      return 'bg-gray-50 dark:bg-gray-900/20'
  }
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'healthy':
      return 'i-heroicons-check-circle'
    case 'degraded':
      return 'i-heroicons-exclamation-triangle'
    case 'unhealthy':
      return 'i-heroicons-x-circle'
    default:
      return 'i-heroicons-question-mark-circle'
  }
}

function getStatusIconColor(status: string): string {
  switch (status) {
    case 'healthy':
      return 'text-green-600 dark:text-green-400'
    case 'degraded':
      return 'text-yellow-600 dark:text-yellow-400'
    case 'unhealthy':
      return 'text-red-600 dark:text-red-400'
    default:
      return 'text-gray-600 dark:text-gray-400'
  }
}

function getStatusTextColor(status: string): string {
  switch (status) {
    case 'healthy':
      return 'text-green-900 dark:text-green-100'
    case 'degraded':
      return 'text-yellow-900 dark:text-yellow-100'
    case 'unhealthy':
      return 'text-red-900 dark:text-red-100'
    default:
      return 'text-gray-900 dark:text-gray-100'
  }
}

function getStatusSubtextColor(status: string): string {
  switch (status) {
    case 'healthy':
      return 'text-green-700 dark:text-green-300'
    case 'degraded':
      return 'text-yellow-700 dark:text-yellow-300'
    case 'unhealthy':
      return 'text-red-700 dark:text-red-300'
    default:
      return 'text-gray-700 dark:text-gray-300'
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'healthy':
      return 'System Healthy'
    case 'degraded':
      return 'System Degraded'
    case 'unhealthy':
      return 'System Unhealthy'
    default:
      return 'Status Unknown'
  }
}

function getMemoryBarColor(percentage: number): string {
  if (percentage < 60) return 'bg-green-500'
  if (percentage < 80) return 'bg-yellow-500'
  return 'bg-red-500'
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp)
  return date.toLocaleString()
}
</script>
