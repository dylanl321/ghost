<template>
  <div class="space-y-6">
    <!-- Breadcrumb Navigation -->
    <div class="flex items-center gap-2 text-sm text-gray-400">
      <NuxtLink to="/account/user" class="hover:text-white flex items-center gap-1">
        <UIcon name="i-heroicons-arrow-left" class="w-4 h-4" />
        <span>Back to Users</span>
      </NuxtLink>
      <UIcon name="i-heroicons-chevron-right" class="w-4 h-4" />
      <NuxtLink :to="`/account/user/${username}`" class="hover:text-white">
        {{ userProfile?.displayName || username }}
      </NuxtLink>
      <UIcon name="i-heroicons-chevron-right" class="w-4 h-4" />
      <span class="text-white">Access History</span>
    </div>

    <!-- Combined Header & Filters Card -->
    <UCard class="bg-gray-900 border border-gray-800">
      <!-- Header Section -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6 border-b border-gray-700">
        <!-- Left: User Info -->
        <div class="flex items-center gap-3">
          <UIcon name="i-heroicons-clock" class="w-8 h-8 text-primary-400 flex-shrink-0" />
          <div class="flex-1 min-w-0">
            <h1 class="text-lg font-semibold text-white">AWS Access History</h1>
            <p class="text-sm text-gray-400 truncate">
              CloudTrail events for: <span class="font-medium text-white">{{ userProfile?.displayName || username }}</span>
            </p>
            <p v-if="resolvedEmail" class="text-xs text-gray-500 mt-1 truncate">
              Searching for: {{ resolvedEmail }}
            </p>
          </div>
        </div>
        
        <!-- Right: Actions -->
        <div class="flex items-center justify-end gap-3">
          <UButton
            icon="i-heroicons-arrow-path"
            variant="outline"
            @click="loadAccessHistory"
            :loading="loading"
            size="sm"
          >
            Refresh
          </UButton>
          
          <UButton
            icon="i-heroicons-arrow-down-tray"
            variant="outline"
            @click="exportAccessHistory"
            :disabled="!accessEvents.length"
            size="sm"
          >
            Export
          </UButton>
        </div>
      </div>
      
      <!-- Filters Section -->
      <div class="p-6">
        <div class="flex items-center gap-2 mb-4">
          <UIcon name="i-heroicons-funnel" class="w-4 h-4 text-gray-400" />
          <h3 class="text-sm font-medium text-gray-300">Search Filters</h3>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">Date Range</label>
            <USelect 
              v-model="selectedDateRange" 
              :options="dateRangeOptions"
              @change="loadAccessHistory"
              color="gray"
            />
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">Event Type</label>
            <USelect 
              v-model="selectedEventType" 
              :options="eventTypeOptions"
              @change="loadAccessHistory"
              color="gray"
            />
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">AWS Account</label>
            <USelect 
              v-model="selectedAccount" 
              :options="accountOptions"
              @change="loadAccessHistory"
              color="gray"
            />
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">Service</label>
            <USelect 
              v-model="selectedService" 
              :options="serviceOptions"
              @change="loadAccessHistory"
              color="gray"
            />
          </div>
        </div>
      </div>
    </UCard>

    <!-- Loading State -->
    <UCard v-if="loading" class="bg-gray-900 border border-gray-800">
      <div class="flex items-center justify-center py-16">
        <div class="text-center">
          <UIcon name="i-heroicons-arrow-path" class="w-12 h-12 animate-spin text-blue-400 mb-4" />
          <h3 class="text-lg font-semibold text-white mb-2">Loading Access History</h3>
          <p class="text-gray-400 text-center max-w-md">
            {{ loadingMessage }}
          </p>
        </div>
      </div>
    </UCard>

    <!-- Error State -->
    <UAlert
      v-else-if="error"
      icon="i-heroicons-exclamation-triangle"
      color="red"
      :title="error"
      :description="errorDetails || undefined"
      class="mb-6"
    />

    <!-- No Data State -->
    <UCard v-else-if="!loading && !accessEvents.length" class="bg-gray-900 border border-gray-800">
      <div class="text-center py-16">
        <UIcon name="i-heroicons-document-magnifying-glass" class="w-20 h-20 text-gray-500 mx-auto mb-6" />
        <h3 class="text-2xl font-semibold text-white mb-3">No Access History Found</h3>
        <p class="text-gray-400 mb-8 max-w-md mx-auto">
          No CloudTrail events were found for this user in the selected time period and filters.
        </p>
        <UButton @click="resetFilters" variant="outline">Reset Filters</UButton>
      </div>
    </UCard>

    <!-- Access History Content -->
    <div v-else class="space-y-6">
      <!-- View Toggle -->
      <div class="flex justify-between items-center">
        <div class="flex items-center gap-3">
          <UIcon name="i-heroicons-chart-bar" class="w-5 h-5 text-primary-400" />
          <h2 class="text-lg font-semibold text-white">Access Analysis</h2>
          <span class="text-sm text-gray-400">{{ accessEvents.length }} events found</span>
        </div>
        
        <div class="flex items-center gap-2">
          <UButton
            :variant="viewMode === 'overview' ? 'solid' : 'outline'"
            @click="viewMode = 'overview'"
            size="sm"
            icon="i-heroicons-chart-pie"
          >
            Overview
          </UButton>
          <UButton
            :variant="viewMode === 'login' ? 'solid' : 'outline'"
            @click="viewMode = 'login'"
            size="sm"
            icon="i-heroicons-user"
          >
            Login History
          </UButton>
          <UButton
            :variant="viewMode === 'services' ? 'solid' : 'outline'"
            @click="viewMode = 'services'"
            size="sm"
            icon="i-heroicons-server"
          >
            Service Usage
          </UButton>
          <UButton
            :variant="viewMode === 'security' ? 'solid' : 'outline'"
            @click="viewMode = 'security'"
            size="sm"
            icon="i-heroicons-shield"
          >
            Security Events
          </UButton>
          <UButton
            :variant="viewMode === 'compliance' ? 'solid' : 'outline'"
            @click="viewMode = 'compliance'"
            size="sm"
            icon="i-heroicons-document"
          >
            Compliance
          </UButton>
        </div>
      </div>

      <!-- Summary Stats -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <UCard class="bg-gray-900 border border-gray-800">
          <div class="flex items-center">
            <div class="flex-shrink-0">
              <UIcon name="i-heroicons-calendar" class="w-8 h-8 text-blue-400" />
            </div>
            <div class="ml-3">
              <p class="text-sm font-medium text-gray-400">Total Events</p>
              <p class="text-lg font-semibold text-white">{{ accessEvents.length }}</p>
            </div>
          </div>
        </UCard>

        <UCard class="bg-gray-900 border border-gray-800">
          <div class="flex items-center">
            <div class="flex-shrink-0">
              <UIcon name="i-heroicons-building-office-2" class="w-8 h-8 text-green-400" />
            </div>
            <div class="ml-3">
              <p class="text-sm font-medium text-gray-400">Unique Accounts</p>
              <p class="text-lg font-semibold text-white">{{ uniqueAccounts.length }}</p>
            </div>
          </div>
        </UCard>

        <UCard class="bg-gray-900 border border-gray-800">
          <div class="flex items-center">
            <div class="flex-shrink-0">
              <UIcon name="i-heroicons-server-stack" class="w-8 h-8 text-purple-400" />
            </div>
            <div class="ml-3">
              <p class="text-sm font-medium text-gray-400">Unique Services</p>
              <p class="text-lg font-semibold text-white">{{ uniqueServices.length }}</p>
            </div>
          </div>
        </UCard>

        <UCard class="bg-gray-900 border border-gray-800">
          <div class="flex items-center">
            <div class="flex-shrink-0">
              <UIcon name="i-heroicons-exclamation-triangle" class="w-8 h-8 text-red-400" />
            </div>
            <div class="ml-3">
              <p class="text-sm font-medium text-gray-400">Errors</p>
              <p class="text-lg font-semibold text-white">{{ errorEvents.length }}</p>
            </div>
          </div>
        </UCard>
      </div>

      <!-- Use-case Specific Content -->
      <div v-if="viewMode === 'overview'" class="space-y-6">
        <!-- Overview Charts Grid -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Login Activity Trend -->
          <UCard class="bg-gray-900 border border-gray-800">
            <template #header>
              <div class="px-4 py-3">
                <h3 class="text-lg font-semibold text-white flex items-center gap-2">
                  <UIcon name="i-heroicons-user" class="w-5 h-5 text-blue-400" />
                  Login Activity Trend
                </h3>
                <p class="text-sm text-gray-400">Daily login events over time</p>
              </div>
            </template>
            <div class="p-6">
              <div class="h-64">
                <ClientOnly>
                  <apexchart
                    v-if="loginTrendData.series[0].data.length > 0"
                    type="line"
                    height="100%"
                    :options="loginTrendChartOptions"
                    :series="loginTrendData.series"
                  />
                  <div v-else class="flex items-center justify-center h-full text-gray-400">
                    No login data available
                  </div>
                </ClientOnly>
              </div>
            </div>
          </UCard>

          <!-- Service Usage Distribution -->
          <UCard class="bg-gray-900 border border-gray-800">
            <template #header>
              <div class="px-4 py-3">
                <h3 class="text-lg font-semibold text-white flex items-center gap-2">
                  <UIcon name="i-heroicons-server" class="w-5 h-5 text-green-400" />
                  Top Services Used
                </h3>
                <p class="text-sm text-gray-400">Most frequently accessed AWS services</p>
              </div>
            </template>
            <div class="p-6">
              <div class="h-64">
                <ClientOnly>
                  <apexchart
                    v-if="serviceDistributionData.series.length > 0"
                    type="donut"
                    height="100%"
                    :options="serviceDistributionChartOptions"
                    :series="serviceDistributionData.series"
                  />
                  <div v-else class="flex items-center justify-center h-full text-gray-400">
                    No service usage data available
                  </div>
                </ClientOnly>
              </div>
            </div>
          </UCard>
        </div>

        <!-- Activity Heatmap -->
        <UCard class="bg-gray-900 border border-gray-800">
          <template #header>
            <div class="px-4 py-3">
              <h3 class="text-lg font-semibold text-white flex items-center gap-2">
                <UIcon name="i-heroicons-chart-bar" class="w-5 h-5 text-purple-400" />
                Activity Heatmap by Hour
              </h3>
              <p class="text-sm text-gray-400">When the user is most active throughout the day</p>
            </div>
          </template>
          <div class="p-6">
            <div class="h-80">
              <ClientOnly>
                <apexchart
                  v-if="activityHeatmapData.series.length > 0"
                  type="heatmap"
                  height="100%"
                  :options="activityHeatmapChartOptions"
                  :series="activityHeatmapData.series"
                />
                <div v-else class="flex items-center justify-center h-full text-gray-400">
                  No activity data available
                </div>
              </ClientOnly>
            </div>
          </div>
        </UCard>
      </div>

      <!-- Login History -->
      <div v-else-if="viewMode === 'login'" class="space-y-6">
        <!-- Login Analytics Grid -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <UCard class="bg-gray-900 border border-gray-800">
            <div class="flex items-center p-4">
              <div class="flex-shrink-0">
                <UIcon name="i-heroicons-check-circle" class="w-8 h-8 text-green-400" />
              </div>
              <div class="ml-3">
                <p class="text-sm font-medium text-gray-400">Success Rate</p>
                <p class="text-2xl font-semibold text-white">{{ loginAnalytics.successRate }}%</p>
              </div>
            </div>
          </UCard>

          <UCard class="bg-gray-900 border border-gray-800">
            <div class="flex items-center p-4">
              <div class="flex-shrink-0">
                <UIcon name="i-heroicons-clock" class="w-8 h-8 text-blue-400" />
              </div>
              <div class="ml-3">
                <p class="text-sm font-medium text-gray-400">Peak Hour</p>
                <p class="text-2xl font-semibold text-white">{{ loginAnalytics.peakHour }}:00</p>
              </div>
            </div>
          </UCard>

          <UCard class="bg-gray-900 border border-gray-800">
            <div class="flex items-center p-4">
              <div class="flex-shrink-0">
                <UIcon name="i-heroicons-map-pin" class="w-8 h-8 text-purple-400" />
              </div>
              <div class="ml-3">
                <p class="text-sm font-medium text-gray-400">Unique Locations</p>
                <p class="text-2xl font-semibold text-white">{{ loginAnalytics.uniqueLocations }}</p>
              </div>
            </div>
          </UCard>

          <UCard class="bg-gray-900 border border-gray-800">
            <div class="flex items-center p-4">
              <div class="flex-shrink-0">
                <UIcon name="i-heroicons-exclamation-triangle" class="w-8 h-8 text-red-400" />
              </div>
              <div class="ml-3">
                <p class="text-sm font-medium text-gray-400">Failed Logins</p>
                <p class="text-2xl font-semibold text-white">{{ loginAnalytics.failedLogins }}</p>
              </div>
            </div>
          </UCard>
        </div>

        <!-- Login Charts -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Login Success/Failure Timeline -->
          <UCard class="bg-gray-900 border border-gray-800">
            <template #header>
              <div class="px-4 py-3">
                <h3 class="text-lg font-semibold text-white">Login Timeline</h3>
                <p class="text-sm text-gray-400">Success vs failure rates over time</p>
              </div>
            </template>
            <div class="p-6">
              <div class="h-64">
                <ClientOnly>
                  <apexchart
                    v-if="loginTimelineData.series.length > 0"
                    type="area"
                    height="100%"
                    :options="loginTimelineChartOptions"
                    :series="loginTimelineData.series"
                  />
                  <div v-else class="flex items-center justify-center h-full text-gray-400">
                    No login timeline data
                  </div>
                </ClientOnly>
              </div>
            </div>
          </UCard>

          <!-- IP Address Distribution -->
          <UCard class="bg-gray-900 border border-gray-800">
            <template #header>
              <div class="px-4 py-3">
                <h3 class="text-lg font-semibold text-white">Source IP Addresses</h3>
                <p class="text-sm text-gray-400">Login attempts by IP address</p>
              </div>
            </template>
            <div class="p-6">
              <div class="h-64">
                <ClientOnly>
                  <apexchart
                    v-if="ipDistributionData.series.length > 0"
                    type="bar"
                    height="100%"
                    :options="ipDistributionChartOptions"
                    :series="ipDistributionData.series"
                  />
                  <div v-else class="flex items-center justify-center h-full text-gray-400">
                    No IP data available
                  </div>
                </ClientOnly>
              </div>
            </div>
          </UCard>
        </div>

        <!-- Login Events Table -->
        <UCard class="bg-gray-900 border border-gray-800">
          <template #header>
            <div class="px-4 py-3">
              <h3 class="text-lg font-semibold text-white">Recent Login Events</h3>
              <p class="text-sm text-gray-400">Latest 50 authentication events</p>
            </div>
          </template>
          <div class="overflow-x-auto">
            <UTable
              :rows="loginEvents.slice(0, 50)"
              :columns="[
                { key: 'eventTime', label: 'Time', sortable: true },
                { key: 'eventName', label: 'Event', sortable: true },
                { key: 'sourceIPAddress', label: 'Source IP' },
                { key: 'userAgent', label: 'User Agent' },
                { key: 'status', label: 'Status' }
              ]"
              class="w-full min-w-[800px]"
            >
              <template #eventTime-data="{ row }">
                <span class="text-sm text-gray-300 whitespace-nowrap">{{ formatDateTime(row.eventTime) }}</span>
              </template>
              <template #eventName-data="{ row }">
                <span class="text-sm text-white truncate max-w-[150px] block">{{ row.eventName }}</span>
              </template>
              <template #sourceIPAddress-data="{ row }">
                <span class="text-sm text-blue-400 font-mono">{{ row.sourceIPAddress || 'N/A' }}</span>
              </template>
              <template #userAgent-data="{ row }">
                <span class="text-xs text-gray-400 truncate max-w-[200px] block" :title="row.userAgent">
                  {{ row.userAgent || 'N/A' }}
                </span>
              </template>
              <template #status-data="{ row }">
                <UBadge
                  :color="row.errorCode ? 'red' : 'green'"
                  variant="subtle"
                  size="sm"
                >
                  {{ row.errorCode ? 'Failed' : 'Success' }}
                </UBadge>
              </template>
            </UTable>
          </div>
        </UCard>
      </div>

      <!-- Service Usage -->
      <div v-else-if="viewMode === 'services'" class="space-y-6">
        <!-- Service Analytics Grid -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <UCard class="bg-gray-900 border border-gray-800">
            <div class="flex items-center p-4">
              <div class="flex-shrink-0">
                <UIcon name="i-heroicons-server" class="w-8 h-8 text-blue-400" />
              </div>
              <div class="ml-3">
                <p class="text-sm font-medium text-gray-400">Total API Calls</p>
                <p class="text-2xl font-semibold text-white">{{ serviceAnalytics.totalCalls }}</p>
              </div>
            </div>
          </UCard>

          <UCard class="bg-gray-900 border border-gray-800">
            <div class="flex items-center p-4">
              <div class="flex-shrink-0">
                <UIcon name="i-heroicons-building-office" class="w-8 h-8 text-green-400" />
              </div>
              <div class="ml-3">
                <p class="text-sm font-medium text-gray-400">Unique Services</p>
                <p class="text-2xl font-semibold text-white">{{ serviceAnalytics.uniqueServices }}</p>
              </div>
            </div>
          </UCard>

          <UCard class="bg-gray-900 border border-gray-800">
            <div class="flex items-center p-4">
              <div class="flex-shrink-0">
                <UIcon name="i-heroicons-star" class="w-8 h-8 text-purple-400" />
              </div>
              <div class="ml-3">
                <p class="text-sm font-medium text-gray-400">Most Active Service</p>
                <p class="text-lg font-semibold text-white truncate">{{ serviceAnalytics.mostActiveService }}</p>
              </div>
            </div>
          </UCard>

          <UCard class="bg-gray-900 border border-gray-800">
            <div class="flex items-center p-4">
              <div class="flex-shrink-0">
                <UIcon name="i-heroicons-exclamation-triangle" class="w-8 h-8 text-red-400" />
              </div>
              <div class="ml-3">
                <p class="text-sm font-medium text-gray-400">Services with Errors</p>
                <p class="text-2xl font-semibold text-white">{{ serviceAnalytics.servicesWithErrors }}</p>
              </div>
            </div>
          </UCard>
        </div>

        <!-- Service Usage Charts -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Service Usage Over Time -->
          <UCard class="bg-gray-900 border border-gray-800">
            <template #header>
              <div class="px-4 py-3">
                <h3 class="text-lg font-semibold text-white">Service Usage Over Time</h3>
                <p class="text-sm text-gray-400">API calls by service over time</p>
              </div>
            </template>
            <div class="p-6">
              <div class="h-64">
                <ClientOnly>
                  <apexchart
                    v-if="serviceUsageTimelineData.series.length > 0"
                    type="line"
                    height="100%"
                    :options="serviceUsageTimelineChartOptions"
                    :series="serviceUsageTimelineData.series"
                  />
                  <div v-else class="flex items-center justify-center h-full text-gray-400">
                    No service usage timeline data
                  </div>
                </ClientOnly>
              </div>
            </div>
          </UCard>

          <!-- Error Rate by Service -->
          <UCard class="bg-gray-900 border border-gray-800">
            <template #header>
              <div class="px-4 py-3">
                <h3 class="text-lg font-semibold text-white">Error Rate by Service</h3>
                <p class="text-sm text-gray-400">Percentage of failed API calls</p>
              </div>
            </template>
            <div class="p-6">
              <div class="h-64">
                <ClientOnly>
                  <apexchart
                    v-if="serviceErrorRateData.series.length > 0"
                    type="bar"
                    height="100%"
                    :options="serviceErrorRateChartOptions"
                    :series="serviceErrorRateData.series"
                  />
                  <div v-else class="flex items-center justify-center h-full text-gray-400">
                    No error rate data
                  </div>
                </ClientOnly>
              </div>
            </div>
          </UCard>
        </div>

        <!-- Service Usage Breakdown Table -->
        <UCard class="bg-gray-900 border border-gray-800">
          <template #header>
            <div class="px-4 py-3">
              <h3 class="text-lg font-semibold text-white">Service Usage Breakdown</h3>
              <p class="text-sm text-gray-400">Detailed service statistics</p>
            </div>
          </template>
          <UTable
            :rows="serviceAnalytics.topServices"
            :columns="[
              { key: 'name', label: 'Service', sortable: true },
              { key: 'count', label: 'API Calls', sortable: true },
              { key: 'errors', label: 'Errors', sortable: true },
              { key: 'errorRate', label: 'Error Rate', sortable: true },
              { key: 'lastUsed', label: 'Last Used', sortable: true }
            ]"
            class="w-full overflow-x-auto"
          >
            <template #name-data="{ row }">
              <span class="font-medium text-white">{{ row.name }}</span>
            </template>
            <template #count-data="{ row }">
              <span class="text-blue-400 font-medium">{{ row.count.toLocaleString() }}</span>
            </template>
            <template #errors-data="{ row }">
              <span :class="row.errors > 0 ? 'text-red-400' : 'text-gray-400'">{{ row.errors }}</span>
            </template>
            <template #errorRate-data="{ row }">
              <UBadge
                :color="row.errorRate > 10 ? 'red' : row.errorRate > 5 ? 'yellow' : 'green'"
                variant="subtle"
                size="sm"
              >
                {{ row.errorRate }}%
              </UBadge>
            </template>
            <template #lastUsed-data="{ row }">
              <span class="text-sm text-gray-400">{{ formatTimeAgo(row.lastUsed) }}</span>
            </template>
          </UTable>
        </UCard>
      </div>

      <!-- Security Events -->
      <div v-else-if="viewMode === 'security'" class="space-y-6">
        <!-- Security Risk Assessment -->
        <UCard class="bg-gray-900 border border-gray-800">
          <template #header>
            <div class="px-4 py-3">
              <h3 class="text-lg font-semibold text-white flex items-center gap-2">
                <UIcon name="i-heroicons-shield-exclamation" class="w-5 h-5 text-red-400" />
                Security Risk Assessment
              </h3>
            </div>
          </template>
          <div class="p-6">
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div class="flex items-center">
                <div class="flex-shrink-0">
                  <UIcon name="i-heroicons-x-circle" class="w-8 h-8 text-red-400" />
                </div>
                <div class="ml-3">
                  <p class="text-sm font-medium text-gray-400">Failed Actions</p>
                  <p class="text-2xl font-semibold text-white">{{ securityAnalytics.failedActions }}</p>
                </div>
              </div>
              <div class="flex items-center">
                <div class="flex-shrink-0">
                  <UIcon name="i-heroicons-key" class="w-8 h-8 text-yellow-400" />
                </div>
                <div class="ml-3">
                  <p class="text-sm font-medium text-gray-400">Privilege Changes</p>
                  <p class="text-2xl font-semibold text-white">{{ securityAnalytics.privilegeChanges }}</p>
                </div>
              </div>
              <div class="flex items-center">
                <div class="flex-shrink-0">
                  <UIcon name="i-heroicons-globe-alt" class="w-8 h-8 text-blue-400" />
                </div>
                <div class="ml-3">
                  <p class="text-sm font-medium text-gray-400">Unique IPs</p>
                  <p class="text-2xl font-semibold text-white">{{ securityAnalytics.unusualIPs }}</p>
                </div>
              </div>
              <div class="flex items-center">
                <div class="flex-shrink-0">
                  <UIcon name="i-heroicons-clock" class="w-8 h-8 text-orange-400" />
                </div>
                <div class="ml-3">
                  <p class="text-sm font-medium text-gray-400">Recent Failures</p>
                  <p class="text-2xl font-semibold text-white">{{ securityAnalytics.recentFailures }}</p>
                </div>
              </div>
            </div>
          </div>
        </UCard>

        <!-- Security Charts -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Failed Events Timeline -->
          <UCard class="bg-gray-900 border border-gray-800">
            <template #header>
              <div class="px-4 py-3">
                <h3 class="text-lg font-semibold text-white">Failed Events Timeline</h3>
                <p class="text-sm text-gray-400">Security events over time</p>
              </div>
            </template>
            <div class="p-6">
              <div class="h-64">
                <ClientOnly>
                  <apexchart
                    v-if="securityTimelineData.series.length > 0"
                    type="area"
                    height="100%"
                    :options="securityTimelineChartOptions"
                    :series="securityTimelineData.series"
                  />
                  <div v-else class="flex items-center justify-center h-full text-gray-400">
                    No security timeline data
                  </div>
                </ClientOnly>
              </div>
            </div>
          </UCard>

          <!-- Risk Distribution -->
          <UCard class="bg-gray-900 border border-gray-800">
            <template #header>
              <div class="px-4 py-3">
                <h3 class="text-lg font-semibold text-white">Risk Event Types</h3>
                <p class="text-sm text-gray-400">Distribution of security events</p>
              </div>
            </template>
            <div class="p-6">
              <div class="h-64">
                <ClientOnly>
                  <apexchart
                    v-if="riskDistributionData.series.length > 0"
                    type="donut"
                    height="100%"
                    :options="riskDistributionChartOptions"
                    :series="riskDistributionData.series"
                  />
                  <div v-else class="flex items-center justify-center h-full text-gray-400">
                    No risk distribution data
                  </div>
                </ClientOnly>
              </div>
            </div>
          </UCard>
        </div>

        <!-- Security Events Table -->
        <UCard class="bg-gray-900 border border-gray-800">
          <template #header>
            <div class="px-4 py-3">
              <h3 class="text-lg font-semibold text-white">Security-Related Events</h3>
              <p class="text-sm text-gray-400">Events requiring security attention</p>
            </div>
          </template>
          <div class="overflow-x-auto">
            <UTable
              :rows="securityEvents.slice(0, 50)"
              :columns="[
                { key: 'eventTime', label: 'Time', sortable: true },
                { key: 'eventName', label: 'Event', sortable: true },
                { key: 'sourceIPAddress', label: 'Source IP' },
                { key: 'errorCode', label: 'Error Code' },
                { key: 'riskLevel', label: 'Risk Level' }
              ]"
              class="w-full min-w-[700px]"
            >
              <template #eventTime-data="{ row }">
                <span class="text-sm text-gray-300 whitespace-nowrap">{{ formatDateTime(row.eventTime) }}</span>
              </template>
              <template #eventName-data="{ row }">
                <span class="text-sm text-white truncate max-w-[150px] block">{{ row.eventName }}</span>
              </template>
              <template #sourceIPAddress-data="{ row }">
                <span class="text-sm text-blue-400 font-mono">{{ row.sourceIPAddress || 'N/A' }}</span>
              </template>
              <template #errorCode-data="{ row }">
                <span class="text-sm text-red-400">{{ row.errorCode || 'None' }}</span>
              </template>
              <template #riskLevel-data="{ row }">
                <UBadge
                  :color="getRiskColor(row) as any"
                  variant="subtle"
                  size="sm"
                >
                  {{ getRiskLevel(row) }}
                </UBadge>
              </template>
            </UTable>
          </div>
        </UCard>
      </div>

      <!-- Compliance -->
      <div v-else-if="viewMode === 'compliance'" class="space-y-6">
        <!-- Compliance Report Summary -->
        <UCard class="bg-gray-900 border border-gray-800">
          <template #header>
            <div class="px-4 py-3">
              <h3 class="text-lg font-semibold text-white flex items-center gap-2">
                <UIcon name="i-heroicons-document-check" class="w-5 h-5 text-green-400" />
                Compliance Report Summary
              </h3>
            </div>
          </template>
          <div class="p-6">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div class="text-center">
                <div class="text-3xl font-bold text-blue-400 mb-1">{{ complianceAnalytics.totalEvents }}</div>
                <div class="text-sm text-gray-400">Total Events</div>
              </div>
              <div class="text-center">
                <div class="text-3xl font-bold text-green-400 mb-1">{{ complianceAnalytics.dataAccessEvents }}</div>
                <div class="text-sm text-gray-400">Data Access Events</div>
              </div>
              <div class="text-center">
                <div class="text-3xl font-bold text-purple-400 mb-1">{{ complianceAnalytics.adminActions }}</div>
                <div class="text-sm text-gray-400">Administrative Actions</div>
              </div>
            </div>
          </div>
        </UCard>

        <!-- Compliance Charts -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Activity Over Time -->
          <UCard class="bg-gray-900 border border-gray-800">
            <template #header>
              <div class="px-4 py-3">
                <h3 class="text-lg font-semibold text-white">Activity Volume Over Time</h3>
                <p class="text-sm text-gray-400">Daily compliance-related activity</p>
              </div>
            </template>
            <div class="p-6">
              <div class="h-64">
                <ClientOnly>
                  <apexchart
                    v-if="complianceTimelineData.series.length > 0"
                    type="area"
                    height="100%"
                    :options="complianceTimelineChartOptions"
                    :series="complianceTimelineData.series"
                  />
                  <div v-else class="flex items-center justify-center h-full text-gray-400">
                    No compliance timeline data
                  </div>
                </ClientOnly>
              </div>
            </div>
          </UCard>

          <!-- Event Type Distribution -->
          <UCard class="bg-gray-900 border border-gray-800">
            <template #header>
              <div class="px-4 py-3">
                <h3 class="text-lg font-semibold text-white">Event Type Distribution</h3>
                <p class="text-sm text-gray-400">Breakdown by event category</p>
              </div>
            </template>
            <div class="p-6">
              <div class="h-64">
                <ClientOnly>
                  <apexchart
                    v-if="complianceDistributionData.series.length > 0"
                    type="bar"
                    height="100%"
                    :options="complianceDistributionChartOptions"
                    :series="complianceDistributionData.series"
                  />
                  <div v-else class="flex items-center justify-center h-full text-gray-400">
                    No event distribution data
                  </div>
                </ClientOnly>
              </div>
            </div>
          </UCard>
        </div>

        <!-- Detailed Activity Log -->
        <UCard class="bg-gray-900 border border-gray-800">
          <template #header>
            <div class="px-4 py-3">
              <h3 class="text-lg font-semibold text-white">Detailed Activity Log</h3>
              <p class="text-sm text-gray-400">Comprehensive audit trail for compliance</p>
            </div>
          </template>
          <div class="overflow-x-auto">
            <UTable
              :rows="complianceEvents.slice(0, 100)"
              :columns="[
                { key: 'eventTime', label: 'Time', sortable: true },
                { key: 'eventName', label: 'Event', sortable: true },
                { key: 'eventSource', label: 'Service', sortable: true },
                { key: 'awsRegion', label: 'Region' },
                { key: 'complianceCategory', label: 'Category' }
              ]"
              class="w-full min-w-[700px]"
            >
              <template #eventTime-data="{ row }">
                <span class="text-sm text-gray-300 whitespace-nowrap">{{ formatDateTime(row.eventTime) }}</span>
              </template>
              <template #eventName-data="{ row }">
                <span class="text-sm text-white truncate max-w-[150px] block">{{ row.eventName }}</span>
              </template>
              <template #eventSource-data="{ row }">
                <span class="text-blue-400 text-sm">{{ getCleanServiceName(row.eventSource) }}</span>
              </template>
              <template #awsRegion-data="{ row }">
                <span class="text-sm text-gray-400">{{ row.awsRegion || 'N/A' }}</span>
              </template>
              <template #complianceCategory-data="{ row }">
                <UBadge
                  :color="getComplianceColor(row) as any"
                  variant="subtle"
                  size="sm"
                >
                  {{ getComplianceCategory(row) }}
                </UBadge>
              </template>
            </UTable>
          </div>
        </UCard>

        <!-- Compliance Activity Log -->
        <div class="overflow-x-auto">
          <UTable 
            :rows="complianceAnalytics.events" 
            :columns="[
              { key: 'eventTime', label: 'Time', sortable: true },
              { key: 'eventName', label: 'Event', sortable: true },
              { key: 'eventSource', label: 'Service', sortable: true },
              { key: 'category', label: 'Category', sortable: true },
              { key: 'sourceIPAddress', label: 'IP Address', sortable: true }
            ]"
            class="w-full min-w-[700px]"
          >
            <template #eventTime-data="{ row }">
              <span class="whitespace-nowrap text-sm">{{ formatTimeAgo(row.eventTime) }}</span>
            </template>
            <template #eventName-data="{ row }">
              <span class="truncate max-w-[200px] block">{{ row.eventName }}</span>
            </template>
            <template #eventSource-data="{ row }">
              <span class="text-sm">{{ getCleanServiceName(row.eventSource) }}</span>
            </template>
            <template #category-data="{ row }">
              <UBadge :color="getComplianceColor(getComplianceCategory(row.eventName)) as any" variant="subtle">
                {{ getComplianceCategory(row.eventName) }}
              </UBadge>
            </template>
            <template #sourceIPAddress-data="{ row }">
              <span class="text-sm font-mono">{{ row.sourceIPAddress || 'N/A' }}</span>
            </template>
          </UTable>
        </div>
      </div>
    </div>

    <!-- Event Details Modal -->
    <UModal v-model="showEventDetails" :ui="{ width: 'sm:max-w-4xl' }">
      <UCard>
        <template #header>
          <div class="flex justify-between items-center">
            <h3 class="text-lg font-semibold text-white">Event Details</h3>
            <UButton
              icon="i-heroicons-x-mark"
              variant="ghost"
              @click="showEventDetails = false"
            />
          </div>
        </template>
        
        <div v-if="selectedEvent" class="space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-1">Event Name</label>
              <p class="text-sm text-gray-100">{{ selectedEvent.eventName }}</p>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-1">Event Time</label>
              <p class="text-sm text-gray-100">{{ formatDateTime(selectedEvent.eventTime) }}</p>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-1">Service</label>
              <p class="text-sm text-gray-100">{{ selectedEvent.eventSource }}</p>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-1">Region</label>
              <p class="text-sm text-gray-100">{{ selectedEvent.awsRegion }}</p>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-1">Account ID</label>
              <p class="text-sm text-gray-100">{{ selectedEvent.accountId }}</p>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-1">Source IP</label>
              <p class="text-sm text-gray-100">{{ selectedEvent.sourceIPAddress }}</p>
            </div>
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-1">User Identity</label>
            <pre class="text-xs text-gray-100 bg-gray-800 p-3 rounded border overflow-auto">{{ JSON.stringify(selectedEvent.userIdentity, null, 2) }}</pre>
          </div>
          
          <div v-if="selectedEvent.requestParameters">
            <label class="block text-sm font-medium text-gray-300 mb-1">Request Parameters</label>
            <pre class="text-xs text-gray-100 bg-gray-800 p-3 rounded border overflow-auto max-h-40">{{ JSON.stringify(selectedEvent.requestParameters, null, 2) }}</pre>
          </div>
          
          <div v-if="selectedEvent.errorCode">
            <label class="block text-sm font-medium text-gray-300 mb-1">Error Details</label>
            <div class="text-sm text-red-400 bg-red-900/20 p-3 rounded border">
              <p><strong>Error Code:</strong> {{ selectedEvent.errorCode }}</p>
              <p v-if="selectedEvent.errorMessage"><strong>Error Message:</strong> {{ selectedEvent.errorMessage }}</p>
            </div>
          </div>
        </div>
      </UCard>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, onBeforeUnmount } from 'vue'
import { getEmailPatternsFromSlug, getSearchTermsFromSlug, isValidUsername, convertToUsernameSlug } from '~/utils/userUtils'

// Types
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
  resources?: any[]
  requestParameters?: any
  responseElements?: any
  userIdentity: {
    type: string
    principalId: string
    arn: string
    accountId: string
    userName?: string
  }
}

interface UserProfile {
  userPrincipalName: string
  displayName: string
}

// Page setup
definePageMeta({
  keepalive: false,
  title: 'AWS Access History',
  description: 'View user AWS access history and CloudTrail events'
})

const route = useRoute()
const username = computed(() => route.params.username as string)

// Use custom breadcrumbs
const { setBreadcrumbs } = usePageBreadcrumbs()

// Update breadcrumbs when user profile is loaded
const updateBreadcrumbs = () => {
  if (userProfile.value) {
    setBreadcrumbs([
      { label: 'Dashboard', to: '/' },
      { label: 'User Search', to: '/account/user' },
      { label: userProfile.value.displayName, to: `/account/user/${username.value}` },
      { label: 'Access History', to: route.path }
    ])
  } else {
    // Fallback breadcrumbs while loading
    setBreadcrumbs([
      { label: 'Dashboard', to: '/' },
      { label: 'User Search', to: '/account/user' },
      { label: username.value, to: `/account/user/${username.value}` },
      { label: 'Access History', to: route.path }
    ])
  }
}

// Component state
const accessEvents = ref<AccessEvent[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const errorDetails = ref<string | null>(null)
const loadingMessage = ref('Searching CloudTrail logs...')
const testingConnection = ref(false)
const mounted = ref(false)

// View state
const viewMode = ref<'overview' | 'login' | 'services' | 'security' | 'compliance'>('overview')
const showEventDetails = ref(false)
const selectedEvent = ref<AccessEvent | null>(null)

// Pagination
const currentPage = ref(1)
const pageSize = ref(25)
const totalPages = computed(() => Math.ceil(accessEvents.value.length / pageSize.value))
const paginatedEvents = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return accessEvents.value.slice(start, end)
})

// Filter options
const selectedDateRange = ref('14d')
const selectedEventType = ref('all')
const selectedAccount = ref('all')
const selectedService = ref('all')

const dateRangeOptions = [
  { label: 'Last 24 hours', value: '1d' },
  { label: 'Last 7 days', value: '7d' },
  { label: 'Last 14 days', value: '14d' },
  { label: 'Last 30 days', value: '30d' },
  { label: 'Last 90 days', value: '90d' }
]

const eventTypeOptions = ref([
  { label: 'All Events', value: 'all' },
  { label: 'Console Sign-in', value: 'ConsoleLogin' },
  { label: 'API Calls', value: 'AwsApiCall' },
  { label: 'AssumeRole', value: 'AssumeRole' },
  { label: 'Errors Only', value: 'errors' }
])

const accountOptions = ref([
  { label: 'All Accounts', value: 'all' }
])

const serviceOptions = ref([
  { label: 'All Services', value: 'all' }
])

// User profile state
const userProfile = ref<UserProfile | null>(null)
const resolvedEmail = ref<string | null>(null)

// Composables for user lookup
const { user } = useOidcAuth()
const { fetchUserProfile, searchUsers } = useGraphApi()

// Computed properties for summary stats
const uniqueAccounts = computed(() => {
  if (!mounted.value || !accessEvents.value) return []
  const accounts = new Set(accessEvents.value.map(e => e.accountId).filter(Boolean))
  return Array.from(accounts)
})

const uniqueServices = computed(() => {
  if (!mounted.value || !accessEvents.value) return []
  const services = new Set(accessEvents.value.map(e => e.eventSource).filter(Boolean))
  return Array.from(services)
})

const errorEvents = computed(() => {
  if (!mounted.value || !accessEvents.value) return []
  return accessEvents.value.filter(e => e.errorCode)
})

// Simple view computed properties
const activityByPeriod = computed(() => {
  if (!mounted.value || !accessEvents.value.length) return []
  
  const periods = new Map<string, number>()
  const now = new Date()
  
  accessEvents.value.forEach(event => {
    const eventDate = new Date(event.eventTime)
    const diffHours = Math.floor((now.getTime() - eventDate.getTime()) / (1000 * 60 * 60))
    
    let periodKey = ''
    if (diffHours < 1) {
      periodKey = 'Last hour'
    } else if (diffHours < 24) {
      periodKey = `${diffHours}h ago`
    } else {
      const diffDays = Math.floor(diffHours / 24)
      if (diffDays === 1) {
        periodKey = 'Yesterday'
      } else if (diffDays < 7) {
        periodKey = `${diffDays} days ago`
      } else {
        const diffWeeks = Math.floor(diffDays / 7)
        periodKey = `${diffWeeks}w ago`
      }
    }
    
    periods.set(periodKey, (periods.get(periodKey) || 0) + 1)
  })
  
  return Array.from(periods.entries())
    .map(([period, count]) => ({ period, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
})

const maxPeriodCount = computed(() => {
  return Math.max(...activityByPeriod.value.map(p => p.count), 1)
})

const topServices = computed(() => {
  if (!mounted.value || !accessEvents.value.length) return []
  
  const services = new Map<string, { count: number, hasErrors: boolean }>()
  
  accessEvents.value.forEach(event => {
    const serviceName = event.eventSource || 'Unknown'
    const current = services.get(serviceName) || { count: 0, hasErrors: false }
    
    current.count++
    if (event.errorCode) {
      current.hasErrors = true
    }
    
    services.set(serviceName, current)
  })
  
  return Array.from(services.entries())
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
})

const recentEvents = computed(() => {
  if (!mounted.value || !accessEvents.value.length) return []
  
  return [...accessEvents.value]
    .sort((a, b) => new Date(b.eventTime).getTime() - new Date(a.eventTime).getTime())
    .slice(0, 10)
})

// Convert username slug to find actual user email
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
          
          // If no exact match, find best partial match
          const partialMatch = searchResults.find((u: any) => 
            u.userPrincipalName.toLowerCase().includes(usernameSlug.replace(/-/g, '.').toLowerCase()) ||
            u.userPrincipalName.toLowerCase().includes(usernameSlug.replace(/-/g, '').toLowerCase())
          )
          if (partialMatch) {
            console.log(`Found partial email match: ${email} -> ${partialMatch.userPrincipalName}`)
            return partialMatch
          }
        }
      } catch (err) {
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
      } catch (err) {
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

// Resolve user profile and email
const resolveUserProfile = async () => {
  if (!mounted.value || !user.value?.accessToken || !username.value) return

  try {
    loading.value = true
    error.value = null
    errorDetails.value = null
    loadingMessage.value = 'Resolving user profile...'

    // Find user by username slug
    const foundUser = await findUserByUsername(username.value)
    
    // Check if component is still mounted
    if (!mounted.value) return
    
    if (!foundUser) {
      error.value = 'User not found'
      errorDetails.value = 'Could not find a user matching the provided username. Please verify the username is correct.'
      return
    }

    // Get detailed profile
    const profile = await fetchUserProfile(foundUser.userPrincipalName, user.value.accessToken)
    
    // Check if component is still mounted
    if (!mounted.value) return
    
    userProfile.value = {
      userPrincipalName: profile.userPrincipalName || foundUser.userPrincipalName,
      displayName: profile.displayName || foundUser.displayName
    }

    // Set the resolved email for CloudWatch queries
    resolvedEmail.value = profile.userPrincipalName || foundUser.userPrincipalName
    
    console.log(`Resolved username slug "${username.value}" to email: ${resolvedEmail.value}`)

    // Update breadcrumbs with user's display name
    updateBreadcrumbs()

  } catch (err) {
    console.error('Error resolving user profile:', err)
    if (mounted.value) {
      error.value = 'Failed to resolve user'
      errorDetails.value = err instanceof Error ? err.message : 'Could not resolve the user profile'
    }
  } finally {
    if (mounted.value) {
      loading.value = false
    }
  }
}

// Load access history
const loadAccessHistory = async () => {
  if (!mounted.value) return
  
  // First ensure we have the resolved email
  if (!resolvedEmail.value) {
    await resolveUserProfile()
    if (!resolvedEmail.value || !mounted.value) {
      return // Error already set in resolveUserProfile
    }
  }

  try {
    loading.value = true
    error.value = null
    errorDetails.value = null
    loadingMessage.value = 'Searching CloudTrail logs...'

    // Update loading message based on selected range
    const rangeMessages: Record<string, string> = {
      '1d': 'Searching last 24 hours...',
      '7d': 'Searching last 7 days...',
      '14d': 'Searching last 14 days...',
      '30d': 'Searching last 30 days...',
      '90d': 'Searching last 90 days...'
    }
    
    loadingMessage.value = rangeMessages[selectedDateRange.value] || 'Searching CloudTrail logs...'

    console.log(`Searching CloudWatch for resolved email: ${resolvedEmail.value}`)

    // Use comprehensive query to get all data once
    const response: any = await $fetch('/api/aws/cloudtrail/user-access-history', {
      method: 'POST',
      body: {
        username: resolvedEmail.value, // Use the resolved email instead of the slug
        dateRange: selectedDateRange.value,
        eventType: 'all', // Get all events
        accountId: selectedAccount.value !== 'all' ? selectedAccount.value : undefined,
        eventSource: selectedService.value !== 'all' ? selectedService.value : undefined,
        queryType: 'comprehensive', // Optimized query for all data
        profile: 'govcloud' // Use GovCloud profile as specified
      }
    })

    // Check if component is still mounted before updating
    if (!mounted.value) return

    accessEvents.value = response.data?.events || []
    
    // Update filter options based on results
    updateFilterOptions(accessEvents.value)
    
    console.log(`Loaded ${accessEvents.value.length} events`)
    
  } catch (err: any) {
    console.error('Error loading access history:', err)
    
    // Only update state if component is still mounted
    if (!mounted.value) return
    
    // Handle specific error types
    if (err.message?.includes('timeout') || err.data?.message?.includes('timeout')) {
      error.value = 'CloudWatch Query Timeout'
      errorDetails.value = 'The query took longer than 30 seconds. Try reducing the date range or applying more specific filters to limit the search scope.'
    } else if (err.message?.includes('permission') || err.message?.includes('access')) {
      error.value = 'Permission Error'
      errorDetails.value = 'Unable to access CloudWatch logs. Please verify AWS credentials and permissions for CloudWatch Log Insights.'
    } else if (err.message?.includes('log group') || err.message?.includes('not found')) {
      error.value = 'Log Group Not Found'
      errorDetails.value = 'The CloudWatch log group "aws-cloudtrail-logs-374673712317-d7a04176" was not found. Please verify CloudTrail is configured to send logs to CloudWatch.'
    } else {
      error.value = 'Failed to load access history'
      errorDetails.value = err.data?.message || err.message || 'An unexpected error occurred while querying CloudTrail logs.'
    }
  } finally {
    if (mounted.value) {
      loading.value = false
    }
  }
}

// Update filter options based on loaded data
const updateFilterOptions = (events: AccessEvent[]) => {
  if (!mounted.value || !events) return
  
  // Extract unique accounts
  const accounts = [...new Set(events.map(e => e.accountId))]
    .filter(Boolean)
    .map(accountId => ({
      label: `${accountId}`,
      value: accountId
    }))
  
  accountOptions.value = [
    { label: 'All Accounts', value: 'all' },
    ...accounts
  ]

  // Extract unique services
  const services = [...new Set(events.map(e => e.eventSource))]
    .filter(Boolean)
    .sort()
    .map(service => ({
      label: service.replace('.amazonaws.com', ''),
      value: service
    }))
  
  serviceOptions.value = [
    { label: 'All Services', value: 'all' },
    ...services
  ]
}

// Utility functions
const refreshData = () => {
  if (!mounted.value) return
  currentPage.value = 1
  loadAccessHistory()
}

const resetFilters = () => {
  if (!mounted.value) return
  selectedDateRange.value = '14d'
  selectedEventType.value = 'all'
  selectedAccount.value = 'all'
  selectedService.value = 'all'
  currentPage.value = 1
  loadAccessHistory()
}

const viewEventDetails = (event: AccessEvent) => {
  if (!mounted.value) return
  selectedEvent.value = event
  showEventDetails.value = true
}

const exportAccessHistory = () => {
  if (!mounted.value || !accessEvents.value || accessEvents.value.length === 0) {
    console.warn('No access history data to export')
    return
  }

  // Create CSV headers
  const headers = [
    'Event Time',
    'Event Name',
    'Event Source',
    'AWS Region',
    'Source IP Address',
    'User Agent',
    'Error Code',
    'Error Message',
    'Event Type',
    'Account ID',
    'Response Elements'
  ]

  // Convert events to CSV rows
  const rows = accessEvents.value.map(event => [
    event.eventTime ? new Date(event.eventTime).toLocaleString() : '',
    event.eventName || '',
    event.eventSource || '',
    event.awsRegion || '',
    event.sourceIPAddress || '',
    event.userAgent || '',
    event.errorCode || '',
    event.errorMessage || '',
    event.eventCategory || event.eventType || '',
    event.recipientAccountId || '',
    event.responseElements ? JSON.stringify(event.responseElements) : ''
  ])

  // Escape CSV fields
  const escapeCsvField = (field: string): string => {
    if (!field) return '""'
    
    // If field contains comma, quote, or newline, wrap in quotes and escape quotes
    if (field.includes(',') || field.includes('"') || field.includes('\n')) {
      return `"${field.replace(/"/g, '""')}"`
    }
    
    return field
  }

  // Build CSV content
  const csvContent = [
    headers.map(escapeCsvField).join(','),
    ...rows.map(row => row.map(escapeCsvField).join(','))
  ].join('\n')

  // Create filename
  const username = userProfile.value?.displayName || route.params.username
  const dateRange = selectedDateRange.value === 'last24h' ? '24h' : 
                   selectedDateRange.value === 'last7d' ? '7d' : 
                   selectedDateRange.value === 'last30d' ? '30d' : 'custom'
  const filename = `access-history-${username?.replace(/\s+/g, '-').toLowerCase()}-${dateRange}-${new Date().toISOString().split('T')[0]}.csv`

  // Download CSV
  try {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob)
      link.setAttribute('href', url)
      link.setAttribute('download', filename)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } else {
      // Fallback for older browsers
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
      URL.revokeObjectURL(url)
    }
  } catch (error) {
    console.error('Failed to download access history CSV:', error)
    alert('Failed to export access history. Please try again.')
  }
}

// Utility function for formatting date time
const formatDateTime = (dateString: string) => {
  try {
    const date = new Date(dateString)
    return date.toLocaleString()
  } catch {
    return dateString
  }
}

const formatTimeAgo = (dateString: string) => {
  try {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMinutes = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    
    if (diffMinutes < 1) {
      return 'Just now'
    } else if (diffMinutes < 60) {
      return `${diffMinutes}m ago`
    } else if (diffHours < 24) {
      return `${diffHours}h ago`
    } else if (diffDays < 7) {
      return `${diffDays}d ago`
    } else {
      return date.toLocaleDateString()
    }
  } catch {
    return dateString
  }
}

// Watch for route changes with better lifecycle management
let routeWatchStop: (() => void) | null = null

const setupRouteWatch = () => {
  routeWatchStop = watch(() => route.params.username, async (newUsername) => {
    if (!newUsername || !mounted.value) return
    // username is computed from route.params, no need to assign it
    resolvedEmail.value = ''
    await resolveUserProfile()
    await loadAccessHistory()
  }, { immediate: true })
}

// Page lifecycle
onMounted(async () => {
  mounted.value = true
  setupRouteWatch()
})

onBeforeUnmount(() => {
  mounted.value = false
  if (routeWatchStop) {
    routeWatchStop()
  }
})

// Use-case specific computed properties
const loginEvents = computed(() => {
  if (!mounted.value || !accessEvents.value) return []
  return accessEvents.value.filter(event => 
    event.eventName?.includes('Login') || 
    event.eventName?.includes('AssumeRole') ||
    event.eventName?.includes('GetSessionToken') ||
    event.eventSource?.includes('signin') ||
    event.eventSource?.includes('sts')
  ).sort((a, b) => new Date(b.eventTime).getTime() - new Date(a.eventTime).getTime())
})

const serviceEvents = computed(() => {
  if (!mounted.value || !accessEvents.value) return []
  return accessEvents.value.filter(event => 
    !event.eventName?.includes('Login') && 
    !event.eventName?.includes('AssumeRole') &&
    event.eventName !== 'GetSessionToken'
  )
})

const securityEvents = computed(() => {
  if (!mounted.value || !accessEvents.value) return []
  return accessEvents.value.filter(event => 
    event.errorCode || 
    event.eventName?.includes('Policy') ||
    event.eventName?.includes('Role') ||
    event.eventName?.includes('User') ||
    event.eventName?.includes('Permission') ||
    event.eventName?.includes('Group') ||
    event.sourceIPAddress?.includes('unknown') ||
    event.eventName?.includes('Delete') ||
    event.eventName?.includes('Attach') ||
    event.eventName?.includes('Detach')
  ).sort((a, b) => new Date(b.eventTime).getTime() - new Date(a.eventTime).getTime())
})

// Login Analytics
const loginAnalytics = computed(() => {
  const logins = loginEvents.value
  const successful = logins.filter(e => !e.errorCode)
  const failed = logins.filter(e => e.errorCode)
  
  // Group by day for pattern analysis
  const dailyLogins = new Map<string, { successful: number, failed: number }>()
  logins.forEach(event => {
    const day = new Date(event.eventTime).toDateString()
    const current = dailyLogins.get(day) || { successful: 0, failed: 0 }
    if (event.errorCode) {
      current.failed++
    } else {
      current.successful++
    }
    dailyLogins.set(day, current)
  })
  
  // Unique locations/IPs
  const uniqueIPs = new Set(logins.map(e => e.sourceIPAddress).filter(Boolean))
  
  // Peak login hours
  const hourCounts = new Array(24).fill(0)
  successful.forEach(event => {
    const hour = new Date(event.eventTime).getHours()
    hourCounts[hour]++
  })
  const peakHour = hourCounts.indexOf(Math.max(...hourCounts))
  
  return {
    totalLogins: logins.length,
    successfulLogins: successful.length,
    failedLogins: failed.length,
    successRate: logins.length ? Math.round((successful.length / logins.length) * 100) : 0,
    uniqueLocations: uniqueIPs.size,
    dailyPattern: Array.from(dailyLogins.entries()).map(([date, counts]) => ({
      date: new Date(date).toLocaleDateString(),
      ...counts
    })).slice(-14), // Last 14 days
    peakHour: peakHour,
    lastLogin: successful[0]?.eventTime
  }
})

// Service Usage Analytics
const serviceAnalytics = computed(() => {
  const services = serviceEvents.value
  
  // Group by service
  const serviceUsage = new Map<string, { count: number, errors: number, lastUsed: string }>()
  services.forEach(event => {
    const serviceName = event.eventSource?.replace('.amazonaws.com', '') || 'Unknown'
    const current = serviceUsage.get(serviceName) || { count: 0, errors: 0, lastUsed: event.eventTime }
    current.count++
    if (event.errorCode) current.errors++
    if (new Date(event.eventTime) > new Date(current.lastUsed)) {
      current.lastUsed = event.eventTime
    }
    serviceUsage.set(serviceName, current)
  })
  
  // Most active services
  const topServices = Array.from(serviceUsage.entries())
    .map(([name, data]) => ({ 
      name, 
      ...data,
      errorRate: data.count ? Math.round((data.errors / data.count) * 100) : 0
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
  
  // Usage trend over time
  const dailyUsage = new Map<string, number>()
  services.forEach(event => {
    const day = new Date(event.eventTime).toDateString()
    dailyUsage.set(day, (dailyUsage.get(day) || 0) + 1)
  })
  
  return {
    totalCalls: services.length,
    uniqueServices: serviceUsage.size,
    topServices,
    dailyUsage: Array.from(dailyUsage.entries())
      .map(([date, count]) => ({ date: new Date(date).toLocaleDateString(), count }))
      .slice(-14),
    mostActiveService: topServices[0]?.name || 'N/A',
    servicesWithErrors: topServices.filter(s => s.errors > 0).length
  }
})

// Security Risk Assessment
const securityAnalytics = computed(() => {
  const security = securityEvents.value
  const allEvents = accessEvents.value
  
  const failedActions = security.filter(e => e.errorCode).length
  const privilegeChanges = security.filter(e => 
    e.eventName?.includes('Role') || 
    e.eventName?.includes('Policy') ||
    e.eventName?.includes('User')
  ).length
  
  const unusualIPs = new Set(allEvents.map(e => e.sourceIPAddress).filter(Boolean))
  const multipleIPs = unusualIPs.size > 3
  
  const recentFailures = security.filter(e => 
    e.errorCode && 
    new Date(e.eventTime) > new Date(Date.now() - 24 * 60 * 60 * 1000)
  ).length
  
  // Risk score calculation
  let riskScore = 0
  if (failedActions > 10) riskScore += 3
  else if (failedActions > 5) riskScore += 2
  else if (failedActions > 0) riskScore += 1
  
  if (privilegeChanges > 0) riskScore += 2
  if (multipleIPs) riskScore += 1
  if (recentFailures > 5) riskScore += 2
  
  const riskLevel = riskScore >= 5 ? 'High' : riskScore >= 3 ? 'Medium' : riskScore >= 1 ? 'Low' : 'Minimal'
  const riskColor = riskScore >= 5 ? 'red' : riskScore >= 3 ? 'orange' : riskScore >= 1 ? 'yellow' : 'green'
  
  return {
    riskScore,
    riskLevel,
    riskColor,
    failedActions,
    privilegeChanges,
    unusualIPs: unusualIPs.size,
    recentFailures,
    securityEvents: security.slice(0, 10)
  }
})

// Compliance Events
const complianceEvents = computed(() => {
  if (!mounted.value || !accessEvents.value) return []
  return accessEvents.value.filter(event => 
    event.eventName?.includes('Get') || 
    event.eventName?.includes('Describe') || 
    event.eventName?.includes('List') ||
    event.eventName?.includes('Create') || 
    event.eventName?.includes('Delete') || 
    event.eventName?.includes('Put') || 
    event.eventName?.includes('Update')
  ).sort((a, b) => new Date(b.eventTime).getTime() - new Date(a.eventTime).getTime())
})

// Compliance Summary
const complianceAnalytics = computed(() => {
  const all = accessEvents.value
  
  const dataAccess = all.filter(event => 
    event.eventName.includes('Get') || 
    event.eventName.includes('Describe') || 
    event.eventName.includes('List')
  )
  
  const adminActions = all.filter(event => 
    event.eventName.includes('Create') || 
    event.eventName.includes('Delete') || 
    event.eventName.includes('Put') || 
    event.eventName.includes('Update')
  )
  
  return {
    totalEvents: all.length,
    dataAccessEvents: dataAccess.length,
    adminActions: adminActions.length,
    timeRange: selectedDateRange.value,
    generatedAt: new Date().toISOString()
  }
})

// Chart Data Computed Properties
const loginTrendData = computed(() => {
  const loginEvents = accessEvents.value.filter(event => 
    event.eventName.includes('ConsoleLogin') || 
    event.eventName.includes('AssumeRole') ||
    event.eventName.includes('GetSessionToken')
  )
  
  const dailyLogins = new Map()
  loginEvents.forEach(event => {
    const date = new Date(event.eventTime).toISOString().split('T')[0]
    dailyLogins.set(date, (dailyLogins.get(date) || 0) + 1)
  })
  
  const sortedDates = Array.from(dailyLogins.keys()).sort()
  const data = sortedDates.map(date => dailyLogins.get(date) || 0)
  const categories = sortedDates.map(date => new Date(date).toLocaleDateString())
  
  return {
    series: [{
      name: 'Login Events',
      data: data
    }],
    categories: categories
  }
})

const serviceDistributionData = computed(() => {
  const serviceUsage = new Map()
  
  accessEvents.value.forEach(event => {
    const service = getCleanServiceName(event.eventSource || 'unknown')
    serviceUsage.set(service, (serviceUsage.get(service) || 0) + 1)
  })
  
  const sortedServices = Array.from(serviceUsage.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
  
  return {
    series: sortedServices.map(([_, count]) => count),
    labels: sortedServices.map(([service, _]) => service)
  }
})

const activityHeatmapData = computed(() => {
  const hourlyActivity = new Map()
  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  
  // Initialize all hours for all days
  daysOfWeek.forEach(day => {
    for (let hour = 0; hour < 24; hour++) {
      hourlyActivity.set(`${day}-${hour}`, 0)
    }
  })
  
  accessEvents.value.forEach(event => {
    const date = new Date(event.eventTime)
    const day = daysOfWeek[date.getDay()]
    const hour = date.getHours()
    const key = `${day}-${hour}`
    hourlyActivity.set(key, (hourlyActivity.get(key) || 0) + 1)
  })
  
  const series = daysOfWeek.map(day => {
    const data = []
    for (let hour = 0; hour < 24; hour++) {
      data.push({
        x: `${hour}:00`,
        y: hourlyActivity.get(`${day}-${hour}`) || 0
      })
    }
    return {
      name: day,
      data: data
    }
  })
  
  return { series }
})

const loginTimelineData = computed(() => {
  const logins = loginEvents.value
  const dailyStats = new Map()
  
  logins.forEach(event => {
    const date = new Date(event.eventTime).toISOString().split('T')[0]
    if (!dailyStats.has(date)) {
      dailyStats.set(date, { success: 0, failed: 0 })
    }
    const stats = dailyStats.get(date)
    if (event.errorCode) {
      stats.failed += 1
    } else {
      stats.success += 1
    }
  })
  
  const sortedDates = Array.from(dailyStats.keys()).sort()
  
  return {
    series: [
      {
        name: 'Successful Logins',
        data: sortedDates.map(date => dailyStats.get(date)?.success || 0)
      },
      {
        name: 'Failed Logins',
        data: sortedDates.map(date => dailyStats.get(date)?.failed || 0)
      }
    ],
    categories: sortedDates.map(date => new Date(date).toLocaleDateString())
  }
})

const ipDistributionData = computed(() => {
  const ipCounts = new Map()
  
  loginEvents.value.forEach(event => {
    if (event.sourceIPAddress) {
      ipCounts.set(event.sourceIPAddress, (ipCounts.get(event.sourceIPAddress) || 0) + 1)
    }
  })
  
  const sortedIPs = Array.from(ipCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
  
  return {
    series: [{
      name: 'Login Attempts',
      data: sortedIPs.map(([_, count]) => count)
    }],
    categories: sortedIPs.map(([ip, _]) => ip)
  }
})

const serviceUsageTimelineData = computed(() => {
  const topServices = serviceAnalytics.value.topServices.slice(0, 5)
  const dailyUsage = new Map()
  
  accessEvents.value.forEach(event => {
    const service = getCleanServiceName(event.eventSource || 'unknown')
    const date = new Date(event.eventTime).toISOString().split('T')[0]
    const key = `${service}-${date}`
    dailyUsage.set(key, (dailyUsage.get(key) || 0) + 1)
  })
  
  const dates = Array.from(new Set(
    accessEvents.value.map(e => new Date(e.eventTime).toISOString().split('T')[0])
  )).sort()
  
  const series = topServices.map(service => ({
    name: service.name,
    data: dates.map(date => dailyUsage.get(`${service.name}-${date}`) || 0)
  }))
  
  return {
    series,
    categories: dates.map(date => new Date(date).toLocaleDateString())
  }
})

const serviceErrorRateData = computed(() => {
  const services = serviceAnalytics.value.topServices.slice(0, 10)
  
  return {
    series: [{
      name: 'Error Rate (%)',
      data: services.map(service => service.errorRate)
    }],
    categories: services.map(service => service.name)
  }
})

const securityTimelineData = computed(() => {
  const security = securityEvents.value
  const dailyFailures = new Map()
  
  security.forEach(event => {
    const date = new Date(event.eventTime).toISOString().split('T')[0]
    dailyFailures.set(date, (dailyFailures.get(date) || 0) + 1)
  })
  
  const sortedDates = Array.from(dailyFailures.keys()).sort()
  
  return {
    series: [{
      name: 'Security Events',
      data: sortedDates.map(date => dailyFailures.get(date) || 0)
    }],
    categories: sortedDates.map(date => new Date(date).toLocaleDateString())
  }
})

const riskDistributionData = computed(() => {
  const riskTypes = new Map()
  
  securityEvents.value.forEach(event => {
    const type = getRiskLevel(event)
    riskTypes.set(type, (riskTypes.get(type) || 0) + 1)
  })
  
  const sortedTypes = Array.from(riskTypes.entries())
  
  return {
    series: sortedTypes.map(([_, count]) => count),
    labels: sortedTypes.map(([type, _]) => type)
  }
})

const complianceTimelineData = computed(() => {
  const compliance = complianceEvents.value
  const dailyActivity = new Map()
  
  compliance.forEach(event => {
    const date = new Date(event.eventTime).toISOString().split('T')[0]
    dailyActivity.set(date, (dailyActivity.get(date) || 0) + 1)
  })
  
  const sortedDates = Array.from(dailyActivity.keys()).sort()
  
  return {
    series: [{
      name: 'Compliance Events',
      data: sortedDates.map(date => dailyActivity.get(date) || 0)
    }],
    categories: sortedDates.map(date => new Date(date).toLocaleDateString())
  }
})

const complianceDistributionData = computed(() => {
  const eventTypes = new Map()
  
  complianceEvents.value.forEach(event => {
    const category = getComplianceCategory(event)
    eventTypes.set(category, (eventTypes.get(category) || 0) + 1)
  })
  
  const sortedTypes = Array.from(eventTypes.entries())
    .sort((a, b) => b[1] - a[1])
  
  return {
    series: [{
      name: 'Event Count',
      data: sortedTypes.map(([_, count]) => count)
    }],
    categories: sortedTypes.map(([type, _]) => type)
  }
})

// Chart Options
const loginTrendChartOptions = computed(() => ({
  chart: {
    type: 'line',
    background: 'transparent',
    toolbar: { show: false }
  },
  theme: { mode: 'dark' },
  stroke: {
    curve: 'smooth',
    width: 3
  },
  colors: ['#3B82F6'],
  xaxis: {
    categories: loginTrendData.value.categories,
    labels: { style: { colors: '#9CA3AF' } }
  },
  yaxis: {
    labels: { style: { colors: '#9CA3AF' } }
  },
  grid: {
    borderColor: '#374151',
    strokeDashArray: 3
  },
  dataLabels: { enabled: false },
  tooltip: {
    theme: 'dark',
    style: { fontSize: '12px' }
  }
}))

const serviceDistributionChartOptions = computed(() => ({
  chart: {
    type: 'donut',
    background: 'transparent'
  },
  theme: { mode: 'dark' },
  labels: serviceDistributionData.value.labels,
  colors: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#84CC16', '#F97316'],
  legend: {
    position: 'bottom',
    labels: { colors: '#9CA3AF' }
  },
  dataLabels: {
    enabled: true,
    style: { colors: ['#FFFFFF'] }
  },
  tooltip: {
    theme: 'dark',
    style: { fontSize: '12px' }
  }
}))

const activityHeatmapChartOptions = computed(() => ({
  chart: {
    type: 'heatmap',
    background: 'transparent',
    toolbar: { show: false }
  },
  theme: { mode: 'dark' },
  colors: ['#3B82F6'],
  xaxis: {
    labels: { style: { colors: '#9CA3AF' } }
  },
  yaxis: {
    labels: { style: { colors: '#9CA3AF' } }
  },
  grid: {
    borderColor: '#374151'
  },
  dataLabels: { enabled: false },
  tooltip: {
    theme: 'dark',
    style: { fontSize: '12px' }
  }
}))

const loginTimelineChartOptions = computed(() => ({
  chart: {
    type: 'area',
    background: 'transparent',
    toolbar: { show: false },
    stacked: false
  },
  theme: { mode: 'dark' },
  colors: ['#10B981', '#EF4444'],
  stroke: {
    curve: 'smooth',
    width: 2
  },
  fill: {
    type: 'gradient',
    opacity: 0.3
  },
  xaxis: {
    categories: loginTimelineData.value.categories,
    labels: { style: { colors: '#9CA3AF' } }
  },
  yaxis: {
    labels: { style: { colors: '#9CA3AF' } }
  },
  grid: {
    borderColor: '#374151',
    strokeDashArray: 3
  },
  dataLabels: { enabled: false },
  legend: {
    labels: { colors: '#9CA3AF' }
  },
  tooltip: {
    theme: 'dark',
    style: { fontSize: '12px' }
  }
}))

const ipDistributionChartOptions = computed(() => ({
  chart: {
    type: 'bar',
    background: 'transparent',
    toolbar: { show: false }
  },
  theme: { mode: 'dark' },
  colors: ['#8B5CF6'],
  plotOptions: {
    bar: {
      horizontal: true,
      borderRadius: 4
    }
  },
  xaxis: {
    categories: ipDistributionData.value.categories,
    labels: { style: { colors: '#9CA3AF' } }
  },
  yaxis: {
    labels: { style: { colors: '#9CA3AF' } }
  },
  grid: {
    borderColor: '#374151',
    strokeDashArray: 3
  },
  dataLabels: { enabled: false },
  tooltip: {
    theme: 'dark',
    style: { fontSize: '12px' }
  }
}))

const serviceUsageTimelineChartOptions = computed(() => ({
  chart: {
    type: 'line',
    background: 'transparent',
    toolbar: { show: false }
  },
  theme: { mode: 'dark' },
  colors: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'],
  stroke: {
    curve: 'smooth',
    width: 3
  },
  xaxis: {
    categories: serviceUsageTimelineData.value.categories,
    labels: { style: { colors: '#9CA3AF' } }
  },
  yaxis: {
    labels: { style: { colors: '#9CA3AF' } }
  },
  grid: {
    borderColor: '#374151',
    strokeDashArray: 3
  },
  dataLabels: { enabled: false },
  legend: {
    labels: { colors: '#9CA3AF' }
  },
  tooltip: {
    theme: 'dark',
    style: { fontSize: '12px' }
  }
}))

const serviceErrorRateChartOptions = computed(() => ({
  chart: {
    type: 'bar',
    background: 'transparent',
    toolbar: { show: false }
  },
  theme: { mode: 'dark' },
  colors: ['#EF4444'],
  plotOptions: {
    bar: {
      borderRadius: 4,
      columnWidth: '60%'
    }
  },
  xaxis: {
    categories: serviceErrorRateData.value.categories,
    labels: { style: { colors: '#9CA3AF' } }
  },
  yaxis: {
    labels: { style: { colors: '#9CA3AF' } },
    title: {
      text: 'Error Rate (%)',
      style: { color: '#9CA3AF' }
    }
  },
  grid: {
    borderColor: '#374151',
    strokeDashArray: 3
  },
  dataLabels: { enabled: false },
  tooltip: {
    theme: 'dark',
    style: { fontSize: '12px' }
  }
}))

const securityTimelineChartOptions = computed(() => ({
  chart: {
    type: 'area',
    background: 'transparent',
    toolbar: { show: false }
  },
  theme: { mode: 'dark' },
  colors: ['#EF4444'],
  stroke: {
    curve: 'smooth',
    width: 3
  },
  fill: {
    type: 'gradient',
    opacity: 0.4
  },
  xaxis: {
    categories: securityTimelineData.value.categories,
    labels: { style: { colors: '#9CA3AF' } }
  },
  yaxis: {
    labels: { style: { colors: '#9CA3AF' } }
  },
  grid: {
    borderColor: '#374151',
    strokeDashArray: 3
  },
  dataLabels: { enabled: false },
  tooltip: {
    theme: 'dark',
    style: { fontSize: '12px' }
  }
}))

const riskDistributionChartOptions = computed(() => ({
  chart: {
    type: 'donut',
    background: 'transparent'
  },
  theme: { mode: 'dark' },
  labels: riskDistributionData.value.labels,
  colors: ['#EF4444', '#F59E0B', '#10B981'],
  legend: {
    position: 'bottom',
    labels: { colors: '#9CA3AF' }
  },
  dataLabels: {
    enabled: true,
    style: { colors: ['#FFFFFF'] }
  },
  tooltip: {
    theme: 'dark',
    style: { fontSize: '12px' }
  }
}))

const complianceTimelineChartOptions = computed(() => ({
  chart: {
    type: 'area',
    background: 'transparent',
    toolbar: { show: false }
  },
  theme: { mode: 'dark' },
  colors: ['#10B981'],
  stroke: {
    curve: 'smooth',
    width: 3
  },
  fill: {
    type: 'gradient',
    opacity: 0.3
  },
  xaxis: {
    categories: complianceTimelineData.value.categories,
    labels: { style: { colors: '#9CA3AF' } }
  },
  yaxis: {
    labels: { style: { colors: '#9CA3AF' } }
  },
  grid: {
    borderColor: '#374151',
    strokeDashArray: 3
  },
  dataLabels: { enabled: false },
  tooltip: {
    theme: 'dark',
    style: { fontSize: '12px' }
  }
}))

const complianceDistributionChartOptions = computed(() => ({
  chart: {
    type: 'bar',
    background: 'transparent',
    toolbar: { show: false }
  },
  theme: { mode: 'dark' },
  colors: ['#10B981'],
  plotOptions: {
    bar: {
      borderRadius: 4,
      columnWidth: '70%'
    }
  },
  xaxis: {
    categories: complianceDistributionData.value.categories,
    labels: { style: { colors: '#9CA3AF' } }
  },
  yaxis: {
    labels: { style: { colors: '#9CA3AF' } }
  },
  grid: {
    borderColor: '#374151',
    strokeDashArray: 3
  },
  dataLabels: { enabled: false },
  tooltip: {
    theme: 'dark',
    style: { fontSize: '12px' }
  }
}))

// Chart Helper Functions
const getRiskLevel = (event: any): string => {
  if (event.errorCode) {
    // Categorize based on error codes
    if (event.errorCode.includes('AccessDenied') || event.errorCode.includes('Unauthorized')) {
      return 'High Risk'
    } else if (event.errorCode.includes('Throttling') || event.errorCode.includes('ServiceUnavailable')) {
      return 'Low Risk'
    } else {
      return 'Medium Risk'
    }
  }
  
  // Categorize based on event names
  if (event.eventName?.includes('Delete') || event.eventName?.includes('Terminate')) {
    return 'High Risk'
  } else if (event.eventName?.includes('Create') || event.eventName?.includes('Put')) {
    return 'Medium Risk'
  } else {
    return 'Low Risk'
  }
}

const getComplianceCategory = (event: any): string => {
  const eventName = event.eventName || event
  if (typeof eventName === 'string') {
    if (eventName.includes('Get') || eventName.includes('Describe') || eventName.includes('List')) {
      return 'Data Access'
    } else if (eventName.includes('Create') || eventName.includes('Delete') || eventName.includes('Put') || eventName.includes('Update')) {
      return 'Configuration'
    } else if (eventName.includes('Policy') || eventName.includes('Role') || eventName.includes('User')) {
      return 'Security'
    } else if (eventName.includes('CloudWatch') || eventName.includes('CloudTrail')) {
      return 'Monitoring'
    } else {
      return 'Other'
    }
  }
  return 'Other'
}

const getCleanServiceName = (eventSource: string): string => {
  if (!eventSource) return 'Unknown'
  return eventSource.replace('.amazonaws.com', '').replace('amazonaws.com', '').replace('.', ' ').toUpperCase()
}

/**
 * Get risk color for badges
 */
function getRiskColor(riskLevel: string): string {
  switch (riskLevel.toLowerCase()) {
    case 'high':
      return 'red'
    case 'medium':
      return 'orange'
    case 'low':
      return 'yellow'
    case 'minimal':
      return 'green'
    default:
      return 'gray'
  }
}

/**
 * Get compliance color for badges
 */
function getComplianceColor(category: string): string {
  switch (category.toLowerCase()) {
    case 'data access':
      return 'blue'
    case 'configuration':
      return 'purple'
    case 'security':
      return 'red'
    case 'monitoring':
      return 'green'
    case 'other':
      return 'gray'
    default:
      return 'gray'
  }
}

// Initialize component
onMounted(() => {
  mounted.value = true
  updateBreadcrumbs() // Set initial breadcrumbs
  loadAccessHistory() // Load initial data
})

// Clean up on unmount
onBeforeUnmount(() => {
  mounted.value = false
})
</script> 