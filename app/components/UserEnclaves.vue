<template>
  <UCard>
    <template #header>
      <div class="h-8">My Enclaves</div>
    </template>

    <!-- <UTable :rows="tableData" :columns="columns" :ui="{ thead: 'bg-gray-800' }"> -->
    <UTable :rows="tableData.filter(r => r.account.name !== 'Unknown Account')" :columns="columns" :ui="{ thead: 'bg-gray-800' }">
      <template #account-data="{ row }">
        <div>
          <div class="text-white text-sm font-medium max-w-120 truncate">{{ row.account.name }}</div>
          <div class="text-gray-400 text-xs">{{ row.account.id }}</div>
        </div>
      </template>

      <template #environment-data="{ row }">
        <div class="flex space-x-1">
          <span v-if="row.environment.includes('GovCloud')" class="w-3 h-3 rounded-full bg-orange-500" />
          <span v-if="row.environment.includes('Commercial')" class="w-3 h-3 rounded-full bg-blue-500" />
        </div>
      </template>

      <template #roles-data="{ row }">
        <div class="flex flex-wrap gap-2">
          <!-- <span v-for="role in row.roles" :key="role" class="px-2 py-1 bg-gray-700 text-white text-xs rounded">{{ role }}</span> -->
          <span v-for="role in row.roles.slice(0, 2)" :key="role" class="px-2 py-1 bg-gray-700 text-white text-xs rounded">{{ role }}</span>
          <span v-if="row.roles.length > 2" class="px-2 py-1 bg-gray-700 text-white text-xs rounded">+{{ row.roles.length - 2 }}</span>
        </div>
      </template>

      <template #actions-data="{ row }">
        <div class="flex gap-2">
          <UButton size="xs" icon="i-heroicons-user" color="primary" @click="router.push(`/account/${row.accountId}`)">Account Details</UButton>
          <UButton size="xs" icon="i-heroicons-users" color="primary" @click="router.push(`/group/${row.accountId}`)">Groups</UButton>
        </div>
      </template>
    </UTable>
  </UCard>
</template>

<script setup lang="ts">
import { UCard, UTable, UButton } from '#components'

const userGroupStore = useUserGroupStore()
const router = useRouter()

const columns = [
  { key: 'account', label: 'Account' },
  { key: 'environment', label: 'Environment' },
  { key: 'roles', label: 'Roles' },
  { key: 'total', label: 'Total' },
  { key: 'actions', label: 'Actions' }
]

const tableData = computed(() => {
  return Object.entries(userGroupStore.awsRoles).map(([accountId, roleData]) => ({
    account: { name: roleData.accountName, id: accountId }, // single field for column=account
    environment: [roleData.isGovCloud ? 'GovCloud' : '', 'Commercial'].filter(Boolean).join(', '),
    roles: roleData.roles,
    total: roleData.roles.length
  }))
})

</script>
