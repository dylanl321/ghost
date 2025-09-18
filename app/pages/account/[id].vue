<template>
  <div class="space-y-6 p-6">
    <UCard>
      <div class="flex gap-2 items-center">
        <div :class="`w-3 h-3 rounded-full ${accountStatus !== 'Decommissioned' ? 'bg-green-500' : 'bg-red-500'}`" />
        <h1 class="font-semibold text-2xl">{{ accountName ?? "ACCOUNT NAME NOT FOUND" }}</h1>
      </div>
    </UCard>

    <AccountDetails v-if="accountId" :account-id="accountId" />
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const enclaveStore = useEnclaveStore()

const accountId = computed(() => route.params.id as string)
const accountName = computed(() => enclaveStore.enclaves[accountId.value]?.projectName)
const accountStatus = computed(() => enclaveStore.enclaves[accountId.value]?.enclaveStatus)
</script>