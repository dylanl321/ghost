<template>
  <div>
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-1">Role Management</h1>
      <p class="text-sm text-gray-600 dark:text-gray-400">View and manage user roles and permissions</p>
    </div>

    <!-- Current User Role Info -->
    <div class="mb-8">
      <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Your Current Access</h2>
      <UserRoleInfo :show-debug="true" />
    </div>

    <!-- Role Configuration Overview -->
    <div class="mb-8">
      <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">System Roles</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <UCard v-for="role in ROLES" :key="role.id">
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-semibold text-gray-900 dark:text-white">{{ role.name }}</h3>
              <UBadge :color="getRoleColor(role.id)" variant="soft" size="xs">
                Priority: {{ role.priority }}
              </UBadge>
            </div>
          </template>

          <div class="space-y-3">
            <p class="text-xs text-gray-600 dark:text-gray-400">{{ role.description }}</p>

            <!-- Rule Conditions -->
            <div>
              <h4 class="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Assignment Rules:</h4>
              <div class="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                <div v-if="role.rules.groups_exact">
                  Groups: {{ role.rules.groups_exact.join(', ') }}
                </div>
                <div v-if="role.rules.username_ends_with">
                  Username ends with: {{ role.rules.username_ends_with.join(', ') }}
                </div>
                <div v-if="role.rules.department_includes">
                  Department: {{ role.rules.department_includes.join(', ') }}
                </div>
                <div v-if="role.rules.default">
                  Default role for all users
                </div>
              </div>
            </div>

            <!-- Permissions -->
            <div>
              <h4 class="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Permissions:</h4>
              <div class="flex flex-wrap gap-1">
                <UBadge
                  v-for="permission in role.permissions"
                  :key="permission"
                  size="xs"
                  variant="outline"
                  color="gray"
                >
                  {{ permission }}
                </UBadge>
              </div>
            </div>
          </div>
        </UCard>
      </div>
    </div>

    <!-- Permission Categories -->
    <div>
      <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Permission Categories</h2>
      <div class="space-y-4">
        <UCard v-for="(category, key) in PERMISSION_CATEGORIES" :key="key">
          <template #header>
            <h3 class="text-sm font-semibold text-gray-900 dark:text-white">{{ category.label }}</h3>
          </template>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div
              v-for="(description, permission) in category.permissions"
              :key="permission"
              class="flex items-start gap-2"
            >
              <Icon
                :name="hasPermission(permission) ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
                :class="hasPermission(permission) ? 'text-green-500' : 'text-gray-400'"
                class="w-4 h-4 mt-0.5 flex-shrink-0"
              />
              <div>
                <div class="text-xs font-medium text-gray-700 dark:text-gray-300">{{ permission }}</div>
                <div class="text-xs text-gray-600 dark:text-gray-400">{{ description }}</div>
              </div>
            </div>
          </div>
        </UCard>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ROLES, PERMISSION_CATEGORIES } from '~/config/roles'
import UserRoleInfo from '~/components/support/UserRoleInfo.vue'

const { can } = useUserRoles()

// Check if current user has a specific permission
const hasPermission = (permission: string) => {
  return can(permission)
}

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
