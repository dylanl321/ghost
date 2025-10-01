<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue'
import UserAccess from '~/components/accounts/UserAccess.vue'
// import { exportFlattenedUserAccessToCSV } from '~/utils/csvExport'
import { getEmailPatternsFromSlug, getSearchTermsFromSlug, isValidUsername, convertToUsernameSlug } from '~/utils/userUtils'
import UserAvatar from '~/components/ui/UserAvatar.vue'

interface UserProfile {
  userPrincipalName: string
  displayName: string
  jobTitle?: string
  department?: string
  officeLocation?: string
  businessPhones?: string[]
  mobilePhone?: string
  mail?: string
}

// Page setup
const route = useRoute()
const username = computed(() => route.params.username as string)

// Use custom breadcrumbs
const { setBreadcrumbs } = usePageBreadcrumbs()

// Component state
const userProfile = ref<UserProfile | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const showInactiveAccounts = ref(false)

// Refs to access UserAccess component data
const userAccessRef = ref<any>(null)
const accessSummary = computed(() => {
  if (!userAccessRef.value?.accessSummary) {
    return {
      totalAccounts: 0,
      totalRoles: 0,
      highestPrivilegeLevel: 'Loading...',
      lastActivity: 'Unknown'
    }
  }
  
  // Access the data from UserAccess component
  const summary = userAccessRef.value.accessSummary
  const accounts = userAccessRef.value.accounts || []
  
  // Calculate highest privilege level
  const allRoles: string[] = accounts.flatMap((acc: any) => (acc.roles || []) as string[])
  let highestLevel = 'none'
  
  if (allRoles.some((role: string) => role.toLowerCase().includes('admin'))) {
    highestLevel = 'Admin'
  } else if (allRoles.some((role: string) => role.toLowerCase().includes('power') || role.toLowerCase().includes('developer'))) {
    highestLevel = 'Power User'
  } else if (allRoles.some((role: string) => role.toLowerCase().includes('readwrite') || role.toLowerCase().includes('contributor'))) {
    highestLevel = 'Read-Write'
  } else if (allRoles.some((role: string) => role.toLowerCase().includes('readonly'))) {
    highestLevel = 'Read-Only'
  } else if (allRoles.length > 0) {
    highestLevel = 'Limited'
  }
  
  return {
    totalAccounts: summary.totalAccounts || 0,
    totalRoles: summary.totalRoles || 0,
    highestPrivilegeLevel: highestLevel,
    lastActivity: 'Recent'
  }
})

// Composables
const { user } = useOidcAuth()
const { fetchUserProfile, searchUsers } = useGraphApi()
const { getUserTags } = useGroupMembers()

// User tags
const userTags = ref<Array<{title: string, color: string, icon?: string, description?: string}>>([])

// Search for user by username pattern
const findUserByUsername = async (usernameSlug: string) => {
  if (!user.value?.accessToken || !usernameSlug) return null

  // Validate the username slug format
  if (!isValidUsername(usernameSlug)) {
    console.error('Invalid username slug format:', usernameSlug)
    return null
  }

  try {
    // Get possible email patterns from the slug
    const emailPatterns = getEmailPatternsFromSlug(usernameSlug)
    
    console.log(`Trying email patterns for slug "${usernameSlug}":`, emailPatterns)

    // Try each email pattern
    for (const email of emailPatterns) {
      try {
        const searchResults = await searchUsers(user.value.accessToken, email, 5)
        if (searchResults && searchResults.length > 0) {
          // Find exact match first
          const exactMatch = searchResults.find((u: any) => 
            u.userPrincipalName.toLowerCase() === email.toLowerCase()
          )
          if (exactMatch) {
            console.log(`Found exact email match: ${email}`)
            return exactMatch
          }
          
          // For partial matches, ensure the slug matches exactly
          // This prevents dylan-lewis from matching dylan.lewis.ms
          const partialMatch = searchResults.find((u: any) => {
            const userSlug = convertToUsernameSlug(u.userPrincipalName)
            return userSlug === usernameSlug.toLowerCase()
          })
          if (partialMatch) {
            console.log(`Found partial email match with exact slug: ${email} -> ${partialMatch.userPrincipalName}`)
            return partialMatch
          }
        }
      } catch {
        console.debug(`No results for email pattern: ${email}`)
      }
    }

    // If email search fails, try searching by display name parts
    const searchTerms = getSearchTermsFromSlug(usernameSlug)
    console.log(`Trying name search terms:`, searchTerms)
    
    for (const searchTerm of searchTerms) {
      try {
        const searchResults = await searchUsers(user.value.accessToken, searchTerm, 10)
        if (searchResults && searchResults.length > 0) {
          // Find the best match based on the slug
          const bestMatch = searchResults.find((u: any) => {
            const userSlug = convertToUsernameSlug(u.userPrincipalName)
            return userSlug.toLowerCase() === usernameSlug.toLowerCase()
          })
          
          if (bestMatch) {
            console.log(`Found name match: ${searchTerm} -> ${bestMatch.userPrincipalName}`)
            return bestMatch
          }
        }
      } catch {
        console.debug(`No results for search term: ${searchTerm}`)
      }
    }

    console.log(`No user found for username slug: ${usernameSlug}`)
    return null
  } catch (err) {
    console.error('Error finding user:', err)
    return null
  }
}

// Load user tags
const loadUserTags = async () => {
  if (!userProfile.value?.userPrincipalName || !user.value?.accessToken) {
    return
  }

  try {
    const tags = await getUserTags(userProfile.value.userPrincipalName, user.value.accessToken)
    userTags.value = tags
  } catch (error) {
    console.error('Failed to load user tags:', error)
    userTags.value = []
  }
}

// Load user profile
const loadUserProfile = async () => {
  if (!user.value?.accessToken || !username.value) return

  try {
    loading.value = true
    error.value = null

    // Find user by username slug
    const foundUser = await findUserByUsername(username.value)
    
    if (!foundUser) {
      error.value = 'User not found'
      return
    }

    // Get detailed profile
    const profile = await fetchUserProfile(foundUser.userPrincipalName, user.value.accessToken)
    
    userProfile.value = {
      userPrincipalName: profile.userPrincipalName || foundUser.userPrincipalName,
      displayName: profile.displayName || foundUser.displayName,
      jobTitle: profile.jobTitle,
      department: profile.department,
      officeLocation: profile.officeLocation,
      businessPhones: profile.businessPhones,
      mobilePhone: profile.mobilePhone,
      mail: profile.mail
    }

    // Load user tags after profile is loaded
    await loadUserTags()

    // Update breadcrumbs with user's display name
    updateBreadcrumbs()

  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load user profile'
    console.error('Error loading user profile:', err)
  } finally {
    loading.value = false
  }
}

// Get inactive accounts from UserAccess component
const inactiveAccounts = computed(() => {
  if (!userAccessRef.value?.accounts) return []
  return userAccessRef.value.accounts.filter((account: any) => 
    !account.isActive || 
    account.status === 'unknown' || 
    account.accountStatus === 'unknown' ||
    account.accountName === 'Unknown Account'
  )
})

// Handler functions for inactive accounts section
const handleAccountClick = (account: any) => {
  navigateTo(`/account/${account.accountId}`)
}

const showGroupDetails = (account: any) => {
  if (userAccessRef.value?.showGroupDetails) {
    userAccessRef.value.showGroupDetails(account)
  }
}

// Handle export user access to CSV
const handleExportCSV = () => {
  if (!userProfile.value || !userAccessRef.value) return

  // Use the shared flattened export function
  exportFlattenedUserAccessToCSV([{
    userProfile: userProfile.value,
    accounts: userAccessRef.value.accounts || [],
    userTags: userTags.value || []
  }], {
    filename: `${userProfile.value.displayName.replace(/[^a-zA-Z0-9]/g, '_')}_detailed_access_${new Date().toISOString().split('T')[0]}.csv`,
    includeGroupDetails: true,
    includeTags: true
  })
}

// Handle navigation back to search
const goBackToSearch = () => {
  navigateTo('/account/user')
}

// Page metadata
definePageMeta({
  title: 'User Profile',
  description: 'User profile and AWS access details'
})

// Load data when component mounts
onMounted(() => {
  updateBreadcrumbs() // Set initial breadcrumbs
  loadUserProfile()
})

// Watch for username changes
watch(() => username.value, () => {
  if (username.value) {
    updateBreadcrumbs() // Update breadcrumbs when username changes
    loadUserProfile()
  }
})

// Update breadcrumbs when user profile is loaded
const updateBreadcrumbs = () => {
  if (userProfile.value) {
    setBreadcrumbs([
      { label: 'Dashboard', to: '/' },
      { label: 'User Search', to: '/account/user' },
      { label: userProfile.value.displayName, to: route.path }
    ])
  } else {
    // Fallback breadcrumbs while loading
    setBreadcrumbs([
      { label: 'Dashboard', to: '/' },
      { label: 'User Search', to: '/account/user' },
      { label: username.value, to: route.path }
    ])
  }
}

// Avatar handled by UserAvatar component
</script>

<template>
  <div class="space-y-4 p-6">
    <!-- Breadcrumb Navigation -->
    <div class="flex items-center gap-2 text-sm text-gray-400">
      <NuxtLink to="/account/user" class="hover:text-white flex items-center gap-1">
        <UIcon name="i-heroicons-arrow-left" class="w-4 h-4" />
        <span>Back to Search</span>
      </NuxtLink>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="flex items-center justify-center py-16">
      <div class="text-center">
        <UIcon name="i-heroicons-arrow-path" class="w-12 h-12 animate-spin text-blue-400 mb-4" />
        <p class="text-gray-400 text-lg">Loading user profile...</p>
      </div>
    </div>

    <!-- Error State -->
    <UAlert v-else-if="error" color="red" icon="i-heroicons-exclamation-triangle">
      <template #title>Failed to Load User</template>
      {{ error }}
      <template #actions>
        <UButton variant="ghost" size="xs" icon="i-heroicons-arrow-path" @click="loadUserProfile">
          Try Again
        </UButton>
        <UButton variant="ghost" size="xs" icon="i-heroicons-arrow-left" @click="goBackToSearch">
          Back to Search
        </UButton>
      </template>
    </UAlert>

    <!-- User Profile Content -->
    <div v-else-if="userProfile">
      <!-- Unified Header: User + Stats -->
      <UCard class="bg-gray-900 border border-gray-800">
        <div class="p-6">
          <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            <!-- User Info Section (Columns 1-7) -->
            <div class="lg:col-span-7">
              <div class="flex items-start gap-4">
                <UserAvatar 
                  :user-principal-name="userProfile.userPrincipalName"
                  :display-name="userProfile.displayName"
                  size="xl"
                  class="flex-shrink-0"
                />
                <div class="flex-1 min-w-0">
                  <h1 class="text-2xl font-bold text-white truncate">{{ userProfile.displayName }}</h1>
                  <p class="text-gray-400 truncate mb-2">{{ userProfile.userPrincipalName }}</p>
                  
                  <div class="space-y-1 text-sm text-gray-400 mb-4">
                    <div v-if="userProfile.jobTitle" class="truncate">{{ userProfile.jobTitle }}</div>
                    <div v-if="userProfile.department" class="truncate">{{ userProfile.department }}</div>
                  </div>
                  
                  <!-- Contact Actions -->
                  <div class="flex items-center gap-2 flex-wrap">
                    <UButton
                      :to="`mailto:${userProfile.userPrincipalName}`"
                      icon="i-heroicons-envelope"
                      color="blue"
                      variant="soft"
                      size="sm"
                    >
                      Email
                    </UButton>
                    <UButton
                      :to="`msteams:/l/chat/0/0?users=${userProfile.userPrincipalName}`"
                      icon="i-simple-icons-microsoftteams"
                      color="purple"
                      variant="soft"
                      size="sm"
                    >
                      Teams
                    </UButton>
                    <NuxtLink :to="`/account/user/${username}/access-history`">
                      <UButton icon="i-heroicons-clock" variant="outline" size="sm">
                        History
                      </UButton>
                    </NuxtLink>
                  </div>
                </div>
              </div>
            </div>

            <!-- AWS Stats Summary - Single Row (Columns 8-12) -->
            <div class="lg:col-span-5">
              <div class="space-y-3">
                <h3 class="text-lg font-semibold text-white flex items-center gap-2">
                  <UIcon name="i-heroicons-chart-bar" class="w-5 h-5 text-blue-400" />
                  AWS Access
                </h3>
                
                <!-- Single row of 4 stats -->
                <div class="grid grid-cols-4 gap-3">
                  <div class="bg-gray-800/50 rounded-lg p-3 text-center">
                    <div class="text-xl font-bold text-blue-400">{{ accessSummary.totalAccounts }}</div>
                    <div class="text-xs text-gray-400">Accounts</div>
                  </div>
                  <div class="bg-gray-800/50 rounded-lg p-3 text-center">
                    <div class="text-xl font-bold text-green-400">{{ accessSummary.totalRoles }}</div>
                    <div class="text-xs text-gray-400">Roles</div>
                  </div>
                  <div class="bg-gray-800/50 rounded-lg p-3 text-center">
                    <div class="text-xl font-bold text-orange-400">{{ userAccessRef?.accessSummary?.govCloudAccounts || 0 }}</div>
                    <div class="text-xs text-gray-400">GovCloud</div>
                  </div>
                  <div class="bg-gray-800/50 rounded-lg p-3 text-center">
                    <div class="text-xl font-bold text-purple-400">{{ userAccessRef?.accessSummary?.multiEnvAccounts || 0 }}</div>
                    <div class="text-xs text-gray-400">Multi-Env</div>
                  </div>
                </div>
                
                <!-- User Tags -->
                <div v-if="userTags.length > 0" class="pt-2 border-t border-gray-700">
                  <span class="text-sm text-gray-400 mb-2 block">User Tags</span>
                  <div class="flex flex-wrap gap-1">
                    <UTooltip
                      v-for="tag in userTags"
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
                </div>
              </div>
            </div>
          </div>
        </div>
      </UCard>

      <!-- Account Access Controls (Above the groups) -->
      <div class="flex items-center justify-between py-4">
        <div class="flex items-center gap-4">
          <h2 class="text-xl font-semibold text-white">AWS Account Access</h2>
          
          <!-- View Toggle -->
          <UButton 
            :icon="userAccessRef?.viewMode === 'cards' ? 'i-heroicons-table-cells' : 'i-heroicons-squares-2x2'"
            variant="outline"
            size="sm"
            @click="userAccessRef?.toggleViewMode()"
          >
            {{ userAccessRef?.viewMode === 'cards' ? 'Table View' : 'Card View' }}
          </UButton>
          
          <!-- Refresh Button -->
          <UButton 
            :loading="userAccessRef?.loading" 
            icon="i-heroicons-arrow-path" 
            variant="ghost" 
            size="sm" 
            @click="userAccessRef?.loadUserAccess()"
          />
        </div>

        <div class="flex items-center gap-3">
          <!-- Role Filter -->
          <div v-if="userAccessRef?.allRoles?.length > 5" class="flex items-center gap-2">
            <label class="text-sm text-gray-400">Filter by Role:</label>
            <USelectMenu 
              v-model="userAccessRef.selectedRoleFilter" 
              :options="[
                { label: 'All Roles', value: '' },
                ...userAccessRef.allRoles.map((role: string) => ({ label: role, value: role }))
              ]"
              placeholder="All Roles"
              size="sm"
              class="w-48"
              value-attribute="value"
              option-attribute="label"
            />
          </div>

          <!-- Export Options -->
          <UDropdown :items="[
            [{
              label: 'Export Options',
              slot: 'account',
              disabled: true
            }],
            [{
              label: 'Detailed CSV',
              icon: 'i-heroicons-document-text',
              click: () => userAccessRef?.exportDetailed()
            }, {
              label: 'Summary CSV',
              icon: 'i-heroicons-document-chart-bar',
              click: () => userAccessRef?.exportSummary()
            }],
            [{
              label: 'JSON Export',
              icon: 'i-heroicons-code-bracket',
              click: () => userAccessRef?.exportJSON()
            }, {
              label: 'User CSV',
              icon: 'i-heroicons-user',
              click: handleExportCSV
            }]
          ]" :popper="{ placement: 'bottom-end' }">
            <UButton 
              icon="i-heroicons-arrow-down-tray"
              variant="outline"
              size="sm"
            >
              Export Data
            </UButton>
          </UDropdown>
        </div>
      </div>

      <!-- Account Access Content (Streamlined) -->
      <div class="space-y-4">
        <!-- Active Accounts Section -->
        <UserAccess 
          ref="userAccessRef"
          :key="userProfile.userPrincipalName"
          :user-principal-name="userProfile.userPrincipalName"
          :display-name="userProfile.displayName"
          :show-user-info="false"
          :show-header="false"
          :show-controls="false"
          :show-stats="false"
          :show-inactive-accounts="false"
        />

        <!-- Inactive Accounts Collapsed Section -->
        <div v-if="inactiveAccounts.length > 0" class="mt-6">
          <UCard class="bg-gray-900 border border-gray-800">
            <template #header>
              <div 
                class="flex items-center justify-between cursor-pointer hover:bg-gray-800/50 -m-4 p-4 rounded-t-lg transition-colors"
                @click="showInactiveAccounts = !showInactiveAccounts"
              >
                <div class="flex items-center gap-3">
                  <UIcon 
                    :name="showInactiveAccounts ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
                    class="w-5 h-5 text-gray-400 transition-transform"
                  />
                  <h3 class="text-lg font-semibold text-white">Inactive Accounts</h3>
                  <UBadge 
                    color="gray" 
                    variant="soft" 
                    size="sm"
                  >
                    {{ inactiveAccounts.length }}
                  </UBadge>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-sm text-gray-400">
                    {{ showInactiveAccounts ? 'Click to collapse' : 'Click to expand' }}
                  </span>
                </div>
              </div>
            </template>

            <!-- Collapsed Content -->
            <div v-if="showInactiveAccounts" class="space-y-4">
              <div class="text-sm text-gray-400 mb-4">
                These accounts are not currently active in the AWS accounts database but the user may still have access through Azure AD groups.
              </div>

              <!-- Inactive Accounts Grid -->
              <div class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                <UCard 
                  v-for="account in inactiveAccounts" 
                  :key="account.accountId"
                  class="bg-gray-900/50 border border-gray-700 opacity-75 cursor-pointer hover:opacity-90 transition-opacity"
                  @click="handleAccountClick(account)"
                >
                  <div class="p-4 space-y-3">
                    <!-- Header -->
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-2 flex-1 min-w-0">
                        <!-- Environment Indicators -->
                        <div class="flex gap-1">
                          <div v-if="account.environments?.includes('commercial')" 
                               class="w-2 h-2 bg-blue-400 rounded-full opacity-60" title="Commercial"/>
                          <div v-if="account.environments?.includes('govcloud')" 
                               class="w-2 h-2 bg-orange-400 rounded-full opacity-60" title="GovCloud"/>
                        </div>
                        
                        <div class="flex-1 min-w-0">
                          <div class="flex items-center gap-2">
                            <h5 class="font-medium text-gray-300 truncate text-sm">
                              {{ account.accountName }}
                            </h5>
                            <UBadge 
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
                        <div class="text-sm font-medium text-gray-400">{{ account.roles?.length || 0 }}</div>
                        <div class="text-xs text-gray-500">roles</div>
                      </div>
                    </div>

                    <!-- Roles -->
                    <div class="space-y-2">
                      <div class="flex flex-wrap gap-1">
                        <span v-for="role in (account.roles || []).slice(0, 4)" :key="role"
                              class="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded">
                          {{ role }}
                        </span>
                        <span v-if="(account.roles?.length || 0) > 4" 
                              class="px-2 py-1 text-xs bg-gray-600 text-gray-400 rounded">
                          +{{ (account.roles?.length || 0) - 4 }} more
                        </span>
                      </div>
                    </div>

                    <!-- Actions -->
                    <div class="flex items-center justify-between pt-2 border-t border-gray-700">
                      <UButton
                        variant="ghost"
                        size="xs"
                        icon="i-heroicons-user-group"
                        class="text-gray-400 hover:text-white"
                        @click.stop="showGroupDetails(account)"
                      >
                        View Groups
                      </UButton>
                      <UButton
                        variant="ghost"
                        size="xs"
                        icon="i-heroicons-arrow-top-right-on-square"
                        class="text-gray-400 hover:text-white"
                        @click.stop="handleAccountClick(account)"
                      >
                        Details
                      </UButton>
                    </div>
                  </div>
                </UCard>
              </div>
            </div>
          </UCard>
        </div>
      </div>
    </div>

    <!-- No User State -->
    <UCard v-else class="bg-gray-900 border border-gray-800">
      <div class="text-center py-16">
        <UIcon name="i-heroicons-user-x-mark" class="w-20 h-20 text-gray-500 mx-auto mb-6" />
        <h3 class="text-2xl font-semibold text-white mb-3">User Not Found</h3>
        <p class="text-gray-400 mb-8 max-w-md mx-auto">
          The user "{{ username }}" could not be found. They may not exist or you may not have permission to view their profile.
        </p>
        
        <div class="flex flex-wrap justify-center gap-4">
          <UButton 
            icon="i-heroicons-arrow-left"
            variant="outline"
            @click="goBackToSearch"
          >
            Back to Search
          </UButton>
          <NuxtLink to="/account/user">
            <UButton 
              icon="i-heroicons-magnifying-glass"
              variant="ghost"
            >
              Search Users
            </UButton>
          </NuxtLink>
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

/* Enhanced user avatar gradient */
.bg-gradient-to-br {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(37, 99, 235, 0.2) 100%);
}
</style> 