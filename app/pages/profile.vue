<template>
  <div class="p-6 max-w-[1600px] mx-auto">
    <!-- Page Header -->
    <div class="mb-6">
      <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">My Profile</h1>
      <p class="text-gray-600 dark:text-gray-400">Your account information, roles, and permissions</p>
    </div>

    <!-- Tab Navigation -->
    <UTabs v-model="selectedTab" :items="profileTabs" class="space-y-6">
      <!-- Profile & Overview Tab -->
      <template #profile>
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-4">
      <!-- Main Profile Info -->
      <UCard class="lg:col-span-2">
        <template #header>
          <div class="flex items-center justify-between p-2">
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Profile Information</h2>
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
              <h3 class="text-xl font-semibold text-gray-900 dark:text-white">{{ displayName }}</h3>
              <p class="text-gray-600 dark:text-gray-400 text-sm">{{ userEmail }}</p>
              <p v-if="username" class="text-gray-500 dark:text-gray-500 text-xs mt-1">@{{ username }}</p>
            </div>
          </div>

          <!-- Additional User Details -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div v-if="jobTitle">
              <div class="text-xs text-gray-500 dark:text-gray-500 mb-1">Job Title</div>
              <div class="text-sm text-gray-900 dark:text-gray-200">{{ jobTitle }}</div>
            </div>
            <div v-if="department">
              <div class="text-xs text-gray-500 dark:text-gray-500 mb-1">Department</div>
              <div class="text-sm text-gray-900 dark:text-gray-200">{{ department }}</div>
            </div>
            <div v-if="officeLocation">
              <div class="text-xs text-gray-500 dark:text-gray-500 mb-1">Office Location</div>
              <div class="text-sm text-gray-900 dark:text-gray-200">{{ officeLocation }}</div>
            </div>
            <div v-if="mobilePhone">
              <div class="text-xs text-gray-500 dark:text-gray-500 mb-1">Mobile Phone</div>
              <div class="text-sm text-gray-900 dark:text-gray-200">{{ mobilePhone }}</div>
            </div>
          </div>

          <!-- User Badges -->
          <div class="pt-4 border-t border-gray-200 dark:border-gray-700">
            <h4 class="text-sm font-medium text-gray-600 dark:text-gray-300 mb-3">Badges</h4>
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
      </template>

      <!-- Roles & Permissions Tab -->
      <template #roles>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
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

      <!-- Permissions Accordion -->
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold text-white">Active Permissions</h2>
            <UBadge color="gray" variant="soft" size="xs">
              {{ sortedPermissions.length }} total
            </UBadge>
          </div>
        </template>

        <UAccordion :items="permissionAccordionItems" :ui="{ wrapper: 'space-y-2' }">
          <template #default="{ item, open }">
            <UButton color="gray" variant="ghost" class="w-full">
              <template #leading>
                <Icon :name="item.icon" class="w-5 h-5" />
              </template>
              <span class="flex-1 text-left">{{ item.label }}</span>
              <template #trailing>
                <UBadge color="blue" variant="soft" size="xs">
                  {{ item.count }}
                </UBadge>
                <Icon
                  name="i-heroicons-chevron-down"
                  class="w-5 h-5 transition-transform"
                  :class="{ 'transform rotate-180': open }"
                />
              </template>
            </UButton>
          </template>
          <template #item="{ item }">
            <div class="space-y-1 p-3">
              <div
                v-for="permission in item.permissions"
                :key="permission"
                class="flex items-center gap-2 p-2 hover:bg-gray-800 rounded"
              >
                <Icon name="i-heroicons-check-circle" class="w-4 h-4 text-green-500 flex-shrink-0" />
                <span class="text-xs text-gray-300">{{ permission }}</span>
                <UTooltip v-if="getPermissionDescription(permission)" :text="getPermissionDescription(permission)">
                  <Icon name="i-heroicons-information-circle" class="w-3 h-3 text-gray-500 ml-auto" />
                </UTooltip>
              </div>
            </div>
          </template>
        </UAccordion>

        <div v-if="sortedPermissions.length === 0" class="text-center py-8 text-gray-500 text-sm">
          No permissions available
        </div>
      </UCard>
        </div>
      </template>

      <!-- AWS Access Tab -->
      <template #aws>
        <UCard class="mt-4">
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

        <!-- Group Memberships Accordion -->
        <UCard class="mt-6">
          <template #header>
            <div class="flex items-center justify-between">
              <h2 class="text-lg font-semibold text-white">Group Memberships</h2>
              <UBadge color="gray" variant="soft" size="xs">
                {{ allGroups.length }} groups
              </UBadge>
            </div>
          </template>

          <UAccordion :items="groupAccordionItems" :ui="{ wrapper: 'space-y-2' }">
            <template #default="{ item, open }">
              <UButton color="gray" variant="ghost" class="w-full">
                <template #leading>
                  <Icon :name="item.icon" class="w-5 h-5" />
                </template>
                <span class="flex-1 text-left">{{ item.label }}</span>
                <template #trailing>
                  <UBadge :color="item.color" variant="soft" size="xs">
                    {{ item.count }}
                  </UBadge>
                  <Icon
                    name="i-heroicons-chevron-down"
                    class="w-5 h-5 transition-transform"
                    :class="{ 'transform rotate-180': open }"
                  />
                </template>
              </UButton>
            </template>
            <template #item="{ item }">
              <div class="flex flex-wrap gap-2 p-3">
                <UBadge
                  v-for="group in item.groups"
                  :key="group"
                  :color="item.badgeColor"
                  variant="outline"
                  size="sm"
                >
                  {{ group }}
                </UBadge>
              </div>
            </template>
          </UAccordion>

          <div v-if="allGroups.length === 0" class="text-center py-8 text-gray-500 text-sm">
            No group memberships found
          </div>
        </UCard>
      </template>

      <!-- Scheduled Reports Tab -->
      <template #reports>
        <UCard id="scheduled-reports" class="mt-4">
      <template #header>
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-lg font-semibold text-white">Scheduled Reports</h2>
            <p class="text-sm text-gray-400 mt-1">Automate cost reports to be delivered to your inbox</p>
          </div>
          <UButton
            color="blue"
            icon="i-heroicons-plus"
            @click="openCreateModal"
            :disabled="!canCreateMore"
          >
            Create New Report
          </UButton>
        </div>
      </template>

      <div>
        <!-- Limit Warning -->
        <div v-if="!canCreateMore" class="mb-4">
          <UAlert
            color="yellow"
            variant="soft"
            icon="i-heroicons-exclamation-triangle"
            title="Report Limit Reached"
            description="You have reached the maximum number of scheduled reports (10). Delete an existing report to create a new one."
          />
        </div>

        <!-- Tabs/Filters -->
        <div class="mb-6">
          <div class="flex items-center gap-2">
            <UButton
              v-for="filter in filters"
              :key="filter.value"
              :color="currentFilter === filter.value ? 'blue' : 'gray'"
              :variant="currentFilter === filter.value ? 'solid' : 'ghost'"
              size="sm"
              @click="currentFilter = filter.value"
            >
              {{ filter.label }}
              <UBadge v-if="filter.count !== undefined" :color="currentFilter === filter.value ? 'white' : 'gray'" size="xs" class="ml-2">
                {{ filter.count }}
              </UBadge>
            </UButton>
          </div>
        </div>

        <!-- Loading State -->
        <div v-if="loading && reports.length === 0" class="flex flex-col items-center justify-center py-12">
          <Icon name="i-heroicons-arrow-path" class="w-10 h-10 animate-spin text-gray-400 mb-3" />
          <p class="text-gray-500 text-sm">Loading your scheduled reports...</p>
        </div>

        <!-- Error State -->
        <div v-else-if="reportsError" class="text-center py-12">
          <Icon name="i-heroicons-exclamation-triangle" class="w-12 h-12 text-red-500 mx-auto mb-3" />
          <h3 class="text-lg font-semibold text-white mb-2">Failed to Load Reports</h3>
          <p class="text-gray-400 text-sm mb-4">{{ reportsError }}</p>
          <UButton @click="fetchReports()" color="blue" size="sm">
            Try Again
          </UButton>
        </div>

        <!-- Reports Grid -->
        <div v-else-if="filteredReports.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <ReportCard
            v-for="report in filteredReports"
            :key="report.reportId"
            :report="report"
            @edit="handleEdit"
            @delete="handleDelete"
            @test="handleTest"
            @toggle-pause="handleTogglePause"
            @view-history="handleViewHistory"
          />
        </div>

        <!-- Empty State -->
        <div v-else class="text-center py-12">
          <Icon name="i-heroicons-calendar-days" class="w-16 h-16 text-gray-600 mx-auto mb-3" />
          <h3 class="text-lg font-semibold text-white mb-2">
            {{ currentFilter === 'all' ? 'No Scheduled Reports' : `No ${currentFilter} Reports` }}
          </h3>
          <p class="text-gray-400 text-sm mb-4">
            {{ currentFilter === 'all'
              ? 'Get started by creating your first automated cost report'
              : 'Create a new report or change the filter to see your other reports'
            }}
          </p>
          <UButton
            v-if="currentFilter === 'all'"
            @click="openCreateModal"
            color="blue"
            icon="i-heroicons-plus"
            size="sm"
          >
            Create Your First Report
          </UButton>
        </div>
      </div>
        </UCard>
      </template>
    </UTabs>

    <!-- Create/Edit Modal -->
    <ReportFormModal
      v-model="showModal"
      :editing-report="editingReport"
      :is-admin="isAdmin"
      :user-email="userEmail"
      @submit="handleSubmit"
    />

    <!-- Execution History Modal -->
    <UModal v-model="showHistoryModal" :ui="{ width: 'sm:max-w-4xl' }">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              {{ selectedReport?.reportName }} - Execution History
            </h3>
            <UButton
              color="gray"
              variant="ghost"
              icon="i-heroicons-x-mark-20-solid"
              size="sm"
              @click="showHistoryModal = false"
            />
          </div>
        </template>

        <ExecutionHistoryTable
          :executions="executions"
          :loading="historyLoading"
          :error="historyError"
          @refresh="loadHistory"
        />
      </UCard>
    </UModal>

    <!-- Delete Confirmation Modal -->
    <UModal v-model="showDeleteModal" :ui="{ width: 'sm:max-w-md' }">
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
            Delete Scheduled Report
          </h3>
        </template>

        <div class="space-y-4">
          <p class="text-gray-700 dark:text-gray-300">
            Are you sure you want to delete <strong>{{ reportToDelete?.reportName }}</strong>?
          </p>
          <p class="text-sm text-gray-600 dark:text-gray-400">
            This action cannot be undone. The report will stop running and all schedule data will be removed.
          </p>
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton
              color="gray"
              variant="ghost"
              @click="showDeleteModal = false"
            >
              Cancel
            </UButton>
            <UButton
              color="red"
              :loading="deleting"
              @click="confirmDelete"
            >
              Delete Report
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { PERMISSION_CATEGORIES } from '~/config/roles'
import type { ScheduledReport, CreateReportRequest } from '~/shared/types/scheduled-reports'

const { user } = useOidcAuth()
const userGroupStore = useUserGroupStore()
const { userRoles, userPermissions, isAdmin } = useUserRoles()
const { getBadgesFromGroups } = useSimpleBadges()
const toast = useToast()
const route = useRoute()

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

// Tab configuration
const selectedTab = ref(0)
const profileTabs = [
  {
    label: 'Profile',
    slot: 'profile',
    icon: 'i-heroicons-user-circle'
  },
  {
    label: 'Roles & Permissions',
    slot: 'roles',
    icon: 'i-heroicons-shield-check'
  },
  {
    label: 'AWS Access',
    slot: 'aws',
    icon: 'i-heroicons-cloud'
  },
  {
    label: 'Scheduled Reports',
    slot: 'reports',
    icon: 'i-heroicons-calendar-days'
  }
]

// Icon mapping for permission categories
const categoryIcons: Record<string, string> = {
  forecast: 'i-heroicons-chart-bar',
  costs: 'i-heroicons-currency-dollar',
  accounts: 'i-heroicons-building-office',
  users: 'i-heroicons-users',
  admin: 'i-heroicons-cog-6-tooth'
}

// Group permissions by category for accordion
const permissionAccordionItems = computed(() => {
  const categories = Object.entries(PERMISSION_CATEGORIES).map(([key, category]) => {
    const categoryPermissions = sortedPermissions.value.filter(perm =>
      perm in category.permissions
    )
    return {
      label: category.label,
      icon: categoryIcons[key] || 'i-heroicons-lock-closed',
      count: categoryPermissions.length,
      permissions: categoryPermissions,
      defaultOpen: false
    }
  }).filter(cat => cat.count > 0)

  // If no categorized permissions, create a single "Other" category
  if (categories.length === 0 && sortedPermissions.value.length > 0) {
    return [{
      label: 'All Permissions',
      icon: 'i-heroicons-lock-closed',
      count: sortedPermissions.value.length,
      permissions: sortedPermissions.value,
      defaultOpen: false
    }]
  }

  return categories
})

// Group memberships accordion items
const groupAccordionItems = computed(() => {
  const items = []

  if (roleGroupNames.value.length > 0) {
    items.push({
      label: 'AWS Role Groups',
      icon: 'i-heroicons-user-group',
      color: 'blue',
      badgeColor: 'blue',
      count: roleGroupNames.value.length,
      groups: roleGroupNames.value,
      defaultOpen: true
    })
  }

  if (distributionGroupNames.value.length > 0) {
    items.push({
      label: 'Distribution Groups',
      icon: 'i-heroicons-envelope',
      color: 'purple',
      badgeColor: 'purple',
      count: distributionGroupNames.value.length,
      groups: distributionGroupNames.value,
      defaultOpen: false
    })
  }

  return items
})

// Scheduled Reports functionality
const {
  loading,
  error: reportsError,
  reports,
  executions,
  fetchReports,
  createReport,
  updateReport,
  deleteReport,
  sendTestReport,
  togglePause,
  fetchExecutionHistory
} = useScheduledReports()

// State
const currentFilter = ref<'all' | 'active' | 'paused'>('all')
const showModal = ref(false)
const showHistoryModal = ref(false)
const showDeleteModal = ref(false)
const editingReport = ref<ScheduledReport | null>(null)
const selectedReport = ref<ScheduledReport | null>(null)
const reportToDelete = ref<ScheduledReport | null>(null)
const deleting = ref(false)
const historyLoading = ref(false)
const historyError = ref<string | null>(null)

// Computed
const filteredReports = computed(() => {
  if (currentFilter.value === 'all') return reports.value
  return reports.value.filter(r => r.status === currentFilter.value)
})

const canCreateMore = computed(() => {
  return isAdmin.value || reports.value.length < 10
})

const filters = computed(() => [
  { label: 'All', value: 'all' as const, count: reports.value.length },
  { label: 'Active', value: 'active' as const, count: reports.value.filter(r => r.status === 'active').length },
  { label: 'Paused', value: 'paused' as const, count: reports.value.filter(r => r.status === 'paused').length }
])

// Methods
function openCreateModal() {
  editingReport.value = null
  showModal.value = true
}

function handleEdit(report: ScheduledReport) {
  editingReport.value = report
  showModal.value = true
}

async function handleSubmit(data: CreateReportRequest) {
  try {
    let success = false

    if (editingReport.value) {
      success = await updateReport(editingReport.value.reportId, data)
      if (success) {
        toast.add({
          title: 'Report Updated',
          description: 'Your scheduled report has been updated successfully',
          icon: 'i-heroicons-check-circle',
          color: 'green'
        })
      }
    } else {
      success = await createReport(data)
      if (success) {
        toast.add({
          title: 'Report Created',
          description: 'Your scheduled report has been created successfully',
          icon: 'i-heroicons-check-circle',
          color: 'green'
        })
      }
    }

    if (success) {
      showModal.value = false
      editingReport.value = null
    } else {
      toast.add({
        title: 'Error',
        description: reportsError.value || 'Failed to save report',
        icon: 'i-heroicons-x-circle',
        color: 'red'
      })
    }
  } catch (err) {
    console.error('Error submitting report:', err)
  }
}

function handleDelete(report: ScheduledReport) {
  reportToDelete.value = report
  showDeleteModal.value = true
}

async function confirmDelete() {
  if (!reportToDelete.value) return

  deleting.value = true
  try {
    const success = await deleteReport(reportToDelete.value.reportId)
    if (success) {
      toast.add({
        title: 'Report Deleted',
        description: 'Your scheduled report has been deleted',
        icon: 'i-heroicons-check-circle',
        color: 'green'
      })
      showDeleteModal.value = false
      reportToDelete.value = null
    } else {
      toast.add({
        title: 'Error',
        description: reportsError.value || 'Failed to delete report',
        icon: 'i-heroicons-x-circle',
        color: 'red'
      })
    }
  } finally {
    deleting.value = false
  }
}

async function handleTest(report: ScheduledReport) {
  const success = await sendTestReport(report.reportId)
  if (success) {
    toast.add({
      title: 'Test Report Sent',
      description: 'Check your inbox for the test report',
      icon: 'i-heroicons-paper-airplane',
      color: 'green'
    })
  } else {
    toast.add({
      title: 'Error',
      description: reportsError.value || 'Failed to send test report',
      icon: 'i-heroicons-x-circle',
      color: 'red'
    })
  }
}

async function handleTogglePause(report: ScheduledReport) {
  const pause = report.status === 'active'
  const success = await togglePause(report.reportId, pause)
  if (success) {
    toast.add({
      title: pause ? 'Report Paused' : 'Report Resumed',
      description: pause ? 'Your report will not run until resumed' : 'Your report schedule has been resumed',
      icon: 'i-heroicons-check-circle',
      color: 'green'
    })
  } else {
    toast.add({
      title: 'Error',
      description: reportsError.value || 'Failed to update report status',
      icon: 'i-heroicons-x-circle',
      color: 'red'
    })
  }
}

async function handleViewHistory(report: ScheduledReport) {
  selectedReport.value = report
  showHistoryModal.value = true
  await loadHistory()
}

async function loadHistory() {
  if (!selectedReport.value) return

  historyLoading.value = true
  historyError.value = null
  try {
    await fetchExecutionHistory(selectedReport.value.reportId)
  } catch (err) {
    historyError.value = reportsError.value || 'Failed to load execution history'
  } finally {
    historyLoading.value = false
  }
}

// Load reports on mount
onMounted(async () => {
  await fetchReports()

  // Switch to scheduled reports tab if coming from query param
  if (route.query.section === 'scheduled-reports') {
    selectedTab.value = 3 // Index of the Scheduled Reports tab
    nextTick(() => {
      const element = document.getElementById('scheduled-reports')
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    })
  }
})
</script>