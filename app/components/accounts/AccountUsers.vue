<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue'
import { exportUsersToCSV, exportFilteredUsersToCSV } from '~/utils/csvExport'
import { convertToUsernameSlug } from '~/utils/userUtils'
import UserAvatar from '~/components/ui/UserAvatar.vue'

interface Props {
  accountId: string
  accountName?: string
  accountInfo?: {
    id: string
    name: string
    isGovCloud: boolean
    standardAccountId?: string
    govCloudAccountId?: string
    status?: string
  }
}

interface User {
  userPrincipalName: string
  displayName: string
  jobTitle?: string
  roles: string[]
  tags: Array<{title: string, color: string, icon?: string}>
}

const props = defineProps<Props>()

// Component state
const users = ref<User[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const searchTerm = ref('')
const selectedRole = ref<string | null>(null)

// Composables
const { user } = useOidcAuth()
const { fetchGroupMembers, getUserTags, batchGetUserTags } = useGroupMembers()
const awsAccountsStore = useAwsAccountsStore()

// Get account info to handle commercial vs GovCloud IDs
const accountInfo = computed(() => {
  if (props.accountInfo) {
    return props.accountInfo
  }
  
  const account = awsAccountsStore.accounts[props.accountId]
  return account || {
    id: props.accountId,
    name: props.accountName || `Account ${props.accountId}`,
    isGovCloud: false,
    standardAccountId: props.accountId,
    govCloudAccountId: undefined
  }
})

// Simplified access type display
const accessTypeLabel = computed(() => {
  const hasGovCloud = accountInfo.value.govCloudAccountId && 
                      accountInfo.value.govCloudAccountId !== accountInfo.value.standardAccountId
  return hasGovCloud ? 'Multi-Environment Access' : 'Single Cloud Access'
})

// Filtered users based on search and role
const filteredUsers = computed(() => {
  let filtered = users.value

  // Filter by search term
  if (searchTerm.value.trim()) {
    const search = searchTerm.value.toLowerCase().trim()
    filtered = filtered.filter(user => 
      user.displayName.toLowerCase().includes(search) ||
      user.userPrincipalName.toLowerCase().includes(search) ||
      (user.jobTitle && user.jobTitle.toLowerCase().includes(search)) ||
      user.roles.some(role => role.toLowerCase().includes(search))
    )
  }

  // Filter by selected role
  if (selectedRole.value) {
    filtered = filtered.filter(user => 
      user.roles.includes(selectedRole.value!)
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

// Load users for this account
const loadAccountUsers = async () => {
  if (!user.value?.accessToken || !props.accountId) return

  try {
    loading.value = true
    error.value = null

    const standardId = accountInfo.value.standardAccountId || props.accountId
    const govCloudId = accountInfo.value.govCloudAccountId

    // Fetch users from both standard and GovCloud accounts if they exist
    const userPromises = []
    
    if (standardId) {
      userPromises.push(fetchGroupMembers(standardId, user.value.accessToken))
    }
    
    if (govCloudId && govCloudId !== standardId) {
      userPromises.push(fetchGroupMembers(govCloudId, user.value.accessToken))
    }

    const results = await Promise.all(userPromises)

    // Combine and deduplicate users from both accounts
    const userMap = new Map<string, User>()
    
    results.forEach((result) => {
      if (!result.members) return
      
      result.members.forEach(member => {
        if (userMap.has(member.userPrincipalName)) {
          // Merge roles
          const existing = userMap.get(member.userPrincipalName)!
          member.roles.forEach(role => {
            if (!existing.roles.includes(role)) {
              existing.roles.push(role)
            }
          })
        } else {
          userMap.set(member.userPrincipalName, {
            userPrincipalName: member.userPrincipalName,
            displayName: member.displayName,
            jobTitle: member.jobTitle,
            roles: [...member.roles],
            tags: [] // Will be filled by batch operation
          })
        }
      })
    })

    const usersWithGroups = Array.from(userMap.values())
    
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
      })).sort((a, b) => a.displayName.localeCompare(b.displayName))
      
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
      
      users.value = (await Promise.all(tagPromises)).sort((a, b) => 
        a.displayName.localeCompare(b.displayName)
      )
    }

  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load users'
    console.error('Error loading account users:', err)
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
  searchTerm.value = ''
  selectedRole.value = null
}

const handleExportCSV = () => {
  const exportData = filteredUsers.value.map(user => ({
    displayName: user.displayName,
    userPrincipalName: user.userPrincipalName,
    jobTitle: user.jobTitle || '',
    roles: user.roles,
    tags: user.tags,
    accountId: props.accountId,
    accountName: accountInfo.value.name,
    isGovCloud: accountInfo.value.isGovCloud,
    department: '',
    officeLocation: '',
    businessPhones: [],
    mobilePhone: '',
    manager: '',
    lastModified: new Date().toISOString(),
    awsAccounts: [{
      accountId: props.accountId,
      accountName: accountInfo.value.name,
      accountAlias: accountInfo.value.name,
      environment: accountInfo.value.isGovCloud ? 'GovCloud' : 'Commercial',
      projectName: '',
      roles: user.roles,
      isGovCloud: accountInfo.value.isGovCloud,
      status: accountInfo.value.status || 'Active',
      accessType: 'group' as const,
      groupName: '',
      lastAccessed: 'Unknown'
    }],
    distributionGroups: [],
    securityGroups: [],
    totalAccounts: 1,
    totalRoles: user.roles.length,
    highestPrivilegeLevel: 'none' as const,
    complianceFlags: []
  }))

  if (selectedRole.value || searchTerm.value) {
    exportFilteredUsersToCSV(
      exportData,
      { searchTerm: searchTerm.value, selectedRole: selectedRole.value || undefined },
      {
        id: props.accountId,
        name: accountInfo.value.name,
        isGovCloud: accountInfo.value.isGovCloud
      }
    )
  } else {
    exportUsersToCSV(exportData, {
      id: props.accountId,
      name: accountInfo.value.name,
      isGovCloud: accountInfo.value.isGovCloud
    })
  }
}

// Load data when component mounts
onMounted(() => {
  loadAccountUsers()
})

// Watch for account ID changes
watch(() => props.accountId, () => {
  if (props.accountId) {
    clearFilters()
    loadAccountUsers()
  }
})
</script>

<template>
  <div class="space-y-6">
    <!-- Simplified Header with Search and Actions -->
    <UCard class="bg-gray-900 border border-gray-800">
      <div class="p-4">
        <div class="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          <!-- Search and Filters -->
          <div class="flex flex-col sm:flex-row gap-3 flex-1">
            <div class="flex-1 max-w-md">
              <UInput
                v-model="searchTerm"
                placeholder="Search users..."
                icon="i-heroicons-magnifying-glass"
                size="sm"
              />
            </div>
            <USelectMenu
              v-model="selectedRole"
              :options="[{ label: 'All Roles', value: null }, ...allRoles.map(role => ({ label: role, value: role }))]"
              placeholder="Filter by role"
              size="sm"
              class="min-w-[180px]"
            />
            <UButton
              v-if="searchTerm || selectedRole"
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
              @click="loadAccountUsers" 
              :loading="loading" 
              icon="i-heroicons-arrow-path" 
              variant="ghost" 
              size="sm"
            >
              Refresh
            </UButton>
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
        <div class="flex items-center gap-4 mt-4 pt-4 border-t border-gray-700">
          <UBadge color="primary" variant="soft" size="sm">
            {{ users.length }} {{ users.length === 1 ? 'User' : 'Users' }}
          </UBadge>
          <UBadge v-if="filteredUsers.length !== users.length" color="blue" variant="soft" size="sm">
            {{ filteredUsers.length }} Filtered
          </UBadge>
          <span class="text-sm text-gray-400">{{ accessTypeLabel }}</span>
        </div>
      </div>
    </UCard>

    <!-- Loading State -->
    <div v-if="loading" class="flex items-center justify-center py-12">
      <div class="text-center">
        <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-blue-400 mb-3" />
        <p class="text-gray-400">Loading users...</p>
      </div>
    </div>

    <!-- Error State -->
    <UAlert v-else-if="error" color="red" icon="i-heroicons-exclamation-triangle">
      <template #title>Failed to load users</template>
      {{ error }}
      <template #actions>
        <UButton @click="loadAccountUsers" variant="ghost" size="xs">
          Try Again
        </UButton>
      </template>
    </UAlert>

    <!-- Empty State -->
    <UCard v-else-if="users.length === 0" class="bg-gray-900 border border-gray-800">
      <div class="text-center py-12">
        <UIcon name="i-heroicons-users" class="w-16 h-16 text-gray-500 mx-auto mb-4" />
        <h4 class="text-xl font-medium text-white mb-2">No Users Found</h4>
        <p class="text-gray-400">No users have access to this AWS account.</p>
      </div>
    </UCard>

    <!-- No Filtered Results -->
    <UCard v-else-if="filteredUsers.length === 0" class="bg-gray-900 border border-gray-800">
      <div class="text-center py-8">
        <UIcon name="i-heroicons-funnel" class="w-12 h-12 text-gray-500 mx-auto mb-3" />
        <h4 class="text-lg font-medium text-white mb-2">No Results Found</h4>
        <p class="text-gray-400 mb-4">No users match your current search criteria.</p>
        <UButton @click="clearFilters" variant="outline" size="sm">
          Clear Filters
        </UButton>
      </div>
    </UCard>

    <!-- Simplified Users List -->
    <UCard v-else class="bg-gray-900 border border-gray-800">
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
                <div class="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                  <h4 class="font-medium text-white text-lg sm:text-base">{{ user.displayName }}</h4>
                  <!-- Contact Actions - More prominent on small screens -->
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
                
                <p class="text-sm text-gray-400 font-medium sm:font-normal">{{ user.userPrincipalName }}</p>
                <p v-if="user.jobTitle" class="text-xs text-gray-500">{{ user.jobTitle }}</p>
                
                <!-- User Tags -->
                <div v-if="user.tags.length > 0" class="flex flex-wrap gap-1 mt-2">
                  <UTooltip
                    v-for="tag in user.tags"
                    :key="tag.title"
                    :text="tag.description || tag.title"
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
                
                <!-- Simplified Roles - Less prominent on small screens -->
                <div v-if="user.roles.length > 0" class="flex flex-wrap gap-1 mt-2">
                  <UBadge
                    v-for="role in user.roles.slice(0, 2)"
                    :key="role"
                    color="gray"
                    variant="soft"
                    size="xs"
                    class="cursor-pointer hover:bg-gray-600 sm:inline-flex"
                    @click="selectedRole = role"
                  >
                    {{ role }}
                  </UBadge>
                  <!-- Show more roles on larger screens -->
                  <UBadge
                    v-for="role in user.roles.slice(2, 4)"
                    :key="role"
                    color="gray"
                    variant="soft"
                    size="xs"
                    class="cursor-pointer hover:bg-gray-600 hidden sm:inline-flex"
                    @click="selectedRole = role"
                  >
                    {{ role }}
                  </UBadge>
                  <UBadge
                    v-if="user.roles.length > 4"
                    color="gray"
                    variant="outline"
                    size="xs"
                    class="hidden sm:inline-flex"
                  >
                    +{{ user.roles.length - 4 }} more
                  </UBadge>
                  <UBadge
                    v-if="user.roles.length > 2"
                    color="gray"
                    variant="outline"
                    size="xs"
                    class="sm:hidden"
                  >
                    +{{ user.roles.length - 2 }} more
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