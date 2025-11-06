<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <!-- Access Denied -->
    <div v-if="!hasAdminAccess" class="flex items-center justify-center min-h-screen p-6">
      <UCard class="max-w-2xl">
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
    <div v-else class="flex">
      <!-- Sidebar -->
      <aside class="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 min-h-screen">
        <div class="p-6">
          <h2 class="text-lg font-bold text-gray-900 dark:text-white mb-1">
            Admin Panel
          </h2>
          <p class="text-xs text-gray-600 dark:text-gray-400">
            System Management
          </p>
        </div>

        <nav class="px-3 space-y-1">
          <button
            @click="activeSection = 'sharelinks'"
            class="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors"
            :class="activeSection === 'sharelinks'
              ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'"
          >
            <Icon name="i-heroicons-link" class="w-5 h-5" />
            Share Links
          </button>

          <button
            @click="activeSection = 'apikeys'"
            class="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors"
            :class="activeSection === 'apikeys'
              ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'"
          >
            <Icon name="i-heroicons-key" class="w-5 h-5" />
            API Keys
          </button>

          <button
            @click="activeSection = 'roles'"
            class="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors"
            :class="activeSection === 'roles'
              ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'"
          >
            <Icon name="i-heroicons-shield-check" class="w-5 h-5" />
            Role Management
          </button>

          <button
            @click="activeSection = 'logs'"
            class="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors"
            :class="activeSection === 'logs'
              ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'"
          >
            <Icon name="i-heroicons-document-text" class="w-5 h-5" />
            System Logs
          </button>

          <button
            @click="activeSection = 'issues'"
            class="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors"
            :class="activeSection === 'issues'
              ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'"
          >
            <Icon name="i-heroicons-exclamation-triangle" class="w-5 h-5" />
            Issues & Tickets
          </button>

          <button
            @click="activeSection = 'scheduledreports'"
            class="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors"
            :class="activeSection === 'scheduledreports'
              ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'"
          >
            <Icon name="i-heroicons-calendar-days" class="w-5 h-5" />
            Scheduled Reports
          </button>

          <button
            @click="activeSection = 'storedreports'"
            class="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors"
            :class="activeSection === 'storedreports'
              ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'"
          >
            <Icon name="i-heroicons-document-duplicate" class="w-5 h-5" />
            Stored Reports
          </button>

          <button
            @click="activeSection = 'userpreferences'"
            class="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors"
            :class="activeSection === 'userpreferences'
              ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'"
          >
            <Icon name="i-heroicons-user-circle" class="w-5 h-5" />
            User Preferences
          </button>

          <button
            @click="activeSection = 'validation'"
            class="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors"
            :class="activeSection === 'validation'
              ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'"
          >
            <Icon name="i-heroicons-clipboard-document-check" class="w-5 h-5" />
            Data Validation
          </button>

          <div class="px-3 py-2 opacity-50">
            <div class="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
              <Icon name="i-heroicons-chart-bar" class="w-5 h-5" />
              User Activity
              <UBadge color="gray" size="xs" variant="soft">Soon</UBadge>
            </div>
          </div>

          <div class="px-3 py-2 opacity-50">
            <div class="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
              <Icon name="i-heroicons-cog-6-tooth" class="w-5 h-5" />
              System Settings
              <UBadge color="gray" size="xs" variant="soft">Soon</UBadge>
            </div>
          </div>
        </nav>

        <!-- Quick Stats in Sidebar -->
        <div class="p-3 mt-6">
          <div class="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 space-y-3">
            <div>
              <div class="text-xs text-gray-600 dark:text-gray-400">Active Users</div>
              <div class="text-xl font-bold text-gray-900 dark:text-white">{{ totalUsers }}</div>
            </div>
            <div>
              <div class="text-xs text-gray-600 dark:text-gray-400">Share Links</div>
              <div class="text-xl font-bold text-gray-900 dark:text-white">{{ shortlinksTotal }}</div>
            </div>
            <div>
              <div class="text-xs text-gray-600 dark:text-gray-400">System Status</div>
              <div class="flex items-center gap-2">
                <div class="w-2 h-2 bg-green-500 rounded-full"></div>
                <span class="text-sm font-medium text-green-600 dark:text-green-400">Online</span>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <!-- Main Content -->
      <main class="flex-1 p-8">
        <!-- Dynamic Component Loading -->
        <ShareLinksPanel v-if="activeSection === 'sharelinks'" />
        <ApiKeysPanel v-else-if="activeSection === 'apikeys'" />
        <RolesPanel v-else-if="activeSection === 'roles'" />
        <SystemLogsPanel v-else-if="activeSection === 'logs'" />
        <IssuesPanel v-else-if="activeSection === 'issues'" />
        <ScheduledReportsPanel v-else-if="activeSection === 'scheduledreports'" />
        <StoredReportsPanel v-else-if="activeSection === 'storedreports'" />
        <UserPreferencesPanel v-else-if="activeSection === 'userpreferences'" />
        <ValidationPanel v-else-if="activeSection === 'validation'" />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import ShareLinksPanel from '~/components/admin/ShareLinksPanel.vue'
import ApiKeysPanel from '~/components/admin/ApiKeysPanel.vue'
import RolesPanel from '~/components/admin/RolesPanel.vue'
import SystemLogsPanel from '~/components/admin/SystemLogsPanel.vue'
import IssuesPanel from '~/components/admin/IssuesPanel.vue'
import ScheduledReportsPanel from '~/components/admin/ScheduledReportsPanel.vue'
import StoredReportsPanel from '~/components/admin/StoredReportsPanel.vue'
import UserPreferencesPanel from '~/components/admin/UserPreferencesPanel.vue'
import ValidationPanel from '~/components/admin/ValidationPanel.vue'

// Page meta
definePageMeta({
  title: 'Admin Panel',
  description: 'Manage GHOST application settings and system configuration'
})

const { isAdmin } = useUserRoles()

// Check if user has admin access
const hasAdminAccess = computed(() => isAdmin.value)

// Active section state
const activeSection = ref('sharelinks')

// Shortlinks data for stats (only loaded for sidebar stats)
const { total: shortlinksTotal, fetchShortlinks } = useShortlinks()

// Stats
const totalUsers = ref('127')

// Load initial stats
onMounted(() => {
  if (hasAdminAccess.value) {
    // Fetch shortlinks count for sidebar stats
    fetchShortlinks({ limit: 1 })
  }
})
</script>
