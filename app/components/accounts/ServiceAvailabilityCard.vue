<template>
  <UCard>
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-heroicons-server-stack" class="text-purple-500 w-5 h-5" />
        <h4 class="font-semibold">Service Availability</h4>
      </div>
    </template>

    <div v-if="loading" class="flex items-center justify-center py-8">
      <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-gray-400" />
    </div>

    <div v-else-if="error" class="text-center py-8">
      <UIcon name="i-heroicons-exclamation-triangle" class="w-8 h-8 text-red-400 mx-auto mb-2" />
      <p class="text-sm text-gray-400">{{ error }}</p>
    </div>

    <div v-else class="space-y-4">
      <!-- Summary Stats -->
      <div class="grid grid-cols-2 gap-3">
        <div class="bg-gray-800 rounded-lg p-3">
          <div class="flex items-center gap-2 mb-1">
            <UIcon name="i-heroicons-server-stack" class="w-4 h-4 text-blue-400" />
            <span class="text-xs text-gray-400">Total Resources</span>
          </div>
          <p class="text-2xl font-bold text-white">{{ totalResources }}</p>
        </div>

        <div class="bg-gray-800 rounded-lg p-3">
          <div class="flex items-center gap-2 mb-1">
            <UIcon name="i-heroicons-cube" class="w-4 h-4 text-purple-400" />
            <span class="text-xs text-gray-400">Service Types</span>
          </div>
          <p class="text-2xl font-bold text-white">{{ serviceCount }}</p>
        </div>
      </div>

      <!-- Top Services -->
      <div v-if="topServices.length > 0">
        <h5 class="text-xs font-semibold text-gray-400 mb-2">Top Services</h5>
        <div class="space-y-2">
          <div
            v-for="service in topServices"
            :key="service.name"
            class="flex items-center justify-between p-2 bg-gray-800 rounded-md hover:bg-gray-750 transition-colors"
          >
            <div class="flex items-center gap-2 min-w-0 flex-1">
              <UIcon :name="getServiceIcon(service.name)" class="w-4 h-4 flex-shrink-0" :class="getServiceColor(service.name)" />
              <span class="text-sm text-gray-300 truncate">{{ formatServiceName(service.name) }}</span>
            </div>
            <UBadge color="gray" variant="subtle" size="xs">
              {{ service.count }}
            </UBadge>
          </div>
        </div>
      </div>

      <!-- Regions Info (if available) -->
      <div v-if="regions.length > 0" class="pt-3 border-t border-gray-700">
        <div class="flex items-center justify-between">
          <span class="text-xs text-gray-400">Active Regions</span>
          <div class="flex items-center gap-1">
            <UBadge
              v-for="region in regions.slice(0, 3)"
              :key="region"
              color="blue"
              variant="subtle"
              size="xs"
            >
              {{ region }}
            </UBadge>
            <UBadge v-if="regions.length > 3" color="gray" variant="subtle" size="xs">
              +{{ regions.length - 3 }}
            </UBadge>
          </div>
        </div>
      </div>

      <!-- View Details Link -->
      <div class="pt-3 border-t border-gray-700">
        <button
          class="text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
          @click="$emit('view-resources')"
        >
          <span>View all resources</span>
          <UIcon name="i-heroicons-arrow-right" class="w-3 h-3" />
        </button>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface ServiceCount {
  name: string
  count: number
}

interface Props {
  resourceCounts?: Record<string, any> | null
  loading?: boolean
  error?: string | null
}

const props = withDefaults(defineProps<Props>(), {
  resourceCounts: null,
  loading: false,
  error: null
})

defineEmits<{
  'view-resources': []
}>()

// Helper function to extract count from resource data
function getResourceCount(value: any): number {
  if (typeof value === 'number') return value
  if (typeof value === 'object' && value !== null) {
    // If it's an object, try to get the 'total' property
    return value.total || 0
  }
  return 0
}

// Compute total resources
const totalResources = computed(() => {
  if (!props.resourceCounts) return 0
  return Object.values(props.resourceCounts).reduce((sum, value) => {
    return sum + getResourceCount(value)
  }, 0)
})

// Compute service count
const serviceCount = computed(() => {
  if (!props.resourceCounts) return 0
  return Object.keys(props.resourceCounts).length
})

// Get top 5 services by resource count
const topServices = computed<ServiceCount[]>(() => {
  if (!props.resourceCounts) return []
  
  return Object.entries(props.resourceCounts)
    .map(([name, value]) => ({ name, count: getResourceCount(value) }))
    .filter(item => item.count > 0) // Only show services with resources
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
})

// Extract regions from resource types (if available)
const regions = computed<string[]>(() => {
  if (!props.resourceCounts) return []
  
  const regionSet = new Set<string>()
  
  // Try to extract regions from resource keys that might contain region info
  Object.keys(props.resourceCounts).forEach(key => {
    // Simple heuristic: look for common region patterns
    const regionMatch = key.match(/(?:us-east-1|us-west-2|us-gov-west-1|us-gov-east-1)/)
    if (regionMatch) {
      regionSet.add(regionMatch[0])
    }
  })
  
  return Array.from(regionSet)
})

// Format service names for display
function formatServiceName(serviceName: string): string {
  // Remove AWS:: prefix and convert to readable format
  return serviceName
    .replace('AWS::', '')
    .replace('::', ' ')
    .replace(/([A-Z])/g, ' $1')
    .trim()
}

// Get icon for service type
function getServiceIcon(serviceName: string): string {
  const name = serviceName.toLowerCase()
  
  if (name.includes('ec2') || name.includes('instance')) return 'i-heroicons-server'
  if (name.includes('s3') || name.includes('bucket')) return 'i-heroicons-circle-stack'
  if (name.includes('rds') || name.includes('database')) return 'i-heroicons-database'
  if (name.includes('lambda') || name.includes('function')) return 'i-heroicons-bolt'
  if (name.includes('vpc') || name.includes('network')) return 'i-heroicons-globe-alt'
  if (name.includes('iam') || name.includes('role') || name.includes('user')) return 'i-heroicons-shield-check'
  if (name.includes('cloudwatch') || name.includes('alarm')) return 'i-heroicons-chart-bar'
  if (name.includes('volume') || name.includes('ebs')) return 'i-heroicons-cube'
  if (name.includes('securitygroup')) return 'i-heroicons-lock-closed'
  if (name.includes('loadbalancer') || name.includes('elb')) return 'i-heroicons-arrows-right-left'
  
  return 'i-heroicons-cube-transparent'
}

// Get color class for service type
function getServiceColor(serviceName: string): string {
  const name = serviceName.toLowerCase()
  
  if (name.includes('ec2') || name.includes('instance')) return 'text-orange-400'
  if (name.includes('s3') || name.includes('bucket')) return 'text-green-400'
  if (name.includes('rds') || name.includes('database')) return 'text-blue-400'
  if (name.includes('lambda') || name.includes('function')) return 'text-yellow-400'
  if (name.includes('vpc') || name.includes('network')) return 'text-purple-400'
  if (name.includes('iam') || name.includes('role') || name.includes('user')) return 'text-red-400'
  if (name.includes('cloudwatch') || name.includes('alarm')) return 'text-cyan-400'
  if (name.includes('volume') || name.includes('ebs')) return 'text-indigo-400'
  if (name.includes('securitygroup')) return 'text-pink-400'
  if (name.includes('loadbalancer') || name.includes('elb')) return 'text-teal-400'
  
  return 'text-gray-400'
}
</script>

