<template>
  <div class="space-y-6">
    <!-- Loading State -->
    <div v-if="loading" class="flex items-center justify-center py-8">
      <div class="text-center">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mx-auto mb-4"></div>
        <p class="text-gray-600 dark:text-gray-400">Analyzing authentication data...</p>
      </div>
    </div>

    <!-- No Data State -->
    <div v-else-if="!events.length" class="text-center py-8">
      <div class="text-gray-500 dark:text-gray-400">
        <Icon name="i-heroicons-key" class="w-16 h-16 mx-auto mb-4 opacity-50" />
        <h3 class="text-lg font-medium mb-2">No Authentication Events</h3>
        <p>No authentication events found for this user.</p>
      </div>
    </div>

    <!-- Main Content -->
    <div v-else class="space-y-6">
      <!-- Authentication Summary Cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <UCard>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-600 dark:text-gray-400">Total Logins</p>
              <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ totalLogins.toLocaleString() }}</p>
            </div>
            <div class="p-3 bg-green-100 dark:bg-green-900 rounded-lg">
              <Icon name="i-heroicons-arrow-right-on-rectangle" class="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
          </div>
        </UCard>

        <UCard>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-600 dark:text-gray-400">Failed Logins</p>
              <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ failedLogins.toLocaleString() }}</p>
            </div>
            <div class="p-3 bg-red-100 dark:bg-red-900 rounded-lg">
              <Icon name="i-heroicons-x-circle" class="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
          </div>
        </UCard>

        <UCard>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-600 dark:text-gray-400">Success Rate</p>
              <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ successRate }}%</p>
            </div>
            <div class="p-3 bg-blue-100 dark:bg-blue-900 rounded-lg">
              <Icon name="i-heroicons-chart-pie" class="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </UCard>

        <UCard>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-600 dark:text-gray-400">MFA Compliance</p>
              <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ mfaCompliance }}%</p>
            </div>
            <div class="p-3 bg-purple-100 dark:bg-purple-900 rounded-lg">
              <Icon name="i-heroicons-shield-check" class="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
        </UCard>
      </div>

      <!-- Authentication Timeline -->
      <UCard>
        <div class="p-4">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold">Authentication Timeline</h3>
            <div class="flex items-center gap-2">
              <UButton
                :variant="timelineView === 'success' ? 'solid' : 'ghost'"
                size="xs"
                @click="timelineView = 'success'"
              >
                Success
              </UButton>
              <UButton
                :variant="timelineView === 'failed' ? 'solid' : 'ghost'"
                size="xs"
                color="red"
                @click="timelineView = 'failed'"
              >
                Failed
              </UButton>
              <UButton
                :variant="timelineView === 'both' ? 'solid' : 'ghost'"
                size="xs"
                color="gray"
                @click="timelineView = 'both'"
              >
                Both
              </UButton>
            </div>
          </div>
          <div class="h-64">
            <apexchart
              type="line"
              :options="timelineOptions"
              :series="timelineSeries"
              height="100%"
            />
          </div>
        </div>
      </UCard>

      <!-- Authentication Methods & Source IPs -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Authentication Methods -->
        <UCard>
          <div class="p-4">
            <h3 class="text-lg font-semibold mb-4">Authentication Methods</h3>
            <div class="h-64">
              <apexchart
                type="donut"
                :options="methodsOptions"
                :series="methodsSeries"
                height="100%"
              />
            </div>
          </div>
        </UCard>

        <!-- Source IPs -->
        <UCard>
          <div class="p-4">
            <h3 class="text-lg font-semibold mb-4">Top Source IPs</h3>
            <div class="h-64">
              <apexchart
                type="bar"
                :options="ipOptions"
                :series="ipSeries"
                height="100%"
              />
            </div>
          </div>
        </UCard>
      </div>

      <!-- Login Patterns Scatter Plot -->
      <UCard>
        <div class="p-4">
          <h3 class="text-lg font-semibold mb-4">Login Patterns (Time vs Success Rate)</h3>
          <div class="h-64">
            <apexchart
              type="scatter"
              :options="scatterOptions"
              :series="scatterSeries"
              height="100%"
            />
          </div>
        </div>
      </UCard>

      <!-- Failed Login Analysis -->
      <UCard v-if="failedLogins > 0">
        <div class="p-4">
          <h3 class="text-lg font-semibold mb-4">Failed Login Analysis</h3>
          <div class="space-y-4">
            <div v-for="failure in failureAnalysis" :key="failure.reason" class="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <div>
                <h4 class="font-medium text-gray-900 dark:text-white">{{ failure.reason }}</h4>
                <p class="text-sm text-gray-600 dark:text-gray-400">{{ failure.count }} occurrences</p>
              </div>
              <div class="text-right">
                <p class="text-sm font-medium text-red-600 dark:text-red-400">{{ failure.percentage }}%</p>
                <p class="text-xs text-gray-500">of failures</p>
              </div>
            </div>
          </div>
        </div>
      </UCard>

      <!-- Security Insights -->
      <UCard>
        <div class="p-4">
          <h3 class="text-lg font-semibold mb-4">Security Insights</h3>
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

const props = withDefaults(defineProps<Props>(), {
  events: () => [],
  loading: false
})

const timelineView = ref<'success' | 'failed' | 'both'>('both')

// Authentication events filtering
const authEvents = computed(() => 
  props.events.filter(event => 
    event.eventName === 'ConsoleLogin' || 
    event.eventName === 'AssumeRoleWithSAML' ||
    event.eventName === 'AssumeRoleWithWebIdentity' ||
    event.eventSource === 'signin.amazonaws.com'
  )
)

// Basic metrics
const totalLogins = computed(() => authEvents.value.length)
const failedLogins = computed(() => authEvents.value.filter(e => e.errorCode || e.errorMessage).length)
const successRate = computed(() => {
  const successful = totalLogins.value - failedLogins.value
  return totalLogins.value ? Math.round((successful / totalLogins.value) * 100) : 0
})
const mfaCompliance = computed(() => {
  const mfaEvents = authEvents.value.filter(e => 
    e.requestParameters?.mfaUsed === 'true' || 
    e.responseElements?.mfaUsed === 'true'
  )
  return totalLogins.value ? Math.round((mfaEvents.length / totalLogins.value) * 100) : 0
})

// Timeline data
const timelineSeries = computed(() => {
  const hourlySuccess = new Map<string, number>()
  const hourlyFailed = new Map<string, number>()
  
  authEvents.value.forEach(event => {
    const hour = new Date(event.eventTime).toISOString().slice(0, 13)
    const isSuccess = !event.errorCode && !event.errorMessage
    
    if (isSuccess) {
      hourlySuccess.set(hour, (hourlySuccess.get(hour) || 0) + 1)
    } else {
      hourlyFailed.set(hour, (hourlyFailed.get(hour) || 0) + 1)
    }
  })
  
  const successData = Array.from(hourlySuccess.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([hour, count]) => ({
      x: new Date(hour + ':00:00').getTime(),
      y: count
    }))
  
  const failedData = Array.from(hourlyFailed.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([hour, count]) => ({
      x: new Date(hour + ':00:00').getTime(),
      y: count
    }))
  
  const series = []
  if (timelineView.value === 'success' || timelineView.value === 'both') {
    series.push({ name: 'Successful', data: successData, color: '#10B981' })
  }
  if (timelineView.value === 'failed' || timelineView.value === 'both') {
    series.push({ name: 'Failed', data: failedData, color: '#EF4444' })
  }
  
  return series
})

const timelineOptions = computed(() => ({
  chart: {
    type: 'line',
    toolbar: { show: false },
    zoom: { enabled: false }
  },
  stroke: {
    curve: 'smooth',
    width: 2
  },
  xaxis: {
    type: 'datetime',
    labels: {
      format: 'HH:mm'
    }
  },
  yaxis: {
    title: {
      text: 'Login Attempts'
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

// Authentication methods data
const methodsData = computed(() => {
  const methods = new Map<string, number>()
  
  authEvents.value.forEach(event => {
    let method = 'Console'
    if (event.eventName === 'AssumeRoleWithSAML') method = 'SAML'
    else if (event.eventName === 'AssumeRoleWithWebIdentity') method = 'Web Identity'
    else if (event.eventSource === 'signin.amazonaws.com') method = 'SSO'
    
    methods.set(method, (methods.get(method) || 0) + 1)
  })
  
  return Array.from(methods.entries())
})

const methodsSeries = computed(() => methodsData.value.map(([, count]) => count))
const methodsOptions = computed(() => ({
  chart: {
    type: 'donut'
  },
  labels: methodsData.value.map(([method]) => method),
  colors: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444'],
  legend: {
    position: 'bottom'
  }
}))

// Source IP data
const ipData = computed(() => {
  const ipCount = new Map<string, number>()
  
  authEvents.value.forEach(event => {
    if (event.sourceIPAddress) {
      ipCount.set(event.sourceIPAddress, (ipCount.get(event.sourceIPAddress) || 0) + 1)
    }
  })
  
  return Array.from(ipCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
})

const ipSeries = computed(() => [{
  name: 'Logins',
  data: ipData.value.map(([ip, count]) => ({ x: ip, y: count }))
}])

const ipOptions = computed(() => ({
  chart: {
    type: 'bar',
    toolbar: { show: false }
  },
  colors: ['#8B5CF6'],
  xaxis: {
    categories: ipData.value.map(([ip]) => ip),
    labels: {
      rotate: -45
    }
  },
  yaxis: {
    title: {
      text: 'Login Count'
    }
  }
}))

// Scatter plot data
const scatterSeries = computed(() => {
  const hourlyData = new Map<number, { total: number, success: number }>()
  
  authEvents.value.forEach(event => {
    const hour = new Date(event.eventTime).getHours()
    const current = hourlyData.get(hour) || { total: 0, success: 0 }
    current.total++
    if (!event.errorCode && !event.errorMessage) {
      current.success++
    }
    hourlyData.set(hour, current)
  })
  
  const scatterData = Array.from(hourlyData.entries()).map(([hour, data]) => ({
    x: hour,
    y: data.total > 0 ? Math.round((data.success / data.total) * 100) : 0
  }))
  
  return [{
    name: 'Success Rate by Hour',
    data: scatterData
  }]
})

const scatterOptions = computed(() => ({
  chart: {
    type: 'scatter',
    toolbar: { show: false }
  },
  colors: ['#F59E0B'],
  xaxis: {
    title: {
      text: 'Hour of Day'
    },
    min: 0,
    max: 23
  },
  yaxis: {
    title: {
      text: 'Success Rate (%)'
    },
    min: 0,
    max: 100
  }
}))

// Failed login analysis
const failureAnalysis = computed(() => {
  const failures = new Map<string, number>()
  
  authEvents.value
    .filter(e => e.errorCode || e.errorMessage)
    .forEach(event => {
      const reason = event.errorCode || event.errorMessage || 'Unknown Error'
      failures.set(reason, (failures.get(reason) || 0) + 1)
    })
  
  return Array.from(failures.entries())
    .map(([reason, count]) => ({
      reason,
      count,
      percentage: Math.round((count / failedLogins.value) * 100)
    }))
    .sort((a, b) => b.count - a.count)
})

// Security insights
const securityInsights = computed(() => {
  const insights = []
  
  // Multiple IP addresses
  const uniqueIPs = new Set(authEvents.value.map(e => e.sourceIPAddress)).size
  if (uniqueIPs > 3) {
    insights.push({
      id: 'multiple-ips',
      title: 'Multiple Source IPs',
      description: `Login attempts from ${uniqueIPs} different IP addresses`,
      icon: 'i-heroicons-globe-alt',
      iconClass: 'bg-yellow-100 dark:bg-yellow-900 text-yellow-600 dark:text-yellow-400',
      severity: 'yellow'
    })
  }
  
  // High failure rate
  if (successRate.value < 80) {
    insights.push({
      id: 'high-failure-rate',
      title: 'High Failure Rate',
      description: `${100 - successRate.value}% of login attempts failed`,
      icon: 'i-heroicons-exclamation-triangle',
      iconClass: 'bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400',
      severity: 'red'
    })
  }
  
  // Low MFA compliance
  if (mfaCompliance.value < 90) {
    insights.push({
      id: 'low-mfa',
      title: 'Low MFA Usage',
      description: `Only ${mfaCompliance.value}% of logins used MFA`,
      icon: 'i-heroicons-shield-exclamation',
      iconClass: 'bg-orange-100 dark:bg-orange-900 text-orange-600 dark:text-orange-400',
      severity: 'orange'
    })
  }
  
  // After-hours activity
  const afterHoursLogins = authEvents.value.filter(e => {
    const hour = new Date(e.eventTime).getHours()
    return hour < 6 || hour > 22
  }).length
  
  if (afterHoursLogins > 0) {
    insights.push({
      id: 'after-hours',
      title: 'After-Hours Activity',
      description: `${afterHoursLogins} login attempts outside business hours`,
      icon: 'i-heroicons-moon',
      iconClass: 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400',
      severity: 'blue'
    })
  }
  
  return insights.slice(0, 5)
})
</script> 