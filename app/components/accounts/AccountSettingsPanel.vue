<template>
  <div class="space-y-6">
    <!-- Cost Tag Configuration -->
    <TagConfigManager
      :account-id="accountId"
      mode="inline"
    />

    <!-- Future settings sections can be added here -->
  </div>
</template>

<script setup lang="ts">
defineProps<{
  accountId: string
}>()
</script>
