<template>
  <div class="space-y-6">
    <!-- Cost Tag Configuration -->
    <TagConfigManager
      :account-id="accountId"
      :environment="environment"
      mode="inline"
    />

    <!-- Future settings sections can be added here -->
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  accountId: string
  environment?: string
}>()

const environment = computed(() => props.environment)
</script>
