<template>
  <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
    <div class="overflow-x-auto">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th 
              scope="col" 
              class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
              @click="toggleSort('eventTime')"
            >
              <div class="flex items-center space-x-1">
                <span>Time</span>
                <Icon 
                  :name="getSortIcon('eventTime')" 
                  class="w-4 h-4" 
                />
              </div>
            </th>
            <th 
              scope="col" 
              class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
              @click="toggleSort('eventName')"
            >
              <div class="flex items-center space-x-1">
                <span>Event</span>
                <Icon 
                  :name="getSortIcon('eventName')" 
                  class="w-4 h-4" 
                />
              </div>
            </th>
            <th 
              scope="col" 
              class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
              @click="toggleSort('eventSource')"
            >
              <div class="flex items-center space-x-1">
                <span>Service</span>
                <Icon 
                  :name="getSortIcon('eventSource')" 
                  class="w-4 h-4" 
                />
              </div>
            </th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Account
            </th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Region
            </th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Source IP
            </th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th scope="col" class="relative px-6 py-3">
              <span class="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          <tr 
            v-for="event in sortedEvents" 
            :key="event.eventId"
            class="hover:bg-gray-50 transition-colors duration-150 ease-in-out"
          >
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
              <div>
                <div class="font-medium">{{ formatTime(event.eventTime) }}</div>
                <div class="text-gray-500">{{ formatDate(event.eventTime) }}</div>
              </div>
            </td>
            <td class="px-6 py-4 text-sm text-gray-900">
              <div class="max-w-xs">
                <div class="font-medium truncate">{{ event.eventName }}</div>
                <div class="text-gray-500 text-xs truncate" v-if="event.userIdentity?.type">
                  {{ event.userIdentity.type }}
                </div>
              </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
              <div class="flex items-center space-x-2">
                <ServiceIcon :service="getServiceName(event.eventSource)" />
                <span>{{ getServiceDisplayName(event.eventSource) }}</span>
              </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
              <div class="font-mono text-xs">{{ event.accountId }}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
              <RegionBadge :region="event.awsRegion" />
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
              <div class="font-mono text-xs">{{ event.sourceIPAddress }}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
              <EventStatusBadge 
                :error-code="event.errorCode" 
                :error-message="event.errorMessage" 
              />
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
              <UButton
                variant="ghost"
                size="sm"
                icon="heroicons:eye"
                @click="$emit('viewDetails', event)"
              >
                Details
              </UButton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Empty state -->
    <div v-if="!events.length && !loading" class="text-center py-12">
      <Icon name="heroicons:document-magnifying-glass" class="w-12 h-12 text-gray-400 mx-auto mb-4" />
      <h3 class="text-lg font-medium text-gray-900 mb-2">No events found</h3>
      <p class="text-gray-600">No CloudTrail events match the current filters.</p>
    </div>

    <!-- Loading state -->
    <div v-if="loading" class="p-8">
      <div class="space-y-4">
        <USkeleton v-for="i in 5" :key="i" class="h-12 w-full" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

interface AccessEvent {
  eventId: string
  eventTime: string
  eventName: string
  eventSource: string
  awsRegion: string
  sourceIPAddress: string
  accountId: string
  errorCode?: string
  errorMessage?: string
  userIdentity: {
    type: string
    principalId: string
    arn: string
    accountId: string
    userName?: string
  }
}

interface Props {
  events: AccessEvent[]
  loading: boolean
}

defineProps<Props>()
defineEmits<{
  viewDetails: [event: AccessEvent]
}>()

// Sorting state
const sortField = ref<keyof AccessEvent>('eventTime')
const sortDirection = ref<'asc' | 'desc'>('desc')

// Toggle sorting
const toggleSort = (field: keyof AccessEvent) => {
  if (sortField.value === field) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortField.value = field
    sortDirection.value = 'desc'
  }
}

// Get sort icon
const getSortIcon = (field: keyof AccessEvent) => {
  if (sortField.value !== field) return 'heroicons:chevron-up-down'
  return sortDirection.value === 'asc' ? 'heroicons:chevron-up' : 'heroicons:chevron-down'
}

// Sorted events
const sortedEvents = computed(() => {
  const events = [...props.events]
  
  return events.sort((a, b) => {
    const aValue = a[sortField.value]
    const bValue = b[sortField.value]
    
    let comparison = 0
    
    if (aValue < bValue) {
      comparison = -1
    } else if (aValue > bValue) {
      comparison = 1
    }
    
    return sortDirection.value === 'asc' ? comparison : -comparison
  })
})

// Utility functions
const formatTime = (dateString: string) => {
  return new Date(dateString).toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit',
    second: '2-digit'
  })
}

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

const getServiceName = (eventSource: string) => {
  return eventSource.replace('.amazonaws.com', '').toLowerCase()
}

const getServiceDisplayName = (eventSource: string) => {
  const service = eventSource.replace('.amazonaws.com', '')
  
  // Common service name mappings
  const serviceNames = {
    'ec2': 'EC2',
    's3': 'S3',
    'iam': 'IAM',
    'lambda': 'Lambda',
    'cloudformation': 'CloudFormation',
    'cloudtrail': 'CloudTrail',
    'cloudwatch': 'CloudWatch',
    'rds': 'RDS',
    'sts': 'STS',
    'organizations': 'Organizations',
    'kms': 'KMS',
    'route53': 'Route 53',
    'elasticloadbalancing': 'ELB',
    'autoscaling': 'Auto Scaling',
    'vpc': 'VPC'
  }
  
  return serviceNames[service.toLowerCase()] || service.charAt(0).toUpperCase() + service.slice(1)
}
</script> 