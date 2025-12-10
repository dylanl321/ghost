<template>
  <UCard>
    <div class="space-y-4">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
            Strands Service Health
          </h3>
          <p class="text-sm text-gray-500 dark:text-gray-400">
            Connectivity and health status of the AI agent service
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
          <p class="text-sm text-gray-500 dark:text-gray-400">Checking service health...</p>
        </div>
      </div>

      <!-- Health Results -->
      <div v-if="health && !loading" class="space-y-4">
        <!-- Overall Status -->
        <div class="p-4 rounded-lg" :class="health.healthy ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'">
          <div class="flex items-center gap-3">
            <UIcon
              :name="health.healthy ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
              :class="health.healthy ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'"
              class="w-6 h-6"
            />
            <div>
              <h4 class="font-semibold" :class="health.healthy ? 'text-green-900 dark:text-green-100' : 'text-red-900 dark:text-red-100'">
                {{ health.healthy ? 'Service Healthy' : 'Service Unhealthy' }}
              </h4>
              <p class="text-xs" :class="health.healthy ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'">
                Last checked: {{ formatTime(health.results.timestamp) }}
              </p>
            </div>
          </div>
        </div>

        <!-- ALB Health -->
        <div class="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
          <div class="flex items-start justify-between mb-3">
            <div class="flex items-center gap-2">
              <UIcon
                :name="health.results.health.alb.reachable ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
                :class="health.results.health.alb.reachable ? 'text-green-500' : 'text-red-500'"
                class="w-5 h-5"
              />
              <div>
                <h5 class="font-medium text-gray-900 dark:text-white">Load Balancer (ALB)</h5>
                <p class="text-xs text-gray-500 dark:text-gray-400">{{ health.results.strandsUrl }}</p>
              </div>
            </div>
            <UBadge
              v-if="health.results.health.alb.status"
              :color="getStatusColor(health.results.health.alb.status)"
              size="sm"
            >
              {{ health.results.health.alb.status }}
            </UBadge>
          </div>

          <div v-if="health.results.health.alb.latency" class="text-sm text-gray-600 dark:text-gray-400 mb-2">
            <span class="font-medium">Latency:</span> {{ health.results.health.alb.latency }}ms
          </div>

          <div v-if="health.results.health.alb.error" class="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded">
            {{ health.results.health.alb.error }}
          </div>
        </div>

        <!-- Service Health -->
        <div class="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
          <div class="flex items-start justify-between mb-3">
            <div class="flex items-center gap-2">
              <UIcon
                :name="health.results.health.service.reachable ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
                :class="health.results.health.service.reachable ? 'text-green-500' : 'text-red-500'"
                class="w-5 h-5"
              />
              <div>
                <h5 class="font-medium text-gray-900 dark:text-white">ECS Service (/query/stream endpoint)</h5>
                <p class="text-xs text-gray-500 dark:text-gray-400">Strands agent streaming API</p>
              </div>
            </div>
            <UBadge
              v-if="health.results.health.service.status"
              :color="getStatusColor(health.results.health.service.status)"
              size="sm"
            >
              {{ health.results.health.service.status }}
            </UBadge>
          </div>

          <div v-if="health.results.health.service.latency" class="text-sm text-gray-600 dark:text-gray-400 mb-2">
            <span class="font-medium">Latency:</span> {{ health.results.health.service.latency }}ms
          </div>

          <div v-if="health.results.health.service.error" class="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded">
            {{ health.results.health.service.error }}
          </div>
        </div>

        <!-- Recommendations -->
        <div v-if="health.recommendations.length > 0" class="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <h5 class="font-medium text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
            <UIcon name="i-heroicons-light-bulb" class="w-5 h-5" />
            Recommendations
          </h5>
          <ul class="space-y-1">
            <li
              v-for="(rec, idx) in health.recommendations"
              :key="idx"
              class="text-sm text-blue-800 dark:text-blue-200 font-mono whitespace-pre-wrap"
            >
              {{ rec }}
            </li>
          </ul>
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
interface HealthCheck {
  success: boolean
  healthy: boolean
  results: {
    timestamp: string
    strandsUrl: string
    health: {
      alb: {
        reachable: boolean
        status: number | null
        latency: number | null
        error: string | null
      }
      service: {
        reachable: boolean
        status: number | null
        latency: number | null
        error: string | null
      }
    }
  }
  recommendations: string[]
}

const loading = ref(false)
const error = ref<string | null>(null)
const health = ref<HealthCheck | null>(null)

// Check health on mount
onMounted(() => {
  checkHealth()
})

async function checkHealth() {
  loading.value = true
  error.value = null

  try {
    const response = await $fetch('/api/admin/strands-health')
    health.value = response as HealthCheck
  } catch (e: any) {
    error.value = e.data?.message || e.message || 'Failed to check service health'
    console.error('Error checking Strands health:', e)
  } finally {
    loading.value = false
  }
}

function getStatusColor(status: number): string {
  if (status >= 200 && status < 300) return 'green'
  if (status >= 400 && status < 500) return 'yellow'
  if (status >= 500) return 'red'
  return 'gray'
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString()
}
</script>
