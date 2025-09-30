<template>
  <div class="container mx-auto p-6 max-w-6xl">
    <!-- Page Header -->
    <div class="mb-8">
      <h1 class="text-3xl font-bold text-white mb-2">My Profile</h1>
      <p class="text-gray-400">Your account information, roles, and permissions</p>
    </div>

    <!-- User Info Card -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
      <!-- Main Profile Info -->
      <UCard class="lg:col-span-2">
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold text-white">Profile Information</h2>
            <UBadge v-if="isAdmin" color="red" variant="soft">
              Admin
            </UBadge>
          </div>
        </template>

        <div class="space-y-6">
          <!-- Avatar and Basic Info -->
          <div class="flex items-start gap-4">
            <UserAvatar
              :name="displayName"
              :email="userEmail"
              size="xl"
            />
            <div class="flex-1">
              <h3 class="text-xl font-semibold text-white">{{ displayName }}</h3>
              <p class="text-gray-400 text-sm">{{ userEmail }}</p>
              <p v-if="username" class="text-gray-500 text-xs mt-1">@{{ username }}</p>
            </div>
          </div>

          <!-- Additional User Details -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-700">
            <div v-if="jobTitle">
              <div class="text-xs text-gray-500 mb-1">Job Title</div>
              <div class="text-sm text-gray-200">{{ jobTitle }}</div>
            </div>
            <div v-if="department">
              <div class="text-xs text-gray-500 mb-1">Department</div>
              <div class="text-sm text-gray-200">{{ department }}</div>
            </div>
            <div v-if="officeLocation">
              <div class="text-xs text-gray-500 mb-1">Office Location</div>
              <div class="text-sm text-gray-200">{{ officeLocation }}</div>
            </div>
            <div v-if="mobilePhone">
              <div class="text-xs text-gray-500 mb-1">Mobile Phone</div>
              <div class="text-sm text-gray-200">{{ mobilePhone }}</div>
            </div>
          </div>

          <!-- User Badges -->
          <div class="pt-4 border-t border-gray-700">
            <h4 class="text-sm font-medium text-gray-300 mb-3">Badges</h4>
            <div class="flex flex-wrap gap-2">
              <UBadge
                v-for="badge in userBadges"
                :key="badge.title"
                :color="badge.color"
                variant="soft"
                size="md"
              >
                <Icon v-if="badge.icon" :name="badge.icon" class="w-4 h-4 mr-1" />
                {{ badge.title }}
              </UBadge>
              <UBadge v-if="userBadges.length === 0" color="gray" variant="soft">
                No badges assigned
              </UBadge>
            </div>
          </div>
        </div>
      </UCard>

      <!-- Quick Stats -->
      <UCard>
        <template #header>
          <h2 class="text-lg font-semibold text-white">Quick Stats</h2>
        </template>

        <div class="space-y-4">
          <div class="text-center p-4 bg-gray-800 rounded-lg">
            <div class="text-3xl font-bold text-blue-400">{{ totalEnclaves }}</div>
            <div class="text-xs text-gray-400 mt-1">AWS Enclaves</div>
          </div>

          <div class="text-center p-4 bg-gray-800 rounded-lg">
            <div class="text-3xl font-bold text-purple-400">{{ totalRoles }}</div>
            <div class="text-xs text-gray-400 mt-1">AWS Roles</div>
          </div>

          <div class="text-center p-4 bg-gray-800 rounded-lg">
            <div class="text-3xl font-bold text-green-400">{{ totalGroups }}</div>
            <div class="text-xs text-gray-400 mt-1">Group Memberships</div>
          </div>
        </div>
      </UCard>
    </div>

    <!-- Roles & Permissions -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
      <!-- User Roles -->
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold text-white">System Roles</h2>
            <UTooltip text="Roles determine what you can do in GHOST">
              <Icon name="i-heroicons-information-circle" class="w-5 h-5 text-gray-400" />
            </UTooltip>
          </div>
        </template>

        <div class="space-y-3">
          <div v-for="role in userRoles" :key="role.id" class="p-3 bg-gray-800 rounded-lg">
            <div class="flex items-center justify-between mb-2">
              <h3 class="text-sm font-semibold text-white">{{ role.name }}</h3>
              <UBadge :color="getRoleColor(role.id)" variant="soft" size="xs">
                Priority: {{ role.priority }}
              </UBadge>
            </div>
            <p class="text-xs text-gray-400">{{ role.description }}</p>
          </div>

          <div v-if="userRoles.length === 0" class="text-center py-4 text-gray-500 text-sm">
            No roles assigned
          </div>

          <UButton
            variant="ghost"
            size="sm"
            to="/support/roles"
            class="w-full"
            icon="i-heroicons-information-circle"
          >
            Learn About Roles
          </UButton>
        </div>
      </UCard>

      <!-- Permissions -->
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold text-white">Active Permissions</h2>
            <UBadge color="gray" variant="soft" size="xs">
              {{ sortedPermissions.length }} total
            </UBadge>
          </div>
        </template>

        <div class="space-y-2 max-h-96 overflow-y-auto">
          <div
            v-for="permission in sortedPermissions"
            :key="permission"
            class="flex items-center gap-2 p-2 hover:bg-gray-800 rounded"
          >
            <Icon name="i-heroicons-check-circle" class="w-4 h-4 text-green-500 flex-shrink-0" />
            <span class="text-xs text-gray-300">{{ permission }}</span>
            <UTooltip v-if="getPermissionDescription(permission)" :text="getPermissionDescription(permission)">
              <Icon name="i-heroicons-information-circle" class="w-3 h-3 text-gray-500 ml-auto" />
            </UTooltip>
          </div>

          <div v-if="sortedPermissions.length === 0" class="text-center py-8 text-gray-500 text-sm">
            No permissions available
          </div>
        </div>
      </UCard>
    </div>

    <!-- AWS Access -->
    <UCard class="mb-6">
      <template #header>
        <h2 class="text-lg font-semibold text-white">AWS Access</h2>
      </template>

      <div class="space-y-4">
        <!-- AWS Enclaves -->
        <div>
          <h3 class="text-sm font-medium text-gray-300 mb-3">Your AWS Enclaves</h3>
          <div v-if="Object.keys(myEnclaves).length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <div
              v-for="(enclave, key) in myEnclaves"
              :key="key"
              class="p-3 bg-gray-800 rounded-lg hover:bg-gray-750 transition-colors"
            >
              <div class="flex items-center justify-between mb-2">
                <h4 class="text-sm font-semibold text-white truncate">{{ enclave.projectName }}</h4>
                <UBadge color="blue" variant="soft" size="xs">
                  {{ enclave.total }} roles
                </UBadge>
              </div>
              <div class="text-xs text-gray-400 space-y-1">
                <div>Standard: {{ enclave.standardId }}</div>
                <div v-if="enclave.govcloudId">GovCloud: {{ enclave.govcloudId }}</div>
              </div>
            </div>
          </div>
          <div v-else class="text-center py-8 text-gray-500 text-sm">
            No AWS enclaves assigned
          </div>
        </div>
      </div>
    </UCard>

    <!-- Group Memberships -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold text-white">Group Memberships</h2>
          <UBadge color="gray" variant="soft" size="xs">
            {{ allGroups.length }} groups
          </UBadge>
        </div>
      </template>

      <div class="space-y-4">
        <!-- Role Groups -->
        <div v-if="roleGroupNames.length > 0">
          <h3 class="text-sm font-medium text-gray-300 mb-2">AWS Role Groups</h3>
          <div class="flex flex-wrap gap-2">
            <UBadge
              v-for="group in roleGroupNames"
              :key="group"
              color="blue"
              variant="outline"
              size="sm"
            >
              {{ group }}
            </UBadge>
          </div>
        </div>

        <!-- Distribution Groups -->
        <div v-if="distributionGroupNames.length > 0">
          <h3 class="text-sm font-medium text-gray-300 mb-2">Distribution Groups</h3>
          <div class="flex flex-wrap gap-2">
            <UBadge
              v-for="group in distributionGroupNames"
              :key="group"
              color="purple"
              variant="outline"
              size="sm"
            >
              {{ group }}
            </UBadge>
          </div>
        </div>

        <div v-if="allGroups.length === 0" class="text-center py-8 text-gray-500 text-sm">
          No group memberships found
        </div>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { PERMISSION_CATEGORIES } from '~/config/roles'

const { user } = useOidcAuth()
const userGroupStore = useUserGroupStore()
const { userRoles, userPermissions, isAdmin } = useUserRoles()
const { getBadgesFromGroups } = useSimpleBadges()

// User basic info
const userEmail = computed(() => user.value?.claims?.email || 'Unknown')
const displayName = computed(() => user.value?.claims?.name || user.value?.claims?.given_name || 'Unknown User')
const username = computed(() => {
  const email = userEmail.value
  return email !== 'Unknown' ? email.split('@')[0] : ''
})

// Additional user details
const jobTitle = computed(() => user.value?.claims?.jobTitle)
const department = computed(() => user.value?.claims?.department)
const officeLocation = computed(() => user.value?.claims?.officeLocation)
const mobilePhone = computed(() => user.value?.claims?.mobilePhone)

// Get user groups - use all Entra groups for comprehensive view
const allGroups = computed(() => {
  return userGroupStore.allEntraGroups || []
})

const roleGroupNames = computed(() => {
  const groups: string[] = []
  if (userGroupStore.roleGroups) {
    for (const key in userGroupStore.roleGroups) {
      const group = userGroupStore.roleGroups[key]
      if (group?.groupName && !groups.includes(group.groupName)) {
        groups.push(group.groupName)
      }
    }
  }
  return groups.sort()
})

const distributionGroupNames = computed(() => {
  const groups: string[] = []
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

// User badges
const userBadges = computed(() => {
  return getBadgesFromGroups(allGroups.value, {
    userPrincipalName: userEmail.value,
    displayName: displayName.value,
    jobTitle: jobTitle.value,
    department: department.value
  })
})

// AWS access info
const myEnclaves = computed(() => userGroupStore.myEnclaves || {})

// Quick stats
const totalEnclaves = computed(() => Object.keys(myEnclaves.value).length)
const totalRoles = computed(() => {
  return Object.values(myEnclaves.value).reduce((sum: number, enclave: any) => sum + (enclave.total || 0), 0)
})
const totalGroups = computed(() => allGroups.value.length)

// Sorted permissions
const sortedPermissions = computed(() => {
  return Array.from(userPermissions.value).sort()
})

// Get role color
const getRoleColor = (roleId: string) => {
  const colors: Record<string, string> = {
    admin: 'red',
    power_user: 'purple',
    finance: 'blue',
    viewer: 'gray'
  }
  return colors[roleId] || 'gray'
}

// Get permission description
const getPermissionDescription = (permission: string): string => {
  for (const category of Object.values(PERMISSION_CATEGORIES)) {
    if (permission in category.permissions) {
      return category.permissions[permission as keyof typeof category.permissions]
    }
  }
  return ''
}
</script>