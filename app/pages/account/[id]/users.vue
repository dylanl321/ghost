<template>
  <div class="space-y-6 p-6">
    <!-- Header Card -->
    <UCard>
      <div class="flex items-center justify-between">
        <div class="flex gap-2 items-center">
          <div :class="`w-3 h-3 rounded-full ${accountStatus !== 'Decommissioned' ? 'bg-green-500' : 'bg-red-500'}`" />
          <h1 class="font-semibold text-2xl">{{ accountName ?? "Loading..." }}</h1>
        </div>
        <UButton :to="`/account/${accountId}`" color="primary" variant="outline" icon="i-heroicons-arrow-left">
          Back to account
        </UButton>
      </div>
    </UCard>

    <!-- Search Card -->
    <UCard>
      <div>
        <UInput v-model="search" placeholder="Search users by name..." icon="i-heroicons-magnifying-glass"
          class="w-full" />
      </div>
    </UCard>

    <!-- Users List Card -->
    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <h2 class="font-bold text-xl">Users</h2>
          <UBadge size="sm" variant="subtle">
            {{ filteredUsers.length }} results
          </UBadge>
        </div>
      </template>

      <div class="space-y-3 pr-2">
        <div v-for="user in paginatedUsers" :key="user.userPrincipalName"
          class="flex items-center justify-between p-3 rounded-lg border border-gray-700 hover:bg-gray-800 transition">
          <div class="flex items-center gap-3">
            <UserAvatar :user-principal-name="user.userPrincipalName" :display-name="user.displayName" size="md" />
            <div>
              <p class="font-medium">{{ user.displayName }}</p>
              <p class="text-xs text-gray-500 mb-1">{{ user.userPrincipalName }}</p>
              <UBadge v-if="user.roles.length" class="mr-1" size="xs" color="gray" variant="soft">
                {{ user.roles[0] }}
              </UBadge>
              <UBadge v-if="user.roles.length > 1" size="xs" color="gray" variant="soft">
                +{{ user.roles.length - 1 }}
              </UBadge>
            </div>

          </div>

          <UButton :to="`/account/user/${convertToUsernameSlug(user.userPrincipalName)}`" size="xs" color="primary" variant="outline">
            View Details
          </UButton>
        </div>
      </div>

      <div class="w-full flex justify-center mt-4">
        <div class="flex items-center gap-3">
          <UButton size="sm" color="primary" variant="outline" :disabled="page === 1" @click="page--">
            Prev
          </UButton>
          <span class="text-sm text-gray-400">
            Page {{ page }} of {{ totalPages }}
          </span>
          <UButton size="sm" color="primary" variant="outline" :disabled="page === totalPages" @click="page++">
            Next
          </UButton>
        </div>
      </div>
    </UCard>
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
const search = ref('')

onMounted(async () => {
  users.value = await groupMembers.fetchEnclaveUsers(accountId.value, govCloudId.value || '', user.value?.accessToken || '')
})

const filteredUsers = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return users.value
  return users.value.filter(
    u =>
      u.displayName.toLowerCase().includes(q) ||
      u.userPrincipalName.toLowerCase().includes(q)
  )
})

// Pagination

const page = ref(1)
const pageSize = 10

const paginatedUsers = computed(() => {
  const start = (page.value - 1) * pageSize
  return filteredUsers.value.slice(start, start + pageSize)
})

const totalPages = computed(() =>
  Math.ceil(filteredUsers.value.length / pageSize)
)
</script>
