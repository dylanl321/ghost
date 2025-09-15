<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue'
import { exportUsersToCSV, exportFilteredUsersToCSV, exportEnhancedUserAccessToCSV } from '~/utils/csvExport'
import { convertToUsernameSlug } from '~/utils/userUtils'
import UserAvatar from '~/components/ui/UserAvatar.vue'

interface User {
  userPrincipalName: string
  displayName: string
  jobTitle?: string
  roles: string[]
  tags: Array<{title: string, color: string, icon?: string}>
  awsAccounts: Array<{
    accountId: string
    accountName: string
    roles: string[]
    isGovCloud: boolean
  }>
}

// Page metadata
definePageMeta({
  title: 'User Search & Management',
  description: 'Search for users and view their AWS account access across the organization'
})

// Component state
const users = ref<User[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

// UI state
const searchQuery = ref('')
const selectedRole = ref<string>('')
const selectedAccount = ref<string>('')
const showOnlyAwsUsers = ref(false)

// Composables
const { user } = useOidcAuth()
const { searchUsers, fetchUserProfile, fetchUserMemberOf } = useGraphApi()
const { parseAwsGroupName, sortRolesByPriority } = useAwsGroupParser()
const { getUserTags, batchGetUserTags } = useGroupMembers()
const awsAccountsStore = useAwsAccountsStore()

// Filtered users based on search and filters
const filteredUsers = computed(() => {
  let filtered = users.value

  // Note: Search filtering is handled by the Graph API search, not here
  // This prevents double filtering which was causing found users to not display

  // Filter by selected role
  if (selectedRole.value && selectedRole.value !== '') {
    filtered = filtered.filter(user => 
      user.roles.includes(selectedRole.value)
    )
  }

  // Filter by selected account
  if (selectedAccount.value && selectedAccount.value !== '') {
    filtered = filtered.filter(user => 
      user.awsAccounts.some(acc => acc.accountId === selectedAccount.value)
    )
  }

  // Filter to show only users with AWS accounts
  if (showOnlyAwsUsers.value) {
    filtered = filtered.filter(user => 
      user.awsAccounts.length > 0
    )
  }

  return filtered.sort((a, b) => a.displayName.localeCompare(b.displayName))
})

// Get all unique roles from users
const allRoles = computed(() => {
  const roleSet = new Set<string>()
  users.value.forEach(user => {
    user.roles.forEach(role => roleSet.add(role))
  })
  return Array.from(roleSet).sort()
})

// Get all unique AWS accounts
const allAccounts = computed(() => {
  const accountMap = new Map<string, { id: string; name: string }>()
  users.value.forEach(user => {
    user.awsAccounts.forEach(acc => {
      if (!accountMap.has(acc.accountId)) {
        accountMap.set(acc.accountId, { id: acc.accountId, name: acc.accountName })
      }
    })
  })
  return Array.from(accountMap.values()).sort((a, b) => a.name.localeCompare(b.name))
})

// Parse user groups to extract AWS access information
const parseUserAwsAccess = (groups: string[]) => {
  const awsAccounts = new Map<string, { accountId: string; accountName: string; roles: string[]; isGovCloud: boolean }>()
  const allRoles = new Set<string>()

  groups.forEach(groupName => {
    const parsed = parseAwsGroupName(groupName)
    if (parsed.type === 'aws-role' && parsed.accountId && parsed.role) {
      const account = awsAccountsStore.accounts[parsed.accountId]
      const accountName = account?.accountName || `Account ${parsed.accountId}`
      const isGovCloud = account?.isGovCloud || false

      if (!awsAccounts.has(parsed.accountId)) {
        awsAccounts.set(parsed.accountId, {
          accountId: parsed.accountId,
          accountName,
          roles: [],
          isGovCloud
        })
      }

      awsAccounts.get(parsed.accountId)!.roles.push(parsed.role)
      allRoles.add(parsed.role)
    }
  })

  return {
    awsAccounts: Array.from(awsAccounts.values()),
    roles: Array.from(allRoles)
  }
}

// Search for users in the organization
const searchForUsers = async (query?: string) => {
  if (!user.value?.accessToken) return

  try {
    loading.value = true
    error.value = null

    // Search for users (if query provided) or get common users
    const searchResults = query 
      ? await searchUsers(user.value.accessToken, query)
      : []

    if (searchResults.length === 0 && !query) {
      users.value = []
      return
    }

    // First, get user groups for all users
    const userPromises = searchResults.map(async (searchUser: any) => {
      try {
        const memberOf = await fetchUserMemberOf(user.value!.accessToken!, searchUser.userPrincipalName)
        const groups = memberOf.map((group: any) => group.displayName)
        
        // Parse AWS access
        const awsAccess = parseUserAwsAccess(groups)
        
        return {
          userPrincipalName: searchUser.userPrincipalName,
          displayName: searchUser.displayName,
          jobTitle: searchUser.jobTitle,
          roles: sortRolesByPriority(awsAccess.roles),
          awsAccounts: awsAccess.awsAccounts,
          tags: [] // Will be filled by batch operation
        }
      } catch (err) {
        console.warn(`Failed to get groups for user ${searchUser.userPrincipalName}:`, err)
        return {
          userPrincipalName: searchUser.userPrincipalName,
          displayName: searchUser.displayName,
          jobTitle: searchUser.jobTitle,
          roles: [],
          awsAccounts: [],
          tags: []
        }
      }
    })

    const usersWithGroups = await Promise.all(userPromises)
    
    // Now batch process tags for all users
    try {
      const usersForTagging = usersWithGroups.map(user => ({
        userPrincipalName: user.userPrincipalName,
        displayName: user.displayName
      }))
      
      const userTagsMap = await batchGetUserTags(usersForTagging, user.value.accessToken)
      
      // Combine the results
      users.value = usersWithGroups.map(user => ({
        ...user,
        tags: userTagsMap[user.userPrincipalName] || []
      }))
      
      console.log(`Successfully processed ${users.value.length} users with batch tagging`)
      
    } catch (tagError) {
      console.warn('Batch tagging failed, falling back to individual calls:', tagError)
      
      // Fallback to individual tag calls if batch fails
      const tagPromises = usersWithGroups.map(async (userResult) => {
        try {
          const tags = await getUserTags(userResult.userPrincipalName, user.value!.accessToken!, userResult.displayName)
          return { ...userResult, tags }
        } catch (err) {
          console.warn(`Failed to get tags for user ${userResult.userPrincipalName}:`, err)
          return { ...userResult, tags: [] }
        }
      })
      
      users.value = await Promise.all(tagPromises)
    }
    
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to search users'
    console.error('Error searching users:', err)
  } finally {
    loading.value = false
  }
}

// Utility functions
const handleUserClick = (userPrincipalName: string) => {
  const username = convertToUsernameSlug(userPrincipalName)
  navigateTo(`/account/user/${username}`)
}

const getEmailLink = (email: string) => `mailto:${email}`

const getTeamsLink = (email: string) => {
  return `msteams:/l/chat/0/0?users=${email}`
}

const clearFilters = () => {
  selectedRole.value = ''
  selectedAccount.value = ''
  showOnlyAwsUsers.value = false
}

const handleExportCSV = () => {
  if (filteredUsers.value.length === 0) return
  
  // Transform user data to match the UserExportData interface
  const exportData = filteredUsers.value.map(user => {
    // Calculate privilege levels based on roles
    const adminRoles = user.roles.filter(role => 
      role.toLowerCase().includes('admin') || role.toLowerCase().includes('administrator')
    ).length
    
    const powerRoles = user.roles.filter(role => 
      role.toLowerCase().includes('power') || role.toLowerCase().includes('developer')
    ).length
    
    const readWriteRoles = user.roles.filter(role => 
      role.toLowerCase().includes('readwrite') || role.toLowerCase().includes('contributor')
    ).length
    
    const readOnlyRoles = user.roles.filter(role => 
      role.toLowerCase().includes('readonly') || role.toLowerCase().includes('read')
    ).length
    
    const billingRoles = user.roles.filter(role => 
      role.toLowerCase().includes('billing') || role.toLowerCase().includes('cost')
    ).length

    // Determine highest privilege level
    let highestPrivilegeLevel: "readonly" | "admin" | "power" | "readwrite" | "billing" | "none" = "none"
    if (adminRoles > 0) highestPrivilegeLevel = "admin"
    else if (powerRoles > 0) highestPrivilegeLevel = "power"
    else if (readWriteRoles > 0) highestPrivilegeLevel = "readwrite"
    else if (readOnlyRoles > 0) highestPrivilegeLevel = "readonly"
    else if (billingRoles > 0) highestPrivilegeLevel = "billing"

    // Transform AWS accounts for export
    const transformedAwsAccounts = user.awsAccounts.map(account => ({
      ...account,
      accountAlias: account.accountName,
      environment: account.isGovCloud ? 'GovCloud' : 'Commercial',
      projectName: '',
      status: 'Active',
      accessType: 'group' as const,
      groupName: '',
      lastAccessed: 'Unknown'
    }))

    return {
      displayName: user.displayName,
      userPrincipalName: user.userPrincipalName,
      jobTitle: user.jobTitle || '',
      roles: user.roles,
      tags: user.tags,
      accountId: '', // For organization search, not specific to one account
      accountName: 'Organization User Search',
      isGovCloud: false,
      department: '',
      officeLocation: '',
      businessPhones: [],
      mobilePhone: '',
      manager: '',
      lastModified: new Date().toISOString(),
      awsAccounts: transformedAwsAccounts,
      distributionGroups: [],
      securityGroups: [],
      totalAccounts: user.awsAccounts.length,
      totalRoles: user.roles.length,
      highestPrivilegeLevel,
      complianceFlags: []
    }
  })

  // Determine if this is a filtered export or full export
  const hasFilters = (selectedRole.value && selectedRole.value !== '') || 
                    (selectedAccount.value && selectedAccount.value !== '') || 
                    searchQuery.value.trim() !== '' ||
                    showOnlyAwsUsers.value

  const accountInfo = {
    id: 'organization-search',
    name: 'Organization User Search',
    isGovCloud: false
  }

  // Use the simple, reliable export functions instead of the complex enhanced ones
  if (hasFilters) {
    const filterInfo = {
      searchTerm: searchQuery.value.trim() || undefined,
      selectedRole: selectedRole.value || undefined
    }
    
    exportFilteredUsersToCSV(exportData, filterInfo, accountInfo, {
      filename: `organization-users-filtered-${new Date().toISOString().split('T')[0]}.csv`,
      includeHeaders: true,
      dateFormat: 'short'
    })
  } else {
    exportUsersToCSV(exportData, accountInfo, {
      filename: `organization-users-complete-${new Date().toISOString().split('T')[0]}.csv`,
      includeHeaders: true,
      dateFormat: 'short'
    })
  }
}

// Trigger search when searchQuery changes (with debouncing)
const searchTimeout = ref<NodeJS.Timeout | null>(null)

watch(searchQuery, (newValue) => {
  if (searchTimeout.value) {
    clearTimeout(searchTimeout.value)
  }
  
  if (newValue.trim().length >= 2) {
    searchTimeout.value = setTimeout(() => {
      searchForUsers(newValue.trim())
    }, 500)
  } else if (newValue.trim().length === 0) {
    users.value = []
  }
})

// Watch for filter changes
watch([selectedRole, selectedAccount], () => {
  // Filters are applied via computed property
})

// Page setup
onMounted(async () => {
  // Initialize AWS accounts store
  try {
    await awsAccountsStore.initialize()
  } catch (error) {
    console.warn('Failed to initialize AWS accounts store:', error)
  }
})
</script>

<template>
  <div class="container mx-auto px-4 py-6 space-y-6">
    <!-- Page Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold text-white">User Search</h1>
        <p class="text-gray-400 mt-1">Search for users and view their AWS account access</p>
      </div>
      <NuxtLink to="/account/user/my-access">
        <UButton icon="i-heroicons-user" variant="outline">
          My Access
        </UButton>
      </NuxtLink>
    </div>

    <!-- Search and Filters -->
    <UCard class="bg-gray-900 border border-gray-800">
      <div class="p-4">
        <div class="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          <!-- Search and Filters -->
          <div class="flex flex-col sm:flex-row gap-3 flex-1">
            <div class="flex-1 max-w-md">
              <UInput
                v-model="searchQuery"
                placeholder="Search users by name or email... (min 2 characters)"
                icon="i-heroicons-magnifying-glass"
                size="sm"
              />
            </div>
            <USelectMenu
              v-model="selectedRole"
              :options="[{ label: 'All Roles', value: '' }, ...allRoles.map(role => ({ label: role, value: role }))]"
              placeholder="Filter by role"
              size="sm"
              class="min-w-[180px]"
            />
            <USelectMenu
              v-model="selectedAccount"
              :options="[{ label: 'All Accounts', value: '' }, ...allAccounts.map(acc => ({ label: acc.name, value: acc.id }))]"
              placeholder="Filter by account"
              size="sm"
              class="min-w-[200px]"
            />
            <UCheckbox
              v-model="showOnlyAwsUsers"
              label="AWS users only"
              size="sm"
            />
            <UButton
              v-if="selectedRole || selectedAccount || showOnlyAwsUsers"
              @click="clearFilters"
              icon="i-heroicons-x-mark"
              variant="ghost"
              size="sm"
            >
              Clear
            </UButton>
          </div>

          <!-- Actions -->
          <div class="flex items-center gap-2">
            <UButton 
              @click="handleExportCSV"
              :disabled="filteredUsers.length === 0"
              icon="i-heroicons-arrow-down-tray"
              variant="outline" 
              size="sm"
            >
              Export
            </UButton>
          </div>
        </div>

        <!-- Summary -->
        <div v-if="users.length > 0" class="flex items-center gap-4 mt-4 pt-4 border-t border-gray-700">
          <UBadge color="primary" variant="soft" size="sm">
            {{ users.length }} {{ users.length === 1 ? 'User' : 'Users' }} Found
          </UBadge>
          <UBadge v-if="filteredUsers.length !== users.length" color="blue" variant="soft" size="sm">
            {{ filteredUsers.length }} Filtered
          </UBadge>
        </div>
      </div>
    </UCard>

    <!-- Search Instructions -->
    <UCard v-if="users.length === 0 && !loading && !error && searchQuery.length < 2" class="bg-gray-900 border border-gray-800">
      <div class="text-center py-12">
        <UIcon name="i-heroicons-magnifying-glass" class="w-16 h-16 text-gray-500 mx-auto mb-4" />
        <h4 class="text-xl font-medium text-white mb-2">Search for Users</h4>
        <p class="text-gray-400 mb-4">Enter at least 2 characters to search for users in the organization.</p>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 text-left max-w-2xl mx-auto">
          <div class="bg-gray-800/50 p-4 rounded-lg">
            <UIcon name="i-heroicons-user" class="w-6 h-6 text-blue-400 mb-2" />
            <h5 class="font-medium text-white mb-1">By Name</h5>
            <p class="text-sm text-gray-400">Search for "John Doe" or "Jane"</p>
          </div>
          <div class="bg-gray-800/50 p-4 rounded-lg">
            <UIcon name="i-heroicons-envelope" class="w-6 h-6 text-green-400 mb-2" />
            <h5 class="font-medium text-white mb-1">By Email</h5>
            <p class="text-sm text-gray-400">Search for "john@gd-ms.com"</p>
          </div>
        </div>
      </div>
    </UCard>

    <!-- Loading State -->
    <div v-if="loading" class="flex items-center justify-center py-12">
      <div class="text-center">
        <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-blue-400 mb-3" />
        <p class="text-gray-400">Searching users...</p>
      </div>
    </div>

    <!-- Error State -->
    <UAlert v-else-if="error" color="red" icon="i-heroicons-exclamation-triangle">
      <template #title>Search failed</template>
      {{ error }}
      <template #actions>
        <UButton @click="searchForUsers(searchQuery)" variant="ghost" size="xs">
          Try Again
        </UButton>
      </template>
    </UAlert>

    <!-- No Results -->
    <UCard v-else-if="searchQuery.length >= 2 && users.length === 0" class="bg-gray-900 border border-gray-800">
      <div class="text-center py-8">
        <UIcon name="i-heroicons-users" class="w-12 h-12 text-gray-500 mx-auto mb-3" />
        <h4 class="text-lg font-medium text-white mb-2">No Users Found</h4>
        <p class="text-gray-400">No users match your search for "{{ searchQuery }}"</p>
      </div>
    </UCard>

    <!-- No Filtered Results -->
    <UCard v-else-if="filteredUsers.length === 0 && users.length > 0" class="bg-gray-900 border border-gray-800">
      <div class="text-center py-8">
        <UIcon name="i-heroicons-funnel" class="w-12 h-12 text-gray-500 mx-auto mb-3" />
        <h4 class="text-lg font-medium text-white mb-2">No Results Found</h4>
        <p class="text-gray-400 mb-4">No users match your current filters.</p>
        <UButton @click="clearFilters" variant="outline" size="sm">
          Clear Filters
        </UButton>
      </div>
    </UCard>

    <!-- Users List -->
    <UCard v-else-if="filteredUsers.length > 0" class="bg-gray-900 border border-gray-800">
      <div class="divide-y divide-gray-700">
        <div 
          v-for="user in filteredUsers" 
          :key="user.userPrincipalName"
          class="p-4 hover:bg-gray-800/50 transition-colors"
        >
          <div class="flex items-center justify-between">
            <!-- User Info -->
            <div class="flex items-center gap-4 flex-1 min-w-0">
              <UserAvatar 
                :user-principal-name="user.userPrincipalName"
                :display-name="user.displayName"
                size="md"
                class="flex-shrink-0"
              />
              
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-3 mb-1">
                  <h4 class="font-medium text-white">{{ user.displayName }}</h4>
                  <!-- Contact Actions -->
                  <div class="flex items-center gap-1">
                    <UButton
                      :to="getEmailLink(user.userPrincipalName)"
                      icon="i-heroicons-envelope"
                      variant="ghost"
                      size="xs"
                      color="gray"
                      title="Send Email"
                    />
                    <UButton
                      :to="getTeamsLink(user.userPrincipalName)"
                      icon="i-simple-icons-microsoftteams"
                      variant="ghost"
                      size="xs"
                      color="gray"
                      title="Start Teams Chat"
                    />
                  </div>
                </div>
                
                <p class="text-sm text-gray-400">{{ user.userPrincipalName }}</p>
                <p v-if="user.jobTitle" class="text-xs text-gray-500">{{ user.jobTitle }}</p>
                
                <!-- User Tags -->
                <div v-if="user.tags.length > 0" class="flex flex-wrap gap-1 mt-2">
                  <UTooltip
                    v-for="tag in user.tags"
                    :key="tag.title"
                    :text="tag.title"
                    :popper="{ placement: 'top' }"
                  >
                    <UBadge
                      :color="tag.color as any"
                      variant="solid"
                      size="xs"
                      class="font-medium cursor-help"
                    >
                      <UIcon 
                        v-if="tag.icon"
                        :name="tag.icon" 
                        class="w-3 h-3 mr-1" 
                      />
                      {{ tag.title }}
                    </UBadge>
                  </UTooltip>
                </div>
                
                <!-- Summary Info -->
                <div class="flex flex-wrap gap-3 mt-2 text-xs text-gray-400">
                  <span v-if="user.awsAccounts.length > 0">
                    <UIcon name="i-heroicons-building-office" class="w-3 h-3 inline mr-1" />
                    {{ user.awsAccounts.length }} account{{ user.awsAccounts.length === 1 ? '' : 's' }}
                  </span>
                  <span v-if="user.roles.length > 0">
                    <UIcon name="i-heroicons-identification" class="w-3 h-3 inline mr-1" />
                    {{ user.roles.length }} role{{ user.roles.length === 1 ? '' : 's' }}
                  </span>
                </div>
                
                <!-- Key Roles -->
                <div v-if="user.roles.length > 0" class="flex flex-wrap gap-1 mt-2">
                  <UBadge
                    v-for="role in user.roles.slice(0, 3)"
                    :key="role"
                    color="gray"
                    variant="soft"
                    size="xs"
                    class="cursor-pointer hover:bg-gray-600"
                    @click="selectedRole = role"
                  >
                    {{ role }}
                  </UBadge>
                  <UBadge
                    v-if="user.roles.length > 3"
                    color="gray"
                    variant="outline"
                    size="xs"
                  >
                    +{{ user.roles.length - 3 }} more
                  </UBadge>
                </div>
              </div>
            </div>

            <!-- View Details Button -->
            <UButton
              @click="handleUserClick(user.userPrincipalName)"
              variant="outline"
              size="sm"
              icon="i-heroicons-arrow-top-right-on-square"
            >
              View Details
            </UButton>
          </div>
        </div>
      </div>
    </UCard>

    <!-- Quick Actions -->
    <div class="flex items-center gap-3 pt-4 border-t border-gray-700">
      <span class="text-sm text-gray-400">Quick actions:</span>
      <NuxtLink to="/account/explorer">
        <UButton 
          icon="i-heroicons-magnifying-glass" 
          variant="ghost" 
          size="sm"
        >
          Browse Accounts
        </UButton>
      </NuxtLink>
      <NuxtLink to="/account/user/my-access">
        <UButton 
          icon="i-heroicons-user-group" 
          variant="ghost" 
          size="sm"
        >
          My AWS Access
        </UButton>
      </NuxtLink>
    </div>
  </div>
</template>

<style scoped>
/* Smooth transitions for interactions */
.transition-all {
  transition: all 0.2s ease;
}

.transition-colors {
  transition: color 0.2s ease, background-color 0.2s ease, border-color 0.2s ease;
}

.transition-transform {
  transition: transform 0.2s ease;
}

/* Enhance scrollbars */
:deep(.scrollable) {
  scrollbar-width: thin;
  scrollbar-color: rgba(107, 114, 128, 0.5) transparent;
}

:deep(.scrollable::-webkit-scrollbar) {
  width: 6px;
  height: 6px;
}

:deep(.scrollable::-webkit-scrollbar-track) {
  background: transparent;
}

:deep(.scrollable::-webkit-scrollbar-thumb) {
  background-color: rgba(107, 114, 128, 0.5);
  border-radius: 3px;
}
</style> 