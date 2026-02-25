<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div class="text-lg font-semibold text-gray-900 dark:text-white">Account Users</div>
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
        class="flex items-center justify-between px-2 py-3 cursor-pointer border-b gap-y-2 flex-wrap 2xl:flex-nowrap border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
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
            <div class="text-gray-900 dark:text-white text-sm font-medium truncate">
              {{ user.displayName }}
            </div>
            <div class="text-gray-500 dark:text-gray-400 text-xs truncate">
              {{ user.userPrincipalName }}
            </div>
          </div>
        </div>

        <div class="flex items-center gap-2 flex-wrap 2xl:flex-nowrap">
          <!-- IDC Session Status Badge -->
          <UBadge
            v-if="showSessionStatus && hasActiveSession(user.userPrincipalName)"
            size="xs"
            color="green"
            variant="soft"
            class="flex items-center gap-1"
          >
            <UIcon name="i-heroicons-check-circle" class="w-3 h-3" />
            <span>Active Session</span>
          </UBadge>

          <!-- Role Badges -->
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
            class="text-xs text-gray-700 dark:text-gray-300"
            variant="soft"
          >
            +{{ user.roles.length - 1 }}
          </UBadge>
        </div>
      </div>
    </div>
    <div v-else class="text-gray-600 dark:text-gray-400 text-sm">No users found for this account.</div>

    <div
      v-if="!showAll && users.length > maxVisible"
      class="flex justify-center mt-3 text-sm text-blue-400 font-medium cursor-pointer hover:underline"
    >
      <NuxtLink :to="`/account/${accountId}/users`">
        View all {{ users.length }} users
      </NuxtLink>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import { convertToUsernameSlug } from '~/utils/userUtils'
import type { IDCUserSession } from '#shared/types/idc-sessions'

interface GraphUser {
  displayName: string
  userPrincipalName: string
  roles: string[]
}

const props = defineProps<{
  users: GraphUser[]
  accountId: string
  loading: boolean
  idcSessions?: IDCUserSession[] // Optional IDC session data
  showSessionStatus?: boolean // Whether to show IDC session badges
  showAll?: boolean // Show all users instead of limiting to maxVisible
}>()

// Helper to check if a user has an active IDC session
const hasActiveSession = (userPrincipalName: string): boolean => {
  if (!props.idcSessions || props.idcSessions.length === 0) {
    return false
  }

  const session = props.idcSessions.find(s => s.userPrincipalName === userPrincipalName)
  return session?.isActive || false
}

const maxVisible = 6
const visibleUsers = computed(() =>
  props.showAll ? props.users : props.users.slice(0, maxVisible)
)

const router = useRouter()
function goToUser(userPrincipalName: string) {
  router.push(`/account/user/${convertToUsernameSlug(userPrincipalName)}`)
}
function goToAllUsers() {
  router.push(`/account/${props.accountId}/users`)
}
</script>
