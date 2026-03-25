<template>
  <div class="space-y-4">
    <!-- Roles Filter -->
    <div class="space-y-2">
      <label class="text-xs font-medium text-gray-400">AWS Roles</label>
      <USelectMenu
        v-model="selectedRoles"
        :options="roleOptions"
        :loading="optionsLoading"
        multiple
        searchable
        placeholder="All roles..."
        size="sm"
        class="w-full"
      >
        <template #label>
          <span v-if="optionsLoading" class="text-gray-500">Loading roles...</span>
          <span v-else-if="selectedRoles.length === 0" class="text-gray-500">All roles</span>
          <span v-else class="text-gray-300">{{ selectedRoles.length }} selected</span>
        </template>
      </USelectMenu>
    </div>

    <!-- User Search -->
    <div class="space-y-2">
      <label class="text-xs font-medium text-gray-400">Search Users</label>
      <UInput
        v-model="filters.userSearch"
        placeholder="Name, email, or UPN..."
        icon="i-heroicons-magnifying-glass"
        size="sm"
        class="w-full"
      />
    </div>

    <!-- Activity Filter -->
    <div class="space-y-2">
      <label class="text-xs font-medium text-gray-400">Activity Filter</label>

      <div class="flex items-center justify-between p-2 bg-gray-900/50 rounded-lg border border-gray-700">
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-user-circle" class="w-4 h-4 text-gray-400" />
          <span class="text-xs text-gray-300">Active Users Only</span>
        </div>
        <UToggle v-model="filters.activeOnly" size="xs" />
      </div>

      <!-- Lookback Period (only shown when active filter is on) -->
      <div v-if="filters.activeOnly" class="pl-6 space-y-2">
        <label class="text-xs text-gray-500">Signed in within</label>
        <USelectMenu
          v-model="selectedLookbackDays"
          :options="lookbackOptions"
          size="sm"
          class="w-full"
        />
      </div>
    </div>

    <!-- Departments Filter -->
    <div class="space-y-2">
      <label class="text-xs font-medium text-gray-400">Departments</label>
      <USelectMenu
        v-model="selectedDepartments"
        :options="departmentOptions"
        :loading="optionsLoading"
        multiple
        searchable
        placeholder="All departments..."
        size="sm"
        class="w-full"
      >
        <template #label>
          <span v-if="optionsLoading" class="text-gray-500">Loading departments...</span>
          <span v-else-if="selectedDepartments.length === 0" class="text-gray-500">All departments</span>
          <span v-else class="text-gray-300">{{ selectedDepartments.length }} selected</span>
        </template>
      </USelectMenu>
    </div>

    <!-- Quick Filters -->
    <div class="pt-3 border-t border-gray-700 space-y-2">
      <div class="text-xs font-medium text-gray-400">Quick Filters</div>
      <div class="flex flex-wrap gap-2">
        <UButton
          size="xs"
          color="gray"
          variant="soft"
          icon="i-heroicons-shield-check"
          @click="setAdminUsers"
        >
          Admins
        </UButton>
        <UButton
          size="xs"
          color="gray"
          variant="soft"
          icon="i-heroicons-clock"
          @click="setInactiveUsers"
        >
          Inactive 90d+
        </UButton>
        <UButton
          size="xs"
          color="gray"
          variant="soft"
          icon="i-heroicons-arrow-path"
          @click="clearFilters"
        >
          Clear
        </UButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { EntraUsersDatasetFilters } from '~/shared/types/dataset-reports'

const logger = createLogger('EntraUsersFilters')

const filters = defineModel<EntraUsersDatasetFilters>({
  default: () => ({
    roles: [],
    userSearch: '',
    activeOnly: false,
    departments: [],
    lookbackDays: 30
  })
})

// Computed for two-way binding with USelectMenu
const selectedRoles = computed({
  get: () => filters.value.roles || [],
  set: (val) => {
    filters.value.roles = val.map(v => typeof v === 'object' ? v.value : v)
  }
})

const selectedDepartments = computed({
  get: () => filters.value.departments || [],
  set: (val) => {
    filters.value.departments = val.map(v => typeof v === 'object' ? v.value : v)
  }
})

const selectedLookbackDays = computed({
  get: () => {
    const days = filters.value.lookbackDays || 30
    return lookbackOptions.find(opt => opt.value === days) || lookbackOptions[0]
  },
  set: (val) => {
    filters.value.lookbackDays = typeof val === 'object' ? val.value : val
  }
})

// Fetch dynamic filter options from API
const roleOptions = ref<Array<{ label: string; value: string }>>([])
const departmentOptions = ref<Array<{ label: string; value: string }>>([])
const optionsLoading = ref(false)

// Load filter options on mount
onMounted(async () => {
  optionsLoading.value = true
  try {
    const response = await $fetch<{
      success: boolean
      data: {
        roles: Array<{ label: string; value: string }>
        departments: Array<{ label: string; value: string }>
      }
    }>('/api/dataset-reports/entra-filter-options')

    if (response.success) {
      roleOptions.value = response.data.roles
      departmentOptions.value = response.data.departments
    }
  } catch (error) {
    logger.error('Failed to load Entra filter options:', error)
    // Fall back to empty arrays - user can still use search and other filters
    roleOptions.value = []
    departmentOptions.value = []
  } finally {
    optionsLoading.value = false
  }
})

const lookbackOptions = [
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
  { label: '60 days', value: 60 },
  { label: '90 days', value: 90 },
  { label: '180 days', value: 180 },
  { label: '1 year', value: 365 }
]

// Quick filter functions
function setAdminUsers() {
  // Find the first admin-like role from available options
  const adminRole = roleOptions.value.find(r =>
    r.value.toLowerCase().includes('admin') ||
    r.value.toLowerCase().includes('administrator')
  )

  filters.value.roles = adminRole ? [adminRole.value] : []
  filters.value.activeOnly = false
  filters.value.userSearch = ''
  filters.value.departments = []
}

function setInactiveUsers() {
  filters.value.activeOnly = true
  filters.value.lookbackDays = 90
  filters.value.roles = []
  filters.value.userSearch = ''
  filters.value.departments = []
}

function clearFilters() {
  filters.value = {
    roles: [],
    userSearch: '',
    activeOnly: false,
    departments: [],
    lookbackDays: 30
  }
}
</script>
