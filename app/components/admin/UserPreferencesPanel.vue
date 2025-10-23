<template>
  <div>
    <!-- Header -->
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-1">
          User Preferences
        </h1>
        <p class="text-sm text-gray-600 dark:text-gray-400">
          View and manage user preferences for all users
        </p>
      </div>
    </div>

    <!-- Info Alert -->
    <UAlert
      color="blue"
      variant="soft"
      icon="i-heroicons-information-circle"
      class="mb-6"
      title="About User Preferences"
      description="User preferences include timezone settings, last login times, and custom settings. Changes to user preferences will affect how the application displays information for that user."
    />

    <!-- User Preferences List -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
            All Users
          </h2>
          <UBadge color="gray" variant="soft">
            {{ allPreferences.length }} {{ allPreferences.length === 1 ? 'user' : 'users' }}
          </UBadge>
        </div>
      </template>

      <!-- Loading State -->
      <div v-if="loading" class="text-center py-12">
        <Icon name="i-heroicons-arrow-path" class="w-8 h-8 text-gray-400 animate-spin mx-auto mb-2" />
        <p class="text-gray-500 dark:text-gray-400">Loading user preferences...</p>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="text-center py-12">
        <Icon name="i-heroicons-exclamation-triangle" class="w-16 h-16 text-red-500 mx-auto mb-4" />
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">Failed to Load Preferences</h3>
        <p class="text-gray-500 dark:text-gray-400 mb-6">{{ error }}</p>
        <UButton @click="loadPreferences()" color="blue">
          Try Again
        </UButton>
      </div>

      <!-- Empty State -->
      <div v-else-if="allPreferences.length === 0" class="text-center py-12">
        <Icon name="i-heroicons-users" class="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
          No User Preferences Yet
        </h3>
        <p class="text-gray-500 dark:text-gray-400 mb-6">
          User preferences will appear here once users log in and their settings are created.
        </p>
      </div>

      <!-- Preferences Table -->
      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="border-b border-gray-200 dark:border-gray-700">
            <tr class="text-left">
              <th class="pb-3 pr-4 font-medium text-gray-700 dark:text-gray-300">User</th>
              <th class="pb-3 pr-4 font-medium text-gray-700 dark:text-gray-300">Timezone</th>
              <th class="pb-3 pr-4 font-medium text-gray-700 dark:text-gray-300">Last Login</th>
              <th class="pb-3 pr-4 font-medium text-gray-700 dark:text-gray-300">Created</th>
              <th class="pb-3 font-medium text-gray-700 dark:text-gray-300">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
            <tr v-for="prefs in allPreferences" :key="prefs.userId" class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <td class="py-3 pr-4">
                <div class="flex items-center gap-2">
                  <UserAvatar :email="prefs.userId" size="sm" />
                  <div>
                    <div class="font-medium text-gray-900 dark:text-white">{{ prefs.userId }}</div>
                  </div>
                </div>
              </td>
              <td class="py-3 pr-4">
                <UBadge color="blue" variant="soft" size="sm">
                  {{ prefs.timezone }}
                </UBadge>
              </td>
              <td class="py-3 pr-4 text-gray-600 dark:text-gray-400 text-xs">
                {{ prefs.lastLoginAt ? formatDate(prefs.lastLoginAt) : 'Never' }}
              </td>
              <td class="py-3 pr-4 text-gray-600 dark:text-gray-400 text-xs">
                {{ formatDate(prefs.createdAt) }}
              </td>
              <td class="py-3">
                <div class="flex items-center gap-2">
                  <UButton
                    color="blue"
                    variant="ghost"
                    size="xs"
                    icon="i-heroicons-pencil"
                    @click="editPreferences(prefs)"
                  >
                    Edit
                  </UButton>
                  <UButton
                    color="red"
                    variant="ghost"
                    size="xs"
                    icon="i-heroicons-trash"
                    @click="confirmDelete(prefs)"
                  >
                    Delete
                  </UButton>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>

    <!-- Edit Modal -->
    <UModal v-model="showEditModal" :ui="{ width: 'sm:max-w-md' }">
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
            Edit User Preferences
          </h3>
        </template>

        <div v-if="editingPrefs" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              User
            </label>
            <div class="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-md">
              <UserAvatar :email="editingPrefs.userId" size="sm" />
              <span class="text-sm text-gray-900 dark:text-white">{{ editingPrefs.userId }}</span>
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Timezone
            </label>
            <USelect
              v-model="editTimezone"
              :options="commonTimezones"
              option-attribute="label"
              value-attribute="value"
              size="lg"
            />
          </div>
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="gray" variant="ghost" @click="showEditModal = false">
              Cancel
            </UButton>
            <UButton color="blue" :loading="saving" @click="saveEdit">
              Save Changes
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Delete Confirmation Modal -->
    <UModal v-model="showDeleteModal" :ui="{ width: 'sm:max-w-md' }">
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
            Delete User Preferences
          </h3>
        </template>

        <div class="space-y-4">
          <p class="text-gray-700 dark:text-gray-300">
            Are you sure you want to delete preferences for <strong>{{ deletingPrefs?.userId }}</strong>?
          </p>
          <p class="text-sm text-gray-600 dark:text-gray-400">
            This will reset all settings to defaults. Preferences will be recreated automatically the next time the user logs in.
          </p>
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="gray" variant="ghost" @click="showDeleteModal = false">
              Cancel
            </UButton>
            <UButton color="red" :loading="deleting" @click="confirmDeleteAction">
              Delete Preferences
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import type { UserPreferences } from '#shared/types/user-preferences'
import { COMMON_TIMEZONES } from '#shared/types/user-preferences'

// State
const allPreferences = ref<UserPreferences[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const showEditModal = ref(false)
const showDeleteModal = ref(false)
const editingPrefs = ref<UserPreferences | null>(null)
const deletingPrefs = ref<UserPreferences | null>(null)
const editTimezone = ref<string>('')
const saving = ref(false)
const deleting = ref(false)
const commonTimezones = COMMON_TIMEZONES
const toast = useToast()

// Load all preferences
async function loadPreferences() {
  loading.value = true
  error.value = null

  try {
    const response = await $fetch<{ data: { preferences: UserPreferences[]; total: number } }>('/api/admin/user-preferences')
    allPreferences.value = response.data.preferences
  } catch (err: any) {
    console.error('Failed to load user preferences:', err)
    error.value = err.message || 'Failed to load user preferences'
  } finally {
    loading.value = false
  }
}

// Edit preferences
function editPreferences(prefs: UserPreferences) {
  editingPrefs.value = prefs
  editTimezone.value = prefs.timezone
  showEditModal.value = true
}

// Save edit
async function saveEdit() {
  if (!editingPrefs.value) return

  saving.value = true
  try {
    await $fetch(`/api/admin/user-preferences/${encodeURIComponent(editingPrefs.value.userId)}`, {
      method: 'PATCH',
      body: {
        timezone: editTimezone.value
      }
    })

    toast.add({
      title: 'Preferences Updated',
      description: `Timezone updated for ${editingPrefs.value.userId}`,
      color: 'green',
      icon: 'i-heroicons-check-circle'
    })

    showEditModal.value = false
    await loadPreferences()
  } catch (err: any) {
    toast.add({
      title: 'Update Failed',
      description: err.message || 'Failed to update preferences',
      color: 'red',
      icon: 'i-heroicons-x-circle'
    })
  } finally {
    saving.value = false
  }
}

// Confirm delete
function confirmDelete(prefs: UserPreferences) {
  deletingPrefs.value = prefs
  showDeleteModal.value = true
}

// Delete action
async function confirmDeleteAction() {
  if (!deletingPrefs.value) return

  deleting.value = true
  try {
    await $fetch(`/api/admin/user-preferences/${encodeURIComponent(deletingPrefs.value.userId)}`, {
      method: 'DELETE'
    })

    toast.add({
      title: 'Preferences Deleted',
      description: `Preferences deleted for ${deletingPrefs.value.userId}`,
      color: 'green',
      icon: 'i-heroicons-check-circle'
    })

    showDeleteModal.value = false
    await loadPreferences()
  } catch (err: any) {
    toast.add({
      title: 'Delete Failed',
      description: err.message || 'Failed to delete preferences',
      color: 'red',
      icon: 'i-heroicons-x-circle'
    })
  } finally {
    deleting.value = false
  }
}

// Format date
function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days} days ago`
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`
    if (days < 365) return `${Math.floor(days / 30)} months ago`

    return date.toLocaleDateString()
  } catch {
    return dateStr
  }
}

// Load on mount
onMounted(() => {
  loadPreferences()
})
</script>
