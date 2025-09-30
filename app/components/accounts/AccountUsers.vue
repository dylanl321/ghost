<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div class="text-lg font-semibold">Account Users</div>
        <UButton icon="i-heroicons-users" size="xs" variant="outline" color="primary" @click="goToAllUsers">
          View All
        </UButton>
      </div>
    </template>

    <div v-if="loading" class="flex items-center justify-center py-8">
      <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-gray-400" />
      <span class="ml-2 text-gray-400">Loading users...</span>
    </div>
    <div v-else-if="users.length > 0">
      <div
        v-for="user in visibleUsers"
        :key="user.userPrincipalName"
        class="flex items-center justify-between px-2 py-3 cursor-pointer border-b gap-y-2 flex-wrap 2xl:flex-nowrap border-gray-800 hover:bg-gray-700 transition"
        @click="goToUser(user.userPrincipalName)"
      >
        <div class="flex items-center gap-3 min-w-0">
          <UserAvatar
            :user-principal-name="user.userPrincipalName"
            :display-name="user.displayName"
            size="sm"
            class="flex-shrink-0"
          />

          <div class="min-w-0">
            <div class="text-white text-sm font-medium truncate">
              {{ user.displayName }}
            </div>
            <div class="text-gray-400 text-xs truncate">
              {{ user.userPrincipalName }}
            </div>
          </div>
        </div>

        <div class="flex items-center gap-2 flex-wrap 2xl:flex-nowrap">
          <UBadge
            v-if="user.roles.length > 0"
            size="xs"
            color="blue"
            variant="soft"
          >
            {{ user.roles[0] }}
          </UBadge>
          <UBadge
            v-if="user.roles.length > 1"
            size="xs"
            color="gray"
            class="text-xs text-gray-300"
            variant="soft"
          >
            +{{ user.roles.length - 1 }}
          </UBadge>
        </div>
      </div>
    </div>
    <div v-else class="text-gray-400 text-sm">No users found for this account.</div>

    <div
      v-if="users.length > maxVisible"
      class="flex justify-center mt-3 text-sm text-blue-400 font-medium cursor-pointer hover:underline"
    >
      <ULink :to="`/account/${accountId}/users`">
        View all {{ users.length }} users
      </ULink>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import { convertToUsernameSlug } from '~/utils/userUtils'

interface GraphUser {
  displayName: string
  userPrincipalName: string
  roles: string[]
}

const props = defineProps<{
  users: GraphUser[]
  accountId: string
  loading: boolean
}>()

const maxVisible = 6
const visibleUsers = computed(() => props.users.slice(0, maxVisible))

const router = useRouter()
function goToUser(userPrincipalName: string) {
  router.push(`/account/user/${convertToUsernameSlug(userPrincipalName)}`)
}
function goToAllUsers() {
  router.push(`/account/${props.accountId}/users`)
}
</script>
