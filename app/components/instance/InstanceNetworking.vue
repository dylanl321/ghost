<template>
  <div class="space-y-4 mt-4">
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <!-- Primary Network -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-globe-alt" class="w-4 h-4 text-gray-400" />
            <span class="font-semibold text-sm">Primary Network</span>
          </div>
        </template>
        <div class="space-y-3 text-sm">
          <div class="flex justify-between items-center">
            <span class="text-gray-500 dark:text-gray-400">Private IP</span>
            <div class="flex items-center gap-1.5">
              <span class="font-mono text-gray-900 dark:text-white">{{ networkInfo?.privateIpAddress || 'N/A' }}</span>
              <UButton v-if="networkInfo?.privateIpAddress" icon="i-heroicons-clipboard-document" size="2xs" color="gray" variant="ghost" @click="copy(networkInfo.privateIpAddress)" />
            </div>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-gray-500 dark:text-gray-400">Public IP</span>
            <div class="flex items-center gap-1.5">
              <span class="font-mono text-gray-900 dark:text-white">{{ networkInfo?.publicIpAddress || 'None' }}</span>
              <UButton v-if="networkInfo?.publicIpAddress" icon="i-heroicons-clipboard-document" size="2xs" color="gray" variant="ghost" @click="copy(networkInfo.publicIpAddress)" />
            </div>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500 dark:text-gray-400">VPC</span>
            <span class="font-mono text-xs text-gray-900 dark:text-white">{{ networkInfo?.vpcId || 'N/A' }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500 dark:text-gray-400">Subnet</span>
            <span class="font-mono text-xs text-gray-900 dark:text-white">{{ networkInfo?.subnetId || 'N/A' }}</span>
          </div>
          <div v-if="config?.placement?.availabilityZone" class="flex justify-between">
            <span class="text-gray-500 dark:text-gray-400">Availability Zone</span>
            <span class="text-gray-900 dark:text-white">{{ config.placement.availabilityZone }}</span>
          </div>
        </div>
      </UCard>

      <!-- DNS -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-at-symbol" class="w-4 h-4 text-gray-400" />
            <span class="font-semibold text-sm">DNS</span>
          </div>
        </template>
        <div class="space-y-3 text-sm">
          <div>
            <div class="text-gray-500 dark:text-gray-400 mb-1">Private DNS</div>
            <div class="font-mono text-xs text-gray-900 dark:text-white break-all">{{ config?.privateDnsName || 'N/A' }}</div>
          </div>
          <div>
            <div class="text-gray-500 dark:text-gray-400 mb-1">Public DNS</div>
            <div class="font-mono text-xs text-gray-900 dark:text-white break-all">{{ config?.publicDnsName || 'None' }}</div>
          </div>
        </div>
      </UCard>
    </div>

    <!-- Security Groups -->
    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-shield-check" class="w-4 h-4 text-gray-400" />
          <span class="font-semibold text-sm">Security Groups</span>
          <UBadge color="gray" variant="soft" size="xs">{{ securityGroups.length }}</UBadge>
        </div>
      </template>
      <div v-if="securityGroups.length > 0" class="space-y-2">
        <div v-for="sg in securityGroups" :key="sg.groupId" class="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
          <div>
            <div class="font-medium text-sm text-gray-900 dark:text-white">{{ sg.groupName }}</div>
            <div class="font-mono text-xs text-gray-500">{{ sg.groupId }}</div>
          </div>
        </div>
      </div>
      <div v-else class="text-sm text-gray-400 text-center py-4">No security groups found</div>
    </UCard>

    <!-- Network Interfaces -->
    <UCard v-if="networkInterfaces.length > 0">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-server-stack" class="w-4 h-4 text-gray-400" />
          <span class="font-semibold text-sm">Network Interfaces</span>
          <UBadge color="gray" variant="soft" size="xs">{{ networkInterfaces.length }}</UBadge>
        </div>
      </template>
      <div class="space-y-3">
        <div v-for="eni in networkInterfaces" :key="eni.networkInterfaceId" class="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 space-y-1.5 text-sm">
          <div class="flex justify-between">
            <span class="text-gray-500 dark:text-gray-400">Interface ID</span>
            <span class="font-mono text-xs text-gray-900 dark:text-white">{{ eni.networkInterfaceId }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500 dark:text-gray-400">Private IP</span>
            <span class="font-mono text-gray-900 dark:text-white">{{ eni.privateIpAddress || 'N/A' }}</span>
          </div>
          <div v-if="eni.macAddress" class="flex justify-between">
            <span class="text-gray-500 dark:text-gray-400">MAC</span>
            <span class="font-mono text-xs text-gray-900 dark:text-white">{{ eni.macAddress }}</span>
          </div>
          <div v-if="eni.attachment?.deviceIndex !== undefined" class="flex justify-between">
            <span class="text-gray-500 dark:text-gray-400">Device Index</span>
            <span class="text-gray-900 dark:text-white">{{ eni.attachment.deviceIndex }}</span>
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  instance: any
}>()

const config = computed(() => props.instance?.configuration)
const networkInfo = computed(() => props.instance?.networkInfo)
const securityGroups = computed(() => config.value?.securityGroups || [])
const networkInterfaces = computed(() => config.value?.networkInterfaces || [])

function copy(text: string) {
  navigator.clipboard.writeText(text)
}
</script>
