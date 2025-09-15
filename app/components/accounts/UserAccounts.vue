<script setup lang="ts">
import { useAwsAccountsStore } from '~/stores/awsAccounts'
import { useRouter } from 'vue-router'

const awsAccountsStore = useAwsAccountsStore()
const router = useRouter()

// Component state
const viewMode = ref<'card' | 'compact'>('card')
const currentPage = ref(1)
const searchQuery = ref('')
const selectedStatus = ref<string[]>([])
const selectedType = ref<string[]>([])
const sortBy = ref<'name' | 'cost' | 'roles'>('name')
const showFilters = ref(false)

// View preferences
const itemsPerPage = ref(6) // Default to 6 cards (2 rows of 3)
const maxPreviewItems = 9 // Maximum items to show before "View All"

// Initialize store if needed
onMounted(async () => {
  await awsAccountsStore.initialize()
})

// Store getters
const isLoading = computed(() => awsAccountsStore.loading)
const hasAccounts = computed(() => awsAccountsStore.hasAccounts)
const allUserAccounts = computed(() => awsAccountsStore.accountsList)

// Status and type options for filtering
const statusOptions = [
  { key: 'ACTIVE', label: 'Active', value: 'ACTIVE' },
  { key: 'SUSPENDED', label: 'Suspended', value: 'SUSPENDED' }
]

const typeOptions = [
  { key: 'commercial', label: 'Commercial', value: false },
  { key: 'govcloud', label: 'GovCloud', value: true }
]

// Filtered and sorted accounts
const filteredAccounts = computed(() => {
  let accounts = [...allUserAccounts.value]

  // Apply search filter
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase().trim()
    accounts = accounts.filter(account => 
      account.name.toLowerCase().includes(query) ||
      account.id.toLowerCase().includes(query) ||
      account.roles.some(role => role.toLowerCase().includes(query))
    )
  }

  // Apply status filter
  if (selectedStatus.value.length > 0) {
    accounts = accounts.filter(account => selectedStatus.value.includes(account.status))
  }

  // Apply type filter
  if (selectedType.value.length > 0) {
    accounts = accounts.filter(account => {
      if (selectedType.value.includes('commercial') && !account.isGovCloud) return true
      if (selectedType.value.includes('govcloud') && account.isGovCloud) return true
      return false
    })
  }

  // Apply sorting
  accounts.sort((a, b) => {
    switch (sortBy.value) {
      case 'name':
        return a.name.localeCompare(b.name)
      case 'cost':
        // Sort by account ID as a proxy for cost data (replace with actual cost data when available)
        return a.id.localeCompare(b.id)
      case 'roles':
        return b.roles.length - a.roles.length
      default:
        return 0
    }
  })

  return accounts
})

// Pagination
const totalPages = computed(() => Math.ceil(filteredAccounts.value.length / itemsPerPage.value))
const hasNextPage = computed(() => currentPage.value < totalPages.value)
const hasPrevPage = computed(() => currentPage.value > 1)

// Current page accounts
const currentPageAccounts = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage.value
  const end = start + itemsPerPage.value
  return filteredAccounts.value.slice(start, end)
})

// Show preview mode when there are many accounts
const showPreviewMode = computed(() => filteredAccounts.value.length > maxPreviewItems)
const previewAccounts = computed(() => filteredAccounts.value.slice(0, maxPreviewItems))

// Display accounts (either preview or paginated)
const displayAccounts = computed(() => {
  return showPreviewMode.value ? previewAccounts.value : currentPageAccounts.value
})

// Reset pagination when filters change
watch([searchQuery, selectedStatus, selectedType, sortBy], () => {
  currentPage.value = 1
})

// Navigation functions
const goToPage = (page: number) => {
  currentPage.value = page
}

const goToAccountsPage = () => {
  router.push('/account/user')
}

const clearFilters = () => {
  searchQuery.value = ''
  selectedStatus.value = []
  selectedType.value = []
  currentPage.value = 1
}

// View mode toggle
const toggleViewMode = () => {
  viewMode.value = viewMode.value === 'card' ? 'compact' : 'card'
}
</script>

<template>
  <div>
    <!-- Loading state -->
    <div v-if="isLoading" class="mb-6">
      <UCard class="bg-gray-900 border border-gray-700">
        <div class="p-8 flex justify-center">
          <UIcon name="i-heroicons-arrow-path" class="animate-spin h-8 w-8" />
        </div>
      </UCard>
    </div>

    <!-- Main content -->
    <div v-else>
      <!-- Accounts display -->
      <div v-if="hasAccounts" class="mb-6">
        <UCard class="bg-gray-900 border border-gray-700">
          <template #header>
            <div class="flex flex-col gap-4">
              <!-- Header row -->
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <h2 class="text-lg font-semibold text-white">My AWS Accounts</h2>
                  <UTooltip :ui="{
                    width: 'max-w-xs',
                    base: 'p-2 break-normal whitespace-normal text-left'
                  }"
                    text="These accounts are ones you have access to through AD groups. This does not indicate ownership or responsibility for the account.">
                    <div class="flex items-center gap-2">
                      <UIcon name="i-heroicons-question-mark-circle"
                        class="w-5 h-5 text-gray-400 hover:text-white cursor-help" />
                    </div>
                  </UTooltip>
                  <NuxtLink to="/support/aws-access"
                    class="text-sm text-primary-400 hover:text-primary-300 hover:underline ml-2">
                    Missing an account?
                  </NuxtLink>
                  <span class="text-gray-600 mx-2">|</span>
                  <NuxtLink to="/account/explorer"
                    class="text-sm text-green-400 hover:text-green-300 hover:underline">
                    Browse Accounts
                  </NuxtLink>
                </div>
                <div class="flex items-center gap-3">
                  <UBadge color="primary" variant="soft">
                    {{ filteredAccounts.length }} of {{ allUserAccounts.length }} Account{{ allUserAccounts.length !== 1 ? 's' : '' }}
                  </UBadge>
                  <UButton
                    v-if="showPreviewMode"
                    variant="outline"
                    size="sm"
                    @click="goToAccountsPage"
                  >
                    View All
                  </UButton>
                </div>
              </div>

              <!-- Search and filters row -->
              <div v-if="allUserAccounts.length > 3" class="flex flex-col sm:flex-row gap-3">
                <div class="flex-1">
                  <UInput
                    v-model="searchQuery"
                    icon="i-heroicons-magnifying-glass"
                    placeholder="Search accounts, IDs, or roles..."
                    class="w-full"
                  />
                </div>
                <div class="flex items-center gap-2">
                  <UButton
                    :icon="showFilters ? 'i-heroicons-funnel' : 'i-heroicons-funnel'"
                    :variant="showFilters ? 'solid' : 'outline'"
                    size="sm"
                    @click="showFilters = !showFilters"
                  >
                    Filters
                  </UButton>
                  <UButton
                    :icon="viewMode === 'card' ? 'i-heroicons-list-bullet' : 'i-heroicons-squares-2x2'"
                    variant="outline"
                    size="sm"
                    @click="toggleViewMode"
                  >
                    {{ viewMode === 'card' ? 'List' : 'Grid' }}
                  </UButton>
                  <UButton
                    v-if="searchQuery || selectedStatus.length || selectedType.length"
                    icon="i-heroicons-x-mark"
                    variant="ghost"
                    size="sm"
                    @click="clearFilters"
                  >
                    Clear
                  </UButton>
                </div>
              </div>

              <!-- Expanded filters -->
              <div v-if="showFilters" class="flex flex-wrap gap-3 p-3 bg-gray-800/50 rounded-lg">
                <USelectMenu
                  v-model="selectedStatus"
                  :options="statusOptions"
                  multiple
                  placeholder="Filter by status"
                  class="min-w-[150px]"
                />
                <USelectMenu
                  v-model="selectedType"
                  :options="typeOptions"
                  multiple
                  placeholder="Filter by type"
                  class="min-w-[150px]"
                />
                <USelectMenu
                  v-model="sortBy"
                  :options="[
                    { key: 'name', label: 'Sort by Name', value: 'name' },
                    { key: 'cost', label: 'Sort by Cost', value: 'cost' },
                    { key: 'roles', label: 'Sort by Roles', value: 'roles' }
                  ]"
                  placeholder="Sort by"
                  class="min-w-[130px]"
                />
              </div>
            </div>
          </template>

          <!-- No results -->
          <div v-if="filteredAccounts.length === 0" class="p-8 text-center">
            <UIcon name="i-heroicons-magnifying-glass" class="w-12 h-12 text-gray-500 mx-auto mb-4" />
            <h3 class="text-lg font-medium text-white mb-2">No accounts found</h3>
            <p class="text-gray-400 mb-4">Try adjusting your search criteria or filters.</p>
            <UButton variant="outline" @click="clearFilters">
              Clear Filters
            </UButton>
          </div>

          <!-- Card view -->
          <div v-else-if="viewMode === 'card'" class="p-4">
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
              <NuxtLink v-for="account in displayAccounts" :key="account.id" :to="`/account/${account.id}`"
                class="group relative overflow-hidden rounded-lg bg-gray-800/50 p-4 transition-all duration-300 hover:bg-gray-800 hover:shadow-lg">
                <!-- Account Info -->
                <div class="flex items-start justify-between">
                  <div class="space-y-1">
                    <h3 class="font-medium text-white group-hover:text-primary-400 transition-colors">
                      {{ account.name }}
                    </h3>
                    <p class="text-sm text-gray-400">
                      {{ account.id }}
                    </p>
                    <div class="flex items-center gap-2 mt-2">
                      <UBadge :color="account.status === 'ACTIVE' ? 'green' : 'yellow'" size="xs">
                        {{ account.status }}
                      </UBadge>
                      <UBadge color="blue" size="xs">
                        {{ account.isGovCloud ? 'GovCloud' : 'Commercial' }}
                      </UBadge>
                    </div>
                  </div>

                  <!-- Roles -->
                  <div class="flex flex-col items-end">
                    <div class="flex flex-wrap justify-end gap-1 mt-1">
                      <RoleBadge
                        v-for="role in account.roles.slice(0, 3)"
                        :key="role"
                        :role="role"
                        size="xs"
                      />
                      <UBadge
                        v-if="account.roles.length > 3"
                        color="gray"
                        variant="soft"
                        size="xs"
                      >
                        +{{ account.roles.length - 3 }} more
                      </UBadge>
                    </div>
                  </div>
                </div>

                <!-- Hover effect -->
                <div
                  class="absolute inset-0 border-2 border-primary-500/0 rounded-lg transition-all duration-300 group-hover:border-primary-500/100" />
              </NuxtLink>
            </div>

            <!-- Preview mode "View All" button -->
            <div v-if="showPreviewMode" class="text-center pt-4 border-t border-gray-700">
              <p class="text-sm text-gray-400 mb-3">
                Showing {{ displayAccounts.length }} of {{ filteredAccounts.length }} accounts
              </p>
              <UButton @click="goToAccountsPage" size="sm" variant="outline">
                <UIcon name="i-heroicons-arrow-right" class="w-4 h-4 mr-2" />
                View All {{ filteredAccounts.length }} Accounts
              </UButton>
            </div>

            <!-- Pagination for non-preview mode -->
            <div v-else-if="totalPages > 1" class="flex justify-center pt-4 border-t border-gray-700">
              <UPagination
                v-model="currentPage"
                :page-count="itemsPerPage"
                :total="filteredAccounts.length"
                :ui="{
                  wrapper: 'flex items-center gap-1',
                  rounded: '!rounded-full min-w-[32px] justify-center',
                  default: {
                    activeButton: {
                      variant: 'solid',
                      color: 'primary'
                    }
                  }
                }"
              />
            </div>
          </div>

          <!-- Compact/List view -->
          <div v-else class="p-4">
            <div class="space-y-2 mb-4">
              <div v-for="account in displayAccounts" :key="account.id"
                class="flex items-center justify-between p-3 rounded-lg bg-gray-800/50 hover:bg-gray-800 transition-colors">
                <NuxtLink :to="`/account/${account.id}`" class="flex-1 flex items-center gap-3 hover:text-primary-400">
                  <div class="flex-1">
                    <div class="flex items-center gap-2">
                      <h3 class="font-medium text-white">{{ account.name }}</h3>
                      <UBadge :color="account.status === 'ACTIVE' ? 'green' : 'yellow'" size="xs">
                        {{ account.status }}
                      </UBadge>
                      <UBadge color="blue" size="xs">
                        {{ account.isGovCloud ? 'GovCloud' : 'Commercial' }}
                      </UBadge>
                    </div>
                    <p class="text-sm text-gray-400">{{ account.id }}</p>
                  </div>
                  <div class="flex items-center gap-1">
                    <RoleBadge
                      v-for="role in account.roles.slice(0, 3)"
                      :key="role"
                      :role="role"
                      size="xs"
                    />
                    <UBadge
                      v-if="account.roles.length > 3"
                      color="gray"
                      variant="soft"
                      size="xs"
                    >
                      +{{ account.roles.length - 3 }} more
                    </UBadge>
                  </div>
                </NuxtLink>
                <UIcon name="i-heroicons-chevron-right" class="w-4 h-4 text-gray-400" />
              </div>
            </div>

            <!-- Preview mode "View All" button for compact view -->
            <div v-if="showPreviewMode" class="text-center pt-4 border-t border-gray-700">
              <p class="text-sm text-gray-400 mb-3">
                Showing {{ displayAccounts.length }} of {{ filteredAccounts.length }} accounts
              </p>
              <UButton @click="goToAccountsPage" size="sm" variant="outline">
                <UIcon name="i-heroicons-arrow-right" class="w-4 h-4 mr-2" />
                View All {{ filteredAccounts.length }} Accounts
              </UButton>
            </div>

            <!-- Pagination for compact view -->
            <div v-else-if="totalPages > 1" class="flex justify-center pt-4 border-t border-gray-700">
              <UPagination
                v-model="currentPage"
                :page-count="itemsPerPage"
                :total="filteredAccounts.length"
                :ui="{
                  wrapper: 'flex items-center gap-1',
                  rounded: '!rounded-full min-w-[32px] justify-center',
                  default: {
                    activeButton: {
                      variant: 'solid',
                      color: 'primary'
                    }
                  }
                }"
              />
            </div>
          </div>
        </UCard>
      </div>
    </div>
  </div>
</template>

<style scoped>
.group:hover .group-hover\:text-primary-400 {
  color: var(--color-primary-400);
}

/* Smooth transitions */
.transition-all {
  transition: all 0.2s ease;
}

/* Custom pagination styles */
:deep(.u-pagination) {
  gap: 0.25rem;
}

:deep(.u-pagination button) {
  min-width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>