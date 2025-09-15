<template>
  <div class="space-y-6">
    <!-- Event Overview -->
    <div class="bg-gray-50 rounded-lg p-4">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h4 class="text-sm font-medium text-gray-500 mb-1">Event Name</h4>
          <p class="text-lg font-semibold text-gray-900">{{ event.eventName }}</p>
        </div>
        <div>
          <h4 class="text-sm font-medium text-gray-500 mb-1">Event Time</h4>
          <p class="text-lg font-semibold text-gray-900">{{ formatDateTime(event.eventTime) }}</p>
        </div>
        <div>
          <h4 class="text-sm font-medium text-gray-500 mb-1">Service</h4>
          <div class="flex items-center space-x-2">
            <ServiceIcon :service="getServiceName(event.eventSource)" />
            <span class="text-lg font-semibold text-gray-900">{{ getServiceDisplayName(event.eventSource) }}</span>
          </div>
        </div>
        <div>
          <h4 class="text-sm font-medium text-gray-500 mb-1">Status</h4>
          <EventStatusBadge 
            :error-code="event.errorCode" 
            :error-message="event.errorMessage" 
          />
        </div>
      </div>
    </div>

    <!-- Error Information (if applicable) -->
    <div v-if="event.errorCode" class="bg-red-50 border border-red-200 rounded-lg p-4">
      <h4 class="text-sm font-medium text-red-800 mb-2">Error Details</h4>
      <div class="space-y-2">
        <div>
          <span class="text-sm font-medium text-red-700">Error Code:</span>
          <span class="ml-2 text-sm text-red-600 font-mono">{{ event.errorCode }}</span>
        </div>
        <div v-if="event.errorMessage">
          <span class="text-sm font-medium text-red-700">Error Message:</span>
          <p class="mt-1 text-sm text-red-600">{{ event.errorMessage }}</p>
        </div>
      </div>
    </div>

    <!-- Event Details Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- Basic Information -->
      <div class="bg-white border border-gray-200 rounded-lg p-4">
        <h4 class="text-lg font-semibold text-gray-900 mb-4">Basic Information</h4>
        <dl class="space-y-3">
          <div>
            <dt class="text-sm font-medium text-gray-500">Event ID</dt>
            <dd class="text-sm text-gray-900 font-mono">{{ event.eventId }}</dd>
          </div>
          <div>
            <dt class="text-sm font-medium text-gray-500">AWS Region</dt>
            <dd class="text-sm text-gray-900">
              <RegionBadge :region="event.awsRegion" />
            </dd>
          </div>
          <div>
            <dt class="text-sm font-medium text-gray-500">Account ID</dt>
            <dd class="text-sm text-gray-900 font-mono">{{ event.accountId }}</dd>
          </div>
          <div>
            <dt class="text-sm font-medium text-gray-500">Source IP Address</dt>
            <dd class="text-sm text-gray-900 font-mono">{{ event.sourceIPAddress }}</dd>
          </div>
          <div v-if="event.userAgent">
            <dt class="text-sm font-medium text-gray-500">User Agent</dt>
            <dd class="text-sm text-gray-900 break-all">{{ event.userAgent }}</dd>
          </div>
        </dl>
      </div>

      <!-- User Identity -->
      <div class="bg-white border border-gray-200 rounded-lg p-4">
        <h4 class="text-lg font-semibold text-gray-900 mb-4">User Identity</h4>
        <dl class="space-y-3">
          <div>
            <dt class="text-sm font-medium text-gray-500">Type</dt>
            <dd class="text-sm text-gray-900">{{ event.userIdentity.type }}</dd>
          </div>
          <div v-if="event.userIdentity.userName">
            <dt class="text-sm font-medium text-gray-500">User Name</dt>
            <dd class="text-sm text-gray-900">{{ event.userIdentity.userName }}</dd>
          </div>
          <div>
            <dt class="text-sm font-medium text-gray-500">Principal ID</dt>
            <dd class="text-sm text-gray-900 font-mono break-all">{{ event.userIdentity.principalId }}</dd>
          </div>
          <div v-if="event.userIdentity.arn">
            <dt class="text-sm font-medium text-gray-500">ARN</dt>
            <dd class="text-sm text-gray-900 font-mono break-all">{{ event.userIdentity.arn }}</dd>
          </div>
          <div>
            <dt class="text-sm font-medium text-gray-500">Account ID</dt>
            <dd class="text-sm text-gray-900 font-mono">{{ event.userIdentity.accountId }}</dd>
          </div>
        </dl>
      </div>
    </div>

    <!-- Resources (if available) -->
    <div v-if="event.resources && event.resources.length > 0" class="bg-white border border-gray-200 rounded-lg p-4">
      <h4 class="text-lg font-semibold text-gray-900 mb-4">Resources</h4>
      <div class="space-y-3">
        <div 
          v-for="(resource, index) in event.resources" 
          :key="index"
          class="bg-gray-50 rounded p-3"
        >
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div v-if="resource.resourceType">
              <span class="text-sm font-medium text-gray-500">Type:</span>
              <span class="ml-2 text-sm text-gray-900">{{ resource.resourceType }}</span>
            </div>
            <div v-if="resource.resourceName">
              <span class="text-sm font-medium text-gray-500">Name:</span>
              <span class="ml-2 text-sm text-gray-900 font-mono break-all">{{ resource.resourceName }}</span>
            </div>
            <div v-if="resource.ARN" class="md:col-span-2">
              <span class="text-sm font-medium text-gray-500">ARN:</span>
              <p class="mt-1 text-sm text-gray-900 font-mono break-all">{{ resource.ARN }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Request Parameters -->
    <div v-if="event.requestParameters" class="bg-white border border-gray-200 rounded-lg p-4">
      <h4 class="text-lg font-semibold text-gray-900 mb-4">Request Parameters</h4>
      <JsonViewer :data="event.requestParameters" />
    </div>

    <!-- Response Elements -->
    <div v-if="event.responseElements" class="bg-white border border-gray-200 rounded-lg p-4">
      <h4 class="text-lg font-semibold text-gray-900 mb-4">Response Elements</h4>
      <JsonViewer :data="event.responseElements" />
    </div>

    <!-- Raw Event Data -->
    <div class="bg-white border border-gray-200 rounded-lg p-4">
      <div class="flex justify-between items-center mb-4">
        <h4 class="text-lg font-semibold text-gray-900">Raw Event Data</h4>
        <UButton
          variant="outline"
          size="sm"
          icon="heroicons:clipboard-document"
          @click="copyEventData"
        >
          Copy JSON
        </UButton>
      </div>
      <JsonViewer :data="event" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useClipboard } from '@vueuse/core'

interface AccessEvent {
  eventId: string
  eventTime: string
  eventName: string
  eventSource: string
  awsRegion: string
  sourceIPAddress: string
  userAgent: string
  accountId: string
  errorCode?: string
  errorMessage?: string
  resources?: any[]
  requestParameters?: any
  responseElements?: any
  userIdentity: {
    type: string
    principalId: string
    arn: string
    accountId: string
    userName?: string
  }
}

interface Props {
  event: AccessEvent
}

const props = defineProps<Props>()

// Clipboard functionality
const { copy, isSupported } = useClipboard()
const toast = useToast()

const copyEventData = async () => {
  if (!isSupported) {
    toast.add({
      title: 'Copy not supported',
      description: 'Clipboard copy is not supported in this browser',
      color: 'red'
    })
    return
  }

  try {
    await copy(JSON.stringify(props.event, null, 2))
    toast.add({
      title: 'Copied to clipboard',
      description: 'Event data has been copied to your clipboard',
      color: 'green'
    })
  } catch (error) {
    toast.add({
      title: 'Copy failed',
      description: 'Failed to copy event data to clipboard',
      color: 'red'
    })
  }
}

// Utility functions
const formatDateTime = (dateString: string) => {
  return new Date(dateString).toLocaleString()
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