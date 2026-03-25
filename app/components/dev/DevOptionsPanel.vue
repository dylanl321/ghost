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
        class="fixed bottom-6 left-6 z-50 w-96 max-h-[85vh] flex flex-col bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border-2 border-amber-400 dark:border-amber-500"
      >
        <!-- Header -->
        <div class="flex items-center justify-between p-4 border-b border-amber-200 dark:border-amber-700 bg-gradient-to-r from-amber-500 to-amber-600 rounded-t-xl shrink-0">
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

        <!-- Scrollable Content -->
        <div class="p-4 space-y-4 overflow-y-auto min-h-0">
          <!-- Admin Toggle -->
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-gray-900 dark:text-white">Admin Privileges</p>
              <p class="text-xs text-gray-500 dark:text-gray-400">AWS-Product-Team group</p>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-xs" :class="isAdminEnabled ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'">
                {{ isAdminEnabled ? 'On' : 'Off' }}
              </span>
              <UToggle
                :model-value="isAdminEnabled"
                @update:model-value="toggleAdmin"
              />
            </div>
          </div>

          <hr class="border-gray-200 dark:border-gray-700" />

          <!-- Account Selection -->
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Account Access</p>
              <UBadge :color="selectedAccountIds.length > 0 ? 'blue' : 'gray'" variant="soft" size="xs">
                {{ selectedAccountIds.length }} selected
              </UBadge>
            </div>

            <!-- Search accounts -->
            <UInput
              v-model="accountSearch"
              icon="i-heroicons-magnifying-glass"
              placeholder="Search accounts..."
              size="sm"
              :ui="{ icon: { trailing: { pointer: '' } } }"
            >
              <template #trailing>
                <UButton
                  v-if="accountSearch"
                  color="gray"
                  variant="link"
                  icon="i-heroicons-x-mark-20-solid"
                  :padded="false"
                  @click="accountSearch = ''"
                />
              </template>
            </UInput>

            <!-- Quick actions -->
            <div class="flex gap-2">
              <UButton size="xs" variant="soft" color="blue" @click="selectAllVisible" :disabled="filteredAccounts.length === 0">
                Select All{{ accountSearch ? ' Filtered' : '' }}
              </UButton>
              <UButton size="xs" variant="soft" color="gray" @click="deselectAll" :disabled="selectedAccountIds.length === 0">
                Clear All
              </UButton>
            </div>

            <!-- Account list -->
            <div class="max-h-48 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
              <div v-if="filteredAccounts.length === 0" class="p-3 text-center text-xs text-gray-400">
                <template v-if="!enclavesLoaded">
                  <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin mr-1" />
                  Loading accounts...
                </template>
                <template v-else-if="accountSearch">
                  No accounts match "{{ accountSearch }}"
                </template>
                <template v-else>
                  No accounts available
                </template>
              </div>

              <label
                v-for="account in filteredAccounts"
                :key="account.accountId"
                class="flex items-start gap-2 p-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  :checked="selectedAccountIds.includes(account.accountId)"
                  @change="toggleAccount(account.accountId)"
                  class="mt-1 rounded border-gray-300 dark:border-gray-600 text-amber-500 focus:ring-amber-500"
                />
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {{ account.projectName || account.accountName || 'Unnamed' }}
                  </p>
                  <div class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <span class="text-blue-400">{{ account.awsStandardAccountID || account.accountId }}</span>
                    <span v-if="account.awsGovCloudAccountID" class="text-orange-400">{{ account.awsGovCloudAccountID }}</span>
                  </div>
                </div>
                <UBadge
                  v-if="account.accountStatus"
                  :color="account.accountStatus === 'ACTIVE' ? 'green' : 'gray'"
                  variant="subtle"
                  size="xs"
                  class="shrink-0 mt-1"
                >
                  {{ account.accountStatus }}
                </UBadge>
              </label>
            </div>
          </div>

          <hr class="border-gray-200 dark:border-gray-700" />

          <!-- Role Selection -->
          <div class="space-y-3">
            <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Assigned Roles</p>
            <p class="text-xs text-gray-400 dark:text-gray-500">Roles applied to all selected accounts</p>

            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="role in availableRoles"
                :key="role"
                @click="toggleRole(role)"
                class="px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-150"
                :class="selectedRoles.includes(role)
                  ? 'bg-amber-500 text-white shadow-sm'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'"
              >
                {{ role }}
              </button>
            </div>
          </div>

          <hr class="border-gray-200 dark:border-gray-700" />

          <!-- Apply Button -->
          <UButton
            color="amber"
            block
            @click="applyDevSettings"
            :loading="isApplying"
            :disabled="selectedAccountIds.length === 0 && selectedRoles.length === 0"
          >
            <UIcon name="i-heroicons-check" class="w-4 h-4 mr-2" />
            Apply ({{ selectedAccountIds.length }} accounts, {{ selectedRoles.length }} roles)
          </UButton>

          <hr class="border-gray-200 dark:border-gray-700" />

          <!-- Reset Actions -->
          <div class="space-y-2">
            <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Reset Actions</p>

            <div class="flex gap-2">
              <UButton
                color="red"
                variant="soft"
                size="sm"
                class="flex-1"
                @click="confirmResetPreferences"
                :loading="isResetting"
              >
                <UIcon name="i-heroicons-trash" class="w-3 h-3 mr-1" />
                Reset All
              </UButton>

              <UButton
                color="gray"
                variant="soft"
                size="sm"
                class="flex-1"
                @click="confirmClearCache"
                :loading="isClearing"
              >
                <UIcon name="i-heroicons-archive-box-x-mark" class="w-3 h-3 mr-1" />
                Clear Cache
              </UButton>
            </div>
          </div>

          <!-- Status Info -->
          <div class="p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg space-y-1">
            <p class="text-xs text-amber-800 dark:text-amber-200">
              <UIcon name="i-heroicons-information-circle" class="w-3 h-3 inline mr-1" />
              Dev auth mode — panel only visible in development
            </p>
            <p v-if="userGroupStore.myAccountIds.length > 0" class="text-xs text-amber-700 dark:text-amber-300">
              Active: {{ userGroupStore.myAccountIds.length }} accounts, {{ Object.keys(userGroupStore.awsRoles).length }} role entries
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
const logger = createLogger('DevOptionsPanel')

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
const isApplying = ref(false)

// Account search
const accountSearch = ref('')

// Selected accounts and roles (local state before applying)
const selectedAccountIds = ref<string[]>([])
const selectedRoles = ref<string[]>(['IAMAdmin', 'ReadOnly'])

// Standard AWS SSO roles used in the GHOST environment
const availableRoles = [
  'IAMAdmin',
  'PowerUser',
  'ReadOnly',
  'DatabaseAdmin',
  'NetworkAdmin',
  'SystemAdmin',
  'ViewOnly',
  'SecurityAudit'
]

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

// Whether enclave data has been loaded
const enclavesLoaded = computed(() => Object.keys(enclaveStore.enclaves).length > 0)

// Sorted and filtered account list
const sortedAccounts = computed(() => {
  return Object.values(enclaveStore.enclaves)
    .filter(a => {
      const status = (a.enclaveStatus || '').toLowerCase()
      return !status.includes('decommission')
    })
    .sort((a, b) => {
      const nameA = (a.projectName || a.accountName || '').toLowerCase()
      const nameB = (b.projectName || b.accountName || '').toLowerCase()
      return nameA.localeCompare(nameB)
    })
})

const filteredAccounts = computed(() => {
  if (!accountSearch.value) return sortedAccounts.value
  const query = accountSearch.value.toLowerCase()
  return sortedAccounts.value.filter(a =>
    (a.projectName || '').toLowerCase().includes(query) ||
    (a.accountName || '').toLowerCase().includes(query) ||
    (a.accountId || '').includes(query) ||
    (a.awsStandardAccountID || '').includes(query) ||
    (a.awsGovCloudAccountID || '').includes(query)
  )
})

// Initialize selected state from current store when panel opens
watch(isOpen, (opened) => {
  if (opened) {
    // Sync selected accounts from the current store state
    selectedAccountIds.value = [...userGroupStore.myAccountIds]

    // Sync roles from current store state
    if (Object.keys(userGroupStore.awsRoles).length > 0) {
      const currentRoles = new Set<string>()
      for (const roleInfo of Object.values(userGroupStore.awsRoles)) {
        roleInfo.roles.forEach(r => currentRoles.add(r))
      }
      if (currentRoles.size > 0) {
        selectedRoles.value = Array.from(currentRoles)
      }
    }

    // Ensure enclaves are loaded
    if (!enclavesLoaded.value) {
      enclaveStore.initialize()
    }
  }
})

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

// Toggle an account in the selection
function toggleAccount(accountId: string) {
  const idx = selectedAccountIds.value.indexOf(accountId)
  if (idx >= 0) {
    selectedAccountIds.value.splice(idx, 1)
  } else {
    selectedAccountIds.value.push(accountId)
  }
}

// Toggle a role in the selection
function toggleRole(role: string) {
  const idx = selectedRoles.value.indexOf(role)
  if (idx >= 0) {
    selectedRoles.value.splice(idx, 1)
  } else {
    selectedRoles.value.push(role)
  }
}

// Select all visible (filtered) accounts
function selectAllVisible() {
  const visibleIds = filteredAccounts.value.map(a => a.accountId)
  const merged = new Set([...selectedAccountIds.value, ...visibleIds])
  selectedAccountIds.value = Array.from(merged)
}

// Deselect all accounts
function deselectAll() {
  selectedAccountIds.value = []
}

// Apply the dev settings to the store
async function applyDevSettings() {
  isApplying.value = true
  try {
    // Ensure enclave data is loaded
    if (!enclavesLoaded.value) {
      await enclaveStore.initialize()
    }

    // Apply accounts and roles to the user group store
    userGroupStore.setDevAccounts(
      selectedAccountIds.value,
      selectedRoles.value,
      enclaveStore.enclaves
    )

    toast.add({
      title: 'Dev Settings Applied',
      description: `${selectedAccountIds.value.length} accounts with ${selectedRoles.value.length} roles`,
      icon: 'i-heroicons-check-circle',
      color: 'green',
      timeout: 3000
    })
  } catch (error) {
    logger.error('Failed to apply dev settings:', error)
    toast.add({
      title: 'Apply Failed',
      description: 'Could not apply dev account settings',
      icon: 'i-heroicons-x-circle',
      color: 'red',
      timeout: 3000
    })
  } finally {
    isApplying.value = false
  }
}

// Confirm reset preferences
function confirmResetPreferences() {
  confirmTitle.value = 'Reset Preferences'
  confirmMessage.value = 'This will clear all user preferences, account selections, and cached data.'
  confirmColor.value = 'red'
  confirmIcon.value = 'i-heroicons-exclamation-triangle'
  confirmIconClass.value = 'text-red-500'
  pendingAction.value = 'reset'
  showConfirmModal.value = true
}

// Confirm clear cache
function confirmClearCache() {
  confirmTitle.value = 'Clear Cached Data'
  confirmMessage.value = 'This will clear cached enclave data and reload it from the server. Your account selections will be preserved.'
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

    // Reset local state
    selectedAccountIds.value = []
    selectedRoles.value = ['IAMAdmin', 'ReadOnly']

    // Reload enclave data
    await enclaveStore.initialize(true)

    toast.add({
      title: 'Preferences Reset',
      description: 'All preferences and account selections have been cleared',
      icon: 'i-heroicons-check-circle',
      color: 'green',
      timeout: 3000
    })
  } catch (error) {
    logger.error('Failed to reset preferences:', error)
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
    // Save current selections
    const currentAccountIds = [...selectedAccountIds.value]
    const currentRoles = [...selectedRoles.value]
    const currentGroups = [...userGroupStore.allEntraGroups]

    // Clear cache
    enclaveStore.clear()

    // Reload enclave data
    await enclaveStore.initialize(true)

    // Re-apply groups
    userGroupStore.setDevGroups(currentGroups)

    // Re-apply account selections if we had any
    if (currentAccountIds.length > 0) {
      userGroupStore.setDevAccounts(currentAccountIds, currentRoles, enclaveStore.enclaves)
    }

    toast.add({
      title: 'Cache Cleared',
      description: 'Cached data refreshed, selections preserved',
      icon: 'i-heroicons-check-circle',
      color: 'green',
      timeout: 3000
    })
  } catch (error) {
    logger.error('Failed to clear cache:', error)
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
