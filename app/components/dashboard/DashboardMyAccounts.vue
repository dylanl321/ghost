<template>
  <ClientOnly>
    <UserEnclaves :loading="loading" :display-style="displayStyle" />
  </ClientOnly>
</template>

<script setup lang="ts">
defineProps<{
  loading: boolean
  userAccountCount: number
  displayStyle?: 'full' | 'half' | 'compact'
}>()
</script>
