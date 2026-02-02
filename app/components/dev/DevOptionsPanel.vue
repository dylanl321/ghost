<template>
  <!-- Only render when dev auth is active -->
  <div v-if="isDevAuthActive">
    <!-- Floating Trigger Button -->
    <div v-if="!isOpen" class="fixed bottom-6 left-6 z-50">
      <button
        @click="isOpen = true"
        class="w-14 h-14 rounded-full bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center group hover:scale-110 active:scale-105"
        title="Open Developer Options"
      >
        <UIcon name="i-heroicons-wrench-screwdriver" class="w-6 h-6" />
        <span class="absolute -top-1 -right-1 px-1.5 py-0.5 text-[10px] font-bold bg-amber-700 rounded-full">
          DEV
        </span>
      </button>
    </div>

    <!-- Panel -->
    <Transition
      enter-active-class="transition-all duration-300 ease-out"
      enter-from-class="opacity-0 translate-y-4 scale-95"
      enter-to-class="opacity-100 translate-y-0 scale-100"
      leave-active-class="transition-all duration-200 ease-in"
      leave-from-class="opacity-100 translate-y-0 scale-100"
      leave-to-class="opacity-0 translate-y-4 scale-95"
    >
      <div
        v-if="isOpen"
        class="fixed bottom-6 left-6 z-50 w-80 flex flex-col bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border-2 border-amber-400 dark:border-amber-500"
      >
        <!-- Header -->
        <div class="flex items-center justify-between p-4 border-b border-amber-200 dark:border-amber-700 bg-gradient-to-r from-amber-500 to-amber-600 rounded-t-xl">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
              <UIcon name="i-heroicons-wrench-screwdriver" class="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 class="text-white font-semibold text-sm">DEV MODE</h3>
              <p class="text-amber-100 text-xs">Development options</p>
            </div>
          </div>
          <button
            @click="isOpen = false"
            class="p-1.5 hover:bg-white/10 active:bg-white/20 rounded-lg transition-all duration-150 active:scale-95"
            title="Close"
          >
            <UIcon name="i-heroicons-x-mark" class="w-5 h-5 text-white" />
          </button>
        </div>

        <!-- Content -->
        <div class="p-4 space-y-4">
          <!-- Admin Toggle -->
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-gray-900 dark:text-white">Admin Privileges</p>
              <p class="text-xs text-gray-500 dark:text-gray-400">Toggle admin access</p>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-xs" :class="isAdminEnabled ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'">
                {{ isAdminEnabled ? 'Enabled' : 'Disabled' }}
              </span>
              <UToggle
                :model-value="isAdminEnabled"
                @update:model-value="toggleAdmin"
              />
            </div>
          </div>

          <hr class="border-gray-200 dark:border-gray-700" />

          <!-- Reset Actions -->
          <div class="space-y-2">
            <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Reset Actions</p>

            <UButton
              color="red"
              variant="soft"
              block
              @click="confirmResetPreferences"
              :loading="isResetting"
            >
              <UIcon name="i-heroicons-trash" class="w-4 h-4 mr-2" />
              Reset Preferences
            </UButton>

            <UButton
              color="gray"
              variant="soft"
              block
              @click="confirmClearCache"
              :loading="isClearing"
            >
              <UIcon name="i-heroicons-archive-box-x-mark" class="w-4 h-4 mr-2" />
              Clear Cached Data
            </UButton>
          </div>

          <!-- Info -->
          <div class="p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
            <p class="text-xs text-amber-800 dark:text-amber-200">
              <UIcon name="i-heroicons-information-circle" class="w-3 h-3 inline mr-1" />
              This panel only appears in dev auth mode
            </p>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Confirmation Modal -->
    <UModal v-model="showConfirmModal">
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon :name="confirmIcon" class="w-5 h-5" :class="confirmIconClass" />
            <h3 class="text-lg font-semibold">{{ confirmTitle }}</h3>
          </div>
        </template>

        <p class="text-gray-600 dark:text-gray-300">{{ confirmMessage }}</p>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="gray" variant="soft" @click="showConfirmModal = false">
              Cancel
            </UButton>
            <UButton :color="confirmColor" @click="executeConfirmedAction">
              Confirm
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>

<script setup lang="ts">
const { user } = useOidcAuth()
const userGroupStore = useUserGroupStore()
const enclaveStore = useEnclaveStore()
const config = useRuntimeConfig()
const toast = useToast()

// Only show when using dev auth provider
const isDevAuthActive = computed(() => user.value?.provider === 'dev')

// Panel open state
const isOpen = ref(false)

// Loading states
const isResetting = ref(false)
const isClearing = ref(false)

// Confirmation modal state
const showConfirmModal = ref(false)
const confirmTitle = ref('')
const confirmMessage = ref('')
const confirmColor = ref<'red' | 'gray'>('red')
const confirmIcon = ref('i-heroicons-exclamation-triangle')
const confirmIconClass = ref('text-red-500')
const pendingAction = ref<'reset' | 'clear' | null>(null)

// Admin toggle - checks if 'AWS-Product-Team' is in allEntraGroups
const isAdminEnabled = computed(() => userGroupStore.allEntraGroups.includes('AWS-Product-Team'))

// Toggle admin privileges
function toggleAdmin(enabled: boolean) {
  const groups = [...userGroupStore.allEntraGroups]
  if (enabled && !groups.includes('AWS-Product-Team')) {
    userGroupStore.setDevGroups([...groups, 'AWS-Product-Team'])
    toast.add({
      title: 'Admin Enabled',
      description: 'AWS-Product-Team group added',
      icon: 'i-heroicons-shield-check',
      color: 'green',
      timeout: 3000
    })
  } else if (!enabled) {
    userGroupStore.setDevGroups(groups.filter(g => g !== 'AWS-Product-Team'))
    toast.add({
      title: 'Admin Disabled',
      description: 'AWS-Product-Team group removed',
      icon: 'i-heroicons-shield-exclamation',
      color: 'amber',
      timeout: 3000
    })
  }
}

// Confirm reset preferences
function confirmResetPreferences() {
  confirmTitle.value = 'Reset Preferences'
  confirmMessage.value = 'This will clear all user preferences and cached data. You will need to re-authenticate.'
  confirmColor.value = 'red'
  confirmIcon.value = 'i-heroicons-exclamation-triangle'
  confirmIconClass.value = 'text-red-500'
  pendingAction.value = 'reset'
  showConfirmModal.value = true
}

// Confirm clear cache
function confirmClearCache() {
  confirmTitle.value = 'Clear Cached Data'
  confirmMessage.value = 'This will clear cached enclave and group data. Data will be reloaded with default dev groups.'
  confirmColor.value = 'gray'
  confirmIcon.value = 'i-heroicons-archive-box-x-mark'
  confirmIconClass.value = 'text-gray-500'
  pendingAction.value = 'clear'
  showConfirmModal.value = true
}

// Execute confirmed action
async function executeConfirmedAction() {
  showConfirmModal.value = false

  if (pendingAction.value === 'reset') {
    await resetAll()
  } else if (pendingAction.value === 'clear') {
    await clearCachedData()
  }

  pendingAction.value = null
}

// Reset all preferences
async function resetAll() {
  isResetting.value = true
  try {
    userGroupStore.clear()
    enclaveStore.clear()

    // Re-initialize with default dev groups
    const devGroups = (config.public.devUserGroups || 'AWS-Product-Team')
      .split(',')
      .map((g: string) => g.trim())
      .filter((g: string) => g.length > 0)
    userGroupStore.setDevGroups(devGroups)

    toast.add({
      title: 'Preferences Reset',
      description: 'All preferences and cached data have been cleared',
      icon: 'i-heroicons-check-circle',
      color: 'green',
      timeout: 3000
    })
  } catch (error) {
    console.error('Failed to reset preferences:', error)
    toast.add({
      title: 'Reset Failed',
      description: 'An error occurred while resetting preferences',
      icon: 'i-heroicons-x-circle',
      color: 'red',
      timeout: 3000
    })
  } finally {
    isResetting.value = false
  }
}

// Clear cached data only
async function clearCachedData() {
  isClearing.value = true
  try {
    enclaveStore.clear()

    // Clear and re-initialize user groups
    const currentGroups = [...userGroupStore.allEntraGroups]
    userGroupStore.clear()

    // Re-apply current groups or defaults
    const devGroups = currentGroups.length > 0
      ? currentGroups
      : (config.public.devUserGroups || 'AWS-Product-Team')
          .split(',')
          .map((g: string) => g.trim())
          .filter((g: string) => g.length > 0)
    userGroupStore.setDevGroups(devGroups)

    toast.add({
      title: 'Cache Cleared',
      description: 'Cached data has been cleared',
      icon: 'i-heroicons-check-circle',
      color: 'green',
      timeout: 3000
    })
  } catch (error) {
    console.error('Failed to clear cache:', error)
    toast.add({
      title: 'Clear Failed',
      description: 'An error occurred while clearing cache',
      icon: 'i-heroicons-x-circle',
      color: 'red',
      timeout: 3000
    })
  } finally {
    isClearing.value = false
  }
}
</script>
