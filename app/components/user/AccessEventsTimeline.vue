<template>
  <div class="bg-white rounded-lg border border-gray-200 p-6">
    <div v-if="groupedEvents.length === 0 && !loading" class="text-center py-12">
      <Icon name="i-heroicons-clock" class="w-12 h-12 text-gray-400 mx-auto mb-4" />
      <h3 class="text-lg font-medium text-gray-900 mb-2">No timeline data</h3>
      <p class="text-gray-600">No events found to display in timeline view.</p>
    </div>

    <div v-else class="space-y-8">
      <div 
        v-for="group in groupedEvents" 
        :key="group.date"
        class="relative"
      >
        <!-- Date Header -->
        <div class="sticky top-0 bg-white z-10 pb-4">
          <h3 class="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2">
            {{ formatGroupDate(group.date) }}
          </h3>
        </div>

        <!-- Timeline -->
        <div class="relative">
          <!-- Timeline line -->
          <div class="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200"></div>
          
          <!-- Events -->
          <div class="space-y-6">
            <div 
              v-for="event in group.events" 
              :key="event.eventId"
              class="relative flex items-start space-x-4"
            >
              <!-- Timeline dot -->
              <div class="relative flex-shrink-0">
                <div 
                  class="w-3 h-3 rounded-full border-2 border-white"
                  :class="getEventDotColor(event)"
                ></div>
              </div>

              <!-- Event content -->
              <div class="flex-1 min-w-0 bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition-colors duration-150">
                <div class="flex items-start justify-between">
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center space-x-2 mb-2">
                      <ServiceIcon :service="getServiceName(event.eventSource)" />
                      <h4 class="text-sm font-semibold text-gray-900 truncate">
                        {{ event.eventName }}
                      </h4>
                      <EventStatusBadge 
                        :error-code="event.errorCode" 
                        :error-message="event.errorMessage" 
                      />
                    </div>

                    <div class="text-sm text-gray-600 space-y-1">
                      <div class="flex items-center space-x-4">
                        <span class="font-medium">{{ formatTime(event.eventTime) }}</span>
                        <span>{{ getServiceDisplayName(event.eventSource) }}</span>
                        <RegionBadge :region="event.awsRegion" />
                      </div>
                      
                      <div class="flex items-center space-x-4 text-xs">
                        <span>Account: {{ event.accountId }}</span>
                        <span>IP: {{ event.sourceIPAddress }}</span>
                        <span v-if="event.userIdentity?.type">
                          Identity: {{ event.userIdentity.type }}
                        </span>
                      </div>

                      <div v-if="event.errorMessage" class="text-red-600 text-xs mt-2">
                        {{ event.errorMessage }}
                      </div>
                    </div>
                  </div>

                  <div class="flex-shrink-0 ml-4">
                    <UButton
                      variant="ghost"
                      size="sm"
                      icon="i-heroicons-eye"
                      @click="$emit('viewDetails', event)"
                    >
                      Details
                    </UButton>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="loading" class="space-y-6">
      <div v-for="i in 3" :key="i" class="relative">
        <USkeleton class="h-6 w-32 mb-4" />
        <div class="space-y-4">
          <div v-for="j in 2" :key="j" class="flex items-start space-x-4">
            <USkeleton class="w-3 h-3 rounded-full flex-shrink-0" />
            <USkeleton class="h-20 flex-1 rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

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

// Group events by date
const groupedEvents = computed(() => {
  const groups = new Map<string, AccessEvent[]>()
  
  props.events.forEach(event => {
    const date = new Date(event.eventTime).toDateString()
    if (!groups.has(date)) {
      groups.set(date, [])
    }
    groups.get(date)!.push(event)
  })
  
  // Convert to array and sort by date (newest first)
  return Array.from(groups.entries())
    .map(([date, events]) => ({
      date,
      events: events.sort((a, b) => new Date(b.eventTime).getTime() - new Date(a.eventTime).getTime())
    }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
})

// Utility functions
const formatGroupDate = (dateString: string) => {
  const date = new Date(dateString)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  
  if (date.toDateString() === today.toDateString()) {
    return 'Today'
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday'
  } else {
    return date.toLocaleDateString([], {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }
}

const formatTime = (dateString: string) => {
  return new Date(dateString).toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit',
    second: '2-digit'
  })
}

const getEventDotColor = (event: AccessEvent) => {
  if (event.errorCode) {
    return 'bg-red-500'
  }
  
  // Different colors for different event types
  if (event.eventName.includes('ConsoleLogin')) {
    return 'bg-blue-500'
  } else if (event.eventName.includes('AssumeRole')) {
    return 'bg-purple-500'
  } else if (event.eventSource.includes('s3')) {
    return 'bg-green-500'
  } else if (event.eventSource.includes('ec2')) {
    return 'bg-orange-500'
  }
  
  return 'bg-gray-500'
}

const getServiceName = (eventSource: string) => {
  return eventSource.replace('.amazonaws.com', '').toLowerCase()
}

const getServiceDisplayName = (eventSource: string) => {
  const service = eventSource.replace('.amazonaws.com', '')
  
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