<template>
  <AccountInsights
    :top-accounts="topAccounts"
    :loading="loading"
    @toggle-proforma="$emit('toggleProforma', $event)"
  />
</template>

<script setup lang="ts">
defineProps<{
  topAccounts: { accountId: string; cost: number; name: string; percentOfTotal: number }[]
  loading: boolean
}>()

defineEmits<{
  'toggleProforma': [value: boolean]
}>()
</script>
