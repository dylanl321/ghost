<template>
  <div class="space-y-6">
    <!-- Security Overview Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <UCard class="border-l-4 border-blue-500">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-gray-600 dark:text-gray-400">Login Sessions</p>
            <p class="text-2xl font-bold text-blue-600 dark:text-blue-400">{{ securityMetrics.loginSessions }}</p>
          </div>
          <UIcon name="i-heroicons-key" class="w-8 h-8 text-blue-500" />
        </div>
        <p class="text-xs text-gray-500 mt-2">{{ securityMetrics.mfaUsage }}% with MFA</p>
      </UCard>

      <UCard class="border-l-4 border-green-500">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-gray-600 dark:text-gray-400">Resource Operations</p>
            <p class="text-2xl font-bold text-green-600 dark:text-green-400">{{ securityMetrics.resourceOps }}</p>
          </div>
          <UIcon name="i-heroicons-cube" class="w-8 h-8 text-green-500" />
        </div>
        <p class="text-xs text-gray-500 mt-2">{{ securityMetrics.createOps }} creates, {{ securityMetrics.deleteOps }} deletes</p>
      </UCard>

      <UCard class="border-l-4 border-purple-500">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-gray-600 dark:text-gray-400">Cross-Account Access</p>
            <p class="text-2xl font-bold text-purple-600 dark:text-purple-400">{{ securityMetrics.crossAccountOps }}</p>
          </div>
          <UIcon name="i-heroicons-arrow-right-circle" class="w-8 h-8 text-purple-500" />
        </div>
        <p class="text-xs text-gray-500 mt-2">{{ uniqueCrossAccounts.length }} unique accounts</p>
      </UCard>

      <UCard class="border-l-4 border-red-500">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-gray-600 dark:text-gray-400">Security Events</p>
            <p class="text-2xl font-bold text-red-600 dark:text-red-400">{{ securityMetrics.securityEvents }}</p>
          </div>
          <UIcon name="i-heroicons-shield-exclamation" class="w-8 h-8 text-red-500" />
        </div>
        <p class="text-xs text-gray-500 mt-2">{{ securityMetrics.accessDenied }} access denied</p>
      </UCard>
    </div>

    <!-- Security Analysis Tabs -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Security Analysis</h3>
          <USelectMenu
            v-model="selectedAnalysis"
            :options="analysisOptions"
            class="w-64"
          />
        </div>
      </template>

      <div class="space-y-6">
        <!-- Login & Role Assumption Timeline -->
        <div v-if="selectedAnalysis === 'login-timeline'">
          <h4 class="text-base font-medium text-gray-900 dark:text-white mb-4">
            Login & Role-Assumption Timeline
          </h4>
          <div v-if="loginTimelineData.length > 0">
            <apexchart
              type="timeline"
              height="300"
              :options="loginTimelineOptions"
              :series="loginTimelineData"
            />
          </div>
          <div class="mt-4 space-y-2">
            <div v-for="session in sessionDetails" :key="session.id" class="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <UBadge :color="session.status === 'active' ? 'green' : 'gray'">
                    {{ session.status }}
                  </UBadge>
                  <span class="font-medium">{{ session.type }} Session</span>
                </div>
                <span class="text-sm text-gray-500">{{ session.duration }}</span>
              </div>
              <div class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {{ session.startTime }} → {{ session.endTime || 'Active' }}
              </div>
              <div class="text-xs text-gray-500 mt-1">
                Roles: {{ session.roles.join(', ') || 'None' }}
              </div>
            </div>
          </div>
        </div>

        <!-- Resource Operations Audit -->
        <div v-if="selectedAnalysis === 'resource-audit'">
          <h4 class="text-base font-medium text-gray-900 dark:text-white mb-4">
            Resource Creation & Deletion Audit
          </h4>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h5 class="text-sm font-medium text-green-600 dark:text-green-400 mb-2">Resource Creation Events</h5>
              <apexchart
                type="donut"
                height="250"
                :options="resourceCreateChartOptions"
                :series="resourceCreateSeries"
              />
            </div>
            <div>
              <h5 class="text-sm font-medium text-red-600 dark:text-red-400 mb-2">Resource Deletion Events</h5>
              <apexchart
                type="donut"
                height="250"
                :options="resourceDeleteChartOptions"
                :series="resourceDeleteSeries"
              />
            </div>
          </div>
          <div class="mt-4">
            <UTable :rows="resourceOperations" :columns="resourceColumns" />
          </div>
        </div>

        <!-- Permission & Policy Changes -->
        <div v-if="selectedAnalysis === 'permission-changes'">
          <h4 class="text-base font-medium text-gray-900 dark:text-white mb-4">
            Permission & Policy Changes
          </h4>
          <div class="space-y-4">
            <apexchart
              type="bar"
              height="200"
              :options="permissionChartOptions"
              :series="permissionSeries"
            />
            <UTable :rows="permissionChanges" :columns="permissionColumns" />
          </div>
        </div>

        <!-- Unauthorized Access Attempts -->
        <div v-if="selectedAnalysis === 'unauthorized-access'">
          <h4 class="text-base font-medium text-gray-900 dark:text-white mb-4">
            Unauthorized Access Attempts
          </h4>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <apexchart
                type="line"
                height="200"
                :options="unauthorizedAttemptsChartOptions"
                :series="unauthorizedAttemptsSeries"
              />
            </div>
            <div>
              <apexchart
                type="pie"
                height="200"
                :options="errorTypeChartOptions"
                :series="errorTypeSeries"
              />
            </div>
          </div>
          <UTable :rows="unauthorizedAttempts" :columns="unauthorizedColumns" />
        </div>

        <!-- Data Access Events -->
        <div v-if="selectedAnalysis === 'data-access'">
          <h4 class="text-base font-medium text-gray-900 dark:text-white mb-4">
            Data Access Audit Trail
          </h4>
          <div class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div class="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <div class="text-2xl font-bold text-blue-600 dark:text-blue-400">{{ dataAccessMetrics.s3Operations }}</div>
                <div class="text-sm text-gray-600 dark:text-gray-400">S3 Operations</div>
              </div>
              <div class="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <div class="text-2xl font-bold text-green-600 dark:text-green-400">{{ dataAccessMetrics.dynamoOperations }}</div>
                <div class="text-sm text-gray-600 dark:text-gray-400">DynamoDB Queries</div>
              </div>
              <div class="text-center p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                <div class="text-2xl font-bold text-purple-600 dark:text-purple-400">{{ dataAccessMetrics.athenaQueries }}</div>
                <div class="text-sm text-gray-600 dark:text-gray-400">Athena Queries</div>
              </div>
            </div>
            <UTable :rows="dataAccessEvents" :columns="dataAccessColumns" />
          </div>
        </div>

        <!-- Cross-Account Access -->
        <div v-if="selectedAnalysis === 'cross-account'">
          <h4 class="text-base font-medium text-gray-900 dark:text-white mb-4">
            Cross-Account Access Monitoring
          </h4>
          <div class="space-y-4">
            <apexchart
              type="heatmap"
              height="300"
              :options="crossAccountHeatmapOptions"
              :series="crossAccountHeatmapData"
            />
            <UTable :rows="crossAccountAccess" :columns="crossAccountColumns" />
          </div>
        </div>

        <!-- MFA Usage Enforcement -->
        <div v-if="selectedAnalysis === 'mfa-usage'">
          <h4 class="text-base font-medium text-gray-900 dark:text-white mb-4">
            MFA Usage Enforcement
          </h4>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <apexchart
                type="pie"
                height="250"
                :options="mfaUsageChartOptions"
                :series="mfaUsageSeries"
              />
            </div>
            <div class="space-y-3">
              <div v-for="login in mfaLogins" :key="login.id" class="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                <div class="flex items-center justify-between">
                  <span class="font-medium">{{ login.timestamp }}</span>
                  <UBadge :color="login.mfaUsed ? 'green' : 'red'">
                    {{ login.mfaUsed ? 'MFA Used' : 'No MFA' }}
                  </UBadge>
                </div>
                <div class="text-sm text-gray-600 dark:text-gray-400">
                  {{ login.sourceIP }} • {{ login.userAgent }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Network Changes -->
        <div v-if="selectedAnalysis === 'network-changes'">
          <h4 class="text-base font-medium text-gray-900 dark:text-white mb-4">
            Security Group & Network Changes
          </h4>
          <UTable :rows="networkChanges" :columns="networkColumns" />
        </div>

        <!-- Privilege Escalation Detection -->
        <div v-if="selectedAnalysis === 'privilege-escalation'">
          <h4 class="text-base font-medium text-gray-900 dark:text-white mb-4">
            Privilege Escalation Detection
          </h4>
          <div class="space-y-4">
            <div v-for="escalation in privilegeEscalations" :key="escalation.id" class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 rounded-lg">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <UIcon name="i-heroicons-exclamation-triangle" class="w-5 h-5 text-red-500" />
                  <span class="font-medium text-red-800 dark:text-red-200">Potential Privilege Escalation</span>
                </div>
                <UBadge color="red">{{ escalation.severity }}</UBadge>
              </div>
              <div class="mt-2 text-sm text-red-700 dark:text-red-300">
                {{ escalation.description }}
              </div>
              <div class="mt-1 text-xs text-red-600 dark:text-red-400">
                {{ escalation.timestamp }} • {{ escalation.sourceIP }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

interface AccessEvent {
  eventId: string
  eventTime: string
  eventName: string
  eventSource: string
  awsRegion: string
  sourceIPAddress: string
  userAgent: string
  accountId: string
  errorCode?: string
  errorMessage?: string
  resources?: any
  requestParameters?: any
  responseElements?: any
  userIdentity: {
    type: string
    principalId: string
    arn: string
    accountId: string
    userName?: string
    sessionContext?: any
  }
}

interface Props {
  events: AccessEvent[]
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  loading: false
})

const selectedAnalysis = ref('login-timeline')

const analysisOptions = [
  { label: 'Login & Role-Assumption Timeline', value: 'login-timeline' },
  { label: 'Resource Creation & Deletion Audit', value: 'resource-audit' },
  { label: 'Permission & Policy Changes', value: 'permission-changes' },
  { label: 'Unauthorized Access Attempts', value: 'unauthorized-access' },
  { label: 'Data Access Events', value: 'data-access' },
  { label: 'Cross-Account Access', value: 'cross-account' },
  { label: 'MFA Usage Enforcement', value: 'mfa-usage' },
  { label: 'Network Security Changes', value: 'network-changes' },
  { label: 'Privilege Escalation Detection', value: 'privilege-escalation' }
]

// Security metrics
const securityMetrics = computed(() => {
  const loginEvents = props.events.filter(e => e.eventName?.includes('ConsoleLogin'))
  const mfaEvents = loginEvents.filter(e => e.responseElements?.ConsoleLogin === 'Success')
  const resourceOps = props.events.filter(e => 
    e.eventName?.startsWith('Create') || 
    e.eventName?.startsWith('Delete') ||
    e.eventName?.startsWith('Run') ||
    e.eventName?.includes('Terminate')
  )
  const createOps = props.events.filter(e => 
    e.eventName?.startsWith('Create') || e.eventName?.startsWith('Run')
  ).length
  const deleteOps = props.events.filter(e => 
    e.eventName?.startsWith('Delete') || e.eventName?.includes('Terminate')
  ).length
  const crossAccountOps = props.events.filter(e => 
    e.userIdentity?.accountId && e.accountId && e.userIdentity.accountId !== e.accountId
  ).length
  const securityEvents = props.events.filter(e => 
    e.errorCode === 'AccessDenied' || e.errorCode === 'UnauthorizedOperation'
  ).length
  const accessDenied = props.events.filter(e => e.errorCode === 'AccessDenied').length

  return {
    loginSessions: loginEvents.length,
    mfaUsage: loginEvents.length > 0 ? Math.round((mfaEvents.length / loginEvents.length) * 100) : 0,
    resourceOps: resourceOps.length,
    createOps,
    deleteOps,
    crossAccountOps,
    securityEvents,
    accessDenied
  }
})

// Cross-account unique accounts
const uniqueCrossAccounts = computed(() => {
  const accounts = new Set<string>()
  props.events.forEach(e => {
    if (e.userIdentity?.accountId && e.accountId && e.userIdentity.accountId !== e.accountId) {
      accounts.add(e.accountId)
    }
  })
  return Array.from(accounts)
})

// Session details
const sessionDetails = computed(() => {
  const sessions: any[] = []
  let currentSession: any = null
  const sessionTimeout = 30 * 60 * 1000 // 30 minutes

  const sortedEvents = [...props.events].sort((a, b) => 
    new Date(a.eventTime).getTime() - new Date(b.eventTime).getTime()
  )

  sortedEvents.forEach(event => {
    const eventTime = new Date(event.eventTime).getTime()
    
    if (!currentSession || eventTime - currentSession.lastActivity > sessionTimeout) {
      if (currentSession) sessions.push(currentSession)
      currentSession = {
        id: `session-${eventTime}`,
        type: event.eventName?.includes('ConsoleLogin') ? 'Console' : 'API',
        status: 'completed',
        startTime: event.eventTime,
        endTime: null,
        lastActivity: eventTime,
        roles: new Set<string>(),
        events: [event]
      }
    } else {
      currentSession.lastActivity = eventTime
      currentSession.endTime = event.eventTime
      currentSession.events.push(event)
    }

    // Track role assumptions
    if (event.eventName?.includes('AssumeRole') && event.requestParameters?.roleArn) {
      const roleName = event.requestParameters.roleArn.split('/').pop()
      currentSession.roles.add(roleName)
    }
  })

  if (currentSession) sessions.push(currentSession)

  return sessions.map(session => ({
    ...session,
    roles: Array.from(session.roles),
    duration: session.endTime 
      ? formatDuration(new Date(session.endTime).getTime() - new Date(session.startTime).getTime())
      : 'Active',
    startTime: new Date(session.startTime).toLocaleString(),
    endTime: session.endTime ? new Date(session.endTime).toLocaleString() : null,
    status: !session.endTime ? 'active' : 'completed'
  }))
})

// Login timeline data
const loginTimelineData = computed(() => {
  const loginEvents = props.events.filter(e => 
    e.eventName?.includes('ConsoleLogin') || e.eventName?.includes('AssumeRole')
  )

  return [{
    name: 'Login Timeline',
    data: loginEvents.map(event => ({
      x: event.eventName,
      y: [
        new Date(event.eventTime).getTime() - 300000, // 5 minutes before
        new Date(event.eventTime).getTime() + 300000  // 5 minutes after
      ]
    }))
  }]
})

const loginTimelineOptions = computed(() => ({
  chart: { type: 'rangeBar', height: 300 },
  plotOptions: {
    bar: { horizontal: true, rangeBarGroupRows: true }
  },
  xaxis: { type: 'datetime' },
  colors: ['#3b82f6']
}))

// Resource operations data
const resourceOperations = computed(() => {
  return props.events
    .filter(e => e.eventName?.startsWith('Create') || e.eventName?.startsWith('Delete') || e.eventName?.startsWith('Run'))
    .map(event => ({
      eventTime: new Date(event.eventTime).toLocaleString(),
      eventName: event.eventName,
      service: event.eventSource?.replace('.amazonaws.com', ''),
      account: event.accountId,
      sourceIP: event.sourceIPAddress,
      status: event.errorCode || 'Success',
      type: event.eventName?.startsWith('Create') || event.eventName?.startsWith('Run') ? 'Create' : 'Delete'
    }))
    .slice(0, 50)
})

const resourceColumns = [
  { key: 'eventTime', label: 'Time' },
  { key: 'eventName', label: 'Event' },
  { key: 'service', label: 'Service' },
  { key: 'type', label: 'Type' },
  { key: 'account', label: 'Account' },
  { key: 'status', label: 'Status' }
]

// Resource creation/deletion charts
const resourceCreateSeries = computed(() => {
  const createEvents = props.events.filter(e => 
    e.eventName?.startsWith('Create') || e.eventName?.startsWith('Run')
  )
  const serviceMap = new Map<string, number>()
  
  createEvents.forEach(e => {
    const service = e.eventSource?.replace('.amazonaws.com', '') || 'Unknown'
    serviceMap.set(service, (serviceMap.get(service) || 0) + 1)
  })
  
  return Array.from(serviceMap.values())
})

const resourceCreateChartOptions = computed(() => ({
  chart: { type: 'donut' },
  labels: Array.from(new Set(props.events
    .filter(e => e.eventName?.startsWith('Create') || e.eventName?.startsWith('Run'))
    .map(e => e.eventSource?.replace('.amazonaws.com', '') || 'Unknown'))),
  colors: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6']
}))

const resourceDeleteSeries = computed(() => {
  const deleteEvents = props.events.filter(e => 
    e.eventName?.startsWith('Delete') || e.eventName?.includes('Terminate')
  )
  const serviceMap = new Map<string, number>()
  
  deleteEvents.forEach(e => {
    const service = e.eventSource?.replace('.amazonaws.com', '') || 'Unknown'
    serviceMap.set(service, (serviceMap.get(service) || 0) + 1)
  })
  
  return Array.from(serviceMap.values())
})

const resourceDeleteChartOptions = computed(() => ({
  chart: { type: 'donut' },
  labels: Array.from(new Set(props.events
    .filter(e => e.eventName?.startsWith('Delete') || e.eventName?.includes('Terminate'))
    .map(e => e.eventSource?.replace('.amazonaws.com', '') || 'Unknown'))),
  colors: ['#ef4444', '#f59e0b', '#8b5cf6', '#10b981', '#3b82f6']
}))

// Permission changes
const permissionChanges = computed(() => {
  return props.events
    .filter(e => 
      e.eventSource?.includes('iam') || 
      e.eventName?.includes('Policy') || 
      e.eventName?.includes('Role') ||
      e.eventName?.includes('User')
    )
    .map(event => ({
      eventTime: new Date(event.eventTime).toLocaleString(),
      eventName: event.eventName,
      service: event.eventSource?.replace('.amazonaws.com', ''),
      account: event.accountId,
      sourceIP: event.sourceIPAddress,
      status: event.errorCode || 'Success'
    }))
    .slice(0, 20)
})

const permissionColumns = [
  { key: 'eventTime', label: 'Time' },
  { key: 'eventName', label: 'Event' },
  { key: 'service', label: 'Service' },
  { key: 'account', label: 'Account' },
  { key: 'status', label: 'Status' }
]

const permissionSeries = computed(() => [{
  name: 'Permission Changes',
  data: permissionChanges.value.slice(0, 10).map(change => ({
    x: change.eventName,
    y: 1
  }))
}])

const permissionChartOptions = computed(() => ({
  chart: { type: 'bar' },
  xaxis: { categories: permissionChanges.value.slice(0, 10).map(c => c.eventName) },
  colors: ['#8b5cf6']
}))

// Unauthorized access attempts
const unauthorizedAttempts = computed(() => {
  return props.events
    .filter(e => e.errorCode === 'AccessDenied' || e.errorCode === 'UnauthorizedOperation')
    .map(event => ({
      eventTime: new Date(event.eventTime).toLocaleString(),
      eventName: event.eventName,
      errorCode: event.errorCode,
      service: event.eventSource?.replace('.amazonaws.com', ''),
      account: event.accountId,
      sourceIP: event.sourceIPAddress
    }))
    .slice(0, 50)
})

const unauthorizedColumns = [
  { key: 'eventTime', label: 'Time' },
  { key: 'eventName', label: 'Event' },
  { key: 'errorCode', label: 'Error' },
  { key: 'service', label: 'Service' },
  { key: 'sourceIP', label: 'Source IP' }
]

const unauthorizedAttemptsSeries = computed(() => [{
  name: 'Unauthorized Attempts',
  data: generateHourlyData(unauthorizedAttempts.value.map(a => a.eventTime))
}])

const unauthorizedAttemptsChartOptions = computed(() => ({
  chart: { type: 'line' },
  xaxis: { type: 'datetime' },
  colors: ['#ef4444']
}))

const errorTypeSeries = computed(() => {
  const errorMap = new Map<string, number>()
  unauthorizedAttempts.value.forEach(attempt => {
    errorMap.set(attempt.errorCode, (errorMap.get(attempt.errorCode) || 0) + 1)
  })
  return Array.from(errorMap.values())
})

const errorTypeChartOptions = computed(() => ({
  chart: { type: 'pie' },
  labels: Array.from(new Set(unauthorizedAttempts.value.map(a => a.errorCode))),
  colors: ['#ef4444', '#f59e0b']
}))

// Data access events
const dataAccessEvents = computed(() => {
  return props.events
    .filter(e => 
      e.eventName?.includes('GetObject') ||
      e.eventName?.includes('PutObject') ||
      e.eventName?.includes('Query') ||
      e.eventName?.includes('Scan') ||
      e.eventName?.includes('StartQueryExecution')
    )
    .map(event => ({
      eventTime: new Date(event.eventTime).toLocaleString(),
      eventName: event.eventName,
      service: event.eventSource?.replace('.amazonaws.com', ''),
      account: event.accountId,
      sourceIP: event.sourceIPAddress,
      status: event.errorCode || 'Success'
    }))
    .slice(0, 50)
})

const dataAccessColumns = [
  { key: 'eventTime', label: 'Time' },
  { key: 'eventName', label: 'Event' },
  { key: 'service', label: 'Service' },
  { key: 'account', label: 'Account' },
  { key: 'status', label: 'Status' }
]

const dataAccessMetrics = computed(() => ({
  s3Operations: props.events.filter(e => 
    e.eventSource?.includes('s3') && (e.eventName?.includes('GetObject') || e.eventName?.includes('PutObject'))
  ).length,
  dynamoOperations: props.events.filter(e => 
    e.eventSource?.includes('dynamodb') && (e.eventName?.includes('Query') || e.eventName?.includes('Scan'))
  ).length,
  athenaQueries: props.events.filter(e => 
    e.eventSource?.includes('athena') && e.eventName?.includes('StartQueryExecution')
  ).length
}))

// Cross-account access
const crossAccountAccess = computed(() => {
  return props.events
    .filter(e => e.userIdentity?.accountId && e.accountId && e.userIdentity.accountId !== e.accountId)
    .map(event => ({
      eventTime: new Date(event.eventTime).toLocaleString(),
      eventName: event.eventName,
      sourceAccount: event.userIdentity?.accountId,
      targetAccount: event.accountId,
      service: event.eventSource?.replace('.amazonaws.com', ''),
      sourceIP: event.sourceIPAddress,
      status: event.errorCode || 'Success'
    }))
    .slice(0, 50)
})

const crossAccountColumns = [
  { key: 'eventTime', label: 'Time' },
  { key: 'eventName', label: 'Event' },
  { key: 'sourceAccount', label: 'Source Account' },
  { key: 'targetAccount', label: 'Target Account' },
  { key: 'service', label: 'Service' },
  { key: 'status', label: 'Status' }
]

const crossAccountHeatmapData = computed(() => {
  const accountMap: Record<string, Record<string, number>> = {}
  
  crossAccountAccess.value.forEach(access => {
    if (!accountMap[access.sourceAccount]) accountMap[access.sourceAccount] = {}
    accountMap[access.sourceAccount][access.targetAccount] = 
      (accountMap[access.sourceAccount][access.targetAccount] || 0) + 1
  })

  return Object.entries(accountMap).map(([source, targets]) => ({
    name: source,
    data: Object.entries(targets).map(([target, count]) => ({
      x: target,
      y: count
    }))
  }))
})

const crossAccountHeatmapOptions = computed(() => ({
  chart: { type: 'heatmap' },
  xaxis: { title: { text: 'Target Account' } },
  yaxis: { title: { text: 'Source Account' } },
  colors: ['#3b82f6']
}))

// MFA usage
const mfaLogins = computed(() => {
  return props.events
    .filter(e => e.eventName?.includes('ConsoleLogin'))
    .map(event => ({
      id: event.eventId,
      timestamp: new Date(event.eventTime).toLocaleString(),
      mfaUsed: event.responseElements?.ConsoleLogin === 'Success',
      sourceIP: event.sourceIPAddress,
      userAgent: event.userAgent || 'Unknown'
    }))
    .slice(0, 20)
})

const mfaUsageSeries = computed(() => {
  const mfaUsed = mfaLogins.value.filter(l => l.mfaUsed).length
  const noMfa = mfaLogins.value.length - mfaUsed
  return [mfaUsed, noMfa]
})

const mfaUsageChartOptions = computed(() => ({
  chart: { type: 'pie' },
  labels: ['MFA Used', 'No MFA'],
  colors: ['#10b981', '#ef4444']
}))

// Network changes
const networkChanges = computed(() => {
  return props.events
    .filter(e => 
      e.eventName?.includes('SecurityGroup') ||
      e.eventName?.includes('NetworkAcl') ||
      e.eventName?.includes('Authorize') ||
      e.eventName?.includes('Revoke')
    )
    .map(event => ({
      eventTime: new Date(event.eventTime).toLocaleString(),
      eventName: event.eventName,
      service: event.eventSource?.replace('.amazonaws.com', ''),
      account: event.accountId,
      sourceIP: event.sourceIPAddress,
      status: event.errorCode || 'Success'
    }))
    .slice(0, 50)
})

const networkColumns = [
  { key: 'eventTime', label: 'Time' },
  { key: 'eventName', label: 'Event' },
  { key: 'service', label: 'Service' },
  { key: 'account', label: 'Account' },
  { key: 'status', label: 'Status' }
]

// Privilege escalation detection
const privilegeEscalations = computed(() => {
  const escalations: any[] = []
  
  // Look for PassRole followed by high-privilege operations
  const passRoleEvents = props.events.filter(e => e.eventName?.includes('PassRole'))
  
  passRoleEvents.forEach(passRole => {
    const subsequentEvents = props.events.filter(e => 
      new Date(e.eventTime).getTime() > new Date(passRole.eventTime).getTime() &&
      new Date(e.eventTime).getTime() - new Date(passRole.eventTime).getTime() < 3600000 && // Within 1 hour
      e.sourceIPAddress === passRole.sourceIPAddress &&
      (e.eventName?.includes('Create') || e.eventName?.includes('Delete') || e.eventName?.includes('Put'))
    )
    
    if (subsequentEvents.length > 0) {
      escalations.push({
        id: `escalation-${passRole.eventId}`,
        timestamp: new Date(passRole.eventTime).toLocaleString(),
        sourceIP: passRole.sourceIPAddress,
        description: `PassRole operation followed by ${subsequentEvents.length} high-privilege actions`,
        severity: subsequentEvents.length > 5 ? 'High' : 'Medium'
      })
    }
  })
  
  return escalations
})

// Helper functions
function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  
  if (days > 0) return `${days}d ${hours % 24}h`
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  return `${minutes}m`
}

function generateHourlyData(timestamps: string[]) {
  const hourlyData: Record<string, number> = {}
  
  timestamps.forEach(timestamp => {
    const hour = new Date(timestamp).toISOString().slice(0, 13) + ':00:00.000Z'
    hourlyData[hour] = (hourlyData[hour] || 0) + 1
  })
  
  return Object.entries(hourlyData).map(([time, count]) => ({
    x: new Date(time).getTime(),
    y: count
  }))
}
</script> 