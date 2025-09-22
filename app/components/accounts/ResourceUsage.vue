<template>
  <UCard>
    <template #header>
      <div class="text-lg font-semibold">Resource Usage</div>
    </template>

    <div :class="`grid gap-4 grid-cols-${props.columns}`">
      <!-- EC2 Instances -->
      <div class="bg-gray-800/50 rounded-xl p-4 space-y-2">
        <div class="flex gap-1 items-center">
          <UIcon name="i-heroicons-server" class="text-purple-400" />
          <div class="text-sm text-gray-400">EC2 Instances</div>
        </div>
        <div class="text-2xl font-bold text-white">42</div>
        <div class="space-y-1 text-xs text-gray-400">
          <div>Stopped: 10</div>
          <div>Windows: 8</div>
        </div>
      </div>

      <!-- EBS Volumes -->
      <div class="bg-gray-800/50 rounded-xl p-4 space-y-2">
        <div class="flex gap-1 items-center">
          <UIcon name="i-heroicons-circle-stack" class="text-blue-400" />
          <div class="text-sm text-gray-400">EBS Volumes</div>
        </div>
        <div class="text-2xl font-bold text-white">128</div>
        <div class="space-y-1 text-xs text-gray-400">
          <div>Total Size: 20,000 GB</div>
          <div>GP3: 60 | GP2: 50</div>
          <div>IO1: 18</div>
        </div>
      </div>

      <!-- Container Clusters -->
      <div class="bg-gray-800/50 rounded-xl p-4 space-y-2">
        <div class="flex gap-1 items-center">
          <UIcon name="i-heroicons-cube" class="text-green-400" />
          <div class="text-sm text-gray-400">Container Clusters</div>
        </div>
        <div class="text-2xl font-bold text-white">7</div>
        <div class="space-y-1 text-xs text-gray-400">
          <div>ECS: 5</div>
          <div>EKS: 2</div>
        </div>
      </div>

      <!-- S3 Buckets -->
      <div class="bg-gray-800/50 rounded-xl p-4 space-y-2">
        <div class="flex gap-1 items-center">
          <UIcon name="i-heroicons-circle-stack" class="text-yellow-400" />
          <div class="text-sm text-gray-400">S3 Buckets</div>
        </div>
        <div class="text-2xl font-bold text-white">55</div>
        <div class="space-y-1 text-xs text-gray-400">
          <div>Versioned: 22</div>
        </div>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
interface Props {
  columns?: number;
}
const props = withDefaults(defineProps<Props>(), {
  columns: 4
})

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

</script>
