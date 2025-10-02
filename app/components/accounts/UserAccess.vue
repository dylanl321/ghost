<script setup lang="ts">
/*
 * UserAccess Component - Enhanced AWS Account Access Display
 * 
 * Key Features:
 * 1. Commercial/GovCloud ID Mapping: Always links to commercial account IDs for consistency
 * 2. Environment Access Display: Shows Commercial, GovCloud, or Both access clearly
 * 3. Direct vs Group Membership: Tracks and displays access source
 * 4. Clickable Role Filters: Role badges filter the view when clicked
 * 5. Prominent Contact Options: Email, Teams, and other communication tools
 * 6. Modern UI: Clean cards with clear access indicators
 * 7. View Toggle: Switch between detailed cards and compact table view
 * 8. Help System: Tooltips and explanations for complex terminology
 * 9. Group Details: Modal for viewing group membership details
 */

import { computed, ref, onMounted, watch } from 'vue'
import { parseGroupDescription, convertToUsernameSlug } from '~/utils/userUtils'
import { useGroupMembers } from '~/composables/useGroupMembers'
import UserAvatar from '../ui/UserAvatar.vue'
import { 
  exportEnhancedUserAccessToCSV, 
  exportUserAccessToJSON, 
  transformUserAccessDataForExport 
} from '~/utils/csvExport'

interface Props {
  userPrincipalName: string
  displayName?: string
  showUserInfo?: boolean
  showHeader?: boolean
  showControls?: boolean
  showStats?: boolean
  showInactiveAccounts?: boolean
}

interface AccountAccess {
  accountId: string
  accountName: string
  roles: string[]
  environments: ('commercial' | 'govcloud')[]
  isActive: boolean
  hasMultiEnvironment: boolean
  membershipSource: 'direct' | 'group' | 'mixed'
  directRoles: string[]
  groupRoles: string[]
  groupDetails: Array<{
    groupName: string
    groupId: string
    role: string
    environment: string
    description?: string
    owners: string[]
    cleanDescription: string
  }>
}

interface GroupDetail {
  groupName: string
  groupId: string
  role: string
  environment: string
  accountName: string
  accountId: string
  description?: string
  owners: string[]
  cleanDescription: string
  members: Array<{
    userPrincipalName: string
    displayName: string
    jobTitle?: string
  }>
  memberCount: number
  loadingMembers: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showUserInfo: true,
  showHeader: true,
  showControls: true,
  showStats: true,
  showInactiveAccounts: true
})

// Component state
const accounts = ref<AccountAccess[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const userProfile = ref<any>(null)
const selectedRoleFilter = ref<string>('')
const viewMode = ref<'cards' | 'table'>('cards')
const showHelpModal = ref(false)
const showGroupModal = ref(false)
const selectedGroupDetails = ref<GroupDetail[]>([])
const loadingGroupDetails = ref(false)
const showInactiveAccounts = ref(props.showInactiveAccounts ?? false)

// Export functionality
const showExportModal = ref(false)
const exportOptions = ref({
  format: 'detailed' as 'standard' | 'detailed' | 'summary' | 'compliance' | 'audit',
  includeContactInfo: false,
  includeGroupDetails: true,
  includeComplianceData: true,
  fileType: 'csv' as 'csv' | 'json'
})

// Composables
const { user } = useOidcAuth()
const { fetchUserProfile, fetchUserMemberOf, fetchGroupDetails } = useGraphApi()
const { sortRolesByPriority } = useAwsGroupParser()
const awsAccountsStore = useAwsAccountsStore()
const { fetchMembersForGroup, getUserTags } = useGroupMembers()
const enclaveStore = useEnclaveStore()
const { usernameMatches } = useEnclaveRoles()

// Initialize loading state properly
const isInitializing = ref(true)
const userTags = ref<Array<{title: string, color: string, icon?: string, description?: string}>>([])

// Load data when component mounts
onMounted(async () => {
  try {
    isInitializing.value = true
    await awsAccountsStore.initialize()
    await awsAccountsStore.initializeAllAccounts()
    if (props.userPrincipalName) {
      await loadUserAccess()
      await loadUserTags()
    }
  } finally {
    isInitializing.value = false
  }
})

// Enhanced account name resolution with multiple fallbacks
const resolveAccountName = async (accountId: string): Promise<string> => {
  console.log(`🔍 Resolving account name for: ${accountId}`)
  
  try {
    // Method 1: Check user's personal accounts store
    const userAccount = awsAccountsStore.accounts[accountId]
    if (userAccount?.accountName) {
      console.log(`✅ Found account ${accountId} in user store:`, userAccount.accountName)
      return userAccount.accountName
    } else {
      console.log(`❌ Account ${accountId} not found in user store`)
    }

    // Method 2: Check all system accounts store
    const systemAccount = awsAccountsStore.findAccountById(accountId)
    if (systemAccount?.accountName) {
      console.log(`✅ Found account ${accountId} in system store:`, systemAccount.accountName)
      return systemAccount.accountName
    } else {
      console.log(`❌ Account ${accountId} not found in system store`)
    }

    // Debug: Check what's actually in the stores
    console.log(`📊 User store has ${Object.keys(awsAccountsStore.accounts).length} accounts`)
    console.log(`📊 System store initialized: ${awsAccountsStore.allAccountsInitialized}`)

    // Method 3: Format the account ID nicely as fallback (skip API for now)
    let fallbackName: string
    if (accountId.length === 12 && /^\d+$/.test(accountId)) {
      fallbackName = `AWS Account ${accountId}`
    } else {
      fallbackName = `Account ${accountId}`
    }
    
    console.log(`📝 Using fallback name for ${accountId}: ${fallbackName}`)
    return fallbackName
    
  } catch (error) {
    console.warn(`❌ Account resolution failed for ${accountId}:`, error)
    return `Account ${accountId}`
  }
}

// Parse AWS groups from Graph API groups
const parseAwsGroups = (groups: any[]) => {
  const awsGroups: any[] = []
  
  // Support both AWS-ID_ROLE and AWS-ID-ROLE patterns
  const awsGroupRegex = /^AWS-(\d{12})[_-](.+)$/
  
  groups.forEach((group: any) => {
    const groupName = group.displayName
    if (!groupName) return
    
    try {
      // Check for AWS role groups (Something like "AWS-266632029214_GDSSO_IAMAdmin")
      const awsMatch = groupName.match(awsGroupRegex)
      if (awsMatch) {
        const [, accountId, roleName] = awsMatch
        awsGroups.push({
          id: group.id,
          displayName: groupName,
          accountId,
          role: roleName,
          description: group.description || ''
        })
      }
    } catch {
      // Silently ignore groups that don't match our patterns
      console.debug(`Skipped group that couldn't be parsed: ${groupName}`)
    }
  })
  
  console.log(`Parsed ${awsGroups.length} AWS groups from ${groups.length} total groups`)
  return awsGroups
}

// Load user's AWS access
const loadUserAccess = async () => {
  if (!user.value?.accessToken || !props.userPrincipalName) {
    loading.value = false
    return
  }

  try {
    loading.value = true
    error.value = null

    // Get user profile if showing user info
    if (props.showUserInfo) {
      try {
        userProfile.value = await fetchUserProfile(props.userPrincipalName, user.value.accessToken)
      } catch (err) {
        console.warn('Failed to fetch user profile:', err)
      }
    }

    // Get user's groups
    const userGroups = await fetchUserMemberOf(user.value.accessToken, props.userPrincipalName)
    
    // Parse AWS groups
    const awsGroups = parseAwsGroups(userGroups)
    
    // Group by account and collect detailed access info
    const accountMap = new Map<string, AccountAccess>()

    // Process groups sequentially to avoid overwhelming the API
    for (const group of awsGroups) {
      // Skip groups with undefined accountId or role
      if (!group.accountId || !group.role) {
        continue
      }
      
      const accountData = awsAccountsStore.findAccountById(group.accountId!)

      // Use commercial ID for grouping (primary identifier)
      const primaryAccountId = accountData?.awsStandardAccountID || accountData?.accountId || group.accountId!
      
      // Enhanced account name resolution
      let accountName: string
      if (!accountMap.has(primaryAccountId)) {
        accountName = await resolveAccountName(group.accountId!)
      } else {
        // Use the already resolved name for this account
        accountName = accountMap.get(primaryAccountId)!.accountName
      }
      
      const isGovCloud = accountData?.awsGovCloudAccountID ? group.accountId! === accountData.awsGovCloudAccountID : false
      const isCommercial = accountData?.awsStandardAccountID ? group.accountId! === accountData.awsStandardAccountID : true
      const isActive = !!accountData
      const hasMultiEnvironment = accountData?.awsGovCloudAccountID &&
                                  accountData.awsStandardAccountID &&
                                  accountData.awsGovCloudAccountID !== accountData.awsStandardAccountID

      if (!accountMap.has(primaryAccountId)) {
        accountMap.set(primaryAccountId, {
          accountId: primaryAccountId,
          accountName,
          roles: [],
          environments: [],
          isActive,
          hasMultiEnvironment: !!hasMultiEnvironment,
          membershipSource: 'direct', // Will be updated based on analysis
          directRoles: [],
          groupRoles: [],
          groupDetails: []
        })
      }

      const account = accountMap.get(primaryAccountId)!
      
      // Add role if not exists
      if (!account.roles.includes(group.role!)) {
        account.roles.push(group.role!)
      }

      // Add environment
      const environment = isGovCloud ? 'govcloud' : 'commercial'
      if (!account.environments.includes(environment)) {
        account.environments.push(environment)
      }

      // Store group details for modal with enhanced parsing
      const groupDescription = (group as any).description || ''
      const { owners, description: cleanDescription } = parseGroupDescription(groupDescription)
      
      account.groupDetails.push({
        groupName: group.displayName || `${group.role} Group`,
        groupId: group.id || '',
        role: group.role!,
        environment,
        description: groupDescription,
        owners,
        cleanDescription
      })

      // Determine membership source (simplified - in real app you'd check group membership details)
      // For now, we'll assume roles with 'admin' or 'poweruser' are direct, others are group-based
      const isDirect = ['admin', 'poweruser'].includes(group.role!)
      
      if (isDirect) {
        if (!account.directRoles.includes(group.role!)) {
          account.directRoles.push(group.role!)
        }
      } else {
        if (!account.groupRoles.includes(group.role!)) {
          account.groupRoles.push(group.role!)
        }
      }

      // Update membership source
      if (account.directRoles.length > 0 && account.groupRoles.length > 0) {
        account.membershipSource = 'mixed'
      } else if (account.directRoles.length > 0) {
        account.membershipSource = 'direct'
      } else {
        account.membershipSource = 'group'
      }
    }

    // Sort accounts and roles
    accounts.value = Array.from(accountMap.values())
      // Show all accounts, not just active ones - users should see all their access
      // .filter(account => account.isActive) // Removed this filter
      .map(account => ({
        ...account,
        roles: sortRolesByPriority(account.roles),
        directRoles: sortRolesByPriority(account.directRoles),
        groupRoles: sortRolesByPriority(account.groupRoles)
      }))
      .sort((a, b) => {
        // Sort active accounts first, then by name
        if (a.isActive !== b.isActive) {
          return a.isActive ? -1 : 1
        }
        return a.accountName.localeCompare(b.accountName)
      })

  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load user access'
    console.error('Error loading user access:', err)
  } finally {
    loading.value = false
  }
}

// Load user tags
const loadUserTags = async () => {
  if (!props.userPrincipalName || !user.value?.accessToken) {
    return
  }

  try {
    // Use displayName from user profile if available, otherwise leave undefined
    const displayName = userProfile.value?.displayName
    const tags = await getUserTags(props.userPrincipalName, user.value.accessToken, displayName)
    userTags.value = tags
  } catch (error) {
    console.error('Failed to load user tags:', error)
    userTags.value = []
  }
}

// Computed properties
const accessSummary = computed(() => {
  const totalAccounts = filteredAccounts.value.length
  const totalRoles = filteredAccounts.value.reduce((sum, acc) => sum + acc.roles.length, 0)
  const multiEnvAccounts = filteredAccounts.value.filter(acc => acc.hasMultiEnvironment).length
  const commercialAccounts = filteredAccounts.value.filter(acc => acc.environments.includes('commercial')).length
  const govCloudAccounts = filteredAccounts.value.filter(acc => acc.environments.includes('govcloud')).length
  
  return { totalAccounts, totalRoles, multiEnvAccounts, commercialAccounts, govCloudAccounts }
})

const filteredAccounts = computed(() => {
  let filtered = accounts.value

  // Filter by role if selected
  if (selectedRoleFilter.value) {
    filtered = filtered.filter(account => 
      account.roles.includes(selectedRoleFilter.value)
    )
  }

  // Filter by account status if needed
  if (!showInactiveAccounts.value) {
    filtered = filtered.filter(account => 
      account.isActive && 
      account.status !== 'unknown' && 
      account.accountStatus !== 'unknown' &&
      account.accountName !== 'Unknown Account'
    )
  }

  return filtered
})

const allRoles = computed(() => {
  const roles = new Set<string>()
  accounts.value.forEach(account => {
    account.roles.forEach(role => roles.add(role))
  })
  return Array.from(roles).sort()
})

// Event handlers
const handleAccountClick = (account: AccountAccess) => {
  navigateTo(`/account/${account.accountId}`)
}

const toggleRoleFilter = (role: string) => {
  selectedRoleFilter.value = selectedRoleFilter.value === role ? '' : role
}

const clearFilters = () => {
  selectedRoleFilter.value = ''
  showInactiveAccounts.value = false
}

const toggleViewMode = () => {
  viewMode.value = viewMode.value === 'cards' ? 'table' : 'cards'
}

const showGroupDetails = async (account: AccountAccess, role?: string) => {
  try {
    loadingGroupDetails.value = true
    showGroupModal.value = true // Show modal immediately with loading state
    
    // Filter group details by role if specified
    const filteredDetails = account.groupDetails
      .filter(detail => !role || detail.role === role)
      .map(detail => ({
        ...detail,
        accountName: account.accountName,
        accountId: account.accountId,
        members: [],
        memberCount: 0,
        loadingMembers: true, // Start with loading state
        // Ensure all required properties are present
        description: detail.description || '',
        owners: detail.owners || [],
        cleanDescription: detail.cleanDescription || ''
      }))

    // Set initial loading details
    selectedGroupDetails.value = filteredDetails

    // Fetch detailed information for each group
    const enhancedDetails: GroupDetail[] = []
    
    for (const detail of filteredDetails) {
      if (!detail.groupId || !user.value?.accessToken) {
        enhancedDetails.push({
          ...detail,
          loadingMembers: false
        })
        continue
      }

      try {
        // Fetch group details and members in parallel
        const [groupInfo, membersResponse] = await Promise.all([
          fetchGroupDetails(user.value.accessToken, detail.groupId),
          fetchMembersForGroup(detail.groupId, user.value.accessToken)
        ])

        // Parse description for owners and clean description
        const groupDescription = groupInfo?.description || detail.description || ''
        const { owners, description: cleanDescription } = parseGroupDescription(groupDescription)

        enhancedDetails.push({
          ...detail,
          description: groupDescription,
          owners,
          cleanDescription,
          members: membersResponse.members || [],
          memberCount: membersResponse.members?.length || 0,
          loadingMembers: false
        })
      } catch (err) {
        console.warn(`Failed to load details for group ${detail.groupName}:`, err)
        enhancedDetails.push({
          ...detail,
          loadingMembers: false
        })
      }
    }
    
    selectedGroupDetails.value = enhancedDetails
    
  } catch (err) {
    console.error('Failed to load group details:', err)
    selectedGroupDetails.value = []
  } finally {
    loadingGroupDetails.value = false
  }
}

const navigateToGroupsPage = (accountId: string) => {
  navigateTo(`/account/${accountId}/groups`)
}

const navigateToGroup = (groupId: string) => {
  if (groupId) {
    navigateTo(`/account/user?group=${groupId}`)
  }
}

const navigateToUser = (userPrincipalName: string) => {
  const username = convertToUsernameSlug(userPrincipalName)
  navigateTo(`/account/user/${username}`)
}

// Utility functions
const getEmailLink = (email: string) => `mailto:${email}`

const getTeamsLink = (email: string) => {
  return `msteams:/l/chat/0/0?users=${email}`
}

const getEnvironmentLabel = (environments: string[]) => {
  if (environments.length === 2) {
    return 'Multi-Environment Access'
  } else if (environments.includes('govcloud')) {
    return 'GovCloud Access'
  } else {
    return 'Commercial Access'
  }
}

const getEnvironmentColor = (environments: string[]) => {
  if (environments.length === 2) {
    return 'purple'
  } else if (environments.includes('govcloud')) {
    return 'orange'
  } else {
    return 'blue'
  }
}

const getMembershipLabel = (source: string) => {
  switch (source) {
    case 'direct':
      return 'Direct Assignment'
    case 'group':
      return 'Group Membership'
    case 'mixed':
      return 'Direct + Group'
    default:
      return 'Unknown'
  }
}

const getMembershipTooltip = (source: string) => {
  switch (source) {
    case 'direct': return 'User is directly assigned to account roles'
    case 'group': return 'User has access through Azure AD group membership'
    case 'mixed': return 'User has both direct assignments and group-based access'
    default: return 'Unknown access source'
  }
}

const getEnvironmentTooltip = (environments: string[]) => {
  if (environments.length === 2) {
    return 'User has access to both Commercial and GovCloud environments'
  } else if (environments.includes('govcloud')) {
    return 'User has access to GovCloud environment only'
  } else {
    return 'User has access to Commercial cloud environment only'
  }
}

const getRoleTooltip = (role: string) => {
  const tooltips: Record<string, string> = {
    'admin': 'Full administrative access to the AWS account',
    'poweruser': 'Elevated access with most administrative permissions',
    'developer': 'Development and deployment permissions',
    'readonly': 'View-only access to AWS resources',
    'billing': 'Access to billing and cost management',
    'support': 'Access to AWS support features'
  }
  return tooltips[role.toLowerCase()] || `Role: ${role}`
}

// Get roles grouped by environment for an account
const getRolesByEnvironment = (account: AccountAccess) => {
  const rolesByEnv: Record<string, Set<string>> = {
    commercial: new Set(),
    govcloud: new Set()
  }

  // Group roles by environment from groupDetails
  account.groupDetails.forEach(detail => {
    rolesByEnv[detail.environment].add(detail.role)
  })

  return {
    commercial: Array.from(rolesByEnv.commercial),
    govcloud: Array.from(rolesByEnv.govcloud),
    both: account.roles.filter(role =>
      rolesByEnv.commercial.has(role) && rolesByEnv.govcloud.has(role)
    )
  }
}

// Check if user has admin or cost manager role for a specific account
const getAccountAdminRoles = (accountId: string) => {
  const enclave = enclaveStore.enclaves[accountId]
  if (!enclave) return { isPrimaryAdmin: false, isDelegateAdmin: false, isCostManager: false }

  return {
    isPrimaryAdmin: enclave.primaryAccountAdminUsername
      ? usernameMatches(enclave.primaryAccountAdminUsername, props.userPrincipalName)
      : false,
    isDelegateAdmin: enclave.delegateAccountAdminUsername
      ? usernameMatches(enclave.delegateAccountAdminUsername, props.userPrincipalName)
      : false,
    isCostManager: enclave.costManagerUsername
      ? usernameMatches(enclave.costManagerUsername, props.userPrincipalName)
      : false
  }
}

// Watch for user changes
watch(() => props.userPrincipalName, async (newUserPrincipalName) => {
  if (newUserPrincipalName) {
    // Reset states
    accounts.value = []
    error.value = null
    loading.value = true
    userTags.value = []
    
    // Load access and tags for new user
    await loadUserAccess()
    await loadUserTags()
  }
}, { immediate: true })

// Export functionality
const handleExportAccess = () => {
  if (!userProfile.value || accounts.value.length === 0) {
    useToast().add({
      title: 'No data to export',
      description: 'User has no AWS account access to export.',
      color: 'orange'
    })
    return
  }

  const transformedData = transformUserAccessDataForExport(
    {
      displayName: props.displayName || userProfile.value?.displayName || '',
      userPrincipalName: props.userPrincipalName,
      distributionGroups: [], // Could be populated from group details
      securityGroups: []
    },
    userProfile.value,
    accounts.value.map(account => ({
      accountId: account.accountId,
      accountName: account.accountName,
      roles: account.roles,
      isGovCloud: account.environments.includes('govcloud'),
      environment: account.hasMultiEnvironment ? 'Multi-Environment' : 
                   account.environments.includes('govcloud') ? 'GovCloud' : 'Commercial',
      status: account.isActive ? 'Active' : 'Inactive',
      groupName: account.groupDetails.map(g => g.groupName).join(', '),
      lastAccessed: 'Unknown', // Could be enhanced with actual data
      projectName: '', // Could be populated from account data
      accountAlias: '' // Could be populated from account data
    }))
  )

  const accountInfo = {
    id: 'user-profile',
    name: `${props.displayName || props.userPrincipalName} Access Report`,
    isGovCloud: accounts.value.some(acc => acc.environments.includes('govcloud'))
  }

  if (exportOptions.value.fileType === 'json') {
    exportUserAccessToJSON([transformedData], accountInfo, {
      filename: `user-access-${convertToUsernameSlug(props.userPrincipalName)}-${formatDateForFilename()}.json`,
      pretty: true,
      includeMetadata: true
    })
  } else {
    exportEnhancedUserAccessToCSV([transformedData], accountInfo, {
      format: exportOptions.value.format,
      includeContactInfo: exportOptions.value.includeContactInfo,
      includeGroupDetails: exportOptions.value.includeGroupDetails,
      includeComplianceData: exportOptions.value.includeComplianceData,
      filename: `user-access-${exportOptions.value.format}-${convertToUsernameSlug(props.userPrincipalName)}-${formatDateForFilename()}.${exportOptions.value.fileType}`
    })
  }

  useToast().add({
    title: 'Export completed',
    description: `User access data exported successfully as ${exportOptions.value.fileType.toUpperCase()}.`,
    color: 'green'
  })

  showExportModal.value = false
}

// Quick export functions for different formats
const exportDetailed = () => {
  exportOptions.value = {
    format: 'detailed',
    includeContactInfo: true,
    includeGroupDetails: true,
    includeComplianceData: true,
    fileType: 'csv'
  }
  handleExportAccess()
}

const exportSummary = () => {
  exportOptions.value = {
    format: 'summary',
    includeContactInfo: false,
    includeGroupDetails: false,
    includeComplianceData: false,
    fileType: 'csv'
  }
  handleExportAccess()
}

const exportCompliance = () => {
  exportOptions.value = {
    format: 'compliance',
    includeContactInfo: false,
    includeGroupDetails: true,
    includeComplianceData: true,
    fileType: 'csv'
  }
  handleExportAccess()
}

const exportJSON = () => {
  exportOptions.value = {
    format: 'detailed',
    includeContactInfo: true,
    includeGroupDetails: true,
    includeComplianceData: true,
    fileType: 'json'
  }
  handleExportAccess()
}

// Helper function for filename formatting
const formatDateForFilename = (): string => {
  const now = new Date()
  return now.toISOString().split('T')[0] // YYYY-MM-DD format
}

// Expose data for parent components
defineExpose({
  accounts,
  accessSummary,
  filteredAccounts,
  allRoles,
  loading,
  error,
  userTags,
  viewMode,
  selectedRoleFilter,
  toggleViewMode,
  loadUserAccess,
  exportDetailed,
  exportSummary,
  exportJSON,
  exportCompliance
})
</script>

<template>
  <div class="space-y-6">
    <!-- User Info Header with Prominent Contact Options -->
    <UCard v-if="showUserInfo" class="bg-gray-900 border border-gray-800">
      <div class="p-6">
        <div class="flex items-start gap-6">
          <!-- User Avatar -->
          <UserAvatar 
            :user-principal-name="userPrincipalName"
            :display-name="displayName || userProfile?.displayName"
            size="xl"
            class="flex-shrink-0"
          />
          
          <!-- User Details -->
          <div class="flex-1 min-w-0">
            <h2 class="text-2xl font-bold text-white mb-1">
              {{ displayName || userProfile?.displayName || userPrincipalName }}
            </h2>
            <p class="text-gray-400 mb-1">{{ userPrincipalName }}</p>
            <p v-if="userProfile?.jobTitle" class="text-sm text-gray-500 mb-4">{{ userProfile.jobTitle }}</p>
            
            <!-- User Tags -->
            <div v-if="userTags.length > 0" class="flex flex-wrap gap-2 mb-4">
              <UTooltip
                v-for="tag in userTags"
                :key="tag.title"
                :text="tag.description || tag.title"
                :popper="{ placement: 'top' }"
              >
                <UBadge
                  :color="tag.color as any"
                  variant="solid"
                  size="sm"
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
            
            <!-- Prominent Contact Options -->
            <div class="flex flex-wrap gap-3">
              <UButton
                :to="getEmailLink(userPrincipalName)"
                icon="i-heroicons-envelope"
                color="blue"
                variant="soft"
                size="sm"
                :title="`Send email to ${userPrincipalName}`"
              >
                Send Email
              </UButton>
              <UButton
                :to="getTeamsLink(userPrincipalName)"
                icon="i-simple-icons-microsoftteams"
                color="purple"
                variant="soft"
                size="sm"
                :title="`Start Teams chat with ${displayName || userPrincipalName}`"
              >
                Teams Chat
              </UButton>
              <UButton
                :to="`tel:${userProfile?.businessPhones?.[0]}`"
                v-if="userProfile?.businessPhones?.[0]"
                icon="i-heroicons-phone"
                color="green"
                variant="soft"
                size="sm"
                :title="`Call ${userProfile.businessPhones[0]}`"
              >
                Call
              </UButton>
            </div>
          </div>
        </div>
      </div>
    </UCard>

    <!-- Access Summary and Controls -->
    <UCard v-if="showHeader" class="bg-gray-900 border border-gray-800">
      <div class="p-6">
        <!-- Controls Section -->
        <div v-if="showControls" class="flex items-center justify-between mb-6">
          <div class="flex items-center gap-3">
            <h3 class="text-xl font-semibold text-white">AWS Account Access</h3>
            <UButton 
              @click="showHelpModal = true"
              icon="i-heroicons-question-mark-circle"
              variant="ghost"
              size="sm"
              color="gray"
            >
              Help
            </UButton>
          </div>
          <div class="flex items-center gap-2">
            <!-- Export Dropdown -->
            <UDropdown :items="[
              [{
                label: 'Export Options',
                slot: 'account',
                disabled: true
              }],
              [{
                label: 'Detailed CSV',
                icon: 'i-heroicons-document-text',
                click: exportDetailed
              }, {
                label: 'Summary CSV',
                icon: 'i-heroicons-document-chart-bar',
                click: exportSummary
              }, {
                label: 'Compliance CSV',
                icon: 'i-heroicons-shield-check',
                click: exportCompliance
              }],
              [{
                label: 'JSON Export',
                icon: 'i-heroicons-code-bracket',
                click: exportJSON
              }, {
                label: 'Custom Export...',
                icon: 'i-heroicons-cog-6-tooth',
                click: () => showExportModal = true
              }]
            ]" :popper="{ placement: 'bottom-end' }">
              <UButton 
                icon="i-heroicons-arrow-down-tray"
                variant="outline"
                size="sm"
                :disabled="!accounts.length"
              >
                Export
              </UButton>
            </UDropdown>
            <UButton 
              @click="toggleViewMode"
              :icon="viewMode === 'cards' ? 'i-heroicons-table-cells' : 'i-heroicons-squares-2x2'"
              variant="outline"
              size="sm"
            >
              {{ viewMode === 'cards' ? 'Table View' : 'Card View' }}
            </UButton>
            <UButton 
              @click="loadUserAccess" 
              :loading="loading" 
              icon="i-heroicons-arrow-path" 
              variant="ghost" 
              size="sm"
            >
              Refresh
            </UButton>
          </div>
        </div>
        
        <!-- Stats Section -->
        <div v-if="showStats">
          <!-- Simplified Summary Stats -->
          <div class="grid grid-cols-3 md:grid-cols-6 gap-4 mb-6">
            <div class="bg-gray-800/50 rounded-lg p-3 text-center">
              <div class="text-xl font-bold text-blue-400">{{ accessSummary.totalAccounts }}</div>
              <div class="text-xs text-gray-400">Accounts</div>
            </div>
            <div class="bg-gray-800/50 rounded-lg p-3 text-center">
              <div class="text-xl font-bold text-green-400">{{ accessSummary.totalRoles }}</div>
              <div class="text-xs text-gray-400">Roles</div>
            </div>
            <div class="bg-gray-800/50 rounded-lg p-3 text-center">
              <div class="text-xl font-bold text-blue-400">{{ accessSummary.commercialAccounts }}</div>
              <div class="text-xs text-gray-400">Commercial</div>
            </div>
            <div class="bg-gray-800/50 rounded-lg p-3 text-center">
              <div class="text-xl font-bold text-orange-400">{{ accessSummary.govCloudAccounts }}</div>
              <div class="text-xs text-gray-400">GovCloud</div>
            </div>
            <div class="bg-gray-800/50 rounded-lg p-3 text-center">
              <div class="text-xl font-bold text-purple-400">{{ accessSummary.multiEnvAccounts }}</div>
              <div class="text-xs text-gray-400">Multi-Env</div>
            </div>
            <div class="bg-gray-800/50 rounded-lg p-3 text-center">
              <div class="text-xl font-bold text-gray-400">{{ allRoles.length }}</div>
              <div class="text-xs text-gray-400">Unique Roles</div>
            </div>
          </div>
        </div>

        <!-- Role Filter (only show if controls are enabled) -->
        <div v-if="showControls && allRoles.length > 5" class="flex items-center gap-3">
          <span class="text-sm text-gray-400">Filter by role:</span>
          <USelectMenu 
            v-model="selectedRoleFilter" 
            :options="[
              { label: 'All Roles', value: '' },
              ...allRoles.map(role => ({ label: role, value: role }))
            ]"
            placeholder="All Roles"
            class="w-48"
          />
          <UButton 
            v-if="selectedRoleFilter || showInactiveAccounts"
            @click="clearFilters"
            variant="ghost" 
            size="xs"
            icon="i-heroicons-x-mark"
          >
            Clear
          </UButton>
        </div>

        <!-- Account Status Filter (only show if controls are enabled and there are inactive accounts) -->
        <div v-if="showControls" class="flex items-center gap-3">
          <UCheckbox 
            v-model="showInactiveAccounts"
            label="Show inactive accounts"
            help="Include accounts that are not in the AWS accounts database"
          />
        </div>
      </div>
    </UCard>

    <!-- Loading State -->
    <div v-if="loading || isInitializing" class="flex items-center justify-center py-12">
      <div class="text-center">
        <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-blue-400 mb-3" />
        <p class="text-gray-400">Loading access information...</p>
      </div>
    </div>

    <!-- Error State -->
    <UAlert v-else-if="error" color="red" icon="i-heroicons-exclamation-triangle">
      <template #title>Failed to load access</template>
      {{ error }}
      <template #actions>
        <UButton @click="loadUserAccess" variant="ghost" size="xs">
          Try Again
        </UButton>
      </template>
    </UAlert>

    <!-- No Access State -->
    <UCard v-else-if="!loading && !isInitializing && !error && accounts.length === 0" class="bg-gray-900 border border-gray-800">
      <div class="text-center py-12">
        <UIcon name="i-heroicons-no-symbol" class="w-16 h-16 text-gray-500 mx-auto mb-4" />
        <h4 class="text-xl font-medium text-white mb-2">No AWS Access</h4>
        <p class="text-gray-400">This user has no access to any AWS accounts.</p>
      </div>
    </UCard>

    <!-- No Filtered Results -->
    <UCard v-else-if="!loading && !isInitializing && !error && filteredAccounts.length === 0 && (selectedRoleFilter || !showInactiveAccounts)" class="bg-gray-900 border border-gray-800">
      <div class="text-center py-12">
        <UIcon name="i-heroicons-funnel" class="w-16 h-16 text-gray-500 mx-auto mb-4" />
        <h4 class="text-xl font-medium text-white mb-2">No Results</h4>
        <p class="text-gray-400">
          <span v-if="selectedRoleFilter && !showInactiveAccounts">
            No active accounts found with the "{{ selectedRoleFilter }}" role.
          </span>
          <span v-else-if="selectedRoleFilter">
            No accounts found with the "{{ selectedRoleFilter }}" role.
          </span>
          <span v-else>
            No active accounts found. Try enabling "Show inactive accounts" to see all access.
          </span>
        </p>
        <UButton @click="clearFilters" class="mt-4" variant="soft">
          Clear Filters
        </UButton>
      </div>
    </UCard>

    <!-- Simplified Table View -->
    <UCard v-else-if="viewMode === 'table'" class="bg-gray-900 border border-gray-800">
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="bg-gray-800/50">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Account</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Environment</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Primary Roles</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Total</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-700">
            <tr v-for="account in filteredAccounts" :key="account.accountId" class="hover:bg-gray-800/30">
              <td class="px-4 py-3">
                <div>
                  <div class="text-sm font-medium text-white">{{ account.accountName }}</div>
                  <div class="text-xs text-gray-400 font-mono">{{ account.accountId }}</div>
                </div>
              </td>
              <td class="px-4 py-3">
                <div class="flex items-center gap-1">
                  <div v-if="account.environments.includes('commercial')" 
                       class="w-2 h-2 bg-blue-400 rounded-full" title="Commercial"></div>
                  <div v-if="account.environments.includes('govcloud')" 
                       class="w-2 h-2 bg-orange-400 rounded-full" title="GovCloud"></div>
                  <span class="text-xs text-gray-400 ml-1">
                    {{ account.environments.length > 1 ? 'Multi' : 
                        account.environments.includes('govcloud') ? 'GovCloud' : 'Commercial' }}
                  </span>
                </div>
              </td>
              <td class="px-4 py-3">
                <div class="flex flex-wrap gap-1">
                  <!-- Admin & Cost Manager Badges -->
                  <UBadge
                    v-if="getAccountAdminRoles(account.accountId).isPrimaryAdmin"
                    color="orange"
                    variant="solid"
                    size="xs"
                    class="font-medium"
                  >
                    <UIcon name="i-heroicons-shield-check" class="w-3 h-3 mr-0.5" />
                    Primary Admin
                  </UBadge>
                  <UBadge
                    v-if="getAccountAdminRoles(account.accountId).isDelegateAdmin"
                    color="yellow"
                    variant="solid"
                    size="xs"
                    class="font-medium"
                  >
                    <UIcon name="i-heroicons-user-group" class="w-3 h-3 mr-0.5" />
                    Delegate Admin
                  </UBadge>
                  <UBadge
                    v-if="getAccountAdminRoles(account.accountId).isCostManager"
                    color="green"
                    variant="solid"
                    size="xs"
                    class="font-medium"
                  >
                    <UIcon name="i-heroicons-currency-dollar" class="w-3 h-3 mr-0.5" />
                    Cost Manager
                  </UBadge>

                  <!-- IAM Roles with environment context -->
                  <template v-if="account.hasMultiEnvironment">
                    <!-- Show roles grouped by environment -->
                    <span v-for="role in getRolesByEnvironment(account).both.slice(0, 2)" :key="`both-${role}`"
                          class="px-2 py-1 text-xs bg-purple-900/30 text-purple-300 rounded"
                          :title="`${role} (Both environments)`">
                      {{ role }}
                    </span>
                    <span v-for="role in getRolesByEnvironment(account).commercial.filter(r => !getRolesByEnvironment(account).both.includes(r)).slice(0, 1)" :key="`comm-${role}`"
                          class="px-2 py-1 text-xs bg-blue-900/30 text-blue-300 rounded flex items-center gap-0.5"
                          :title="`${role} (Commercial only)`">
                      <div class="w-1.5 h-1.5 bg-blue-400 rounded-full"></div>
                      {{ role }}
                    </span>
                    <span v-for="role in getRolesByEnvironment(account).govcloud.filter(r => !getRolesByEnvironment(account).both.includes(r)).slice(0, 1)" :key="`gov-${role}`"
                          class="px-2 py-1 text-xs bg-orange-900/30 text-orange-300 rounded flex items-center gap-0.5"
                          :title="`${role} (GovCloud only)`">
                      <div class="w-1.5 h-1.5 bg-orange-400 rounded-full"></div>
                      {{ role }}
                    </span>
                  </template>
                  <template v-else>
                    <!-- Single environment - show normally -->
                    <span v-for="role in account.roles.slice(0, 3)" :key="role"
                          class="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded">
                      {{ role }}
                    </span>
                  </template>

                  <span v-if="account.roles.length > 3"
                        class="px-2 py-1 text-xs bg-gray-600 text-gray-400 rounded">
                    +{{ account.roles.length - 3 }}
                  </span>
                </div>
              </td>
              <td class="px-4 py-3">
                <span class="text-sm text-gray-300">{{ account.roles.length }}</span>
              </td>
              <td class="px-4 py-3">
                <div class="flex items-center gap-2">
                  <UButton
                    @click="handleAccountClick(account)"
                    variant="ghost"
                    size="xs"
                    icon="i-heroicons-arrow-top-right-on-square"
                    :title="`Go to ${account.accountName} account details page`"
                  >
                    Account Details
                  </UButton>
                  <UButton
                    @click="showGroupDetails(account)"
                    variant="ghost"
                    size="xs"
                    icon="i-heroicons-user-group"
                    :title="`View group memberships for ${account.accountName}`"
                  >
                    View Groups
                  </UButton>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>

    <!-- Simplified Card View -->
    <div v-else class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
      <UCard 
        v-for="account in filteredAccounts" 
        :key="account.accountId" 
        :class="[
          'border border-gray-800 hover:border-gray-700 transition-all duration-200 cursor-pointer group',
          account.isActive 
            ? 'bg-gray-900' 
            : 'bg-gray-900/50 opacity-75 border-gray-700'
        ]"
        @click="handleAccountClick(account)"
      >
        <div class="p-4 space-y-3">
          <!-- Compact Header -->
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 flex-1 min-w-0">
              <!-- Environment Indicators -->
              <div class="flex gap-1">
                <div v-if="account.environments.includes('commercial')" 
                     class="w-2 h-2 bg-blue-400 rounded-full" title="Commercial"></div>
                <div v-if="account.environments.includes('govcloud')" 
                     class="w-2 h-2 bg-orange-400 rounded-full" title="GovCloud"></div>
              </div>
              
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <h5 class="font-medium text-white truncate text-sm group-hover:text-blue-400 transition-colors">
                    {{ account.accountName }}
                  </h5>
                  <UBadge 
                    v-if="!account.isActive" 
                    color="gray" 
                    variant="soft" 
                    size="xs"
                    label="Inactive"
                  />
                </div>
                <p class="text-xs text-gray-500 font-mono">{{ account.accountId }}</p>
              </div>
            </div>
            
            <!-- Role Count -->
            <div class="text-right">
              <div class="text-sm font-medium text-blue-400">{{ account.roles.length }}</div>
              <div class="text-xs text-gray-500">roles</div>
            </div>
          </div>

          <!-- Admin & Cost Manager Badges -->
          <div
            v-if="getAccountAdminRoles(account.accountId).isPrimaryAdmin ||
                  getAccountAdminRoles(account.accountId).isDelegateAdmin ||
                  getAccountAdminRoles(account.accountId).isCostManager"
            class="flex flex-wrap gap-1.5"
          >
            <UBadge
              v-if="getAccountAdminRoles(account.accountId).isPrimaryAdmin"
              color="orange"
              variant="solid"
              size="xs"
              class="font-medium"
            >
              <UIcon name="i-heroicons-shield-check" class="w-3 h-3 mr-0.5" />
              Primary Admin
            </UBadge>
            <UBadge
              v-if="getAccountAdminRoles(account.accountId).isDelegateAdmin"
              color="yellow"
              variant="solid"
              size="xs"
              class="font-medium"
            >
              <UIcon name="i-heroicons-user-group" class="w-3 h-3 mr-0.5" />
              Delegate Admin
            </UBadge>
            <UBadge
              v-if="getAccountAdminRoles(account.accountId).isCostManager"
              color="green"
              variant="solid"
              size="xs"
              class="font-medium"
            >
              <UIcon name="i-heroicons-currency-dollar" class="w-3 h-3 mr-0.5" />
              Cost Manager
            </UBadge>
          </div>

          <!-- Primary Roles grouped by environment -->
          <div class="space-y-2">
            <div v-if="account.hasMultiEnvironment" class="space-y-2">
              <!-- Both environments - show roles with indicators -->
              <div v-if="getRolesByEnvironment(account).both.length > 0">
                <div class="text-xs text-gray-500 mb-1">Both Environments</div>
                <div class="flex flex-wrap gap-1">
                  <span v-for="role in getRolesByEnvironment(account).both.slice(0, 3)" :key="`both-${role}`"
                        class="px-2 py-1 text-xs bg-purple-900/30 text-purple-300 rounded cursor-pointer hover:bg-purple-900/50 transition-colors flex items-center gap-1"
                        @click.stop="showGroupDetails(account, role)"
                        :title="`${getRoleTooltip(role)} (Both environments)`">
                    {{ role }}
                  </span>
                </div>
              </div>

              <!-- Commercial only -->
              <div v-if="getRolesByEnvironment(account).commercial.filter(r => !getRolesByEnvironment(account).both.includes(r)).length > 0">
                <div class="text-xs text-gray-500 mb-1 flex items-center gap-1">
                  <div class="w-2 h-2 bg-blue-400 rounded-full"></div>
                  Commercial Only
                </div>
                <div class="flex flex-wrap gap-1">
                  <span v-for="role in getRolesByEnvironment(account).commercial.filter(r => !getRolesByEnvironment(account).both.includes(r)).slice(0, 2)" :key="`comm-${role}`"
                        class="px-2 py-1 text-xs bg-blue-900/30 text-blue-300 rounded cursor-pointer hover:bg-blue-900/50 transition-colors"
                        @click.stop="showGroupDetails(account, role)"
                        :title="`${getRoleTooltip(role)} (Commercial only)`">
                    {{ role }}
                  </span>
                </div>
              </div>

              <!-- GovCloud only -->
              <div v-if="getRolesByEnvironment(account).govcloud.filter(r => !getRolesByEnvironment(account).both.includes(r)).length > 0">
                <div class="text-xs text-gray-500 mb-1 flex items-center gap-1">
                  <div class="w-2 h-2 bg-orange-400 rounded-full"></div>
                  GovCloud Only
                </div>
                <div class="flex flex-wrap gap-1">
                  <span v-for="role in getRolesByEnvironment(account).govcloud.filter(r => !getRolesByEnvironment(account).both.includes(r)).slice(0, 2)" :key="`gov-${role}`"
                        class="px-2 py-1 text-xs bg-orange-900/30 text-orange-300 rounded cursor-pointer hover:bg-orange-900/50 transition-colors"
                        @click.stop="showGroupDetails(account, role)"
                        :title="`${getRoleTooltip(role)} (GovCloud only)`">
                    {{ role }}
                  </span>
                </div>
              </div>

              <button v-if="account.roles.length > 7"
                      @click.stop="showGroupDetails(account)"
                      class="px-2 py-1 text-xs bg-gray-700 text-gray-400 rounded hover:bg-gray-600 transition-colors">
                +{{ account.roles.length - 7 }} more roles
              </button>
            </div>

            <!-- Single environment - show normally -->
            <div v-else class="flex flex-wrap gap-1">
              <span v-for="role in account.roles.slice(0, 4)" :key="role"
                    class="px-2 py-1 text-xs bg-gray-800 text-gray-300 rounded cursor-pointer hover:bg-gray-700 transition-colors"
                    @click.stop="showGroupDetails(account, role)"
                    :title="getRoleTooltip(role)">
                {{ role }}
              </span>
              <button v-if="account.roles.length > 4"
                      @click.stop="showGroupDetails(account)"
                      class="px-2 py-1 text-xs bg-gray-700 text-gray-400 rounded hover:bg-gray-600 transition-colors">
                +{{ account.roles.length - 4 }} more
              </button>
            </div>
          </div>

          <!-- Quick Actions -->
          <div class="flex items-center justify-between pt-2 border-t border-gray-800">
            <UButton
              @click.stop="showGroupDetails(account)"
              variant="ghost"
              size="xs"
              icon="i-heroicons-user-group"
              class="text-gray-400 hover:text-white"
              :title="`View group memberships for ${account.accountName}`"
            >
              View Groups
            </UButton>
            <UButton
              @click.stop="handleAccountClick(account)"
              variant="ghost"
              size="xs"
              icon="i-heroicons-arrow-top-right-on-square"
              class="text-gray-400 hover:text-white"
              :title="`Go to ${account.accountName} account details page`"
            >
              Account Details
            </UButton>
          </div>
        </div>
      </UCard>
    </div>

    <!-- Help Modal -->
    <UModal v-model="showHelpModal">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold text-white">AWS Access Center Help</h3>
            <UButton @click="showHelpModal = false" icon="i-heroicons-x-mark" variant="ghost" size="sm" />
          </div>
        </template>
        
        <div class="space-y-6 p-4 max-h-[70vh] overflow-y-auto">
          <!-- Page Overview -->
          <div>
            <h4 class="font-semibold text-white mb-3 flex items-center gap-2">
              <UIcon name="i-heroicons-information-circle" class="w-5 h-5 text-blue-400" />
              Page Overview
            </h4>
            <p class="text-sm text-gray-300 mb-3">
              This page displays comprehensive AWS account access information for a specific user, including their roles, permissions, and how they obtained access.
            </p>
          </div>

          <!-- User Profile Section -->
          <div>
            <h4 class="font-semibold text-white mb-3 flex items-center gap-2">
              <UIcon name="i-heroicons-user-circle" class="w-5 h-5 text-green-400" />
              User Profile Section
            </h4>
            <div class="space-y-3">
              <div class="flex items-start gap-3">
                <UBadge color="green" variant="soft" size="sm">Avatar</UBadge>
                <p class="text-sm text-gray-300">Displays the user's profile picture or initials if no photo is available</p>
              </div>
              <div class="flex items-start gap-3">
                <UBadge color="blue" variant="soft" size="sm">Contact Actions</UBadge>
                <p class="text-sm text-gray-300">Quick access to email, Teams chat, and phone communication</p>
              </div>
              <div class="flex items-start gap-3">
                <UBadge color="purple" variant="soft" size="sm">Teams Button</UBadge>
                <p class="text-sm text-gray-300">Opens Microsoft Teams to start a chat with the user</p>
              </div>
            </div>
          </div>

          <!-- Environment Types -->
          <div>
            <h4 class="font-semibold text-white mb-3 flex items-center gap-2">
              <UIcon name="i-heroicons-cloud" class="w-5 h-5 text-blue-400" />
              Environment Types
            </h4>
            <div class="space-y-3">
              <div class="flex items-start gap-3">
                <div class="w-3 h-3 bg-blue-400 rounded-full mt-1.5"></div>
                <div>
                  <p class="text-sm font-medium text-blue-300">Commercial Environment</p>
                  <p class="text-xs text-gray-400">Standard AWS cloud environment for general business use</p>
                </div>
              </div>
              <div class="flex items-start gap-3">
                <div class="w-3 h-3 bg-orange-400 rounded-full mt-1.5"></div>
                <div>
                  <p class="text-sm font-medium text-orange-300">GovCloud Environment</p>
                  <p class="text-xs text-gray-400">AWS GovCloud environment for government and compliance workloads</p>
                </div>
              </div>
              <div class="flex items-start gap-3">
                <UBadge color="purple" variant="soft" size="sm">Multi-Env</UBadge>
                <p class="text-sm text-gray-300">User has access to both Commercial and GovCloud environments for the same account</p>
              </div>
            </div>
          </div>

          <!-- Access Types -->
          <div>
            <h4 class="font-semibold text-white mb-3 flex items-center gap-2">
              <UIcon name="i-heroicons-key" class="w-5 h-5 text-yellow-400" />
              How Users Get Access
            </h4>
            <div class="space-y-3">
              <div class="flex items-start gap-3">
                <UBadge color="green" variant="soft" size="sm">Direct Member</UBadge>
                <p class="text-sm text-gray-300">User is directly assigned to specific AWS account roles in Azure AD</p>
              </div>
              <div class="flex items-start gap-3">
                <UBadge color="blue" variant="soft" size="sm">Group Member</UBadge>
                <p class="text-sm text-gray-300">User inherits access through Azure AD group membership</p>
              </div>
              <div class="flex items-start gap-3">
                <UBadge color="purple" variant="soft" size="sm">Mixed Access</UBadge>
                <p class="text-sm text-gray-300">User has both direct assignments and group-based access</p>
              </div>
            </div>
          </div>

          <!-- Common AWS Roles -->
          <div>
            <h4 class="font-semibold text-white mb-3 flex items-center gap-2">
              <UIcon name="i-heroicons-shield-check" class="w-5 h-5 text-red-400" />
              Common AWS Roles
            </h4>
            <div class="space-y-3">
              <div class="flex items-start gap-3">
                <UBadge color="red" variant="soft" size="sm">admin</UBadge>
                <p class="text-sm text-gray-300">Full administrative access - can create, modify, and delete all AWS resources</p>
              </div>
              <div class="flex items-start gap-3">
                <UBadge color="orange" variant="soft" size="sm">poweruser</UBadge>
                <p class="text-sm text-gray-300">Elevated access with most permissions except user/group management</p>
              </div>
              <div class="flex items-start gap-3">
                <UBadge color="yellow" variant="soft" size="sm">developer</UBadge>
                <p class="text-sm text-gray-300">Development permissions - can deploy applications and manage development resources</p>
              </div>
              <div class="flex items-start gap-3">
                <UBadge color="blue" variant="soft" size="sm">readonly</UBadge>
                <p class="text-sm text-gray-300">View-only access - can see resources but cannot make changes</p>
              </div>
              <div class="flex items-start gap-3">
                <UBadge color="gray" variant="soft" size="sm">billing</UBadge>
                <p class="text-sm text-gray-300">Access to billing and cost information only</p>
              </div>
            </div>
          </div>

          <!-- Icon Legend -->
          <div>
            <h4 class="font-semibold text-white mb-3 flex items-center gap-2">
              <UIcon name="i-heroicons-sparkles" class="w-5 h-5 text-purple-400" />
              Interface Icons
            </h4>
            <div class="grid grid-cols-2 gap-3">
              <div class="flex items-center gap-2">
                <UIcon name="i-heroicons-building-office" class="w-4 h-4 text-blue-400" />
                <span class="text-xs text-gray-300">AWS Account</span>
              </div>
              <div class="flex items-center gap-2">
                <UIcon name="i-heroicons-user-group" class="w-4 h-4 text-green-400" />
                <span class="text-xs text-gray-300">Group Access</span>
              </div>
              <div class="flex items-center gap-2">
                <UIcon name="i-heroicons-eye" class="w-4 h-4 text-gray-400" />
                <span class="text-xs text-gray-300">View Details</span>
              </div>
              <div class="flex items-center gap-2">
                <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 text-blue-400" />
                <span class="text-xs text-gray-300">Refresh Data</span>
              </div>
              <div class="flex items-center gap-2">
                <UIcon name="i-heroicons-funnel" class="w-4 h-4 text-yellow-400" />
                <span class="text-xs text-gray-300">Filter Results</span>
              </div>
              <div class="flex items-center gap-2">
                <UIcon name="i-heroicons-squares-2x2" class="w-4 h-4 text-purple-400" />
                <span class="text-xs text-gray-300">Toggle View Mode</span>
              </div>
            </div>
          </div>

          <!-- View Modes -->
          <div>
            <h4 class="font-semibold text-white mb-3 flex items-center gap-2">
              <UIcon name="i-heroicons-rectangle-group" class="w-5 h-5 text-cyan-400" />
              View Modes
            </h4>
            <div class="space-y-3">
              <div class="flex items-start gap-3">
                <UBadge color="blue" variant="soft" size="sm">Card View</UBadge>
                <p class="text-sm text-gray-300">Displays accounts as cards with detailed role and group information</p>
              </div>
              <div class="flex items-start gap-3">
                <UBadge color="cyan" variant="soft" size="sm">Table View</UBadge>
                <p class="text-sm text-gray-300">Compact table format showing key information in rows</p>
              </div>
            </div>
          </div>

          <!-- Status Indicators -->
          <div>
            <h4 class="font-semibold text-white mb-3 flex items-center gap-2">
              <UIcon name="i-heroicons-signal" class="w-5 h-5 text-green-400" />
              Status Indicators
            </h4>
            <div class="space-y-3">
              <div class="flex items-start gap-3">
                <div class="w-3 h-3 bg-green-400 rounded-full mt-1.5"></div>
                <div>
                  <p class="text-sm font-medium text-green-300">Active Account</p>
                  <p class="text-xs text-gray-400">Account is active and accessible</p>
                </div>
              </div>
              <div class="flex items-start gap-3">
                <div class="w-3 h-3 bg-yellow-400 rounded-full mt-1.5"></div>
                <div>
                  <p class="text-sm font-medium text-yellow-300">Inactive Account</p>
                  <p class="text-xs text-gray-400">Account exists but may have limited access</p>
                </div>
              </div>
              <div class="flex items-start gap-3">
                <div class="w-3 h-3 bg-blue-400 rounded-full mt-1.5"></div>
                <div>
                  <p class="text-sm font-medium text-blue-300">Loading</p>
                  <p class="text-xs text-gray-400">Data is being fetched from Azure AD and AWS</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Tips -->
          <div>
            <h4 class="font-semibold text-white mb-3 flex items-center gap-2">
              <UIcon name="i-heroicons-light-bulb" class="w-5 h-5 text-yellow-400" />
              Tips & Best Practices
            </h4>
            <div class="space-y-2">
              <div class="flex items-start gap-2">
                <span class="text-yellow-400">•</span>
                <p class="text-sm text-gray-300">Use the role filter to quickly find specific types of access</p>
              </div>
              <div class="flex items-start gap-2">
                <span class="text-yellow-400">•</span>
                <p class="text-sm text-gray-300">Click "View Groups" to see detailed group membership and owners</p>
              </div>
              <div class="flex items-start gap-2">
                <span class="text-yellow-400">•</span>
                <p class="text-sm text-gray-300">Multi-environment accounts may require separate login sessions</p>
              </div>
              <div class="flex items-start gap-2">
                <span class="text-yellow-400">•</span>
                <p class="text-sm text-gray-300">Contact group owners for access requests or questions</p>
              </div>
            </div>
          </div>

          <!-- Navigation Guide -->
          <div>
            <h4 class="font-semibold text-white mb-3 flex items-center gap-2">
              <UIcon name="i-heroicons-arrow-top-right-on-square" class="w-5 h-5 text-cyan-400" />
              Where Links Take You
            </h4>
            <div class="space-y-2 text-sm">
              <div class="flex items-start gap-2">
                <UIcon name="i-heroicons-building-office" class="w-4 h-4 text-blue-400 mt-0.5" />
                <div>
                  <p class="text-gray-300 font-medium">Account Details / Account Overview</p>
                  <p class="text-xs text-gray-400">→ Takes you to the AWS account's main page with users, groups, and resources</p>
                </div>
              </div>
              <div class="flex items-start gap-2">
                <UIcon name="i-heroicons-user-group" class="w-4 h-4 text-green-400 mt-0.5" />
                <div>
                  <p class="text-gray-300 font-medium">View Groups / Group Details</p>
                  <p class="text-xs text-gray-400">→ Opens detailed information about Azure AD groups (modal popup)</p>
                </div>
              </div>
              <div class="flex items-start gap-2">
                <UIcon name="i-heroicons-user-circle" class="w-4 h-4 text-purple-400 mt-0.5" />
                <div>
                  <p class="text-gray-300 font-medium">User Names / View Access</p>
                  <p class="text-xs text-gray-400">→ Takes you to that user's AWS access page (like this page)</p>
                </div>
              </div>
              <div class="flex items-start gap-2">
                <UIcon name="i-heroicons-envelope" class="w-4 h-4 text-blue-400 mt-0.5" />
                <div>
                  <p class="text-gray-300 font-medium">Send Email</p>
                  <p class="text-xs text-gray-400">→ Opens your default email client to compose an email</p>
                </div>
              </div>
              <div class="flex items-start gap-2">
                <UIcon name="i-simple-icons-microsoftteams" class="w-4 h-4 text-purple-400 mt-0.5" />
                <div>
                  <p class="text-gray-300 font-medium">Teams Chat</p>
                  <p class="text-xs text-gray-400">→ Opens Microsoft Teams to start a chat with the user</p>
                </div>
              </div>
              <div class="flex items-start gap-2">
                <UIcon name="i-heroicons-phone" class="w-4 h-4 text-green-400 mt-0.5" />
                <div>
                  <p class="text-gray-300 font-medium">Call</p>
                  <p class="text-xs text-gray-400">→ Uses your device to call the phone number</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </UCard>
    </UModal>

    <!-- Enhanced Group Details Modal -->
    <UModal :ui="{ width: 'md:max-w-4xl'}" v-model="showGroupModal" :prevent-close="false">
      <UCard :ui="{ body: { padding: '' } }" class="w-full">
        <template #header>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <h3 class="text-lg font-semibold text-white">Group Membership Details</h3>
              <UBadge color="gray" variant="soft" size="sm">
                {{ selectedGroupDetails.length }} group{{ selectedGroupDetails.length !== 1 ? 's' : '' }}
              </UBadge>
            </div>
            <div class="flex items-center gap-2">
              <UButton
                v-if="selectedGroupDetails.length > 0"
                @click="navigateToGroupsPage(selectedGroupDetails[0].accountId)"
                variant="outline"
                size="sm"
                icon="i-heroicons-arrow-top-right-on-square"
              >
                View All Groups
              </UButton>
              <UButton @click="showGroupModal = false" icon="i-heroicons-x-mark" variant="ghost" size="sm" />
            </div>
          </div>
        </template>
        
        <div class="max-h-[80vh] overflow-y-auto">
          <!-- Loading State -->
          <div v-if="loadingGroupDetails" class="flex items-center justify-center py-12">
            <div class="text-center">
              <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-blue-400 mb-3" />
              <p class="text-gray-400">Loading group details...</p>
            </div>
          </div>
          
          <!-- No Groups -->
          <div v-else-if="selectedGroupDetails.length === 0" class="text-center py-12 px-6">
            <UIcon name="i-heroicons-user-group" class="w-16 h-16 text-gray-500 mx-auto mb-4" />
            <h4 class="text-lg font-medium text-white mb-2">No Group Details</h4>
            <p class="text-gray-400">No group membership information available.</p>
          </div>
          
          <!-- Group Details -->
          <div v-else class="space-y-6 p-6">
            <div v-for="(detail, index) in selectedGroupDetails" :key="`${detail.groupId}-${detail.role}`" 
                 class="border border-gray-700 rounded-lg overflow-hidden">
              
              <!-- Group Header -->
              <div class="bg-gray-800/50 p-4">
                <div class="flex items-start justify-between mb-3">
                  <div class="flex-1 min-w-0">
                    <h4 class="font-semibold text-white text-lg">{{ detail.groupName }}</h4>
                    <p class="text-sm text-gray-400 mt-1">{{ detail.accountName }}</p>
                    <div class="flex items-center gap-2 mt-2">
                      <UBadge 
                        :color="detail.role === 'admin' ? 'red' : detail.role === 'poweruser' ? 'orange' : 'blue'"
                        variant="soft"
                        size="sm"
                      >
                        {{ detail.role }}
                      </UBadge>
                      <UBadge 
                        :color="detail.environment === 'govcloud' ? 'orange' : 'blue'"
                        variant="soft"
                        size="sm"
                      >
                        {{ detail.environment === 'govcloud' ? 'GovCloud' : 'Commercial' }}
                      </UBadge>
                      <UBadge 
                        color="gray" 
                        variant="soft" 
                        size="sm"
                        class="flex items-center gap-1"
                      >
                        <UIcon name="i-heroicons-users" class="w-3 h-3" />
                        {{ detail.memberCount }}
                      </UBadge>
                    </div>
                  </div>
                  
                  <!-- Action Buttons -->
                  <div class="flex items-start gap-2 ml-4">
                    <UButton
                      @click="navigateTo(`/account/${detail.accountId}`)"
                      variant="ghost"
                      size="sm"
                      icon="i-heroicons-building-office"
                      :title="`Go to ${detail.accountName} account overview page`"
                    >
                      <span class="flex items-center gap-1">
                        Account Overview
                        <UIcon name="i-heroicons-arrow-top-right-on-square" class="w-3 h-3" />
                      </span>
                    </UButton>
                  </div>
                </div>
                
                <!-- Group ID -->
                <div class="text-xs text-gray-500">
                  <span class="font-medium">Group ID:</span>
                  <span class="font-mono ml-1">{{ detail.groupId || 'N/A' }}</span>
                </div>
              </div>

              <!-- Group Details Content -->
              <div class="p-4 space-y-4">
                <!-- Owners Section -->
                <div v-if="detail.owners.length > 0">
                  <div class="flex items-center gap-2 mb-3">
                    <UIcon name="i-heroicons-user-circle" class="w-4 h-4 text-blue-400" />
                    <h5 class="text-sm font-medium text-gray-300">Group Owners ({{ detail.owners.length }})</h5>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <span 
                      v-for="owner in detail.owners" 
                      :key="owner"
                      :class="[
                        'px-3 py-1 text-sm rounded-full transition-colors',
                        owner === 'GDMSCloud.AWS' 
                          ? 'bg-gray-500/10 border border-gray-500/20 text-gray-300' 
                          : 'bg-blue-500/10 border border-blue-500/20 text-blue-300 cursor-pointer hover:bg-blue-500/20'
                      ]"
                      @click="owner !== 'GDMSCloud.AWS' ? navigateToUser(owner + '@gd-ms.com') : null"
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

                <!-- Description Section -->
                <div v-if="detail.cleanDescription">
                  <div class="flex items-center gap-2 mb-3">
                    <UIcon name="i-heroicons-information-circle" class="w-4 h-4 text-green-400" />
                    <h5 class="text-sm font-medium text-gray-300">Description</h5>
                  </div>
                  <p class="text-sm text-gray-400 bg-gray-800/30 rounded-lg p-3">
                    {{ detail.cleanDescription }}
                  </p>
                </div>

                <!-- Members Section -->
                <div>
                  <div class="flex items-center gap-2 mb-3">
                    <UIcon name="i-heroicons-users" class="w-4 h-4 text-purple-400" />
                    <h5 class="text-sm font-medium text-gray-300">Members ({{ detail.memberCount }})</h5>
                  </div>
                  
                  <!-- Loading Members -->
                  <div v-if="detail.loadingMembers" class="flex items-center justify-center py-6">
                    <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin text-gray-400 mr-2" />
                    <span class="text-sm text-gray-400">Loading members...</span>
                  </div>
                  
                  <!-- No Members -->
                  <div v-else-if="detail.memberCount === 0" class="text-center py-6 bg-gray-800/30 rounded-lg">
                    <UIcon name="i-heroicons-user-minus" class="w-8 h-8 text-gray-500 mx-auto mb-2" />
                    <p class="text-sm text-gray-400">No members in this group</p>
                  </div>
                  
                  <!-- Members List -->
                  <div v-else-if="detail.members.length > 0" class="space-y-2 max-h-64 overflow-y-auto border border-gray-700 rounded-lg">
                    <div 
                      v-for="member in detail.members" 
                      :key="member.userPrincipalName"
                      class="flex items-center gap-3 p-3 hover:bg-gray-800/50 transition-colors cursor-pointer border-b border-gray-700 last:border-b-0"
                      @click="navigateToUser(member.userPrincipalName)"
                      :title="`View ${member.displayName}'s access details`"
                    >
                      <!-- User Avatar -->
                      <UserAvatar 
                        :user-principal-name="member.userPrincipalName"
                        :display-name="member.displayName"
                        size="sm"
                        class="flex-shrink-0"
                      />
                      
                      <!-- User Details -->
                      <div class="flex-1 min-w-0">
                        <p class="font-medium text-white text-base">{{ member.displayName }}</p>
                        <p class="text-xs text-gray-400 truncate">{{ member.userPrincipalName }}</p>
                        <p v-if="member.jobTitle" class="text-xs text-gray-500 truncate">{{ member.jobTitle }}</p>
                      </div>
                      
                      <!-- Navigate Icon with label -->
                      <div class="flex items-center gap-1 text-xs text-gray-400">
                        <span class="hidden sm:block">View Access</span>
                        <UIcon name="i-heroicons-arrow-top-right-on-square" class="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                  
                  <!-- Fallback for no member data -->
                  <div v-else class="text-center py-4 bg-gray-800/30 rounded-lg">
                    <p class="text-sm text-gray-400">Member details not available</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </UCard>
    </UModal>

    <!-- Export Options Modal -->
    <UModal v-model="showExportModal" class="z-50">
      <UCard class="max-w-lg">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-arrow-down-tray" class="w-5 h-5 text-blue-400" />
            <h3 class="text-lg font-semibold">Export User Access</h3>
          </div>
        </template>

        <div class="space-y-6">
          <!-- File Format -->
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">File Format</label>
            <USelectMenu
              v-model="exportOptions.fileType"
              :options="[
                { label: 'CSV (Comma Separated)', value: 'csv' },
                { label: 'JSON (JavaScript Object)', value: 'json' }
              ]"
              placeholder="Select format"
            />
          </div>

          <!-- Export Format (only for CSV) -->
          <div v-if="exportOptions.fileType === 'csv'">
            <label class="block text-sm font-medium text-gray-300 mb-2">Export Format</label>
            <USelectMenu
              v-model="exportOptions.format"
              :options="[
                { label: 'Detailed - All information', value: 'detailed' },
                { label: 'Summary - Essential fields only', value: 'summary' },
                { label: 'Compliance - Audit-focused data', value: 'compliance' }
              ]"
              placeholder="Select format"
            />
          </div>

          <!-- Include Options -->
          <div class="space-y-3">
            <label class="block text-sm font-medium text-gray-300">Include Additional Data</label>
            
            <div class="flex items-center gap-2">
              <UCheckbox
                v-model="exportOptions.includeContactInfo"
                id="include-contact"
              />
              <label for="include-contact" class="text-sm text-gray-300">
                Contact Information (email, phone, job title)
              </label>
            </div>

            <div class="flex items-center gap-2">
              <UCheckbox
                v-model="exportOptions.includeGroupDetails"
                id="include-groups"
              />
              <label for="include-groups" class="text-sm text-gray-300">
                Group Membership Details
              </label>
            </div>

            <div class="flex items-center gap-2">
              <UCheckbox
                v-model="exportOptions.includeComplianceData"
                id="include-compliance"
              />
              <label for="include-compliance" class="text-sm text-gray-300">
                Compliance & Audit Fields
              </label>
            </div>
          </div>

          <!-- Preview Info -->
          <div class="bg-gray-800/50 rounded-lg p-4">
            <div class="flex items-start gap-2">
              <UIcon name="i-heroicons-information-circle" class="w-4 h-4 text-blue-400 mt-0.5" />
              <div class="text-sm">
                <p class="text-gray-300 font-medium mb-1">Export Preview</p>
                <p class="text-gray-400">
                  {{ accounts.length }} account{{ accounts.length !== 1 ? 's' : '' }} will be exported
                  as {{ exportOptions.fileType.toUpperCase() }}
                  {{ exportOptions.fileType === 'csv' ? `in ${exportOptions.format} format` : '' }}.
                </p>
              </div>
            </div>
          </div>
        </div>

        <template #footer>
          <div class="flex items-center justify-end gap-3">
            <UButton 
              @click="showExportModal = false"
              variant="ghost"
            >
              Cancel
            </UButton>
            <UButton 
              @click="handleExportAccess"
              color="blue"
              :disabled="!accounts.length"
            >
              Export Data
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>