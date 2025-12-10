<template>
  <UCard>
    <template #header>
      <div class="text-lg font-semibold">My Enclaves</div>
    </template>

    <CenteredLoadingSpinner v-if="props.loading" />
    <div v-else class="overflow-y-auto">
      <UTable :rows="tableData" :columns="columns" :ui="{ thead: 'bg-gray-800 text-xs' }">
        <template #enclave-data="{ row }">
          <div>
            <div class="text-white text-sm font-sm text-wrap">{{ row.projectName }}</div>
            <div class="text-gray-400 text-xs flex flex-wrap">
              <UTooltip text="Commercial Account ID">
                <span class="text-blue-300 mr-2">{{ row.standardId }}</span>
              </UTooltip>
              <UTooltip text="GovCloud Account ID">
                <span class="text-orange-300">{{ row.govcloudId }}</span>
              </UTooltip>
            </div>
          </div>
        </template>

        <template #environment-data="{ row }">
          <div class="flex space-x-1">
            <UTooltip :text="row.environment === 'GovCloud' ? 'GovCloud Paired' : 'Commercial Only'">
              <span>{{ row.environment }}</span>
            </UTooltip>
          </div>
        </template>

        <template #roles-data="{ row }">
          <div class="flex flex-wrap gap-2 font-light text-xs">
            <div v-for="role in visibleRoles(row)" :key="role"
              class="px-2 py-1 bg-gray-700 text-white rounded flex items-center">
              <span v-if="role.includes(COMM_IDENTIFIER)" class="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1" />
              <span v-if="role.includes(GOV_IDENTIFIER)" class="inline-block w-2 h-2 rounded-full bg-orange-500 mr-1" />
              <span>{{ role.split(" |")[0] }}</span>
            </div>

            <span v-if="!isExpanded(row) && row.roles.length > 2"
              class="px-2 py-1 bg-gray-700 text-white rounded cursor-pointer" title="See all roles"
              @click="setExpanded(row)">
              +{{ row.roles.length - 2 }}
            </span>
          </div>
        </template>

        <!-- Actions column -->
        <template #actions-data="{ row }">
          <UDropdown :items="getActionItems(row)">
            <UButton color="gray" variant="ghost" icon="i-heroicons-ellipsis-vertical" />
            <!-- <template #items>
              <ULink :to="`/account/${row.accountId}`"
                class="block px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-800">
                Account Details
              </ULink>
            </template> -->
          </UDropdown>
        </template>

        <!-- <template #actions-data="{ row }">
          <div class="flex gap-2">
            <UButton size="xs" icon="i-heroicons-user" color="primary" variant="soft"
              @click="router.push(`/account/${row.standardId}`)">Account Details</UButton>
            <UButton size="xs" icon="i-heroicons-users" color="primary" variant="soft"
              @click="router.push(`/account/${row.standardId}/groups`)">
              Groups</UButton>
          </div>
        </template> -->
      </UTable>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import { UCard, UTable, UButton } from '#components'

const userGroupStore = useUserGroupStore()
// const router = useRouter()

const props = defineProps<{
  loading: boolean
}>()

const columns = [
  { key: 'enclave', label: 'Enclave' },
  { key: 'environment', label: 'Environment' },
  { key: 'roles', label: 'Roles' },
  // { key: 'total', label: 'Total' },
  { key: 'actions', label: '' }
]

const getActionItems = (enclave: {
  projectName: string;
  standardId: string;
  govcloudId: string;
  environment: string;
  roles: Array<string>;
  total: number;
}) => {
  const actionItems: any = [
    [
      {
        label: 'Account Details',
        icon: 'i-heroicons-document-text',
        to: `/account/${enclave.standardId}`,
        description: 'View full account details and overview'
      },
    ],
  ]

  return actionItems
}

// Keep track of which rows have expanded roles
const expanded = ref<Set<string>>(new Set())

function isExpanded(row: any) {
  return expanded.value.has(row.standardId)
}

function setExpanded(row: any) {
  expanded.value.add(row.standardId)
}

function visibleRoles(row: any) {
  return isExpanded(row) ? row.roles : row.roles.slice(0, 2)
}

// These are used to determine which color dot to display by the role name (so the user knows whether the role is gov or comm)
const GOV_IDENTIFIER = ' | gov'
const COMM_IDENTIFIER = ' | comm'

// Handle empty state gracefully
const tableData = computed(() => {
  if (!userGroupStore.myEnclaves) {
    console.warn('User enclaves not loaded yet')
    return []
  }
  return Object.values(userGroupStore.myEnclaves)
})

</script>
