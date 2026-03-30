<template>
  <ClientOnly>
    <UserEnclaves :loading="loading" :display-style="displayStyle" />
  </ClientOnly>
</template>

<script setup lang="ts">
defineProps<{
  loading: boolean
  userAccountCount: number
  displayStyle?: 'full' | 'two-thirds' | 'half' | 'third'
}>()
</script>
