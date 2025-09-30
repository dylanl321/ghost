<template>
  <div class="bg-gray-800 rounded-lg p-4 space-y-4">
    <!-- Current User Info -->
    <div>
      <h3 class="text-sm font-semibold text-gray-200 mb-2">Current User</h3>
      <div class="text-xs text-gray-400 space-y-1">
        <div>Email: {{ userEmail }}</div>
        <div>Display Name: {{ displayName }}</div>
      </div>
    </div>

    <!-- User Roles -->
    <div>
      <h3 class="text-sm font-semibold text-gray-200 mb-2">Assigned Roles</h3>
      <div class="flex flex-wrap gap-2">
        <UBadge 
          v-for="role in userRoles" 
          :key="role.id"
          :color="getRoleColor(role.id)"
          variant="soft"
          size="sm"
        >
          {{ role.name }}
        </UBadge>
        <UBadge v-if="userRoles.length === 0" color="gray" variant="soft" size="sm">
          No roles assigned
        </UBadge>
      </div>
    </div>

    <!-- User Permissions -->
    <div>
      <h3 class="text-sm font-semibold text-gray-200 mb-2">Active Permissions</h3>
      <div class="max-h-40 overflow-y-auto">
        <div class="grid grid-cols-2 gap-2">
          <div 
            v-for="permission in sortedPermissions" 
            :key="permission"
            class="text-xs text-gray-400 flex items-center gap-1"
          >
            <Icon name="i-heroicons-check-circle" class="w-3 h-3 text-green-500" />
            {{ permission }}
          </div>
          <div v-if="sortedPermissions.length === 0" class="text-xs text-gray-500">
            No permissions available
          </div>
        </div>
      </div>
    </div>

    <!-- Groups -->
    <div>
      <h3 class="text-sm font-semibold text-gray-200 mb-2">Group Memberships</h3>
      <div class="max-h-32 overflow-y-auto">
        <div class="flex flex-wrap gap-1">
          <UBadge 
            v-for="group in userGroups" 
            :key="group"
            size="xs"
            variant="outline"
            color="gray"
          >
            {{ group }}
          </UBadge>
          <span v-if="userGroups.length === 0" class="text-xs text-gray-500">
            No group memberships
          </span>
        </div>
      </div>
    </div>

    <!-- Debug Info -->
    <div v-if="showDebug" class="pt-4 border-t border-gray-700">
      <UButton 
        size="xs" 
        variant="ghost" 
        @click="debugRoles"
        icon="i-heroicons-command-line"
      >
        Log Debug Info to Console
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  showDebug?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showDebug: false
})

const { user } = useOidcAuth()
const userGroupStore = useUserGroupStore()
const { userRoles, userPermissions, debug: debugRoles } = useUserRoles()

// User info
const userEmail = computed(() => user.value?.claims?.email || 'Unknown')
const displayName = computed(() => user.value?.claims?.name || user.value?.claims?.given_name || 'Unknown')

// User groups
const userGroups = computed(() => {
  const groups: string[] = []
  
  // Add role groups
  if (userGroupStore.roleGroups) {
    for (const key in userGroupStore.roleGroups) {
      const group = userGroupStore.roleGroups[key]
      if (group?.groupName && !groups.includes(group.groupName)) {
        groups.push(group.groupName)
      }
    }
  }
  
  // Add distribution groups
  if (userGroupStore.distributionGroups) {
    for (const key in userGroupStore.distributionGroups) {
      const group = userGroupStore.distributionGroups[key]
      if (group?.groupName && !groups.includes(group.groupName)) {
        groups.push(group.groupName)
      }
    }
  }
  
  return groups.sort()
})

// Sorted permissions
const sortedPermissions = computed(() => {
  return Array.from(userPermissions.value).sort()
})

// Get role color based on ID
const getRoleColor = (roleId: string) => {
  const colors: Record<string, string> = {
    admin: 'red',
    power_user: 'purple',
    finance: 'blue',
    viewer: 'gray'
  }
  return colors[roleId] || 'gray'
}
</script>