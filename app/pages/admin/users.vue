<template>
  <div class="container mx-auto px-6 py-8 max-w-7xl">
    <!-- Header with Back Button -->
    <div class="mb-6">
      <UButton
        color="gray"
        variant="ghost"
        icon="i-heroicons-arrow-left"
        @click="navigateTo('/admin')"
        class="mb-4"
      >
        Back to Dashboard
      </UButton>

      <div class="flex items-center gap-3 mb-2">
        <div class="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
          <Icon name="i-heroicons-user-group" class="w-6 h-6 text-blue-600 dark:text-blue-400" />
        </div>
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
          User Management
        </h1>
      </div>
      <p class="text-gray-600 dark:text-gray-400">
        Manage user preferences, roles, and permissions
      </p>
    </div>

    <!-- Tabs -->
    <UTabs
      v-model="activeTab"
      :items="tabs"
      class="mb-6"
    />

    <!-- Tab Content -->
    <div class="mt-6">
      <UserPreferencesPanel v-if="activeTab === 0" />
      <RolesPanel v-else-if="activeTab === 1" />
    </div>
  </div>
</template>

<script setup lang="ts">
import UserPreferencesPanel from '~/components/admin/UserPreferencesPanel.vue'
import RolesPanel from '~/components/admin/RolesPanel.vue'

// Page meta - using admin layout
definePageMeta({
  layout: 'admin',
  title: 'User Management',
  description: 'Manage user preferences, roles, and permissions'
})

// Active tab state
const activeTab = ref(0)

// Tab configuration
const tabs = [
  {
    label: 'User Preferences',
    icon: 'i-heroicons-user-circle'
  },
  {
    label: 'Roles & Permissions',
    icon: 'i-heroicons-shield-check'
  }
]
</script>
