<script setup lang="ts">
import { parseGroupDescription, convertToUsernameSlug } from '~/utils/userUtils'
import { useGroupMembers } from '~/composables/useGroupMembers'
import UserAvatar from '~/components/ui/UserAvatar.vue'

interface Props {
  accountId: string
  accountName?: string
  standardAccountId?: string
  govCloudAccountId?: string
}

interface GroupMember {
  userPrincipalName: string
  displayName: string
  jobTitle?: string
}

interface AccountGroup {
  id: string
  displayName: string
  role: string
  memberCount: number
  members: GroupMember[]
  description?: string
  owners: string[]
  cleanDescription: string
  expanded: boolean
  loadingMembers: boolean
  accountType: 'commercial' | 'govcloud'
  sourceAccountId: string
}

const props = defineProps<Props>()

// Component state
const groups = ref<AccountGroup[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const searchQuery = ref('')
const selectedEnvironment = ref<'all' | 'commercial' | 'govcloud'>('all')

// Composables
const { user } = useOidcAuth()
const { fetchMembersForGroup } = useGroupMembers()

// Parse AWS group role from display name
const parseAwsGroupRole = (groupName: string, accountId: string): string | null => {
  // Support both AWS-ID_ROLE and AWS-ID-ROLE patterns
  const awsGroupRegex = new RegExp(`^AWS-${accountId}[_-](.+)$`)
  const match = groupName.match(awsGroupRegex)
  return match ? match[1] : null
}

// Computed filtered groups
const filteredGroups = computed(() => {
  let filtered = groups.value

  // Filter by environment
  if (selectedEnvironment.value !== 'all') {
    filtered = filtered.filter(group => group.accountType === selectedEnvironment.value)
  }

  // Filter by search query
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    filtered = filtered.filter(group => 
      group.role.toLowerCase().includes(query) ||
      group.displayName.toLowerCase().includes(query) ||
      group.owners.some(owner => owner.toLowerCase().includes(query))
    )
  }

  return filtered
})

// Group by role for better organization
const groupsByRole = computed(() => {
  const grouped = new Map<string, AccountGroup[]>()
  
  filteredGroups.value.forEach(group => {
    // Ensure role is defined, default to 'other' if not
    const role = group.role || 'other'
    if (!grouped.has(role)) {
      grouped.set(role, [])
    }
    grouped.get(role)?.push(group)
  })

  // Convert to array and sort with null checks
  return Array.from(grouped.entries())
    .sort(([a], [b]) => {
      // Add null checks to prevent TypeError
      const roleA = a || 'other'
      const roleB = b || 'other'
      return roleA.localeCompare(roleB)
    })
    .map(([role, roleGroups]) => ({
      role,
      groups: roleGroups.sort((a, b) => {
        // Add null checks for accountType comparison
        const typeA = a.accountType || 'commercial'
        const typeB = b.accountType || 'commercial'
        return typeA.localeCompare(typeB)
      })
    }))
})

// Environment options
const environmentOptions = computed(() => {
  const hasCommercial = groups.value.some(g => g.accountType === 'commercial')
  const hasGovCloud = groups.value.some(g => g.accountType === 'govcloud')
  
  const options = [{ label: 'All Environments', value: 'all' }]
  
  if (hasCommercial) {
    options.push({ label: 'Commercial', value: 'commercial' })
  }
  if (hasGovCloud) {
    options.push({ label: 'GovCloud', value: 'govcloud' })
  }
  
  return options
})

// Toggle group member expansion
const toggleGroupMembers = async (groupIndex: number) => {
  const allGroups = filteredGroups.value
  const group = allGroups[groupIndex]
  
  if (group.expanded) {
    group.expanded = false
    return
  }
  
  group.expanded = true
  
  if (group.members.length === 0 && group.memberCount > 0) {
    await loadGroupMembers(group)
  }
}

// Load members for a specific group
const loadGroupMembers = async (group: AccountGroup) => {
  if (!user.value?.accessToken) return
  
  try {
    group.loadingMembers = true
    
    const response = await fetchMembersForGroup(group.id, user.value.accessToken)
    const members = response.members || []
    
    group.members = members.map(member => ({
      userPrincipalName: member.userPrincipalName,
      displayName: member.displayName,
      jobTitle: member.jobTitle
    }))
    
  } catch (err) {
    console.warn(`Failed to load members for group ${group.displayName}:`, err)
  } finally {
    group.loadingMembers = false
  }
}

// Navigate to user profile
const handleUserClick = (userPrincipalName: string) => {
  const username = convertToUsernameSlug(userPrincipalName)
  navigateTo(`/account/user/${username}`)
}

// Load groups for this account
const loadAccountGroups = async () => {
  loading.value = true
  error.value = null
  groups.value = []

  try {
    // Get access token from user
    if (!user.value?.accessToken) {
      throw new Error('No access token available')
    }
    const accessToken = user.value.accessToken
    
    // Collect unique account IDs to search for
    const accountsToSearch = new Set<string>()
    
    // Add the primary account ID
    if (props.accountId) {
      accountsToSearch.add(props.accountId)
    }
    
    // Add standard account ID if different
    if (props.standardAccountId && props.standardAccountId !== props.accountId) {
      accountsToSearch.add(props.standardAccountId)
    }
    
    // Add GovCloud account ID if different  
    if (props.govCloudAccountId && props.govCloudAccountId !== props.accountId && props.govCloudAccountId !== props.standardAccountId) {
      accountsToSearch.add(props.govCloudAccountId)
    }
    
    if (accountsToSearch.size === 0) {
      throw new Error('No account IDs available to search for groups')
    }
    
    // Fetch all groups directly from Graph API
    const allGroupsRaw: any[] = []
    let nextUrl = `https://graph.microsoft.us/v1.0/groups?$top=999&$select=id,displayName,description,mailEnabled`
    
    // Paginate through all groups
    while (nextUrl) {
      const response = await fetch(nextUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (!response.ok) {
        throw new Error(`Failed to fetch groups: ${response.statusText}`)
      }
      
      const data = await response.json()
      allGroupsRaw.push(...(data.value || []))
      nextUrl = data['@odata.nextLink'] || ''
    }
    
    const allGroups: AccountGroup[] = []
    
    // Filter groups for each unique account ID
    for (const accountId of accountsToSearch) {
      try {
        // Filter groups that match this account ID pattern (AWS-ACCOUNTID_ROLE or AWS-ACCOUNTID-ROLE)
        const accountGroups = allGroupsRaw.filter((group: any) => {
          const groupName = group.displayName || ''
          return groupName.startsWith(`AWS-${accountId}_`) || 
                 groupName.startsWith(`AWS-${accountId}-`)
        })
        
        // Process groups and determine their properties
        for (const group of accountGroups) {
          try {
            // Parse the role from the group name
            const role = parseAwsGroupRole(group.displayName, accountId) || 'other'
            
            // Determine account type
            const isGovCloud = props.govCloudAccountId === accountId
            const accountType = isGovCloud ? 'govcloud' : 'commercial'
            
            // Get member count
            const memberResponse = await fetchMembersForGroup(group.id, accessToken)
            const memberCount = memberResponse.members ? memberResponse.members.length : 0
            
            // Parse description for owners and clean description
            const { cleanDescription, owners } = parseGroupDescription(group.description || '')
            
            allGroups.push({
              id: group.id,
              displayName: group.displayName,
              role,
              memberCount,
              members: [],
              description: group.description,
              owners,
              cleanDescription,
              expanded: false,
              loadingMembers: false,
              accountType,
              sourceAccountId: accountId
            })
          } catch (memberError) {
            console.warn(`Failed to fetch members for group ${group.displayName}:`, memberError)
            
            // Still add the group with default values
            const role = parseAwsGroupRole(group.displayName, accountId) || 'other'
            const isGovCloud = props.govCloudAccountId === accountId
            const accountType = isGovCloud ? 'govcloud' : 'commercial'
            const { cleanDescription, owners } = parseGroupDescription(group.description || '')
            
            allGroups.push({
              id: group.id,
              displayName: group.displayName,
              role,
              memberCount: 0,
              members: [],
              description: group.description,
              owners,
              cleanDescription,
              expanded: false,
              loadingMembers: false,
              accountType,
              sourceAccountId: accountId
            })
          }
        }
        
      } catch (groupError) {
        console.error(`Failed to fetch groups for account ${accountId}:`, groupError)
      }
    }
    
    // Sort groups by role hierarchy and name
    groups.value = allGroups.sort((a, b) => {
      const roleOrder = { 'admin': 0, 'poweruser': 1, 'readonly': 2, 'other': 3 }
      const aRole = a.role || 'other'
      const bRole = b.role || 'other'
      
      if (aRole !== bRole) {
        return (roleOrder[aRole] || 999) - (roleOrder[bRole] || 999)
      }
      
      return a.displayName.localeCompare(b.displayName)
    })
    
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load groups'
    console.error('Error loading account groups:', err)
  } finally {
    loading.value = false
  }
}

// Clear filters
const clearFilters = () => {
  searchQuery.value = ''
  selectedEnvironment.value = 'all'
}

// Load data when component mounts
onMounted(() => {
  loadAccountGroups()
})

// Watch for prop changes
watch([() => props.standardAccountId, () => props.govCloudAccountId], () => {
  loadAccountGroups()
})
</script>

<template>
  <UCard class="bg-gray-900 border border-gray-800">
    <template #header>
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-lg font-semibold text-white">AWS Groups</h3>
          <p class="text-sm text-gray-400">
            {{ filteredGroups.length }} of {{ groups.length }} group{{ groups.length === 1 ? '' : 's' }}
          </p>
        </div>
        <UButton 
          @click="loadAccountGroups" 
          :loading="loading" 
          icon="i-heroicons-arrow-path" 
          variant="ghost" 
          size="sm"
        >
          Refresh
        </UButton>
      </div>
    </template>

    <!-- Filters -->
    <div v-if="groups.length > 0" class="flex flex-col sm:flex-row gap-3 p-4 border-b border-gray-700">
      <div class="flex-1">
        <UInput
          v-model="searchQuery"
          icon="i-heroicons-magnifying-glass"
          placeholder="Search roles, groups, or owners..."
          size="sm"
        />
      </div>
      <div class="flex items-center gap-2">
        <USelectMenu
          v-model="selectedEnvironment"
          :options="environmentOptions"
          size="sm"
          class="min-w-[150px]"
        />
        <UButton
          v-if="searchQuery || selectedEnvironment !== 'all'"
          @click="clearFilters"
          icon="i-heroicons-x-mark"
          variant="ghost"
          size="sm"
        >
          Clear
        </UButton>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="flex items-center justify-center py-12">
      <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-gray-400" />
      <span class="ml-2 text-gray-400">Loading groups...</span>
    </div>

    <!-- Error State -->
    <UAlert v-else-if="error" color="red" icon="i-heroicons-exclamation-triangle">
      <template #title>Failed to load groups</template>
      {{ error }}
      <template #actions>
        <UButton @click="loadAccountGroups" variant="ghost" size="xs">
          Try Again
        </UButton>
      </template>
    </UAlert>

    <!-- Empty State -->
    <div v-else-if="groups.length === 0" class="text-center py-12">
      <UIcon name="i-heroicons-user-group" class="w-12 h-12 text-gray-500 mx-auto mb-4" />
      <h4 class="text-lg font-medium text-white mb-2">No Groups Found</h4>
      <p class="text-gray-400">No AWS groups found for this account.</p>
    </div>

    <!-- No Filtered Results -->
    <div v-else-if="filteredGroups.length === 0" class="text-center py-8">
      <UIcon name="i-heroicons-magnifying-glass" class="w-8 h-8 text-gray-500 mx-auto mb-3" />
      <h4 class="font-medium text-white mb-2">No matches found</h4>
      <p class="text-gray-400 mb-4">Try adjusting your search or filters.</p>
      <UButton @click="clearFilters" variant="outline" size="sm">
        Clear Filters
      </UButton>
    </div>

    <!-- Groups by Role -->
    <div v-else class="space-y-6 p-4">
      <div v-for="({ role, groups: roleGroups }) in groupsByRole" :key="role" class="space-y-3">
        <!-- Role Header - Clean and simple -->
        <div class="flex items-center gap-3 pb-2 border-b border-gray-700">
          <h4 class="text-lg font-medium text-white capitalize">{{ role }}</h4>
          <UBadge color="gray" variant="soft" size="xs">
            {{ roleGroups.length }} environment{{ roleGroups.length === 1 ? '' : 's' }}
          </UBadge>
        </div>

        <!-- Groups for this role -->
        <div class="space-y-2 ml-4">
          <div 
            v-for="(group, groupIndex) in roleGroups" 
            :key="group.id"
            class="bg-gray-800/50 rounded-lg border border-gray-700 overflow-hidden hover:border-gray-600 transition-colors"
          >
            <!-- Group Header - Simplified -->
            <div class="p-4 cursor-pointer hover:bg-gray-800/70 transition-colors"
                 @click="toggleGroupMembers(filteredGroups.indexOf(group))">
              <div class="flex items-center justify-between">
                <!-- Group Info -->
                <div class="flex items-center gap-3">
                  <div class="flex items-center gap-2">
                    <!-- Environment Indicator - Subtle -->
                    <div class="w-2 h-2 rounded-full" 
                         :class="group.accountType === 'govcloud' ? 'bg-blue-400' : 'bg-green-400'">
                    </div>
                    <span class="text-sm font-medium text-white">{{ group.displayName }}</span>
                  </div>
                </div>
                
                <!-- Stats and Expand Icon -->
                <div class="flex items-center gap-4 text-sm text-gray-400">
                  <!-- Member Count -->
                  <div class="flex items-center gap-1">
                    <UIcon name="i-heroicons-users" class="w-4 h-4" />
                    <span>{{ group.memberCount }}</span>
                  </div>
                  
                  <!-- Owners Count -->
                  <div v-if="group.owners.length > 0" class="flex items-center gap-1">
                    <UIcon name="i-heroicons-user-circle" class="w-4 h-4" />
                    <span>{{ group.owners.length }}</span>
                  </div>

                  <!-- Expand Icon -->
                  <UIcon 
                    :name="group.expanded ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'" 
                    class="w-4 h-4 text-gray-400" 
                  />
                </div>
              </div>
              
              <!-- Environment Label - Only show when expanded or on hover -->
              <div v-if="group.expanded || group.accountType === 'govcloud'" class="mt-2">
                <span class="text-xs text-gray-500">
                  {{ group.accountType === 'govcloud' ? 'GovCloud Environment' : 'Commercial Environment' }}
                </span>
              </div>
            </div>

            <!-- Expanded Content - Cleaner styling -->
            <div v-if="group.expanded" class="px-4 pb-4 border-t border-gray-700 bg-gray-900/30">
              <!-- Owners - Simplified -->
              <div v-if="group.owners.length > 0" class="mt-4 mb-4">
                <p class="text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
                  <UIcon name="i-heroicons-user-circle" class="w-4 h-4" />
                  Owners
                </p>
                <div class="flex flex-wrap gap-2">
                  <span 
                    v-for="owner in group.owners" 
                    :key="owner"
                    :class="[
                      'px-2 py-1 rounded text-xs transition-colors',
                      owner === 'GDMSCloud.AWS'
                        ? 'bg-gray-600 text-gray-300'
                        : 'bg-gray-700 text-gray-300 cursor-pointer hover:bg-gray-600'
                    ]"
                    @click="owner !== 'GDMSCloud.AWS' ? $router.push(`/account/user/${convertToUsernameSlug(owner + '@gd-ms.com')}`) : null"
                    :title="owner === 'GDMSCloud.AWS' 
                      ? 'GDMS Landing Zone Owned Group - This group is managed by the GDMS Cloud Platform team' 
                      : `View ${owner}'s access details`"
                  >
                    <span class="flex items-center gap-1">
                      {{ owner }}
                      <UIcon 
                        v-if="owner !== 'GDMSCloud.AWS'"
                        name="i-heroicons-arrow-top-right-on-square" 
                        class="w-3 h-3" 
                      />
                      <UIcon 
                        v-else
                        name="i-heroicons-shield-check" 
                        class="w-3 h-3 text-gray-400" 
                      />
                    </span>
                  </span>
                </div>
              </div>

              <!-- Description -->
              <div v-if="group.cleanDescription" class="mb-4">
                <p class="text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
                  <UIcon name="i-heroicons-information-circle" class="w-4 h-4" />
                  Description
                </p>
                <p class="text-sm text-gray-400 pl-6">{{ group.cleanDescription }}</p>
              </div>

              <!-- Members - Cleaner grid -->
              <div v-if="group.memberCount >= 0">
                <p class="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
                  <UIcon name="i-heroicons-users" class="w-4 h-4" />
                  Members ({{ group.memberCount }})
                </p>
                
                <div v-if="group.loadingMembers" class="flex items-center justify-center py-6">
                  <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin text-gray-400" />
                  <span class="ml-2 text-sm text-gray-400">Loading members...</span>
                </div>
                
                <div v-else-if="group.memberCount === 0" class="pl-6 text-center py-4">
                  <UIcon name="i-heroicons-user-group" class="w-8 h-8 text-gray-500 mx-auto mb-2" />
                  <p class="text-sm text-gray-400">No members in this group</p>
                </div>
                
                <div v-else-if="group.members.length > 0" class="pl-6 grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                  <div 
                    v-for="member in group.members" 
                    :key="member.userPrincipalName"
                    class="flex items-center gap-3 p-2 bg-gray-800/50 rounded cursor-pointer hover:bg-gray-700/50 transition-colors"
                    @click="handleUserClick(member.userPrincipalName)"
                  >
                    <UserAvatar 
                      :user-principal-name="member.userPrincipalName"
                      :display-name="member.displayName"
                      size="xs"
                      class="flex-shrink-0"
                    />
                    <div class="flex-1 min-w-0">
                      <p class="font-medium text-white text-base">{{ member.displayName }}</p>
                      <p class="text-xs text-gray-500 truncate">{{ member.userPrincipalName }}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </UCard>
</template> 