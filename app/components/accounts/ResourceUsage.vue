<template>
  <UCard>
    <template #header>
      <div class="text-lg font-semibold">Resource Usage</div>
    </template>

    <CenteredLoadingSpinner v-if="props.loading" />
    <div v-else :class="`grid gap-4 grid-cols-${props.columns}`">
      <!-- EC2 Instances -->
      <div v-if="props.data.ec2" class="bg-gray-800/50 rounded-xl p-4 space-y-2">
        <div class="flex gap-1 items-center">
          <UIcon name="i-heroicons-server" class="text-purple-400" />
          <div class="text-sm text-gray-400">EC2 Instances</div>
        </div>
        <div class="text-2xl font-bold text-white">{{ props.data.ec2.total }}</div>
        <div class="space-y-1 text-xs text-gray-400">
          <div>Stopped: {{ props.data.ec2.stopped }}</div>
          <div>Windows: {{ props.data.ec2.windows }}</div>
          <div v-if="props.data.ec2.gdmsManaged !== undefined">
            GDMS Managed: {{ props.data.ec2.gdmsManaged }}
          </div>
        </div>
      </div>

      <!-- EBS Volumes -->
      <div v-if="props.data.volumes" class="bg-gray-800/50 rounded-xl p-4 space-y-2">
        <div class="flex gap-1 items-center">
          <UIcon name="i-heroicons-circle-stack" class="text-blue-400" />
          <div class="text-sm text-gray-400">EBS Volumes</div>
        </div>
        <div class="text-2xl font-bold text-white">{{ props.data.volumes.total }}</div>
        <div class="space-y-1 text-xs text-gray-400">
          <div>
            GP3: {{ props.data.volumes.gp3 || 0 }}
            | GP2: {{ props.data.volumes.gp2 || 0 }}
          </div>
          <div>IO1: {{ props.data.volumes.io1 || 0 }}</div>
        </div>
      </div>

      <!-- Container Clusters -->
      <div v-if="props.data.ecsContainers || props.data.eksClusters" class="bg-gray-800/50 rounded-xl p-4 space-y-2">
        <div class="flex gap-1 items-center">
          <UIcon name="i-heroicons-cube" class="text-green-400" />
          <div class="text-sm text-gray-400">Container Clusters</div>
        </div>
        <div class="text-2xl font-bold text-white">
          {{ (props.data.ecsContainers?.total || 0) + (props.data.eksClusters?.total || 0) }}
        </div>
        <div class="space-y-1 text-xs text-gray-400">
          <div>ECS: {{ props.data.ecsContainers?.total }}</div>
          <div>EKS: {{ props.data.eksClusters?.total }}</div>
        </div>
      </div>

      <!-- S3 Buckets -->
      <div v-if="props.data.buckets" class="bg-gray-800/50 rounded-xl p-4 space-y-2">
        <div class="flex gap-1 items-center">
          <UIcon name="i-heroicons-archive-box" class="text-yellow-400" />
          <div class="text-sm text-gray-400">S3 Buckets</div>
        </div>
        <div class="text-2xl font-bold text-white">{{ props.data.buckets.total }}</div>
        <div class="space-y-1 text-xs text-gray-400">
          <div>Versioned: {{ props.data.buckets.versioned }}</div>
        </div>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
interface Props {
  columns?: number;
  data: ResourceCounts & {
    ec2?: {
      total: number;
      stopped?: number;
      windows?: number;
      gdmsManaged?: number;
      notManaged?: number;
      totalDiskGB?: number;
      monthlyPricing?: number;
    };
  };
  loading: boolean;
}
const props = withDefaults(defineProps<Props>(), {
  columns: 4
});

</script>
