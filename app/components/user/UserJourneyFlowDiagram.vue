<template>
  <div class="space-y-6">
    <!-- Journey Overview -->
    <div class="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <UIcon name="i-heroicons-map" class="w-5 h-5 text-blue-600 dark:text-blue-400" />
            User Journey Map
          </h3>
          <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Visual representation of user's path through AWS accounts and role assumptions
          </p>
        </div>
        <div class="flex items-center gap-2">
          <UBadge :color="getTotalRiskColor(totalRiskScore)" size="sm">
            Risk: {{ totalRiskScore }}/100
          </UBadge>
          <UBadge color="blue" size="sm">
            {{ journeyPaths.length }} {{ journeyPaths.length === 1 ? 'Path' : 'Paths' }}
          </UBadge>
        </div>
      </div>

      <!-- Journey Statistics -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="text-center">
          <div class="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {{ totalSessions }}
          </div>
          <div class="text-xs text-gray-600 dark:text-gray-400">Total Sessions</div>
        </div>
        <div class="text-center">
          <div class="text-2xl font-bold text-green-600 dark:text-green-400">
            {{ uniqueAccountsCount }}
          </div>
          <div class="text-xs text-gray-600 dark:text-gray-400">Accounts Accessed</div>
        </div>
        <div class="text-center">
          <div class="text-2xl font-bold text-purple-600 dark:text-purple-400">
            {{ totalRoleAssumptions }}
          </div>
          <div class="text-xs text-gray-600 dark:text-gray-400">Role Assumptions</div>
        </div>
        <div class="text-center">
          <div class="text-2xl font-bold text-orange-600 dark:text-orange-400">
            {{ longestJourneySteps }}
          </div>
          <div class="text-xs text-gray-600 dark:text-gray-400">Longest Path</div>
        </div>
      </div>
    </div>

    <!-- Journey Paths -->
    <div v-if="journeyPaths.length === 0" class="text-center py-12">
      <UIcon name="i-heroicons-map-pin" class="w-12 h-12 mx-auto mb-4 text-gray-400" />
      <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">No Journey Data</h3>
      <p class="text-gray-600 dark:text-gray-400">
        No cross-account sessions or role assumptions found for this user.
      </p>
    </div>

    <div v-else class="space-y-6">
      <!-- Legend -->
      <div class="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <h4 class="text-sm font-medium text-gray-900 dark:text-white mb-3">Legend</h4>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div class="flex items-center gap-2">
            <div class="w-4 h-4 bg-blue-500 rounded-lg"></div>
            <span class="text-gray-600 dark:text-gray-400">Initial Login</span>
          </div>
          <div class="flex items-center gap-2">
            <div class="w-4 h-4 bg-green-500 rounded-lg"></div>
            <span class="text-gray-600 dark:text-gray-400">Role Assumption</span>
          </div>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-arrow-right" class="w-4 h-4 text-gray-400" />
            <span class="text-gray-600 dark:text-gray-400">Session Flow</span>
          </div>
          <div class="flex items-center gap-2">
            <div class="w-2 h-2 bg-red-500 rounded-full"></div>
            <span class="text-gray-600 dark:text-gray-400">High Risk</span>
          </div>
        </div>
      </div>

      <!-- Journey Path Display -->
      <div v-for="path in journeyPaths" :key="path.id" class="mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center space-x-2">
            <UIcon name="i-heroicons-arrow-right-circle" class="text-blue-500" />
            <span class="font-medium text-gray-900 dark:text-white">
              Session {{ formatTime(path.startTime) }}
            </span>
            <UBadge :color="getRiskColor(path.riskScore)" variant="subtle" size="sm">
              Risk: {{ path.riskScore }}/100
            </UBadge>
          </div>
          <div class="text-sm text-gray-500 dark:text-gray-400">
            {{ path.steps.length }} step{{ path.steps.length !== 1 ? 's' : '' }} • 
            {{ formatDuration(path.totalDuration) }}
          </div>
        </div>
        
        <!-- Journey Steps -->
        <div class="flex items-center space-x-2 overflow-x-auto pb-2">
          <div v-for="(step, stepIndex) in path.steps" :key="`${step.accountId}-${step.roleName || step.type}-${stepIndex}`" 
               class="flex items-center space-x-2 flex-shrink-0">
            
            <!-- Step Card -->
            <div class="relative group">
              <div class="flex flex-col items-center p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 min-w-[140px] max-w-[160px] hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                <!-- Step Type Icon -->
                <div class="flex items-center justify-center w-8 h-8 rounded-full mb-2"
                     :class="getStepIconClass(step.type, step.riskLevel)">
                  <UIcon :name="getStepIcon(step.type)" class="w-4 h-4" />
                </div>
                
                <!-- Account ID -->
                <div class="text-xs font-mono text-gray-600 dark:text-gray-300 mb-1 text-center">
                  {{ getReadableAccountName(step.accountId) }}
                </div>
                
                <!-- Role Name -->
                <div v-if="step.roleName" class="text-sm font-medium text-gray-900 dark:text-white text-center leading-tight px-1 break-words">
                  {{ step.roleName }}
                </div>
                <div v-else class="text-sm text-gray-500 dark:text-gray-400 text-center px-1">
                  {{ step.type === 'initial' ? 'Initial Access' : 'Role Switch' }}
                </div>
                
                <!-- Duration Badge -->
                <div v-if="step.duration" class="mt-2">
                  <UBadge color="gray" variant="subtle" size="xs">
                    {{ formatDuration(step.duration) }}
                  </UBadge>
                </div>
              </div>
              
              <!-- Hover Tooltip -->
              <div class="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10 shadow-lg">
                <div class="font-medium">{{ formatTime(step.timestamp) }}</div>
                <div v-if="step.eventCount" class="text-gray-300 mt-1">
                  {{ step.eventCount }} event{{ step.eventCount !== 1 ? 's' : '' }}
                </div>
                <div v-if="step.riskLevel && step.riskLevel !== 'low'" class="text-gray-300 mt-1">
                  Risk: {{ step.riskLevel }}
                </div>
              </div>
            </div>
            
            <!-- Arrow between steps (not after last step) -->
            <div v-if="stepIndex < path.steps.length - 1" class="flex items-center">
              <UIcon name="i-heroicons-arrow-right" class="text-gray-400 w-4 h-4" />
            </div>
          </div>
        </div>
        
        <!-- Path Summary -->
        <div class="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
          <div class="flex items-center justify-between text-sm">
            <div class="flex items-center space-x-4 text-gray-600 dark:text-gray-300">
              <span>{{ path.totalEvents }} events</span>
              <span v-if="path.errorCount > 0" class="text-red-600 dark:text-red-400">
                {{ path.errorCount }} errors
              </span>
              <span v-if="path.uniqueServices.length > 0">
                Services: {{ path.uniqueServices.join(', ') }}
              </span>
            </div>
            <div v-if="path.sourceIPs.length > 0" class="text-gray-500 dark:text-gray-400">
              From: {{ path.sourceIPs.join(', ') }}
            </div>
          </div>
          
          <!-- Path Insights -->
          <div v-if="path.insights && path.insights.length > 0" class="mt-2">
            <div class="flex flex-wrap gap-1">
              <UBadge v-for="insight in path.insights" :key="insight" 
                      color="blue" variant="subtle" size="xs">
                {{ insight }}
              </UBadge>
            </div>
          </div>
        </div>
      </div>

      <!-- Summary Timeline View -->
      <UCard class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <template #header>
          <h4 class="text-sm font-medium text-gray-900 dark:text-white">
            Consolidated Timeline View
          </h4>
        </template>
        
        <div class="p-4">
          <div class="relative">
            <!-- Timeline axis -->
            <div class="absolute top-8 left-0 right-0 h-0.5 bg-gray-200 dark:bg-gray-600"></div>
            
            <!-- Timeline events -->
            <div class="relative flex justify-between items-center h-16">
              <div 
                v-for="(event, index) in timelineEvents" 
                :key="index"
                class="flex flex-col items-center"
                :style="{ left: `${event.position}%` }"
                style="position: absolute;"
              >
                <div 
                  class="w-4 h-4 rounded-full border-2 border-white shadow-sm z-10"
                  :class="event.type === 'login' ? 'bg-blue-500' : 'bg-green-500'"
                ></div>
                <div class="mt-2 text-xs text-gray-600 dark:text-gray-400 text-center whitespace-nowrap">
                  {{ event.label }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { UserSession } from '~/utils/sessionManager'

interface JourneyStep {
  type: 'initial' | 'assume-role'
  accountId: string
  roleName?: string
  timestamp: Date
  duration?: number
  riskLevel?: 'low' | 'medium' | 'high' | 'critical'
  eventCount?: number
}

interface JourneyPath {
  id: string
  startTime: Date
  endTime?: Date
  totalDuration: number
  steps: JourneyStep[]
  riskScore: number
  totalEvents: number
  errorCount: number
  uniqueServices: string[]
  sourceIPs: string[]
  insights: string[]
}

interface Props {
  sessions: UserSession[]
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  sessions: () => [],
  loading: false
})

// Events
const emit = defineEmits<{
  'step-clicked': [step: JourneyStep, path: JourneyPath]
  'view-event-details': [event: any]
}>()

// Computed properties
const journeyPaths = computed((): JourneyPath[] => {
  if (!props.sessions?.length) return []
  
  return props.sessions
    .filter(session => session.activities && session.activities.length > 0)
    .map(session => createJourneyPath(session))
    .filter(path => path.steps.length > 0)
})

const totalSessions = computed(() => props.sessions.length)

const uniqueAccountsCount = computed(() => {
  const accounts = new Set<string>()
  props.sessions.forEach(session => {
    session.accountIds?.forEach(id => accounts.add(id))
  })
  return accounts.size
})

const totalRoleAssumptions = computed(() => {
  return props.sessions.reduce((total, session) => {
    return total + (session.activities?.filter(activity => 
      isRoleAssumptionEvent(activity)
    ).length || 0)
  }, 0)
})

const longestJourneySteps = computed(() => {
  return Math.max(...journeyPaths.value.map(path => path.steps.length), 0)
})

const totalRiskScore = computed(() => {
  if (!journeyPaths.value.length) return 0
  return Math.round(
    journeyPaths.value.reduce((sum, path) => sum + path.riskScore, 0) / journeyPaths.value.length
  )
})

const timelineEvents = computed(() => {
  if (!journeyPaths.value.length) return []
  
  const allEvents: Array<{ time: Date; type: 'login' | 'assume-role'; label: string }> = []
  
  journeyPaths.value.forEach(path => {
    path.steps.forEach(step => {
      allEvents.push({
        time: step.timestamp,
        type: step.type === 'initial' ? 'login' : 'assume-role',
        label: step.type === 'initial' ? 'Login' : `→ ${step.roleName || 'Role'}`
      })
    })
  })
  
  // Sort by time and calculate positions
  allEvents.sort((a, b) => a.time.getTime() - b.time.getTime())
  
  if (allEvents.length <= 1) return allEvents.map(event => ({ ...event, position: 50 }))
  
  const startTime = allEvents[0].time.getTime()
  const endTime = allEvents[allEvents.length - 1].time.getTime()
  const totalDuration = endTime - startTime
  
  return allEvents.map(event => ({
    ...event,
    position: totalDuration > 0 
      ? ((event.time.getTime() - startTime) / totalDuration) * 100 
      : 0
  }))
})

// Methods
function createJourneyPath(session: UserSession): JourneyPath {
  const steps: JourneyStep[] = []
  const seenAccountRoleCombos = new Set<string>()
  
  // Add initial session step only if it's meaningful
  const initialCombo = `${session.primaryAccountId}-initial`
  if (!seenAccountRoleCombos.has(initialCombo)) {
    steps.push({
      type: 'initial',
      accountId: session.primaryAccountId,
      roleName: extractInitialRoleName(session),
      timestamp: session.start,
      duration: session.duration,
      riskLevel: session.riskLevel,
      eventCount: session.eventCount
    })
    seenAccountRoleCombos.add(initialCombo)
  }
  
  // Add role assumption steps, but avoid duplicates
  if (session.activities) {
    const roleAssumptionEvents = session.activities
      .filter(activity => isRoleAssumptionEvent(activity))
      .sort((a, b) => a.eventTime.getTime() - b.eventTime.getTime())
    
    for (const activity of roleAssumptionEvents) {
      const roleName = extractRoleName(activity as any)
      const accountId = activity.accountId || 'Unknown'
      const combo = `${accountId}-${roleName}`
      
      // Only add if this account-role combination hasn't been seen
      if (!seenAccountRoleCombos.has(combo) && roleName !== 'Unknown Role') {
        steps.push({
          type: 'assume-role',
          accountId,
          roleName,
          timestamp: activity.eventTime,
          riskLevel: determineStepRiskLevel(activity as any),
          eventCount: 1
        })
        seenAccountRoleCombos.add(combo)
      }
    }
  }
  
  return {
    id: session.id,
    startTime: session.start,
    endTime: session.end || undefined,
    totalDuration: session.duration,
    steps,
    riskScore: session.riskScore,
    totalEvents: session.eventCount,
    errorCount: session.errorCount,
    uniqueServices: session.services.slice(0, 3), // Limit for display
    sourceIPs: session.sourceIPs.slice(0, 2), // Limit for display
    insights: generatePathInsights(session)
  }
}

function extractInitialRoleName(session: UserSession): string {
  // Try to extract a meaningful initial role name
  if (session.originalPrincipalId) {
    // Handle AWS SSO format: AROA5PJGCXKENB54J2AXR:Garrett.Hutson
    if (session.originalPrincipalId.includes(':')) {
      const parts = session.originalPrincipalId.split(':')
      if (parts.length >= 2) {
        const userName = parts[1]
        // Clean up the user name
        if (userName.includes('.')) {
          return userName // Keep as is for names like Garrett.Hutson
        }
        return userName
      }
    }
    
    // Handle AWS SSO format with double colons
    if (session.originalPrincipalId.includes('::')) {
      const parts = session.originalPrincipalId.split('::')
      if (parts.length >= 3) {
        return parts[2] // User name part
      }
    }
    
    // Handle ARN format
    if (session.originalPrincipalId.includes('/')) {
      const parts = session.originalPrincipalId.split('/')
      const lastName = parts[parts.length - 1]
      // If it looks like a user name, return it
      if (lastName && !lastName.match(/^[A-Z0-9]{16,}$/)) {
        return lastName
      }
    }
    
    // Handle email-like format
    if (session.originalPrincipalId.includes('@')) {
      return session.originalPrincipalId.split('@')[0]
    }
  }
  
  return 'Console Access'
}

function extractRoleName(activity: any): string {
  if (!isRoleAssumptionEvent(activity)) {
    return 'Unknown Role'
  }

  // Prefer originalEvent data if available (new format)
  const activityData = activity.originalEvent || activity
  const eventName = activity.eventName?.toLowerCase() || ''
  
  // Method 1: Check userIdentity for assumed role information (most reliable for console switches)
  if (activityData.userIdentity?.type === 'AssumedRole') {
    const userArn = activityData.userIdentity.arn
    if (userArn && typeof userArn === 'string') {
      // Extract role from ARN like: arn:aws:sts::123456789012:assumed-role/MyRole/session-name
      if (userArn.includes('assumed-role/')) {
        const arnParts = userArn.split('assumed-role/')[1]?.split('/')
        if (arnParts && arnParts.length > 0) {
          const fullRoleName = arnParts[0]
          return extractMeaningfulRoleName(fullRoleName)
        }
      }
      // Also handle direct role ARNs: arn:aws:iam::123456789012:role/MyRole
      if (userArn.includes(':role/')) {
        const roleParts = userArn.split(':role/')[1]?.split('/')
        if (roleParts && roleParts.length > 0) {
          const fullRoleName = roleParts[0]
          return extractMeaningfulRoleName(fullRoleName)
        }
      }
    }
  }
  
  // Method 2: Check sessionIssuer for AWS SSO roles
  if (activityData.userIdentity?.sessionContext?.sessionIssuer) {
    const sessionIssuer = activityData.userIdentity.sessionContext.sessionIssuer
    if (sessionIssuer.userName) {
      return extractMeaningfulRoleName(sessionIssuer.userName)
    }
    if (sessionIssuer.arn && sessionIssuer.arn.includes(':role/')) {
      const rolePart = sessionIssuer.arn.split(':role/')[1]?.split('/')[0]
      if (rolePart) {
        return extractMeaningfulRoleName(rolePart)
      }
    }
  }
  
  // Method 3: Check additionalEventData for SwitchRole events (AWS Console)
  if (activityData.additionalEventData?.SwitchTo) {
    const switchToArn = activityData.additionalEventData.SwitchTo
    if (switchToArn && typeof switchToArn === 'string' && switchToArn.includes(':role/')) {
      // Extract from ARN like: arn:aws-us-gov:iam::188121714667:role/GD/CloudTeam_Operations
      const rolePart = switchToArn.split(':role/')[1]
      if (rolePart) {
        return extractMeaningfulRoleName(rolePart)
      }
    }
  }

  // Method 4: Check request parameters (for API calls)
  if (activityData.requestParameters) {
    const roleArn = activityData.requestParameters.roleArn ||
                    activityData.requestParameters.roleName ||
                    activityData.requestParameters.roleSessionName
    if (roleArn && typeof roleArn === 'string') {
      if (roleArn.includes(':role/')) {
        const parts = roleArn.split(':role/')[1]?.split('/')
        const fullRoleName = parts ? parts[0] : roleArn
        return extractMeaningfulRoleName(fullRoleName)
      }
      return extractMeaningfulRoleName(roleArn)
    }
  }
  
  // Method 5: Check response elements
  if (activityData.responseElements) {
    const roleInfo = activityData.responseElements.assumedRoleUser?.arn ||
                     activityData.responseElements.credentials?.sessionName ||
                     activityData.responseElements.roleName
    if (roleInfo && typeof roleInfo === 'string') {
      if (roleInfo.includes('assumed-role/')) {
        const parts = roleInfo.split('assumed-role/')[1]?.split('/')
        const fullRoleName = parts ? parts[0] : roleInfo
        return extractMeaningfulRoleName(fullRoleName)
      }
      if (roleInfo.includes(':role/')) {
        const parts = roleInfo.split(':role/')[1]?.split('/')
        const fullRoleName = parts ? parts[0] : roleInfo
        return extractMeaningfulRoleName(fullRoleName)
      }
      return extractMeaningfulRoleName(roleInfo)
    }
  }
  
  // If all else fails, provide a more specific unknown message
  if (eventName.includes('switch')) {
    return 'Console Role Switch'
  } else if (eventName.includes('assume')) {
    return 'API Role Assumption'
  }
  
  return 'Unknown Role'
}

// Helper function to extract meaningful role names from complex AWS role names
function extractMeaningfulRoleName(fullRoleName: string): string {
  if (!fullRoleName || typeof fullRoleName !== 'string') {
    return 'Unknown Role'
  }
  
  // Handle AWS SSO reserved roles: AWSReservedSSO_GDSSO_SysAdmin_8c7b4d9bdd7d9425
  if (fullRoleName.startsWith('AWSReservedSSO_')) {
    const ssoRoleParts = fullRoleName.replace('AWSReservedSSO_', '').split('_')
    if (ssoRoleParts.length >= 2) {
      // Remove the hash suffix (last part) and join the meaningful parts
      const meaningfulParts = ssoRoleParts.slice(0, -1) // Remove last element (hash)
      return meaningfulParts.join('_')
    }
  }
  
  // Handle AWS reserved roles in general: aws-reserved/sso.amazonaws.com/us-gov-west-1/AWSReservedSSO_GDSSO_SysAdmin_8c7b4d9bdd7d9425
  if (fullRoleName.includes('aws-reserved/')) {
    const reservedParts = fullRoleName.split('/')
    const lastPart = reservedParts[reservedParts.length - 1]
    if (lastPart && lastPart.startsWith('AWSReservedSSO_')) {
      return extractMeaningfulRoleName(lastPart) // Recursive call to handle SSO extraction
    }
    return lastPart || 'AWS Reserved Role'
  }
  
  // Handle role paths like: GD/CloudTeam_Operations
  if (fullRoleName.includes('/')) {
    const pathParts = fullRoleName.split('/')
    // Return the last part (actual role name) but keep context if meaningful
    const roleName = pathParts[pathParts.length - 1]
    const path = pathParts.slice(0, -1).join('/')
    
    // If path is meaningful (not just random characters), include it
    if (path && path.length > 0 && path.length < 20 && !/^[a-f0-9]{8,}$/i.test(path)) {
      return `${path}/${roleName}`
    }
    return roleName
  }
  
  // Handle roles with hash suffixes: MyRole_1234567890abcdef
  if (fullRoleName.includes('_') && fullRoleName.length > 20) {
    const parts = fullRoleName.split('_')
    const lastPart = parts[parts.length - 1]
    
    // If last part looks like a hash (8+ alphanumeric characters), remove it
    if (lastPart && lastPart.length >= 8 && /^[a-f0-9]+$/i.test(lastPart)) {
      const meaningfulParts = parts.slice(0, -1)
      return meaningfulParts.join('_')
    }
  }
  
  // Return as-is if no special patterns detected
  return fullRoleName
}

function determineStepRiskLevel(activity: any): 'low' | 'medium' | 'high' | 'critical' {
  if (activity.errorCode) return 'high'
  if (activity.eventName?.includes('Admin')) return 'medium'
  return 'low'
}

function generatePathInsights(session: UserSession): string[] {
  const insights: string[] = []
  
  // Cross-partition activity
  if (session.crossPartitionActivity) {
    insights.push('Cross-partition activity detected')
  }
  
  // High-risk activities
  if (session.riskScore > 70) {
    insights.push('High-risk session')
  }
  
  // Multiple role assumptions
  const roleAssumptions = session.activities?.filter(a => isRoleAssumptionEvent(a)).length || 0
  if (roleAssumptions > 3) {
    insights.push(`${roleAssumptions} role assumptions`)
  }
  
  // Long session duration
  if (session.duration > 8 * 60 * 60 * 1000) { // 8 hours
    insights.push('Extended session duration')
  }
  
  // Multiple source IPs
  if (session.sourceIPs.length > 1) {
    insights.push('Multiple source IPs')
  }
  
  // Error-prone session
  if (session.errorCount > 5) {
    insights.push('High error count')
  }
  
  // Multiple accounts
  if (session.accountIds.length > 1) {
    insights.push(`Cross-account access across ${session.accountIds.length} accounts`)
  }
  
  return insights
}

function getReadableAccountName(accountId: string): string {
  if (!accountId) return 'Unknown'
  
  // Handle ARO format: ARO:123456789012 -> 123456789012
  if (accountId.startsWith('ARO:')) {
    const parts = accountId.split(':')
    if (parts.length >= 2) {
      return parts[1] || 'Unknown Account'
    }
  }
  
  // Handle partition format: govcloud:123456789012 -> 123456789012
  if (accountId.includes(':') && accountId.split(':').length === 2) {
    const parts = accountId.split(':')
    const actualAccountId = parts[1]
    if (actualAccountId && actualAccountId.match(/^\d{12}$/)) {
      return actualAccountId
    }
  }
  
  // Return as-is if it's already a clean 12-digit account ID
  if (accountId.match(/^\d{12}$/)) {
    return accountId
  }
  
  // Truncate very long account IDs but preserve meaningful ones
  if (accountId.length > 15) {
    return accountId.substring(0, 12) + '...'
  }
  
  return accountId
}

function getStepNodeClass(step: JourneyStep): string {
  const base = 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600'
  
  if (step.riskLevel === 'critical') {
    return `${base} border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20`
  } else if (step.riskLevel === 'high') {
    return `${base} border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-900/20`
  } else if (step.riskLevel === 'medium') {
    return `${base} border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/20`
  }
  
  return base
}

function getRiskColor(score: number): 'red' | 'orange' | 'yellow' | 'green' {
  if (score >= 70) return 'red'
  if (score >= 50) return 'orange'
  if (score >= 25) return 'yellow'
  return 'green'
}

function getTotalRiskColor(score: number): 'red' | 'orange' | 'yellow' | 'green' {
  return getRiskColor(score)
}

function getTransitionInfo(currentStep: JourneyStep, nextStep: JourneyStep): string {
  const timeDiff = nextStep.timestamp.getTime() - currentStep.timestamp.getTime()
  const minutes = Math.round(timeDiff / 60000)
  
  if (minutes < 1) return '< 1min'
  if (minutes < 60) return `${minutes}min`
  
  const hours = Math.round(minutes / 60)
  return `${hours}h`
}

function getInsightClass(severity: 'info' | 'warning' | 'error'): string {
  switch (severity) {
    case 'error':
      return 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
    case 'warning':
      return 'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300'
    default:
      return 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
  }
}

function getInsightIcon(severity: 'info' | 'warning' | 'error'): string {
  switch (severity) {
    case 'error':
      return 'i-heroicons-exclamation-triangle'
    case 'warning':
      return 'i-heroicons-exclamation-circle'
    default:
      return 'i-heroicons-information-circle'
  }
}

function formatTime(date: Date): string {
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
}

function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

function formatDuration(durationMs: number): string {
  if (!durationMs || durationMs <= 0) return '0min'
  
  const minutes = Math.floor(durationMs / 60000)
  const hours = Math.floor(minutes / 60)
  
  if (hours > 0) {
    const remainingMinutes = minutes % 60
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`
  }
  
  return `${minutes}m`
}

function isRoleAssumptionEvent(event: any): boolean {
  const eventName = event.eventName?.toLowerCase() || ''
  const eventSource = event.eventSource?.toLowerCase() || ''
  
  // AssumeRole family of events (STS API calls)
  const assumeRoleEvents = [
    'assumerole',
    'assumerolewithwebidentity', 
    'assumerolewithsaml'
  ]
  
  // Console role switching events
  const consoleEvents = [
    'switchrole',
    'switch',
    'getrole', // Console might use this when switching
    'listrolesforwebidentity'
  ]
  
  // STS token events
  const stsEvents = [
    'getsessiontoken',
    'getfederationtoken',
    'getcalleridentity'
  ]
  
  // Check for role assumption events
  const isAssumeRoleEvent = assumeRoleEvents.some(role => eventName.includes(role))
  const isSwitchRoleEvent = consoleEvents.some(role => eventName.includes(role))
  const isStsEvent = stsEvents.some(sts => eventName.includes(sts))
  const isStsSource = eventSource.includes('sts.amazonaws.com')
  const isConsoleSource = eventSource.includes('signin.amazonaws.com') || eventSource.includes('console.aws.amazon.com')
  
  // Also check if user identity shows this is an assumed role session
  const isAssumedRoleUser = event.userIdentity?.type === 'AssumedRole'
  
  return isAssumeRoleEvent || isSwitchRoleEvent || isStsEvent || isStsSource || 
         (isConsoleSource && isAssumedRoleUser)
}

function handleStepClick(step: JourneyStep, path: JourneyPath) {
  emit('step-clicked', step, path)
  
  // If this is an assume role step, try to find the corresponding event and emit it
  if (step.type === 'assume-role') {
    const session = props.sessions.find(s => s.id === path.id)
    if (session?.activities) {
      const roleEvent = session.activities.find(activity => 
        isRoleAssumptionEvent(activity) && 
        activity.eventTime === step.timestamp
      )
      if (roleEvent) {
        emit('view-event-details', roleEvent)
      }
    }
  }
}

function getStepIcon(stepType: string): string {
  switch (stepType) {
    case 'initial':
      return 'i-heroicons-user-circle'
    case 'assume-role':
      return 'i-heroicons-key'
    default:
      return 'i-heroicons-arrow-right-circle'
  }
}

function getStepIconClass(stepType: string, riskLevel?: string): string {
  const baseClasses = 'text-white'
  
  if (riskLevel === 'critical') {
    return `bg-red-500 ${baseClasses}`
  } else if (riskLevel === 'high') {
    return `bg-orange-500 ${baseClasses}`
  } else if (riskLevel === 'medium') {
    return `bg-yellow-500 ${baseClasses}`
  }
  
  // Default colors based on step type
  switch (stepType) {
    case 'initial':
      return `bg-blue-500 ${baseClasses}`
    case 'assume-role':
      return `bg-green-500 ${baseClasses}`
    default:
      return `bg-gray-500 ${baseClasses}`
  }
}
</script> 