<template>
  <div class="space-y-6">
    <!-- Loading State -->
    <div v-if="loading" class="flex items-center justify-center py-8">
      <div class="text-center">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mx-auto mb-4"></div>
        <p class="text-gray-600 dark:text-gray-400">Processing access history...</p>
      </div>
    </div>

    <!-- No Data State -->
    <div v-else-if="!events.length" class="text-center py-8">
      <div class="text-gray-500 dark:text-gray-400">
        <Icon name="i-heroicons-chart-bar" class="w-16 h-16 mx-auto mb-4 opacity-50" />
        <h3 class="text-lg font-medium mb-2">No Access Data</h3>
        <p>No access history events found to analyze.</p>
      </div>
    </div>

    <!-- Main Content -->
    <div v-else class="space-y-6">
      <!-- Key Metrics Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <!-- Total Events -->
        <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <div class="flex items-center">
            <div class="p-3 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
              <UIcon name="i-heroicons-bolt" class="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div class="ml-4">
              <p class="text-sm font-medium text-gray-600 dark:text-gray-400">Total Events</p>
              <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ summary.totalEvents.toLocaleString() }}</p>
              <p class="text-xs text-gray-500">{{ formatDateRange() }}</p>
            </div>
          </div>
        </div>

        <!-- Unique Accounts -->
        <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <div class="flex items-center">
            <div class="p-3 bg-green-100 dark:bg-green-900/20 rounded-lg">
              <UIcon name="i-heroicons-building-office-2" class="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <div class="ml-4">
              <p class="text-sm font-medium text-gray-600 dark:text-gray-400">Accounts Accessed</p>
              <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ summary.uniqueAccounts }}</p>
              <p class="text-xs" :class="summary.crossAccountAccess > 0 ? 'text-orange-600' : 'text-gray-500'">
                {{ summary.crossAccountAccess > 0 ? `${summary.crossAccountAccess} cross-account` : 'Single account' }}
              </p>
            </div>
          </div>
        </div>

        <!-- Services Used -->
        <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <div class="flex items-center">
            <div class="p-3 bg-purple-100 dark:bg-purple-900/20 rounded-lg">
              <UIcon name="i-heroicons-cpu-chip" class="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div class="ml-4">
              <p class="text-sm font-medium text-gray-600 dark:text-gray-400">Services Used</p>
              <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ summary.uniqueServices }}</p>
              <p class="text-xs text-gray-500">{{ mostUsedService }}</p>
            </div>
          </div>
        </div>

        <!-- Error Rate -->
        <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <div class="flex items-center">
            <div class="p-3" :class="summary.errorRate > 10 ? 'bg-red-100 dark:bg-red-900/20' : 'bg-gray-100 dark:bg-gray-800'">
              <UIcon 
                :name="summary.errorRate > 10 ? 'i-heroicons-exclamation-triangle' : 'i-heroicons-check-circle'" 
                class="w-6 h-6" 
                :class="summary.errorRate > 10 ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'"
              />
            </div>
            <div class="ml-4">
              <p class="text-sm font-medium text-gray-600 dark:text-gray-400">Error Rate</p>
              <p class="text-2xl font-bold" :class="getErrorRateColor()">{{ summary.errorRate.toFixed(1) }}%</p>
              <p class="text-xs text-gray-500">{{ summary.errorEvents }} failed events</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Activity Pattern Analysis -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <!-- Activity Timeline Chart -->
        <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Activity Over Time</h3>
            <USelectMenu
              v-model="timeGrouping"
              :options="timeGroupingOptions"
              size="sm"
            />
          </div>
          
          <!-- Simple Activity Chart -->
          <div class="space-y-2">
            <div v-for="(period, index) in activityTimeline" :key="index" class="flex items-center gap-2">
              <div class="text-xs text-gray-500 dark:text-gray-400 w-16 font-mono">
                {{ formatTimeLabel(period.time) }}
              </div>
              <div class="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div 
                  class="bg-blue-500 h-2 rounded-full transition-all duration-300" 
                  :style="{ width: `${(period.count / maxActivityCount) * 100}%` }"
                ></div>
              </div>
              <div class="text-xs text-gray-600 dark:text-gray-400 w-8 text-right">
                {{ period.count }}
              </div>
            </div>
          </div>
        </div>

        <!-- Risk Assessment -->
        <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Risk Assessment</h3>
          
          <div class="space-y-4">
            <!-- Overall Risk Score -->
            <div class="flex items-center justify-between p-3 rounded-lg" :class="getRiskBgColor()">
              <div class="flex items-center gap-3">
                <UIcon :name="getRiskIcon()" class="w-6 h-6" :class="getRiskIconColor()" />
                <div>
                  <p class="font-medium" :class="getRiskTextColor()">Overall Risk Level</p>
                  <p class="text-sm opacity-75" :class="getRiskTextColor()">{{ getRiskDescription() }}</p>
                </div>
              </div>
              <div class="text-right">
                <p class="text-2xl font-bold" :class="getRiskTextColor()">{{ riskAnalysis.overallScore }}/100</p>
                <p class="text-sm opacity-75" :class="getRiskTextColor()">{{ riskAnalysis.level.toUpperCase() }} RISK</p>
              </div>
            </div>

            <!-- Risk Factors -->
            <div class="space-y-2">
              <div v-for="factor in riskAnalysis.factors" :key="factor.type" class="flex items-center justify-between text-sm">
                <span class="text-gray-600 dark:text-gray-400">{{ factor.name }}</span>
                <div class="flex items-center gap-2">
                  <div class="w-16 bg-gray-200 dark:bg-gray-700 rounded-full h-1">
                    <div 
                      :class="factor.score > 70 ? 'bg-red-500' : factor.score > 40 ? 'bg-orange-500' : 'bg-green-500'"
                      class="h-1 rounded-full" 
                      :style="{ width: `${factor.score}%` }"
                    ></div>
                  </div>
                  <span class="text-xs text-gray-500 w-8 text-right">{{ factor.score }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Detailed Breakdowns -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Top Services -->
        <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Most Used Services</h3>
          <div class="space-y-3">
            <div v-for="service in topServices" :key="service.name" class="flex items-center gap-3">
              <div class="p-2 bg-blue-100 dark:bg-blue-900/20 rounded">
                <UIcon name="i-heroicons-cpu-chip" class="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between">
                  <p class="text-sm font-medium text-gray-900 dark:text-white truncate">{{ service.displayName }}</p>
                  <span class="text-xs text-gray-600 dark:text-gray-400">{{ service.count }}</span>
                </div>
                <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1 mt-1">
                  <div 
                    class="bg-blue-500 h-1 rounded-full" 
                    :style="{ width: `${(service.count / topServices[0].count) * 100}%` }"
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Access Patterns -->
        <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Access Patterns</h3>
          <div class="space-y-4">
            <!-- Peak Hours -->
            <div>
              <p class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Peak Activity Hours</p>
              <div class="flex items-center gap-2">
                <UIcon name="i-heroicons-clock" class="w-4 h-4 text-gray-500" />
                <span class="text-sm text-gray-600 dark:text-gray-400">{{ peakHours.join(', ') }}</span>
              </div>
            </div>

            <!-- Geographic Distribution -->
            <div v-if="topRegions.length > 0">
              <p class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Top Regions</p>
              <div class="space-y-1">
                <div v-for="region in topRegions.slice(0, 3)" :key="region.name" class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <UIcon name="i-heroicons-globe-alt" class="w-3 h-3 text-gray-500" />
                    <span class="text-xs text-gray-600 dark:text-gray-400">{{ region.name }}</span>
                  </div>
                  <span class="text-xs text-gray-500">{{ region.count }}</span>
                </div>
              </div>
            </div>

            <!-- Session Types -->
            <div>
              <p class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Session Types</p>
              <div class="space-y-1">
                <div v-for="type in sessionTypes" :key="type.name" class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <UIcon :name="type.icon" class="w-3 h-3 text-gray-500" />
                    <span class="text-xs text-gray-600 dark:text-gray-400">{{ type.name }}</span>
                  </div>
                  <span class="text-xs text-gray-500">{{ type.percentage }}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Security Insights -->
        <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Security Insights</h3>
          <div class="space-y-3">
            <div v-for="insight in securityInsights" :key="insight.type" class="p-3 rounded-lg" :class="insight.bgColor">
              <div class="flex items-start gap-2">
                <UIcon :name="insight.icon" class="w-4 h-4 mt-0.5" :class="insight.iconColor" />
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium" :class="insight.textColor">{{ insight.title }}</p>
                  <p class="text-xs mt-1" :class="insight.descColor">{{ insight.description }}</p>
                  <div v-if="insight.action" class="mt-2">
                    <UButton size="xs" variant="ghost" color="gray">
                      {{ insight.action }}
                    </UButton>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface AccessEvent {
  eventId: string
  eventTime: string
  eventName: string
  eventSource: string
  awsRegion: string
  sourceIPAddress: string
  userAgent: string
  accountId: string
  accountName?: string
  errorCode?: string
  errorMessage?: string
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
  userEmail?: string
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  events: () => [],
  userEmail: ''
})

// State
const timeGrouping = ref('hour')

// Time grouping options
const timeGroupingOptions = [
  { label: 'Hour', value: 'hour' },
  { label: 'Day', value: 'day' },
  { label: 'Week', value: 'week' }
]

// Computed properties
const summary = computed(() => {
  const totalEvents = props.events.length
  const uniqueAccounts = new Set(props.events.map(e => e.accountId)).size
  const uniqueServices = new Set(props.events.map(e => e.eventSource)).size
  const errorEvents = props.events.filter(e => e.errorCode).length
  const errorRate = totalEvents > 0 ? (errorEvents / totalEvents) * 100 : 0
  const crossAccountAccess = uniqueAccounts > 1 ? uniqueAccounts - 1 : 0

  return {
    totalEvents,
    uniqueAccounts,
    uniqueServices,
    errorEvents,
    errorRate,
    crossAccountAccess
  }
})

const topServices = computed(() => {
  const serviceCounts: Record<string, number> = {}
  props.events.forEach(event => {
    if (event.eventSource) {
      const serviceName = event.eventSource.replace('.amazonaws.com', '')
      serviceCounts[serviceName] = (serviceCounts[serviceName] || 0) + 1
    }
  })

  return Object.entries(serviceCounts)
    .map(([name, count]) => ({
      name,
      displayName: formatServiceName(name),
      count
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
})

const mostUsedService = computed(() => {
  return topServices.value.length > 0 ? `Top: ${topServices.value[0].displayName}` : 'No services'
})

const activityTimeline = computed(() => {
  const buckets: Record<string, number> = {}
  
  props.events.forEach(event => {
    const date = new Date(event.eventTime)
    let bucketKey: string
    
    switch (timeGrouping.value) {
      case 'hour':
        bucketKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:00`
        break
      case 'day':
        bucketKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
        break
      case 'week':
        const weekStart = new Date(date)
        weekStart.setDate(date.getDate() - date.getDay())
        bucketKey = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`
        break
      default:
        bucketKey = bucketKey!
    }
    
    buckets[bucketKey] = (buckets[bucketKey] || 0) + 1
  })

  const sorted = Object.entries(buckets)
    .map(([time, count]) => ({ time, count }))
    .sort((a, b) => a.time.localeCompare(b.time))

  return sorted.slice(-24) // Show last 24 periods
})

const maxActivityCount = computed(() => {
  return Math.max(...activityTimeline.value.map(p => p.count), 1)
})

const riskAnalysis = computed(() => {
  const factors = [
    {
      type: 'error_rate',
      name: 'Error Rate',
      score: Math.min(summary.value.errorRate * 5, 100) // Scale error rate
    },
    {
      type: 'after_hours',
      name: 'After Hours Activity',
      score: calculateAfterHoursScore()
    },
    {
      type: 'cross_account',
      name: 'Cross-Account Access',
      score: summary.value.crossAccountAccess > 0 ? Math.min(summary.value.crossAccountAccess * 25, 100) : 0
    },
    {
      type: 'geographic_spread',
      name: 'Geographic Spread',
      score: calculateGeographicScore()
    },
    {
      type: 'sensitive_operations',
      name: 'Sensitive Operations',
      score: calculateSensitiveOperationsScore()
    }
  ]

  const overallScore = Math.round(factors.reduce((sum, f) => sum + f.score, 0) / factors.length)
  let level: 'low' | 'medium' | 'high' = 'low'
  
  if (overallScore > 70) level = 'high'
  else if (overallScore > 40) level = 'medium'

  return {
    overallScore,
    level,
    factors
  }
})

const peakHours = computed(() => {
  const hourCounts: Record<number, number> = {}
  props.events.forEach(event => {
    const hour = new Date(event.eventTime).getHours()
    hourCounts[hour] = (hourCounts[hour] || 0) + 1
  })

  return Object.entries(hourCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 3)
    .map(([hour]) => `${hour}:00`)
})

const topRegions = computed(() => {
  const regionCounts: Record<string, number> = {}
  props.events.forEach(event => {
    if (event.awsRegion) {
      regionCounts[event.awsRegion] = (regionCounts[event.awsRegion] || 0) + 1
    }
  })

  return Object.entries(regionCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
})

const sessionTypes = computed(() => {
  const consoleEvents = props.events.filter(e => e.eventName?.includes('Console')).length
  const apiEvents = props.events.filter(e => !e.eventName?.includes('Console')).length
  const assumeRoleEvents = props.events.filter(e => e.eventName?.includes('AssumeRole')).length
  const total = props.events.length

  return [
    {
      name: 'Console',
      percentage: total > 0 ? Math.round((consoleEvents / total) * 100) : 0,
      icon: 'i-heroicons-computer-desktop'
    },
    {
      name: 'API',
      percentage: total > 0 ? Math.round((apiEvents / total) * 100) : 0,
      icon: 'i-heroicons-code-bracket'
    },
    {
      name: 'Role Assumption',
      percentage: total > 0 ? Math.round((assumeRoleEvents / total) * 100) : 0,
      icon: 'i-heroicons-arrow-path'
    }
  ].filter(type => type.percentage > 0)
})

const securityInsights = computed(() => {
  const insights = []

  // High error rate
  if (summary.value.errorRate > 15) {
    insights.push({
      type: 'high_error_rate',
      title: 'High Error Rate Detected',
      description: `${summary.value.errorRate.toFixed(1)}% of operations failed`,
      icon: 'i-heroicons-exclamation-triangle',
      iconColor: 'text-red-600',
      textColor: 'text-red-900 dark:text-red-100',
      descColor: 'text-red-700 dark:text-red-300',
      bgColor: 'bg-red-50 dark:bg-red-900/20',
      action: 'Review Errors',
      actionColor: 'red'
    })
  }

  // Cross-account access
  if (summary.value.crossAccountAccess > 2) {
    insights.push({
      type: 'cross_account',
      title: 'Extensive Cross-Account Access',
      description: `Activity across ${summary.value.uniqueAccounts} different accounts`,
      icon: 'i-heroicons-arrows-right-left',
      iconColor: 'text-orange-600',
      textColor: 'text-orange-900 dark:text-orange-100',
      descColor: 'text-orange-700 dark:text-orange-300',
      bgColor: 'bg-orange-50 dark:bg-orange-900/20',
      action: 'Review Access',
      actionColor: 'orange'
    })
  }

  // After hours activity
  const afterHoursScore = calculateAfterHoursScore()
  if (afterHoursScore > 30) {
    insights.push({
      type: 'after_hours',
      title: 'Significant After-Hours Activity',
      description: `${Math.round(afterHoursScore)}% of activity outside business hours`,
      icon: 'i-heroicons-moon',
      iconColor: 'text-blue-600',
      textColor: 'text-blue-900 dark:text-blue-100',
      descColor: 'text-blue-700 dark:text-blue-300',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20'
    })
  }

  // All good
  if (insights.length === 0) {
    insights.push({
      type: 'all_good',
      title: 'Normal Activity Pattern',
      description: 'No significant security concerns detected',
      icon: 'i-heroicons-check-circle',
      iconColor: 'text-green-600',
      textColor: 'text-green-900 dark:text-green-100',
      descColor: 'text-green-700 dark:text-green-300',
      bgColor: 'bg-green-50 dark:bg-green-900/20'
    })
  }

  return insights
})

// Helper functions
function formatServiceName(serviceName: string): string {
  // Convert service names to more readable format
  const serviceMap: Record<string, string> = {
    'sts': 'Security Token Service',
    'iam': 'Identity & Access Management',
    'ec2': 'Elastic Compute Cloud',
    's3': 'Simple Storage Service',
    'cloudtrail': 'CloudTrail',
    'lambda': 'Lambda',
    'rds': 'Relational Database Service',
    'cloudformation': 'CloudFormation'
  }

  return serviceMap[serviceName.toLowerCase()] || serviceName.toUpperCase()
}

function formatDateRange(): string {
  if (props.events.length === 0) return ''
  
  const dates = props.events.map(e => new Date(e.eventTime)).sort((a, b) => a.getTime() - b.getTime())
  const start = dates[0]
  const end = dates[dates.length - 1]
  
  const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  
  return startStr === endStr ? startStr : `${startStr} - ${endStr}`
}

function formatTimeLabel(timeStr: string): string {
  const date = new Date(timeStr)
  
  switch (timeGrouping.value) {
    case 'hour':
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    case 'day':
      return date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })
    case 'week':
      return `W${Math.ceil(date.getDate() / 7)}`
    default:
      return timeStr
  }
}

function calculateAfterHoursScore(): number {
  const afterHoursEvents = props.events.filter(event => {
    const hour = new Date(event.eventTime).getHours()
    return hour < 6 || hour > 22 // Outside 6 AM - 10 PM
  })
  
  return props.events.length > 0 ? (afterHoursEvents.length / props.events.length) * 100 : 0
}

function calculateGeographicScore(): number {
  const uniqueRegions = new Set(props.events.map(e => e.awsRegion)).size
  const uniqueIPs = new Set(props.events.map(e => e.sourceIPAddress)).size
  
  // Higher score for more regions and IPs
  const regionScore = Math.min(uniqueRegions * 10, 50)
  const ipScore = Math.min(uniqueIPs * 15, 50)
  
  return regionScore + ipScore
}

function calculateSensitiveOperationsScore(): number {
  const sensitiveOps = props.events.filter(event => {
    const eventName = event.eventName?.toLowerCase() || ''
    return eventName.includes('delete') || 
           eventName.includes('terminate') || 
           eventName.includes('assume') ||
           eventName.includes('attach') ||
           eventName.includes('detach') ||
           eventName.includes('put') ||
           eventName.includes('create')
  })
  
  return props.events.length > 0 ? (sensitiveOps.length / props.events.length) * 100 : 0
}

function getErrorRateColor(): string {
  if (summary.value.errorRate > 15) return 'text-red-600 dark:text-red-400'
  if (summary.value.errorRate > 5) return 'text-orange-600 dark:text-orange-400'
  return 'text-green-600 dark:text-green-400'
}

function getRiskBgColor(): string {
  switch (riskAnalysis.value.level) {
    case 'high': return 'bg-red-50 dark:bg-red-900/20'
    case 'medium': return 'bg-orange-50 dark:bg-orange-900/20'
    default: return 'bg-green-50 dark:bg-green-900/20'
  }
}

function getRiskTextColor(): string {
  switch (riskAnalysis.value.level) {
    case 'high': return 'text-red-900 dark:text-red-100'
    case 'medium': return 'text-orange-900 dark:text-orange-100'
    default: return 'text-green-900 dark:text-green-100'
  }
}

function getRiskIcon(): string {
  switch (riskAnalysis.value.level) {
    case 'high': return 'i-heroicons-shield-exclamation'
    case 'medium': return 'i-heroicons-exclamation-triangle'
    default: return 'i-heroicons-shield-check'
  }
}

function getRiskIconColor(): string {
  switch (riskAnalysis.value.level) {
    case 'high': return 'text-red-600'
    case 'medium': return 'text-orange-600'
    default: return 'text-green-600'
  }
}

function getRiskDescription(): string {
  switch (riskAnalysis.value.level) {
    case 'high': return 'Multiple security concerns detected'
    case 'medium': return 'Some areas need attention'
    default: return 'Activity appears normal'
  }
}
</script>