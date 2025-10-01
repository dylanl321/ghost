<template>
  <div class="space-y-6">
    <!-- Loading State -->
    <div v-if="loading" class="flex items-center justify-center py-8">
      <div class="text-center">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mx-auto mb-4"></div>
        <p class="text-gray-600 dark:text-gray-400">Analyzing cross-account access...</p>
      </div>
    </div>

    <!-- No Data State -->
    <div v-else-if="!events.length" class="text-center py-8">
      <div class="text-gray-500 dark:text-gray-400">
        <Icon name="i-heroicons-building-office-2" class="w-16 h-16 mx-auto mb-4 opacity-50" />
        <h3 class="text-lg font-medium mb-2">No Cross-Account Activity</h3>
        <p>No cross-account access events found for this user.</p>
      </div>
    </div>

    <!-- Main Content -->
    <div v-else class="space-y-6">
      <!-- Account Summary Cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <UCard>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-600 dark:text-gray-400">Total Accounts</p>
              <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ totalAccounts.toLocaleString() }}</p>
            </div>
            <div class="p-3 bg-blue-100 dark:bg-blue-900 rounded-lg">
              <Icon name="i-heroicons-building-office-2" class="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </UCard>

        <UCard>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-600 dark:text-gray-400">Cross-Account Events</p>
              <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ crossAccountEvents.toLocaleString() }}</p>
            </div>
            <div class="p-3 bg-green-100 dark:bg-green-900 rounded-lg">
              <Icon name="i-heroicons-arrows-right-left" class="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
          </div>
        </UCard>

        <UCard>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-600 dark:text-gray-400">Services Accessed</p>
              <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ uniqueServices.toLocaleString() }}</p>
            </div>
            <div class="p-3 bg-purple-100 dark:bg-purple-900 rounded-lg">
              <Icon name="i-heroicons-cog-6-tooth" class="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
        </UCard>

        <UCard>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-600 dark:text-gray-400">Risk Score</p>
              <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ averageRiskScore }}/100</p>
            </div>
            <div class="p-3 bg-yellow-100 dark:bg-yellow-900 rounded-lg">
              <Icon name="i-heroicons-shield-exclamation" class="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
            </div>
          </div>
        </UCard>
      </div>

      <!-- Account Activity Timeline -->
      <UCard>
        <div class="p-4">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold">Cross-Account Activity Timeline</h3>
            <div class="flex items-center gap-2">
              <UButton
                :variant="timelineView === 'all' ? 'solid' : 'ghost'"
                size="xs"
                @click="timelineView = 'all'"
              >
                All
              </UButton>
              <UButton
                :variant="timelineView === 'high-risk' ? 'solid' : 'ghost'"
                size="xs"
                color="red"
                @click="timelineView = 'high-risk'"
              >
                High Risk
              </UButton>
            </div>
          </div>
          <div class="h-64">
            <apexchart
              type="area"
              :options="timelineOptions"
              :series="timelineSeries"
              height="100%"
            />
          </div>
        </div>
      </UCard>

      <!-- Account Distribution & Service Usage -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Account Distribution -->
        <UCard>
          <div class="p-4">
            <h3 class="text-lg font-semibold mb-4">Account Distribution</h3>
            <div class="h-64">
              <apexchart
                type="treemap"
                :options="accountTreemapOptions"
                :series="accountTreemapSeries"
                height="100%"
              />
            </div>
          </div>
        </UCard>

        <!-- Service Usage -->
        <UCard>
          <div class="p-4">
            <h3 class="text-lg font-semibold mb-4">Service Usage</h3>
            <div class="h-64">
              <apexchart
                type="bar"
                :options="serviceOptions"
                :series="serviceSeries"
                height="100%"
              />
            </div>
          </div>
        </UCard>
      </div>

      <!-- Cross-Account Flow Visualization -->
      <UCard>
        <div class="p-4">
          <h3 class="text-lg font-semibold mb-4">Cross-Account Access Flow</h3>
          <div class="h-80">
            <apexchart
              type="bar"
              :options="flowOptions"
              :series="flowSeries"
              height="100%"
            />
          </div>
        </div>
      </UCard>

      <!-- Account Details Table -->
      <UCard>
        <div class="p-4">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold">Account Details</h3>
            <div class="flex items-center gap-2">
              <USelectMenu
                v-model="sortBy"
                :options="sortOptions"
                size="sm"
              />
              <UButton
                :icon="sortOrder === 'asc' ? 'i-heroicons-arrow-up' : 'i-heroicons-arrow-down'"
                variant="ghost"
                size="sm"
                @click="toggleSortOrder"
              />
            </div>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead>
                <tr class="border-b border-gray-200 dark:border-gray-700">
                  <th class="text-left py-2 px-3 font-medium text-gray-900 dark:text-white">Account</th>
                  <th class="text-left py-2 px-3 font-medium text-gray-900 dark:text-white">Events</th>
                  <th class="text-left py-2 px-3 font-medium text-gray-900 dark:text-white">Services</th>
                  <th class="text-left py-2 px-3 font-medium text-gray-900 dark:text-white">Risk Score</th>
                  <th class="text-left py-2 px-3 font-medium text-gray-900 dark:text-white">Last Activity</th>
                  <th class="text-left py-2 px-3 font-medium text-gray-900 dark:text-white">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="account in sortedAccounts"
                  :key="account.accountId"
                  class="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <td class="py-3 px-3">
                    <div>
                      <p class="font-medium text-gray-900 dark:text-white">{{ account.accountName || account.accountId }}</p>
                      <p class="text-sm text-gray-500 font-mono">{{ account.accountId }}</p>
                    </div>
                  </td>
                  <td class="py-3 px-3">
                    <span class="text-gray-900 dark:text-white">{{ account.eventCount.toLocaleString() }}</span>
                  </td>
                  <td class="py-3 px-3">
                    <div class="flex flex-wrap gap-1">
                      <UBadge
                        v-for="service in account.services.slice(0, 3)"
                        :key="service"
                        color="gray"
                        size="xs"
                      >
                        {{ service }}
                      </UBadge>
                      <UBadge
                        v-if="account.services.length > 3"
                        color="gray"
                        size="xs"
                      >
                        +{{ account.services.length - 3 }}
                      </UBadge>
                    </div>
                  </td>
                  <td class="py-3 px-3">
                    <UBadge :color="(getRiskColor(account.riskScore) as any)">
                      {{ account.riskScore }}/100
                    </UBadge>
                  </td>
                  <td class="py-3 px-3">
                    <span class="text-sm text-gray-600 dark:text-gray-400">
                      {{ formatTime(account.lastActivity) }}
                    </span>
                  </td>
                  <td class="py-3 px-3">
                    <UBadge :color="(getAccountStatusColor(account) as any)">
                      {{ getAccountStatus(account) }}
                    </UBadge>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </UCard>

      <!-- Security Insights -->
      <UCard>
        <div class="p-4">
          <h3 class="text-lg font-semibold mb-4">Cross-Account Security Insights</h3>
          <div class="space-y-3">
            <div v-for="insight in securityInsights" :key="insight.id" class="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div class="flex-shrink-0">
                <div :class="insight.iconClass" class="w-8 h-8 rounded-full flex items-center justify-center">
                  <Icon :name="insight.icon" class="w-4 h-4" />
                </div>
              </div>
              <div class="flex-grow">
                <h4 class="font-medium text-gray-900 dark:text-white">{{ insight.title }}</h4>
                <p class="text-sm text-gray-600 dark:text-gray-400">{{ insight.description }}</p>
              </div>
              <UBadge :color="(insight.severity as any)" size="sm">{{ insight.severity }}</UBadge>
            </div>
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AccessEvent } from '~/utils/sessionManager'

interface Props {
  events: AccessEvent[]
  loading: boolean
}

interface AccountData {
  accountId: string
  accountName?: string
  eventCount: number
  services: string[]
  riskScore: number
  lastActivity: string
  highRiskEvents: number
}

const props = withDefaults(defineProps<Props>(), {
  events: () => [],
  loading: false
})

const timelineView = ref<'all' | 'high-risk'>('all')
const sortBy = ref('eventCount')
const sortOrder = ref<'asc' | 'desc'>('desc')

const sortOptions = [
  { label: 'Event Count', value: 'eventCount' },
  { label: 'Risk Score', value: 'riskScore' },
  { label: 'Account Name', value: 'accountName' },
  { label: 'Last Activity', value: 'lastActivity' }
]

// Helper function to calculate event risk score
const calculateEventRiskScore = (event: AccessEvent): number => {
  let score = 0
  
  // Error events are higher risk
  if (event.errorCode || event.errorMessage) score += 50
  
  // After-hours activity
  const hour = new Date(event.eventTime).getHours()
  if (hour < 6 || hour > 22) score += 20
  
  // Sensitive event names
  const eventName = event.eventName.toLowerCase()
  if (eventName.includes('delete') || eventName.includes('terminate') || 
      eventName.includes('assume') || eventName.includes('policy')) score += 30
  
  // Admin-level operations
  if (event.eventSource?.includes('iam') || event.eventSource?.includes('sts')) score += 25
  
  return Math.min(score, 100)
}

// Basic metrics
const totalAccounts = computed(() => new Set(props.events.map(e => e.accountId)).size)
const crossAccountEvents = computed(() => props.events.length)
const uniqueServices = computed(() => new Set(props.events.map(e => e.eventSource)).size)
const averageRiskScore = computed(() => {
  const total = props.events.reduce((sum, e) => sum + calculateEventRiskScore(e), 0)
  return props.events.length ? Math.round(total / props.events.length) : 0
})

// Account data aggregation
const accountData = computed(() => {
  const accounts = new Map<string, AccountData>()
  
  props.events.forEach(event => {
    const existing = accounts.get(event.accountId) || {
      accountId: event.accountId,
      accountName: event.accountName,
      eventCount: 0,
      services: [],
      riskScore: 0,
      lastActivity: event.eventTime,
      highRiskEvents: 0
    }
    
    existing.eventCount++
    if (!existing.services.includes(event.eventSource)) {
      existing.services.push(event.eventSource)
    }
    const eventRisk = calculateEventRiskScore(event)
    existing.riskScore += eventRisk
    if (new Date(event.eventTime) > new Date(existing.lastActivity)) {
      existing.lastActivity = event.eventTime
    }
    if (eventRisk > 70) {
      existing.highRiskEvents++
    }
    
    accounts.set(event.accountId, existing)
  })
  
  // Calculate average risk scores
  Array.from(accounts.values()).forEach(account => {
    account.riskScore = Math.round(account.riskScore / account.eventCount)
  })
  
  return Array.from(accounts.values())
})

const sortedAccounts = computed(() => {
  const sorted = [...accountData.value]
  
  sorted.sort((a, b) => {
    let comparison = 0
    
    switch (sortBy.value) {
      case 'eventCount':
        comparison = a.eventCount - b.eventCount
        break
      case 'riskScore':
        comparison = a.riskScore - b.riskScore
        break
      case 'accountName':
        comparison = (a.accountName || a.accountId).localeCompare(b.accountName || b.accountId)
        break
      case 'lastActivity':
        comparison = new Date(a.lastActivity).getTime() - new Date(b.lastActivity).getTime()
        break
    }
    
    return sortOrder.value === 'asc' ? comparison : -comparison
  })
  
  return sorted
})

// Timeline data
const timelineSeries = computed(() => {
  const hourlyData = new Map<string, { all: number, highRisk: number }>()
  
  props.events.forEach(event => {
    const hour = new Date(event.eventTime).toISOString().slice(0, 13)
    const current = hourlyData.get(hour) || { all: 0, highRisk: 0 }
    current.all++
    if (calculateEventRiskScore(event) > 70) {
      current.highRisk++
    }
    hourlyData.set(hour, current)
  })
  
  const sortedHours = Array.from(hourlyData.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
  
  const series = [{
    name: 'All Events',
    data: sortedHours.map(([hour, data]) => ({
      x: new Date(hour + ':00:00').getTime(),
      y: data.all
    }))
  }]
  
  if (timelineView.value === 'high-risk' || timelineView.value === 'all') {
    series.push({
      name: 'High Risk Events',
      data: sortedHours.map(([hour, data]) => ({
        x: new Date(hour + ':00:00').getTime(),
        y: data.highRisk
      }))
    })
  }
  
  return timelineView.value === 'high-risk' ? [series[1]] : series
})

const timelineOptions = computed(() => ({
  chart: {
    type: 'area',
    toolbar: { show: false },
    zoom: { enabled: false }
  },
  fill: {
    type: 'gradient',
    gradient: {
      shadeIntensity: 1,
      opacityFrom: 0.7,
      opacityTo: 0.9,
      stops: [0, 90, 100]
    }
  },
  colors: ['#3B82F6', '#EF4444'],
  xaxis: {
    type: 'datetime',
    labels: {
      format: 'HH:mm'
    }
  },
  yaxis: {
    title: {
      text: 'Events'
    }
  },
  grid: {
    strokeDashArray: 3
  },
  tooltip: {
    x: {
      format: 'MMM dd, HH:mm'
    }
  }
}))

// Account treemap data
const accountTreemapSeries = computed(() => [{
  name: 'Accounts',
  data: accountData.value.map(account => ({
    x: account.accountName || account.accountId,
    y: account.eventCount
  }))
}])

const accountTreemapOptions = computed(() => ({
  chart: {
    type: 'treemap'
  },
  colors: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6']
}))

// Service usage data
const serviceData = computed(() => {
  const services = new Map<string, number>()
  
  props.events.forEach(event => {
    services.set(event.eventSource, (services.get(event.eventSource) || 0) + 1)
  })
  
  return Array.from(services.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
})

const serviceSeries = computed(() => [{
  name: 'Events',
  data: serviceData.value.map(([service, count]) => ({ x: service, y: count }))
}])

const serviceOptions = computed(() => ({
  chart: {
    type: 'bar',
    toolbar: { show: false }
  },
  colors: ['#10B981'],
  xaxis: {
    categories: serviceData.value.map(([service]) => service),
    labels: {
      rotate: -45
    }
  },
  yaxis: {
    title: {
      text: 'Events'
    }
  }
}))

// Cross-account flow data
const flowSeries = computed(() => [{
  name: 'Cross-Account Events',
  data: accountData.value.map(account => ({
    x: account.accountName || account.accountId,
    y: account.eventCount
  }))
}])

const flowOptions = computed(() => ({
  chart: {
    type: 'bar',
    toolbar: { show: false }
  },
  colors: ['#8B5CF6'],
  plotOptions: {
    bar: {
      horizontal: true
    }
  },
  xaxis: {
    title: {
      text: 'Event Count'
    }
  }
}))

// Security insights
const securityInsights = computed(() => {
  const insights = []
  
  // Multiple high-risk accounts
  const highRiskAccounts = accountData.value.filter(a => a.riskScore > 70).length
  if (highRiskAccounts > 0) {
    insights.push({
      id: 'high-risk-accounts',
      title: 'High-Risk Account Access',
      description: `${highRiskAccounts} accounts have high-risk activity patterns`,
      icon: 'i-heroicons-shield-exclamation',
      iconClass: 'bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400',
      severity: 'red'
    })
  }
  
  // Cross-account privilege escalation
  const assumeRoleEvents = props.events.filter(e => e.eventName === 'AssumeRole').length
  if (assumeRoleEvents > totalAccounts.value * 2) {
    insights.push({
      id: 'privilege-escalation',
      title: 'Frequent Role Assumptions',
      description: `${assumeRoleEvents} role assumption events across accounts`,
      icon: 'i-heroicons-arrow-path',
      iconClass: 'bg-orange-100 dark:bg-orange-900 text-orange-600 dark:text-orange-400',
      severity: 'orange'
    })
  }
  
  // Unusual service access
  if (uniqueServices.value > 10) {
    insights.push({
      id: 'broad-service-access',
      title: 'Broad Service Access',
      description: `Access to ${uniqueServices.value} different AWS services`,
      icon: 'i-heroicons-cog-6-tooth',
      iconClass: 'bg-yellow-100 dark:bg-yellow-900 text-yellow-600 dark:text-yellow-400',
      severity: 'yellow'
    })
  }
  
  // Cross-account data access
  const dataServices = props.events.filter(e => 
    e.eventSource.includes('s3') || 
    e.eventSource.includes('dynamodb') || 
    e.eventSource.includes('rds')
  ).length
  
  if (dataServices > 0) {
    insights.push({
      id: 'data-access',
      title: 'Cross-Account Data Access',
      description: `${dataServices} events accessing data services across accounts`,
      icon: 'i-heroicons-circle-stack',
      iconClass: 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400',
      severity: 'blue'
    })
  }
  
  return insights.slice(0, 5)
})

// Helper functions
function toggleSortOrder() {
  sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
}

function getRiskColor(score: number): string {
  if (score >= 80) return 'red'
  if (score >= 60) return 'orange'
  if (score >= 40) return 'yellow'
  return 'green'
}

function getAccountStatus(account: AccountData): string {
  if (account.riskScore > 70) return 'High Risk'
  if (account.highRiskEvents > 0) return 'Caution'
  return 'Normal'
}

function getAccountStatusColor(account: AccountData): string {
  if (account.riskScore > 70) return 'red'
  if (account.highRiskEvents > 0) return 'orange'
  return 'green'
}

function formatTime(timeStr: string): string {
  return new Date(timeStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}
</script> 