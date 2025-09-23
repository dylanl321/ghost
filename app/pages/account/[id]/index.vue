<template>
  <div class="space-y-6 p-6">
    <!-- Account Header -->
    <UCard>
      <div class="flex gap-2 items-center">
        <div :class="`w-3 h-3 rounded-full ${accountStatus !== 'Decommissioned' ? 'bg-green-500' : 'bg-red-500'}`" />
        <h1 class="font-semibold text-2xl">{{ accountName ?? "Loading..." }}</h1>
      </div>
    </UCard>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 row-auto">
      <!-- Account Details -->
      <AccountDetails v-if="accountId" :account-id="accountId" class="col-span-2" />

      <!-- Account Users -->
      <AccountUsers
        :users="users"
        :account-id="accountId"
        :loading="loading"
        class="col-span-1"
      />

      <CostTrendChart
        title="Account Cost Trends"
        :time-series="[]"
        :loading="true"
        class="col-span-2"
      />
      <ResourceUsage :columns="2" class="col-span-1" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { GraphUser } from '~/composables/useGroupMembers'

const route = useRoute()
const enclaveStore = useEnclaveStore()
const groupMembers = useGroupMembers()
const { user } = useOidcAuth()

const accountId = computed(() => route.params.id as string)
const govCloudId = computed(() => enclaveStore.enclaves[accountId.value]?.awsGovCloudAccountID)
const accountName = computed(() => enclaveStore.enclaves[accountId.value]?.projectName)
const accountStatus = computed(() => enclaveStore.enclaves[accountId.value]?.enclaveStatus)

const users = ref<GraphUser[]>([])
const loading = ref(true)

onMounted(async () => {
  try {
    if (accountId.value) {
      users.value = await groupMembers.fetchEnclaveUsers(accountId.value, govCloudId.value || '', user.value?.accessToken || '')
    }
  } catch (err) {
    console.error('Error fetching users:', err)
  } finally {
    loading.value = false
  }
})
</script>
