<template>
  <div class="space-y-6 p-6 max-w-[1600px] mx-auto">
    <!-- Access Denied -->
    <div v-if="!hasAdminAccess" class="max-w-2xl mx-auto">
        <UCard>
          <div class="p-8 text-center">
            <Icon name="i-heroicons-shield-exclamation" class="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Access Denied
            </h1>
            <p class="text-gray-600 dark:text-gray-400 mb-6">
              You don't have permission to access the admin panel. This area is restricted to administrators only.
            </p>

            <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-6 text-left">
              <h3 class="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                To get admin access:
              </h3>
              <ul class="text-sm text-gray-600 dark:text-gray-400 space-y-1 list-disc list-inside">
                <li>You must be a member of the <code class="text-blue-600 dark:text-blue-400">AWS-Product-Team</code> group</li>
                <li>Contact your manager to request access</li>
                <li>Submit a SailPoint request for the AWS-Product-Team group</li>
              </ul>
            </div>

            <div class="flex flex-col sm:flex-row gap-3 justify-center">
              <UButton
                color="emerald"
                @click="navigateTo('/')"
              >
                <Icon name="i-heroicons-home" class="w-4 h-4 mr-2" />
                Go to Dashboard
              </UButton>
              <UButton
                color="gray"
                variant="soft"
                @click="navigateTo('/profile')"
              >
                <Icon name="i-heroicons-user-circle" class="w-4 h-4 mr-2" />
                View My Profile
              </UButton>
            </div>
          </div>
        </UCard>
      </div>

    <!-- Admin Dashboard -->
    <div v-else>
      <!-- Header -->
      <UCard>
        <div class="p-2">
          <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Admin Panel
          </h1>
          <p class="text-gray-600 dark:text-gray-400">
            Manage GHOST application settings, users, and system configuration
          </p>
        </div>
      </UCard>

      <!-- Admin Cards Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

          <!-- Role Management -->
          <UCard
            class="hover:shadow-lg transition-shadow cursor-pointer"
            @click="navigateTo('/admin/roles')"
          >
            <div class="p-6">
              <div class="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center mb-4">
                <Icon name="i-heroicons-shield-check" class="w-6 h-6 text-purple-600 dark:text-purple-400" />
              </div>
              <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Role Management
              </h3>
              <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
                View and manage user roles and permissions
              </p>
              <UButton color="purple" variant="soft" size="sm">
                Manage Roles
              </UButton>
            </div>
          </UCard>

          <!-- System Logs -->
          <UCard
            class="hover:shadow-lg transition-shadow cursor-pointer"
            @click="navigateTo('/admin/logs')"
          >
            <div class="p-6">
              <div class="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center mb-4">
                <Icon name="i-heroicons-document-text" class="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                System Logs
              </h3>
              <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
                View application logs and debugging information
              </p>
              <UButton color="blue" variant="soft" size="sm">
                View Logs
              </UButton>
            </div>
          </UCard>

          <!-- Issues & Tickets -->
          <UCard
            class="hover:shadow-lg transition-shadow cursor-pointer"
            @click="navigateTo('/admin/issues')"
          >
            <div class="p-6">
              <div class="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center mb-4">
                <Icon name="i-heroicons-exclamation-triangle" class="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Issues & Tickets
              </h3>
              <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Track and manage reported issues
              </p>
              <UButton color="red" variant="soft" size="sm">
                View Issues
              </UButton>
            </div>
          </UCard>

          <!-- API Keys -->
          <UCard
            class="hover:shadow-lg transition-shadow cursor-pointer"
            @click="navigateTo('/admin/api-keys')"
          >
            <div class="p-6">
              <div class="w-12 h-12 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex items-center justify-center mb-4">
                <Icon name="i-heroicons-key" class="w-6 h-6 text-amber-600 dark:text-amber-400" />
              </div>
              <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                API Keys
              </h3>
              <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Manage API keys for programmatic access
              </p>
              <UButton color="amber" variant="soft" size="sm">
                Manage Keys
              </UButton>
            </div>
          </UCard>

          <!-- Forecast Management -->
          <UCard
            v-if="can('forecast.import')"
            class="hover:shadow-lg transition-shadow cursor-pointer"
            @click="navigateTo('/account/costs')"
          >
            <div class="p-6">
              <div class="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center mb-4">
                <Icon name="i-heroicons-currency-dollar" class="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
              <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Forecast Management
              </h3>
              <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Import and manage cost forecast data
              </p>
              <UButton color="green" variant="soft" size="sm">
                Manage Forecasts
              </UButton>
            </div>
          </UCard>

          <!-- User Activity -->
          <UCard class="opacity-60">
            <div class="p-6">
              <div class="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center mb-4">
                <Icon name="i-heroicons-chart-bar" class="w-6 h-6 text-gray-500 dark:text-gray-400" />
              </div>
              <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                User Activity
              </h3>
              <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Monitor user activity and usage metrics
              </p>
              <UButton color="gray" variant="soft" size="sm" disabled>
                Coming Soon
              </UButton>
            </div>
          </UCard>

          <!-- System Settings -->
          <UCard class="opacity-60">
            <div class="p-6">
              <div class="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center mb-4">
                <Icon name="i-heroicons-cog-6-tooth" class="w-6 h-6 text-gray-500 dark:text-gray-400" />
              </div>
              <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                System Settings
              </h3>
              <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Configure application settings and preferences
              </p>
              <UButton color="gray" variant="soft" size="sm" disabled>
                Coming Soon
              </UButton>
            </div>
          </UCard>
        </div>

        <!-- Quick Stats -->
        <div class="mt-8 grid grid-cols-1 md:grid-cols-4 gap-6">
          <UCard>
            <div class="p-6 text-center">
              <div class="text-3xl font-bold text-blue-600 dark:text-blue-400 mb-1">
                {{ totalUsers }}
              </div>
              <div class="text-sm text-gray-600 dark:text-gray-400">
                Active Users
              </div>
            </div>
          </UCard>

          <UCard>
            <div class="p-6 text-center">
              <div class="text-3xl font-bold text-purple-600 dark:text-purple-400 mb-1">
                4
              </div>
              <div class="text-sm text-gray-600 dark:text-gray-400">
                System Roles
              </div>
            </div>
          </UCard>

          <UCard>
            <div class="p-6 text-center">
              <div class="text-3xl font-bold text-green-600 dark:text-green-400 mb-1">
                <Icon name="i-heroicons-check-circle" class="w-8 h-8 inline" />
              </div>
              <div class="text-sm text-gray-600 dark:text-gray-400">
                System Status
              </div>
            </div>
          </UCard>

          <UCard>
            <div class="p-6 text-center">
              <div class="text-3xl font-bold text-orange-600 dark:text-orange-400 mb-1">
                {{ lastUpdate }}
              </div>
              <div class="text-sm text-gray-600 dark:text-gray-400">
                Last Sync
              </div>
            </div>
          </UCard>
        </div>
      </div>
  </div>
</template>

<script setup lang="ts">
// Page meta
definePageMeta({
  title: 'Admin Panel',
  description: 'Manage GHOST application settings and users'
})

const { isAdmin, can } = useUserRoles()

// Check if user has admin access
const hasAdminAccess = computed(() => isAdmin.value)

// Mock stats - replace with actual data later
const totalUsers = ref('127')
const lastUpdate = ref('2h ago')
</script>
