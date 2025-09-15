<template>
  <UCard class="bg-gray-900 border border-gray-700">
    <template #header>
      <div class="flex justify-between items-center">
        <div class="flex items-center gap-2">
          <h3 class="text-lg font-semibold">Resource Usage</h3>
          <UTooltip text="Resource counts gathered through AWS Config Aggregator, showing current resource state across accounts">
            <UIcon name="i-heroicons-information-circle" class="h-4 w-4 text-gray-400" />
          </UTooltip>
        </div>
        <UButton 
          color="gray" 
          variant="ghost" 
          icon="i-heroicons-arrow-path" 
          :loading="isLoading"
          @click="fetchResourceCounts"
        />
      </div>
    </template>
    <div class="grid grid-cols-2 gap-4 p-4">
      <div class="bg-gray-800/50 rounded-lg p-4">
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-server" class="text-purple-400" />
          <h4 class="text-sm text-gray-400">EC2 Instances</h4>
        </div>
        <p class="text-2xl font-bold mt-2">{{ resourceCounts.ec2?.total || '--' }}</p>
        <div class="mt-2 text-xs text-gray-400 space-y-1">
          <p>Stopped: {{ resourceCounts.ec2?.stopped || '--' }}</p>
          <p>Windows: {{ resourceCounts.ec2?.windows || '--' }}</p>
        </div>
      </div>
      <div class="bg-gray-800/50 rounded-lg p-4">
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-circle-stack" class="text-blue-400" />
          <h4 class="text-sm text-gray-400">EBS Volumes</h4>
        </div>
        <p class="text-2xl font-bold mt-2">{{ resourceCounts.volumes?.total || '--' }}</p>
        <div class="mt-2 text-xs text-gray-400">
          <p>Total Size: {{ formatStorageSize(resourceCounts.volumes?.totalSizeGB || 0) }}</p>
          <p>GP3: {{ resourceCounts.volumes?.gp3 || '--' }} | GP2: {{ resourceCounts.volumes?.gp2 || '--' }}</p>
          <p>IO1: {{ resourceCounts.volumes?.io1 || '--' }}</p>
        </div>
      </div>
      <div class="bg-gray-800/50 rounded-lg p-4">
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-cube-transparent" class="text-green-400" />
          <h4 class="text-sm text-gray-400">Container Clusters</h4>
        </div>
        <p class="text-2xl font-bold mt-2">{{ (resourceCounts.ecsContainers?.total || 0) + (resourceCounts.eksClusters?.total || 0) || '--' }}</p>
        <div class="mt-2 text-xs text-gray-400 space-y-1">
            <p>ECS: {{ resourceCounts.ecsContainers?.total || '--' }}</p>
            <p>EKS: {{ resourceCounts.eksClusters?.total || '--' }}</p>
        </div>
      </div>
      <div class="bg-gray-800/50 rounded-lg p-4">
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-inbox-stack" class="text-yellow-400" />
          <h4 class="text-sm text-gray-400">S3 Buckets</h4>
        </div>
        <p class="text-2xl font-bold mt-2">{{ resourceCounts.buckets?.total || '--' }}</p>
        <div class="mt-2 text-xs text-gray-400">
          <p>Versioned: {{ resourceCounts.buckets?.versioned || '--' }}</p>
        </div>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { formatStorageSize } from '~/utils/reportFormatters';

// Define interface for resource counts structure
interface ResourceCounts {
  ec2?: {
    total: number;
    stopped?: number;
    windows?: number;
  };
  volumes?: {
    total: number;
    totalSizeGB: number;
    gp2?: number;
    gp3?: number;
    io1?: number;
  };
  ecsContainers?: {
    total: number;
  };
  eksClusters?: {
    total: number;
  };
  buckets?: {
    total: number;
    versioned?: number;
  };
}

const props = defineProps({
  accountId: {
    type: String,
    required: false,
    default: null
  },
  shouldLoad: {
    type: Boolean,
    default: true
  }
});

const isLoading = ref(false);
const resourceCounts = ref<ResourceCounts>({});

const fetchResourceCounts = async () => {
  if (!props.shouldLoad) return;
  
  isLoading.value = true;
  try {
    const url = new URL('/api/aws/config/get-resource-counts', window.location.origin);
    if (props.accountId) {
      url.searchParams.append('accountId', props.accountId);
    }

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    resourceCounts.value = await response.json();
  } catch (error) {
    console.error('Error fetching resource counts:', error);
  } finally {
    isLoading.value = false;
  }
};

// Initial fetch
onMounted(() => {
  if (props.shouldLoad) {
    fetchResourceCounts();
  }
});

// Watch for accountId changes
watch(() => props.accountId, fetchResourceCounts);
</script> 