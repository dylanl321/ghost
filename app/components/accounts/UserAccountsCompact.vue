<template>
  <UCard class="border border-gray-800">
    <template #header>
      <h2 class="text-lg font-semibold">Your AWS Enclaves</h2>
    </template>
    <UTable :columns="tableColumns" :rows="tableData">
      <template #account-data="{ row }">
        <NuxtLink :to="`/account/${row.standardAccountId}`" class="hover:underline text-white font-semibold">{{
          row.accountName }}</NuxtLink>
      </template>
      <template #standardId-data="{ row }">
        <p>{{ row.standardAccountId }}</p>
      </template>
      <template #govcloudId-data="{ row }">
        <p>{{ row.govCloudAccountId }}</p>
      </template>
      <template #details-data="{ row }">
        <UDropdown :items="getAccountActions(row)">
          <UButton color="gray" variant="ghost" icon="i-heroicons-ellipsis-horizontal" size="xs" />
        </UDropdown>
      </template>
    </UTable>
  </UCard>
</template>

<script setup lang="ts">

import type { AwsRoleDetails } from '~/types/accounts';

const awsAccountsStore = useAwsAccountsStore();

const tableColumns = [
  { key: 'account', label: 'Account' },
  { key: 'standardId', label: 'Standard Account ID' },
  { key: 'govcloudId', label: 'GovCloud Account ID' },
  { key: 'details', label: 'Details' },
]

const tableData = computed<AwsRoleDetails[]>(() => {
  const seenAccountNames = new Set<string>();
  return Object.entries(awsAccountsStore.accounts)
    .map(([key, value]) => value)
    .filter(value => value.accountStatus === "ACTIVE")
    .filter(value => {
      if (seenAccountNames.has(value.accountName)) {
        return false; // Skip duplicates
      }
      seenAccountNames.add(value.accountName);
      return true;
    });
});

function getAccountActions(row: AwsRoleDetails) {
  return [
    [{
      label: 'Account Overview',
      icon: 'i-heroicons-arrow-top-right-on-square',
      click: () => navigateTo(`/account/${row.standardAccountId}`)
    }],
    [{
      label: 'Account Cost Details',
      icon: 'i-heroicons-arrow-top-right-on-square',
      click: () => navigateTo(`/account/${row.standardAccountId}/cost`)
    }],
  ]
}

onMounted(() => {
  awsAccountsStore.initialize()
})

</script>