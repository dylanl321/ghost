<template>
  <div class="space-y-4">
    <div class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
      Filter Options
    </div>

    <UFormField label="Resource ID"><UInput v-model="filters.resourceId" placeholder="i-..., bucket, ARN..." /></UFormField>
    <UFormField label="Resource Name"><UInput v-model="filters.resourceName" placeholder="Partial resource name" /></UFormField>
    <UFormField label="Tags" help="Comma-separated key=value pairs"><UInput v-model="tagExpression" placeholder="Environment=prod,Owner=platform" /></UFormField>

    <!-- Resource Types -->
    <UFormField label="Resource Types" help="Leave empty to include all types">
      <USelectMenu
        v-model="selectedResourceTypes"
        :items="resourceTypeOptions"
        multiple
       
        placeholder="Select resource types..."
        value-key="value"
      >
        <template #label>
          <span v-if="!selectedResourceTypes || selectedResourceTypes.length === 0">
            All resource types
          </span>
          <span v-else>
            {{ selectedResourceTypes.length }} selected
          </span>
        </template>
      </USelectMenu>
    </UFormField>

    <!-- Compliance Status -->
    <UFormField label="Compliance Status" help="Filter by compliance evaluation">
      <div class="flex flex-wrap gap-2">
        <UBadge
          v-for="status in complianceStatuses"
          :key="status.value"
          :color="isStatusSelected(status.value) ? status.color : 'gray'"
          :variant="isStatusSelected(status.value) ? 'solid' : 'soft'"
          class="cursor-pointer"
          @click="toggleStatus(status.value)"
        >
          {{ status.label }}
        </UBadge>
      </div>
    </UFormField>

    <!-- Compliance Only -->
    <UFormField>
      <div class="flex items-center gap-2">
        <UCheckbox
          v-model="filters.complianceOnly"
          label="Only show resources with compliance rules"
        />
      </div>
    </UFormField>

    <!-- Regions -->
    <UFormField label="Regions" help="Leave empty to include all regions">
      <USelectMenu
        v-model="selectedRegions"
        :items="regionOptions"
        multiple
       
        placeholder="Select regions..."
        value-key="value"
      >
        <template #label>
          <span v-if="!selectedRegions || selectedRegions.length === 0">
            All regions
          </span>
          <span v-else>
            {{ selectedRegions.length }} selected
          </span>
        </template>
      </USelectMenu>
    </UFormField>

    <!-- Quick Filters -->
    <div class="pt-3 border-t border-gray-200 dark:border-gray-700">
      <div class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Quick Filters</div>
      <div class="grid grid-cols-1 gap-2 mb-3">
        <UCheckbox v-model="quickFilters.publicIpOnly" label="Has public IP" />
        <UCheckbox v-model="quickFilters.publicAccessEnabled" label="Public access enabled" />
        <UCheckbox v-model="quickFilters.openToInternet" label="Open to the internet" />
        <UCheckbox v-model="quickFilters.unencryptedOnly" label="Unencrypted" />
        <UCheckbox v-model="quickFilters.noMfaOnly" label="MFA not enabled" />
      </div>
      <div class="flex flex-wrap gap-2">
        <UButton
          size="xs"
          color="neutral"
          variant="soft"
          @click="setComputeResources"
        >
          Compute Resources
        </UButton>
        <UButton
          size="xs"
          color="neutral"
          variant="soft"
          @click="setStorageResources"
        >
          Storage Resources
        </UButton>
        <UButton
          size="xs"
          color="neutral"
          variant="soft"
          @click="setNetworkResources"
        >
          Network Resources
        </UButton>
        <UButton
          size="xs"
          color="neutral"
          variant="soft"
          @click="clearFilters"
        >
          Clear All
        </UButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ConfigDatasetFilters } from '#shared/types/dataset-reports'

const filters = defineModel<ConfigDatasetFilters>({
  default: () => ({
    resourceTypes: [],
    complianceStatus: [],
    regions: []
  })
})

const tagExpression = computed({
  get: () => Object.entries(filters.value.tags || {}).map(([key, value]) => `${key}=${value}`).join(','),
  set: (value: string) => {
    filters.value.tags = Object.fromEntries(value.split(',').map(part => part.trim()).filter(Boolean).map(part => {
      const separator = part.indexOf('=')
      return separator > 0 ? [part.slice(0, separator).trim(), part.slice(separator + 1).trim()] : [part, '']
    }))
  }
})
watch(() => filters.value.quickFilters, value => {
  if (!value) filters.value.quickFilters = {}
}, { immediate: true })
const quickFilters = computed(() => filters.value.quickFilters!)

// Computed wrappers to extract just the values from select menus
const selectedResourceTypes = computed({
  get: () => filters.value.resourceTypes || [],
  set: (val: any[]) => {
    if (!filters.value.resourceTypes) {
      filters.value.resourceTypes = []
    }
    // Extract just the value strings if objects are passed
    filters.value.resourceTypes = val.map(v => typeof v === 'object' ? v.value : v)
  }
})

const selectedRegions = computed({
  get: () => filters.value.regions || [],
  set: (val: any[]) => {
    if (!filters.value.regions) {
      filters.value.regions = []
    }
    // Extract just the value strings if objects are passed
    filters.value.regions = val.map(v => typeof v === 'object' ? v.value : v)
  }
})

// Constants
const complianceStatuses = [
  { value: 'COMPLIANT', label: 'Compliant', color: 'green' },
  { value: 'NON_COMPLIANT', label: 'Non-Compliant', color: 'red' },
  { value: 'NOT_APPLICABLE', label: 'Not Applicable', color: 'gray' },
  { value: 'INSUFFICIENT_DATA', label: 'Insufficient Data', color: 'yellow' }
] as const

const resourceTypeOptions = [
  // Compute
  { value: 'AWS::EC2::Instance', label: 'EC2 Instance' },
  { value: 'AWS::Lambda::Function', label: 'Lambda Function' },
  { value: 'AWS::ECS::Cluster', label: 'ECS Cluster' },
  { value: 'AWS::ECS::Service', label: 'ECS Service' },
  { value: 'AWS::AutoScaling::AutoScalingGroup', label: 'Auto Scaling Group' },

  // Storage
  { value: 'AWS::S3::Bucket', label: 'S3 Bucket' },
  { value: 'AWS::EC2::Volume', label: 'EBS Volume' },
  { value: 'AWS::EFS::FileSystem', label: 'EFS File System' },

  // Database
  { value: 'AWS::RDS::DBInstance', label: 'RDS Instance' },
  { value: 'AWS::DynamoDB::Table', label: 'DynamoDB Table' },

  // Network
  { value: 'AWS::EC2::VPC', label: 'VPC' },
  { value: 'AWS::EC2::Subnet', label: 'Subnet' },
  { value: 'AWS::EC2::SecurityGroup', label: 'Security Group' },
  { value: 'AWS::ElasticLoadBalancingV2::LoadBalancer', label: 'Load Balancer' },

  // Security & IAM
  { value: 'AWS::IAM::Role', label: 'IAM Role' },
  { value: 'AWS::IAM::User', label: 'IAM User' },
  { value: 'AWS::IAM::Policy', label: 'IAM Policy' },
  { value: 'AWS::KMS::Key', label: 'KMS Key' }
]

const regionOptions = [
  // Commercial regions
  { value: 'us-east-1', label: 'US East (N. Virginia)' },
  { value: 'us-east-2', label: 'US East (Ohio)' },
  { value: 'us-west-1', label: 'US West (N. California)' },
  { value: 'us-west-2', label: 'US West (Oregon)' },

  // GovCloud regions
  { value: 'us-gov-east-1', label: 'GovCloud East' },
  { value: 'us-gov-west-1', label: 'GovCloud West' }
]

// Methods
function isStatusSelected(status: string): boolean {
  return filters.value.complianceStatus?.includes(status as any) || false
}

function toggleStatus(status: string) {
  if (!filters.value.complianceStatus) {
    filters.value.complianceStatus = []
  }

  const index = filters.value.complianceStatus.indexOf(status as any)
  if (index > -1) {
    filters.value.complianceStatus.splice(index, 1)
  } else {
    filters.value.complianceStatus.push(status as any)
  }
}

function setComputeResources() {
  filters.value.resourceTypes = [
    'AWS::EC2::Instance',
    'AWS::Lambda::Function',
    'AWS::ECS::Cluster',
    'AWS::ECS::Service'
  ]
}

function setStorageResources() {
  filters.value.resourceTypes = [
    'AWS::S3::Bucket',
    'AWS::EC2::Volume',
    'AWS::EFS::FileSystem'
  ]
}

function setNetworkResources() {
  filters.value.resourceTypes = [
    'AWS::EC2::VPC',
    'AWS::EC2::Subnet',
    'AWS::EC2::SecurityGroup',
    'AWS::ElasticLoadBalancingV2::LoadBalancer'
  ]
}

function clearFilters() {
  filters.value = {
    resourceTypes: [],
    complianceStatus: [],
    regions: []
  }
}
</script>
