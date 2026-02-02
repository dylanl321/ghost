<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <!-- Access Denied -->
    <div v-if="!hasAdminAccess" class="flex items-center justify-center min-h-screen p-6">
      <UCard class="max-w-2xl">
        <div class="p-8 text-center">
          <Icon name="i-heroicons-shield-exclamation" class="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Access Denied
          </h1>
          <p class="text-gray-600 dark:text-gray-400 mb-6">
            Support Tools are restricted to administrators only.
          </p>
          <UButton color="emerald" @click="navigateTo('/')">
            <Icon name="i-heroicons-home" class="w-4 h-4 mr-2" />
            Go to Dashboard
          </UButton>
        </div>
      </UCard>
    </div>

    <!-- Support Tools Content -->
    <div v-else class="container mx-auto px-6 py-8 max-w-7xl">
      <!-- Header -->
      <div class="mb-6">
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Support Tools
        </h1>
        <p class="text-gray-600 dark:text-gray-400">
          Quick access to investigation and debugging tools for AWS resources
        </p>
      </div>

      <!-- Global Context Bar -->
      <SupportContextBar class="mb-6" />

      <!-- Tool Cards Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <!-- IP Lookup Card -->
        <UCard
          class="cursor-pointer transition-all duration-200"
          :class="{
            'col-span-full': expandedCard === 'ip-lookup',
            'hover:shadow-lg': expandedCard !== 'ip-lookup'
          }"
        >
          <div class="space-y-4">
            <!-- Card Header -->
            <div
              class="flex items-center justify-between cursor-pointer"
              @click="toggleCard('ip-lookup')"
            >
              <div class="flex items-center gap-3">
                <div class="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <Icon name="i-heroicons-globe-alt" class="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 class="font-semibold text-gray-900 dark:text-white">IP Lookup</h3>
                  <p class="text-sm text-gray-600 dark:text-gray-400">Find which account owns an IP</p>
                </div>
              </div>
              <Icon
                :name="expandedCard === 'ip-lookup' ? 'i-heroicons-minus' : 'i-heroicons-plus'"
                class="w-5 h-5 text-gray-400"
              />
            </div>

            <!-- Expanded Content -->
            <div v-if="expandedCard === 'ip-lookup'" class="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-4">
              <!-- Mode Toggle -->
              <div class="flex items-center gap-2">
                <UButton
                  :color="ipLookup.mode === 'manual' ? 'primary' : 'gray'"
                  size="xs"
                  @click="ipLookup.mode = 'manual'"
                >
                  Manual Query
                </UButton>
                <UButton
                  :color="ipLookup.mode === 'ai' ? 'primary' : 'gray'"
                  size="xs"
                  @click="ipLookup.mode = 'ai'"
                >
                  AI Assist
                </UButton>
              </div>

              <!-- Manual Mode -->
              <div v-if="ipLookup.mode === 'manual'" class="space-y-4">
                <div class="flex gap-4">
                  <UInput
                    v-model="ipLookup.ip"
                    placeholder="Enter IP address (e.g., 10.0.1.25)"
                    class="flex-1"
                    @keyup.enter="searchIP"
                  />
                  <USelect
                    v-model="ipLookup.environment"
                    :options="environmentOptions"
                    class="w-40"
                  />
                  <UButton
                    color="primary"
                    :loading="ipLookup.loading"
                    @click="searchIP"
                  >
                    Search
                  </UButton>
                </div>
              </div>

              <!-- AI Mode -->
              <div v-else class="space-y-4">
                <UTextarea
                  v-model="ipLookup.aiQuery"
                  placeholder="Describe what you're looking for (e.g., 'Find the instance with IP 10.0.1.25 in the production account')"
                  :rows="2"
                />
                <div class="flex gap-4">
                  <USelect
                    v-model="ipLookup.environment"
                    :options="environmentOptions"
                    class="w-40"
                  />
                  <UButton
                    color="primary"
                    :loading="ipLookup.aiLoading"
                    @click="generateIPQuery"
                  >
                    Generate Query
                  </UButton>
                </div>

                <!-- Generated Query Preview -->
                <div v-if="ipLookup.generatedQuery" class="bg-gray-100 dark:bg-gray-800 rounded-lg p-3 space-y-2">
                  <div class="flex items-center justify-between">
                    <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Generated Query:</span>
                    <UButton size="xs" variant="ghost" @click="copyToClipboard(ipLookup.generatedQuery)">
                      <Icon name="i-heroicons-clipboard" class="w-4 h-4" />
                    </UButton>
                  </div>
                  <pre class="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{{ ipLookup.generatedQuery }}</pre>
                  <p v-if="ipLookup.queryExplanation" class="text-xs text-gray-500 italic">{{ ipLookup.queryExplanation }}</p>
                  <UButton
                    color="primary"
                    size="sm"
                    :loading="ipLookup.loading"
                    @click="executeGeneratedIPQuery"
                  >
                    Execute Query
                  </UButton>
                </div>
              </div>

              <!-- Results -->
              <div v-if="ipLookup.result" class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 space-y-3">
                <div class="flex items-center gap-2">
                  <Icon
                    :name="ipLookup.result.found ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
                    :class="ipLookup.result.found ? 'text-green-500' : 'text-gray-400'"
                    class="w-5 h-5"
                  />
                  <span class="font-medium text-gray-900 dark:text-white">
                    {{ ipLookup.result.found ? 'Resource Found' : 'No Resource Found' }}
                  </span>
                </div>

                <div v-if="ipLookup.result.found && ipLookup.result.resource" class="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span class="text-gray-500">Account:</span>
                    <span class="ml-2 text-gray-900 dark:text-white font-medium">
                      {{ ipLookup.result.account?.name || ipLookup.result.resource.accountId }}
                    </span>
                  </div>
                  <div>
                    <span class="text-gray-500">Resource ID:</span>
                    <span class="ml-2 text-gray-900 dark:text-white font-mono text-xs">
                      {{ ipLookup.result.resource.resourceId }}
                    </span>
                  </div>
                  <div>
                    <span class="text-gray-500">Type:</span>
                    <span class="ml-2 text-gray-900 dark:text-white">{{ ipLookup.result.resource.resourceType }}</span>
                  </div>
                  <div>
                    <span class="text-gray-500">Region:</span>
                    <span class="ml-2 text-gray-900 dark:text-white">{{ ipLookup.result.resource.region }}</span>
                  </div>
                  <div v-if="ipLookup.result.resource.configuration?.vpcId">
                    <span class="text-gray-500">VPC:</span>
                    <span class="ml-2 text-gray-900 dark:text-white font-mono text-xs">
                      {{ ipLookup.result.resource.configuration.vpcId }}
                    </span>
                  </div>
                  <div v-if="ipLookup.result.resource.configuration?.instanceType">
                    <span class="text-gray-500">Instance Type:</span>
                    <span class="ml-2 text-gray-900 dark:text-white">
                      {{ ipLookup.result.resource.configuration.instanceType }}
                    </span>
                  </div>
                </div>

                <div v-if="ipLookup.result.resource?.configuration?.tags && Object.keys(ipLookup.result.resource.configuration.tags).length > 0" class="pt-2 border-t border-gray-200 dark:border-gray-700">
                  <span class="text-sm text-gray-500 block mb-2">Tags:</span>
                  <div class="flex flex-wrap gap-2">
                    <span
                      v-for="(value, key) in ipLookup.result.resource.configuration.tags"
                      :key="key"
                      class="text-xs px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded text-gray-700 dark:text-gray-300"
                    >
                      {{ key }}={{ value }}
                    </span>
                  </div>
                </div>
              </div>

              <!-- Error -->
              <div v-if="ipLookup.error" class="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
                <div class="flex items-center gap-2 text-red-600 dark:text-red-400">
                  <Icon name="i-heroicons-exclamation-triangle" class="w-5 h-5" />
                  <span>{{ ipLookup.error }}</span>
                </div>
              </div>
            </div>
          </div>
        </UCard>

        <!-- Instance Lookup Card -->
        <UCard
          class="cursor-pointer transition-all duration-200"
          :class="{
            'col-span-full': expandedCard === 'instance-lookup',
            'hover:shadow-lg': expandedCard !== 'instance-lookup'
          }"
        >
          <div class="space-y-4">
            <div
              class="flex items-center justify-between cursor-pointer"
              @click="toggleCard('instance-lookup')"
            >
              <div class="flex items-center gap-3">
                <div class="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                  <Icon name="i-heroicons-server" class="w-6 h-6 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <h3 class="font-semibold text-gray-900 dark:text-white">Instance Lookup</h3>
                  <p class="text-sm text-gray-600 dark:text-gray-400">Get full instance details</p>
                </div>
              </div>
              <Icon
                :name="expandedCard === 'instance-lookup' ? 'i-heroicons-minus' : 'i-heroicons-plus'"
                class="w-5 h-5 text-gray-400"
              />
            </div>

            <div v-if="expandedCard === 'instance-lookup'" class="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-4">
              <div class="flex gap-4">
                <UInput
                  v-model="instanceLookup.query"
                  placeholder="Enter instance ID, name, or IP"
                  class="flex-1"
                  @keyup.enter="searchInstance"
                />
                <USelect
                  v-model="instanceLookup.environment"
                  :options="environmentOptions"
                  class="w-40"
                />
                <UButton
                  color="primary"
                  :loading="instanceLookup.loading"
                  @click="searchInstance"
                >
                  Search
                </UButton>
              </div>

              <div v-if="instanceLookup.result" class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 space-y-3">
                <div class="flex items-center gap-2">
                  <Icon
                    :name="instanceLookup.result.found ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
                    :class="instanceLookup.result.found ? 'text-green-500' : 'text-gray-400'"
                    class="w-5 h-5"
                  />
                  <span class="font-medium text-gray-900 dark:text-white">
                    {{ instanceLookup.result.found ? 'Instance Found' : 'No Instance Found' }}
                  </span>
                </div>

                <div v-if="instanceLookup.result.found && instanceLookup.result.resource" class="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span class="text-gray-500">Instance ID:</span>
                    <span class="ml-2 text-gray-900 dark:text-white font-mono text-xs">
                      {{ instanceLookup.result.resource.resourceId }}
                    </span>
                  </div>
                  <div>
                    <span class="text-gray-500">Name:</span>
                    <span class="ml-2 text-gray-900 dark:text-white">
                      {{ instanceLookup.result.resource.resourceName }}
                    </span>
                  </div>
                  <div>
                    <span class="text-gray-500">Account:</span>
                    <span class="ml-2 text-gray-900 dark:text-white">
                      {{ instanceLookup.result.account?.name || instanceLookup.result.resource.accountId }}
                    </span>
                  </div>
                  <div>
                    <span class="text-gray-500">Region:</span>
                    <span class="ml-2 text-gray-900 dark:text-white">{{ instanceLookup.result.resource.region }}</span>
                  </div>
                  <div v-if="instanceLookup.result.resource.configuration?.instanceType">
                    <span class="text-gray-500">Type:</span>
                    <span class="ml-2 text-gray-900 dark:text-white">
                      {{ instanceLookup.result.resource.configuration.instanceType }}
                    </span>
                  </div>
                  <div v-if="instanceLookup.result.resource.configuration?.state">
                    <span class="text-gray-500">State:</span>
                    <span
                      class="ml-2 px-2 py-0.5 rounded text-xs"
                      :class="{
                        'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200': instanceLookup.result.resource.configuration.state === 'running',
                        'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200': instanceLookup.result.resource.configuration.state === 'stopped',
                        'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200': !['running', 'stopped'].includes(instanceLookup.result.resource.configuration.state)
                      }"
                    >
                      {{ instanceLookup.result.resource.configuration.state }}
                    </span>
                  </div>
                  <div v-if="instanceLookup.result.resource.configuration?.privateIpAddress">
                    <span class="text-gray-500">Private IP:</span>
                    <span class="ml-2 text-gray-900 dark:text-white font-mono text-xs">
                      {{ instanceLookup.result.resource.configuration.privateIpAddress }}
                    </span>
                  </div>
                  <div v-if="instanceLookup.result.resource.configuration?.publicIpAddress">
                    <span class="text-gray-500">Public IP:</span>
                    <span class="ml-2 text-gray-900 dark:text-white font-mono text-xs">
                      {{ instanceLookup.result.resource.configuration.publicIpAddress }}
                    </span>
                  </div>
                </div>
              </div>

              <div v-if="instanceLookup.error" class="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
                <div class="flex items-center gap-2 text-red-600 dark:text-red-400">
                  <Icon name="i-heroicons-exclamation-triangle" class="w-5 h-5" />
                  <span>{{ instanceLookup.error }}</span>
                </div>
              </div>
            </div>
          </div>
        </UCard>

        <!-- Resource Search Card -->
        <UCard
          class="cursor-pointer transition-all duration-200"
          :class="{
            'col-span-full': expandedCard === 'resource-search',
            'hover:shadow-lg': expandedCard !== 'resource-search'
          }"
        >
          <div class="space-y-4">
            <div
              class="flex items-center justify-between cursor-pointer"
              @click="toggleCard('resource-search')"
            >
              <div class="flex items-center gap-3">
                <div class="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                  <Icon name="i-heroicons-magnifying-glass" class="w-6 h-6 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <h3 class="font-semibold text-gray-900 dark:text-white">Resource Search</h3>
                  <p class="text-sm text-gray-600 dark:text-gray-400">Find any AWS resource</p>
                </div>
              </div>
              <Icon
                :name="expandedCard === 'resource-search' ? 'i-heroicons-minus' : 'i-heroicons-plus'"
                class="w-5 h-5 text-gray-400"
              />
            </div>

            <div v-if="expandedCard === 'resource-search'" class="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-4">
              <!-- Mode Toggle -->
              <div class="flex items-center gap-2">
                <UButton
                  :color="resourceSearch.mode === 'manual' ? 'primary' : 'gray'"
                  size="xs"
                  @click="resourceSearch.mode = 'manual'"
                >
                  Manual Query
                </UButton>
                <UButton
                  :color="resourceSearch.mode === 'ai' ? 'primary' : 'gray'"
                  size="xs"
                  @click="resourceSearch.mode = 'ai'"
                >
                  AI Assist
                </UButton>
              </div>

              <!-- Manual Mode -->
              <div v-if="resourceSearch.mode === 'manual'" class="space-y-4">
                <div class="flex gap-4 flex-wrap">
                  <USelect
                    v-model="resourceSearch.resourceType"
                    :options="resourceTypeOptions"
                    placeholder="Select resource type"
                    class="w-64"
                  />
                  <UInput
                    v-model="resourceSearch.query"
                    placeholder="Search by name or ID"
                    class="flex-1 min-w-[200px]"
                    @keyup.enter="searchResources"
                  />
                  <USelect
                    v-model="resourceSearch.environment"
                    :options="environmentOptions"
                    class="w-40"
                  />
                  <UButton
                    color="primary"
                    :loading="resourceSearch.loading"
                    @click="searchResources"
                  >
                    Search
                  </UButton>
                </div>
              </div>

              <!-- AI Mode -->
              <div v-else class="space-y-4">
                <UTextarea
                  v-model="resourceSearch.aiQuery"
                  placeholder="Describe what you're looking for (e.g., 'Find all S3 buckets without encryption' or 'Show EC2 instances tagged as production')"
                  :rows="2"
                />
                <div class="flex gap-4">
                  <USelect
                    v-model="resourceSearch.environment"
                    :options="environmentOptions"
                    class="w-40"
                  />
                  <UButton
                    color="primary"
                    :loading="resourceSearch.aiLoading"
                    @click="generateResourceQuery"
                  >
                    Generate Query
                  </UButton>
                </div>

                <div v-if="resourceSearch.generatedQuery" class="bg-gray-100 dark:bg-gray-800 rounded-lg p-3 space-y-2">
                  <div class="flex items-center justify-between">
                    <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Generated Config SQL:</span>
                    <UButton size="xs" variant="ghost" @click="copyToClipboard(resourceSearch.generatedQuery)">
                      <Icon name="i-heroicons-clipboard" class="w-4 h-4" />
                    </UButton>
                  </div>
                  <pre class="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap overflow-x-auto">{{ resourceSearch.generatedQuery }}</pre>
                  <p v-if="resourceSearch.queryExplanation" class="text-xs text-gray-500 italic">{{ resourceSearch.queryExplanation }}</p>
                  <UButton
                    color="primary"
                    size="sm"
                    :loading="resourceSearch.loading"
                    @click="executeGeneratedResourceQuery"
                  >
                    Execute Query
                  </UButton>
                </div>
              </div>

              <!-- Results -->
              <div v-if="resourceSearch.results.length > 0" class="space-y-2">
                <div class="text-sm text-gray-600 dark:text-gray-400">
                  Found {{ resourceSearch.results.length }} resources
                </div>
                <div class="overflow-x-auto">
                  <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead>
                      <tr>
                        <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Resource ID</th>
                        <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                        <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                        <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Account</th>
                        <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Region</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                      <tr v-for="resource in resourceSearch.results" :key="resource.resourceId">
                        <td class="px-4 py-2 text-sm font-mono text-gray-900 dark:text-white">{{ resource.resourceId }}</td>
                        <td class="px-4 py-2 text-sm text-gray-900 dark:text-white">{{ resource.resourceName || '-' }}</td>
                        <td class="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">{{ resource.resourceType?.split('::').pop() }}</td>
                        <td class="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">{{ resource.accountId }}</td>
                        <td class="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">{{ resource.awsRegion }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div v-if="resourceSearch.error" class="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
                <div class="flex items-center gap-2 text-red-600 dark:text-red-400">
                  <Icon name="i-heroicons-exclamation-triangle" class="w-5 h-5" />
                  <span>{{ resourceSearch.error }}</span>
                </div>
              </div>
            </div>
          </div>
        </UCard>

        <!-- CloudWatch Logs Card -->
        <UCard
          class="cursor-pointer transition-all duration-200"
          :class="{
            'col-span-full': expandedCard === 'cloudwatch-logs',
            'hover:shadow-lg': expandedCard !== 'cloudwatch-logs'
          }"
        >
          <div class="space-y-4">
            <div
              class="flex items-center justify-between cursor-pointer"
              @click="toggleCard('cloudwatch-logs')"
            >
              <div class="flex items-center gap-3">
                <div class="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                  <Icon name="i-heroicons-document-text" class="w-6 h-6 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <h3 class="font-semibold text-gray-900 dark:text-white">CloudWatch Logs</h3>
                  <p class="text-sm text-gray-600 dark:text-gray-400">Search logs for activity</p>
                </div>
              </div>
              <Icon
                :name="expandedCard === 'cloudwatch-logs' ? 'i-heroicons-minus' : 'i-heroicons-plus'"
                class="w-5 h-5 text-gray-400"
              />
            </div>

            <div v-if="expandedCard === 'cloudwatch-logs'" class="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-4">
              <!-- Mode Toggle -->
              <div class="flex items-center gap-2">
                <UButton
                  :color="cloudwatchLogs.mode === 'manual' ? 'primary' : 'gray'"
                  size="xs"
                  @click="cloudwatchLogs.mode = 'manual'"
                >
                  Manual Query
                </UButton>
                <UButton
                  :color="cloudwatchLogs.mode === 'ai' ? 'primary' : 'gray'"
                  size="xs"
                  @click="cloudwatchLogs.mode = 'ai'"
                >
                  AI Assist
                </UButton>
              </div>

              <!-- Manual Mode -->
              <div v-if="cloudwatchLogs.mode === 'manual'" class="space-y-4">
                <!-- Account context hint -->
                <div v-if="!supportContext.isAccountReady.value" class="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
                  <Icon name="i-heroicons-information-circle" class="w-4 h-4 inline mr-1" />
                  Select an account in the context bar above to browse log groups.
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <SupportLogGroupSelector
                    v-model="cloudwatchLogs.logGroup"
                    placeholder="Select or enter log group"
                  />
                  <UInput
                    v-model="cloudwatchLogs.filterPattern"
                    placeholder="Filter pattern (e.g., ERROR)"
                  />
                </div>
                <div class="flex gap-4 flex-wrap">
                  <USelect
                    v-model="cloudwatchLogs.timeRange"
                    :options="timeRangeOptions"
                    class="w-40"
                  />
                  <UButton
                    color="primary"
                    :loading="cloudwatchLogs.loading"
                    :disabled="!cloudwatchLogs.logGroup || !supportContext.isAccountReady.value"
                    @click="searchLogs"
                  >
                    Search
                  </UButton>
                </div>
              </div>

              <!-- AI Mode -->
              <div v-else class="space-y-4">
                <UTextarea
                  v-model="cloudwatchLogs.aiQuery"
                  placeholder="Describe what you're looking for (e.g., 'Show errors for user john@example.com in the last 24 hours')"
                  :rows="2"
                />
                <UButton
                  color="primary"
                  :loading="cloudwatchLogs.aiLoading"
                  @click="generateLogFilter"
                >
                  Generate Filter
                </UButton>

                <div v-if="cloudwatchLogs.generatedFilter" class="bg-gray-100 dark:bg-gray-800 rounded-lg p-3 space-y-2">
                  <div class="flex items-center justify-between">
                    <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Generated Filter Pattern:</span>
                    <UButton size="xs" variant="ghost" @click="copyToClipboard(cloudwatchLogs.generatedFilter)">
                      <Icon name="i-heroicons-clipboard" class="w-4 h-4" />
                    </UButton>
                  </div>
                  <pre class="text-sm text-gray-600 dark:text-gray-400 font-mono">{{ cloudwatchLogs.generatedFilter }}</pre>
                  <p v-if="cloudwatchLogs.filterExplanation" class="text-xs text-gray-500 italic">{{ cloudwatchLogs.filterExplanation }}</p>
                  <UButton
                    size="sm"
                    @click="cloudwatchLogs.filterPattern = cloudwatchLogs.generatedFilter; cloudwatchLogs.mode = 'manual'"
                  >
                    Use This Filter
                  </UButton>
                </div>
              </div>

              <!-- Results -->
              <div v-if="cloudwatchLogs.results.length > 0" class="space-y-2">
                <div class="text-sm text-gray-600 dark:text-gray-400">
                  Found {{ cloudwatchLogs.results.length }} log entries
                  <span v-if="cloudwatchLogs.hasMore" class="text-blue-600">(more available)</span>
                </div>
                <div class="max-h-96 overflow-y-auto space-y-2">
                  <div
                    v-for="(log, index) in cloudwatchLogs.results"
                    :key="index"
                    class="bg-gray-100 dark:bg-gray-800 rounded p-2 text-xs"
                  >
                    <div class="flex items-center gap-2 mb-1">
                      <span class="text-gray-500">{{ formatTimestamp(log.timestamp) }}</span>
                      <span
                        class="px-1.5 py-0.5 rounded text-xs font-medium"
                        :class="getLogLevelClass(log.level)"
                      >
                        {{ log.level }}
                      </span>
                      <span class="text-gray-500 truncate">{{ log.logStreamName }}</span>
                    </div>
                    <pre class="whitespace-pre-wrap text-gray-700 dark:text-gray-300 font-mono">{{ log.message }}</pre>
                  </div>
                </div>
                <UButton
                  v-if="cloudwatchLogs.hasMore && cloudwatchLogs.nextToken"
                  variant="outline"
                  size="sm"
                  :loading="cloudwatchLogs.loadingMore"
                  @click="loadMoreLogs"
                >
                  Load More
                </UButton>
              </div>

              <div v-if="cloudwatchLogs.error" class="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
                <div class="flex items-center gap-2 text-red-600 dark:text-red-400">
                  <Icon name="i-heroicons-exclamation-triangle" class="w-5 h-5" />
                  <span>{{ cloudwatchLogs.error }}</span>
                </div>
              </div>
            </div>
          </div>
        </UCard>

        <!-- Smart Resource Discovery Card -->
        <UCard
          class="cursor-pointer transition-all duration-200"
          :class="{
            'col-span-full': expandedCard === 'smart-discovery',
            'hover:shadow-lg': expandedCard !== 'smart-discovery'
          }"
        >
          <div class="space-y-4">
            <div
              class="flex items-center justify-between cursor-pointer"
              @click="toggleCard('smart-discovery')"
            >
              <div class="flex items-center gap-3">
                <div class="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                  <Icon name="i-heroicons-sparkles" class="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <h3 class="font-semibold text-gray-900 dark:text-white">Smart Discovery</h3>
                  <p class="text-sm text-gray-600 dark:text-gray-400">AI-powered resource search</p>
                </div>
              </div>
              <Icon
                :name="expandedCard === 'smart-discovery' ? 'i-heroicons-minus' : 'i-heroicons-plus'"
                class="w-5 h-5 text-gray-400"
              />
            </div>

            <div v-if="expandedCard === 'smart-discovery'" class="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-4">
              <UTextarea
                v-model="smartDiscovery.query"
                placeholder="Describe what you're looking for (e.g., 'find the instance running payment service' or 'show me prod instances in finance account')"
                :rows="2"
              />
              <div class="flex gap-4 flex-wrap">
                <USelect
                  v-model="smartDiscovery.environment"
                  :options="environmentOptions"
                  class="w-40"
                />
                <UButton
                  color="primary"
                  :loading="smartDiscovery.loading"
                  @click="runSmartDiscovery"
                >
                  <Icon name="i-heroicons-sparkles" class="w-4 h-4 mr-1" />
                  Discover
                </UButton>
              </div>

              <!-- Results -->
              <div v-if="smartDiscovery.results.length > 0" class="space-y-3">
                <div class="flex items-center justify-between text-sm">
                  <span class="text-gray-600 dark:text-gray-400">
                    Found {{ smartDiscovery.results.length }} results
                    <span v-if="smartDiscovery.confidence" class="ml-2 text-indigo-600">
                      ({{ smartDiscovery.confidence }}% confidence)
                    </span>
                  </span>
                </div>
                <div class="space-y-2">
                  <div
                    v-for="result in smartDiscovery.results"
                    :key="result.id"
                    class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3"
                  >
                    <div class="flex items-center gap-2 mb-1">
                      <span
                        class="text-xs px-2 py-0.5 rounded"
                        :class="{
                          'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300': result.type === 'account',
                          'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300': result.type === 'instance',
                          'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300': result.type === 'resource'
                        }"
                      >
                        {{ result.type }}
                      </span>
                      <span class="font-medium text-gray-900 dark:text-white">{{ result.name }}</span>
                      <span class="text-xs text-gray-500">({{ result.confidence }}% match)</span>
                    </div>
                    <div class="text-xs text-gray-600 dark:text-gray-400">
                      <span class="font-mono">{{ result.id }}</span>
                      <span v-if="result.matchReason" class="ml-2 italic">- {{ result.matchReason }}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div v-if="smartDiscovery.error" class="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
                <div class="flex items-center gap-2 text-red-600 dark:text-red-400">
                  <Icon name="i-heroicons-exclamation-triangle" class="w-5 h-5" />
                  <span>{{ smartDiscovery.error }}</span>
                </div>
              </div>
            </div>
          </div>
        </UCard>

        <!-- Security Posture Card -->
        <UCard
          class="cursor-pointer transition-all duration-200"
          :class="{
            'col-span-full': expandedCard === 'security-posture',
            'hover:shadow-lg': expandedCard !== 'security-posture'
          }"
        >
          <div class="space-y-4">
            <div
              class="flex items-center justify-between cursor-pointer"
              @click="toggleCard('security-posture')"
            >
              <div class="flex items-center gap-3">
                <div class="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                  <Icon name="i-heroicons-shield-check" class="w-6 h-6 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <h3 class="font-semibold text-gray-900 dark:text-white">Security Posture</h3>
                  <p class="text-sm text-gray-600 dark:text-gray-400">Security Hub + Inspector findings</p>
                </div>
              </div>
              <Icon
                :name="expandedCard === 'security-posture' ? 'i-heroicons-minus' : 'i-heroicons-plus'"
                class="w-5 h-5 text-gray-400"
              />
            </div>

            <div v-if="expandedCard === 'security-posture'" class="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-4">
              <!-- Account context hint -->
              <div v-if="!supportContext.isAccountReady.value" class="text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                <Icon name="i-heroicons-information-circle" class="w-4 h-4 inline mr-1" />
                Select an account in the context bar above, or leave empty to analyze all accounts.
              </div>
              <div class="flex gap-4 flex-wrap items-center">
                <span v-if="supportContext.isAccountReady.value" class="text-sm text-gray-600 dark:text-gray-400">
                  Analyzing: <span class="font-medium">{{ supportContext.state.accountName || supportContext.state.accountId }}</span>
                </span>
                <UButton
                  color="primary"
                  :loading="securityPosture.loading"
                  @click="fetchSecurityPosture"
                >
                  Analyze
                </UButton>
              </div>

              <div v-if="securityPosture.data" class="space-y-4">
                <!-- Risk Score -->
                <div class="flex items-center gap-4">
                  <div
                    class="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold"
                    :class="{
                      'bg-red-100 text-red-700': securityPosture.data.summary.overallRisk === 'CRITICAL',
                      'bg-orange-100 text-orange-700': securityPosture.data.summary.overallRisk === 'HIGH',
                      'bg-yellow-100 text-yellow-700': securityPosture.data.summary.overallRisk === 'MEDIUM',
                      'bg-blue-100 text-blue-700': securityPosture.data.summary.overallRisk === 'LOW',
                      'bg-green-100 text-green-700': securityPosture.data.summary.overallRisk === 'MINIMAL'
                    }"
                  >
                    {{ securityPosture.data.summary.riskScore }}
                  </div>
                  <div>
                    <div class="text-lg font-semibold text-gray-900 dark:text-white">
                      {{ securityPosture.data.summary.overallRisk }} Risk
                    </div>
                    <div class="text-sm text-gray-600 dark:text-gray-400">
                      {{ securityPosture.data.summary.totalFindings }} total findings
                    </div>
                  </div>
                </div>

                <!-- Severity breakdown -->
                <div class="grid grid-cols-5 gap-2 text-center">
                  <div class="bg-red-50 dark:bg-red-900/20 rounded p-2">
                    <div class="text-lg font-bold text-red-600">{{ securityPosture.data.summary.criticalFindings }}</div>
                    <div class="text-xs text-gray-500">Critical</div>
                  </div>
                  <div class="bg-orange-50 dark:bg-orange-900/20 rounded p-2">
                    <div class="text-lg font-bold text-orange-600">{{ securityPosture.data.summary.highFindings }}</div>
                    <div class="text-xs text-gray-500">High</div>
                  </div>
                  <div class="bg-yellow-50 dark:bg-yellow-900/20 rounded p-2">
                    <div class="text-lg font-bold text-yellow-600">{{ securityPosture.data.summary.mediumFindings }}</div>
                    <div class="text-xs text-gray-500">Medium</div>
                  </div>
                  <div class="bg-blue-50 dark:bg-blue-900/20 rounded p-2">
                    <div class="text-lg font-bold text-blue-600">{{ securityPosture.data.summary.lowFindings }}</div>
                    <div class="text-xs text-gray-500">Low</div>
                  </div>
                  <div class="bg-gray-50 dark:bg-gray-800 rounded p-2">
                    <div class="text-lg font-bold text-gray-600">{{ securityPosture.data.summary.informationalFindings }}</div>
                    <div class="text-xs text-gray-500">Info</div>
                  </div>
                </div>

                <!-- Top findings -->
                <div v-if="securityPosture.data.topFindings.length > 0" class="space-y-2">
                  <h4 class="font-medium text-gray-900 dark:text-white">Top Findings</h4>
                  <div
                    v-for="finding in securityPosture.data.topFindings.slice(0, 5)"
                    :key="finding.id"
                    class="bg-gray-50 dark:bg-gray-800/50 rounded p-2 text-sm"
                  >
                    <div class="flex items-center gap-2">
                      <span
                        class="px-1.5 py-0.5 rounded text-xs font-medium"
                        :class="{
                          'bg-red-100 text-red-800': finding.severity === 'CRITICAL',
                          'bg-orange-100 text-orange-800': finding.severity === 'HIGH',
                          'bg-yellow-100 text-yellow-800': finding.severity === 'MEDIUM',
                          'bg-blue-100 text-blue-800': finding.severity === 'LOW'
                        }"
                      >
                        {{ finding.severity }}
                      </span>
                      <span class="text-gray-900 dark:text-white truncate">{{ finding.title }}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div v-if="securityPosture.error" class="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
                <div class="flex items-center gap-2 text-red-600 dark:text-red-400">
                  <Icon name="i-heroicons-exclamation-triangle" class="w-5 h-5" />
                  <span>{{ securityPosture.error }}</span>
                </div>
              </div>
            </div>
          </div>
        </UCard>

        <!-- Patch Compliance Card -->
        <UCard
          class="cursor-pointer transition-all duration-200"
          :class="{
            'col-span-full': expandedCard === 'patch-compliance',
            'hover:shadow-lg': expandedCard !== 'patch-compliance'
          }"
        >
          <div class="space-y-4">
            <div
              class="flex items-center justify-between cursor-pointer"
              @click="toggleCard('patch-compliance')"
            >
              <div class="flex items-center gap-3">
                <div class="p-2 bg-teal-100 dark:bg-teal-900/30 rounded-lg">
                  <Icon name="i-heroicons-arrow-path" class="w-6 h-6 text-teal-600 dark:text-teal-400" />
                </div>
                <div>
                  <h3 class="font-semibold text-gray-900 dark:text-white">Patch Compliance</h3>
                  <p class="text-sm text-gray-600 dark:text-gray-400">SSM patch status</p>
                </div>
              </div>
              <Icon
                :name="expandedCard === 'patch-compliance' ? 'i-heroicons-minus' : 'i-heroicons-plus'"
                class="w-5 h-5 text-gray-400"
              />
            </div>

            <div v-if="expandedCard === 'patch-compliance'" class="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-4">
              <!-- Account context hint -->
              <div v-if="!supportContext.isAccountReady.value" class="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
                <Icon name="i-heroicons-information-circle" class="w-4 h-4 inline mr-1" />
                Select an account in the context bar above to check patch compliance.
              </div>
              <div class="flex gap-4 flex-wrap">
                <SupportInstanceSelector
                  v-model="patchCompliance.instanceId"
                  placeholder="Select instance (optional)"
                  no-account-placeholder="Enter instance ID (optional)"
                  class="flex-1 min-w-[200px]"
                />
                <UButton
                  color="primary"
                  :loading="patchCompliance.loading"
                  :disabled="!supportContext.isAccountReady.value"
                  @click="fetchPatchCompliance"
                >
                  Check
                </UButton>
              </div>

              <div v-if="patchCompliance.data" class="space-y-4">
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div class="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
                    <div class="text-2xl font-bold text-green-600">{{ patchCompliance.data.summary?.compliantInstances || 0 }}</div>
                    <div class="text-xs text-gray-500">Compliant</div>
                  </div>
                  <div class="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 text-center">
                    <div class="text-2xl font-bold text-red-600">{{ patchCompliance.data.summary?.nonCompliantInstances || 0 }}</div>
                    <div class="text-xs text-gray-500">Non-Compliant</div>
                  </div>
                  <div class="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3 text-center">
                    <div class="text-2xl font-bold text-yellow-600">{{ patchCompliance.data.summary?.totalMissingPatches || 0 }}</div>
                    <div class="text-xs text-gray-500">Missing Patches</div>
                  </div>
                  <div class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-center">
                    <div class="text-2xl font-bold text-blue-600">{{ patchCompliance.data.summary?.compliancePercentage || 0 }}%</div>
                    <div class="text-xs text-gray-500">Compliance</div>
                  </div>
                </div>

                <div v-if="patchCompliance.data.recommendations?.length > 0" class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
                  <h4 class="font-medium text-gray-900 dark:text-white mb-2">Recommendations</h4>
                  <ul class="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                    <li v-for="(rec, i) in patchCompliance.data.recommendations" :key="i">
                      {{ rec }}
                    </li>
                  </ul>
                </div>
              </div>

              <div v-if="patchCompliance.error" class="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
                <div class="flex items-center gap-2 text-red-600 dark:text-red-400">
                  <Icon name="i-heroicons-exclamation-triangle" class="w-5 h-5" />
                  <span>{{ patchCompliance.error }}</span>
                </div>
              </div>
            </div>
          </div>
        </UCard>

        <!-- Cost Anomalies Card -->
        <UCard
          class="cursor-pointer transition-all duration-200"
          :class="{
            'col-span-full': expandedCard === 'cost-anomalies',
            'hover:shadow-lg': expandedCard !== 'cost-anomalies'
          }"
        >
          <div class="space-y-4">
            <div
              class="flex items-center justify-between cursor-pointer"
              @click="toggleCard('cost-anomalies')"
            >
              <div class="flex items-center gap-3">
                <div class="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                  <Icon name="i-heroicons-currency-dollar" class="w-6 h-6 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <h3 class="font-semibold text-gray-900 dark:text-white">Cost Anomalies</h3>
                  <p class="text-sm text-gray-600 dark:text-gray-400">Unusual spending patterns</p>
                </div>
              </div>
              <Icon
                :name="expandedCard === 'cost-anomalies' ? 'i-heroicons-minus' : 'i-heroicons-plus'"
                class="w-5 h-5 text-gray-400"
              />
            </div>

            <div v-if="expandedCard === 'cost-anomalies'" class="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-4">
              <!-- Commercial-only notice -->
              <div class="text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
                <Icon name="i-heroicons-information-circle" class="w-4 h-4 inline mr-1" />
                Cost Anomalies uses Commercial AWS (Cost Explorer is not available in GovCloud).
                {{ supportContext.state.mode === 'account' && supportContext.state.accountId ? `Using account: ${supportContext.state.accountName || supportContext.state.accountId}` : 'Leave account unselected to check all accounts.' }}
              </div>
              <div class="flex gap-4 flex-wrap">
                <USelect
                  v-model="costAnomalies.daysBack"
                  :options="[
                    { label: 'Last 7 days', value: 7 },
                    { label: 'Last 30 days', value: 30 },
                    { label: 'Last 60 days', value: 60 },
                    { label: 'Last 90 days', value: 90 }
                  ]"
                  class="w-40"
                />
                <UButton
                  color="primary"
                  :loading="costAnomalies.loading"
                  @click="fetchCostAnomalies"
                >
                  Check
                </UButton>
              </div>

              <div v-if="costAnomalies.data" class="space-y-4">
                <div class="grid grid-cols-3 gap-4">
                  <div class="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 text-center">
                    <div class="text-2xl font-bold text-red-600">{{ costAnomalies.data.summary.ongoingAnomalies }}</div>
                    <div class="text-xs text-gray-500">Ongoing</div>
                  </div>
                  <div class="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
                    <div class="text-2xl font-bold text-green-600">{{ costAnomalies.data.summary.resolvedAnomalies }}</div>
                    <div class="text-xs text-gray-500">Resolved</div>
                  </div>
                  <div class="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 text-center">
                    <div class="text-2xl font-bold text-amber-600">${{ costAnomalies.data.summary.totalImpact.toFixed(0) }}</div>
                    <div class="text-xs text-gray-500">Total Impact</div>
                  </div>
                </div>

                <div v-if="costAnomalies.data.anomalies.length > 0" class="space-y-2">
                  <h4 class="font-medium text-gray-900 dark:text-white">Recent Anomalies</h4>
                  <div
                    v-for="anomaly in costAnomalies.data.anomalies.slice(0, 5)"
                    :key="anomaly.anomalyId"
                    class="bg-gray-50 dark:bg-gray-800/50 rounded p-2 text-sm"
                  >
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-2">
                        <span
                          class="w-2 h-2 rounded-full"
                          :class="anomaly.status === 'ONGOING' ? 'bg-red-500' : 'bg-green-500'"
                        />
                        <span class="text-gray-900 dark:text-white">{{ anomaly.service || 'Multiple services' }}</span>
                      </div>
                      <span class="font-medium text-amber-600">${{ anomaly.impact.toFixed(2) }}</span>
                    </div>
                    <div class="text-xs text-gray-500 mt-1">
                      {{ anomaly.startDate }} • {{ anomaly.impactPercentage }}% above expected
                    </div>
                  </div>
                </div>
              </div>

              <div v-if="costAnomalies.error" class="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
                <div class="flex items-center gap-2 text-red-600 dark:text-red-400">
                  <Icon name="i-heroicons-exclamation-triangle" class="w-5 h-5" />
                  <span>{{ costAnomalies.error }}</span>
                </div>
              </div>
            </div>
          </div>
        </UCard>

        <!-- Access Audit Card -->
        <UCard
          class="cursor-pointer transition-all duration-200"
          :class="{
            'col-span-full': expandedCard === 'access-audit',
            'hover:shadow-lg': expandedCard !== 'access-audit'
          }"
        >
          <div class="space-y-4">
            <div
              class="flex items-center justify-between cursor-pointer"
              @click="toggleCard('access-audit')"
            >
              <div class="flex items-center gap-3">
                <div class="p-2 bg-violet-100 dark:bg-violet-900/30 rounded-lg">
                  <Icon name="i-heroicons-eye" class="w-6 h-6 text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <h3 class="font-semibold text-gray-900 dark:text-white">Access Audit</h3>
                  <p class="text-sm text-gray-600 dark:text-gray-400">CloudTrail activity analysis</p>
                </div>
              </div>
              <Icon
                :name="expandedCard === 'access-audit' ? 'i-heroicons-minus' : 'i-heroicons-plus'"
                class="w-5 h-5 text-gray-400"
              />
            </div>

            <div v-if="expandedCard === 'access-audit'" class="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-4">
              <!-- Account context hint -->
              <div v-if="!supportContext.isAccountReady.value" class="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
                <Icon name="i-heroicons-information-circle" class="w-4 h-4 inline mr-1" />
                Select an account in the context bar above to audit access.
              </div>
              <div class="flex gap-4 flex-wrap">
                <UInput
                  v-model="accessAudit.resourceId"
                  placeholder="Resource ID"
                  class="w-48"
                />
                <UInput
                  v-model="accessAudit.userName"
                  placeholder="User name"
                  class="w-48"
                />
                <UButton
                  color="primary"
                  :loading="accessAudit.loading"
                  :disabled="!supportContext.isAccountReady.value || (!accessAudit.resourceId && !accessAudit.userName)"
                  @click="fetchAccessAudit"
                >
                  Audit
                </UButton>
              </div>

              <div v-if="accessAudit.data" class="space-y-4">
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-center">
                    <div class="text-2xl font-bold text-blue-600">{{ accessAudit.data.summary.totalEvents }}</div>
                    <div class="text-xs text-gray-500">Total Events</div>
                  </div>
                  <div class="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 text-center">
                    <div class="text-2xl font-bold text-purple-600">{{ accessAudit.data.summary.uniqueUsers }}</div>
                    <div class="text-xs text-gray-500">Unique Users</div>
                  </div>
                  <div class="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
                    <div class="text-2xl font-bold text-green-600">{{ accessAudit.data.summary.readEvents }}</div>
                    <div class="text-xs text-gray-500">Read Events</div>
                  </div>
                  <div class="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-3 text-center">
                    <div class="text-2xl font-bold text-orange-600">{{ accessAudit.data.summary.writeEvents }}</div>
                    <div class="text-xs text-gray-500">Write Events</div>
                  </div>
                </div>

                <div v-if="accessAudit.data.anomalies.length > 0" class="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3">
                  <h4 class="font-medium text-yellow-800 dark:text-yellow-200 mb-2">Anomalies Detected</h4>
                  <ul class="text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
                    <li v-for="(anomaly, i) in accessAudit.data.anomalies" :key="i">
                      {{ anomaly }}
                    </li>
                  </ul>
                </div>

                <div v-if="accessAudit.data.topUsers.length > 0" class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
                  <h4 class="font-medium text-gray-900 dark:text-white mb-2">Top Users</h4>
                  <div class="space-y-1">
                    <div
                      v-for="user in accessAudit.data.topUsers.slice(0, 5)"
                      :key="user.user"
                      class="flex justify-between text-sm"
                    >
                      <span class="text-gray-600 dark:text-gray-400 truncate">{{ user.user }}</span>
                      <span class="text-gray-900 dark:text-white font-medium">{{ user.eventCount }} events</span>
                    </div>
                  </div>
                </div>
              </div>

              <div v-if="accessAudit.error" class="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
                <div class="flex items-center gap-2 text-red-600 dark:text-red-400">
                  <Icon name="i-heroicons-exclamation-triangle" class="w-5 h-5" />
                  <span>{{ accessAudit.error }}</span>
                </div>
              </div>
            </div>
          </div>
        </UCard>

        <!-- Instance Health Card -->
        <UCard
          class="cursor-pointer transition-all duration-200"
          :class="{
            'col-span-full': expandedCard === 'instance-health',
            'hover:shadow-lg': expandedCard !== 'instance-health'
          }"
        >
          <div class="space-y-4">
            <div
              class="flex items-center justify-between cursor-pointer"
              @click="toggleCard('instance-health')"
            >
              <div class="flex items-center gap-3">
                <div class="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                  <Icon name="i-heroicons-heart" class="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <h3 class="font-semibold text-gray-900 dark:text-white">Instance Health</h3>
                  <p class="text-sm text-gray-600 dark:text-gray-400">Comprehensive health dashboard</p>
                </div>
              </div>
              <Icon
                :name="expandedCard === 'instance-health' ? 'i-heroicons-minus' : 'i-heroicons-plus'"
                class="w-5 h-5 text-gray-400"
              />
            </div>

            <div v-if="expandedCard === 'instance-health'" class="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-4">
              <!-- Account context hint -->
              <div v-if="!supportContext.isAccountReady.value" class="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
                <Icon name="i-heroicons-information-circle" class="w-4 h-4 inline mr-1" />
                Select an account in the context bar above to browse instances.
              </div>
              <div class="flex gap-4 flex-wrap">
                <SupportInstanceSelector
                  v-model="instanceHealth.instanceId"
                  placeholder="Select instance"
                  class="flex-1 min-w-[200px]"
                />
                <UButton
                  color="primary"
                  :loading="instanceHealth.loading"
                  :disabled="!instanceHealth.instanceId || !supportContext.isAccountReady.value"
                  @click="fetchInstanceHealth"
                >
                  Analyze
                </UButton>
              </div>

              <div v-if="instanceHealth.data" class="space-y-4">
                <!-- Health Score -->
                <div class="flex items-center gap-4">
                  <div
                    class="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold"
                    :class="{
                      'bg-green-100 text-green-700': instanceHealth.data.healthStatus === 'HEALTHY',
                      'bg-yellow-100 text-yellow-700': instanceHealth.data.healthStatus === 'WARNING',
                      'bg-red-100 text-red-700': instanceHealth.data.healthStatus === 'CRITICAL',
                      'bg-gray-100 text-gray-500': instanceHealth.data.healthStatus === 'UNKNOWN'
                    }"
                  >
                    {{ instanceHealth.data.healthScore }}
                  </div>
                  <div>
                    <div class="text-xl font-semibold text-gray-900 dark:text-white">
                      {{ instanceHealth.data.healthStatus }}
                    </div>
                    <div class="text-sm text-gray-600 dark:text-gray-400">
                      {{ instanceHealth.data.instanceName || instanceHealth.data.instanceId }}
                    </div>
                    <div v-if="instanceHealth.data.partialData" class="text-xs text-yellow-600">
                      Some data unavailable
                    </div>
                  </div>
                </div>

                <!-- Health Components Grid -->
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <!-- Patches -->
                  <div class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
                    <div class="text-xs text-gray-500 mb-1">Patches</div>
                    <div
                      class="font-semibold"
                      :class="{
                        'text-green-600': instanceHealth.data.patchCompliance.status === 'COMPLIANT',
                        'text-red-600': ['NON_COMPLIANT', 'FAILED'].includes(instanceHealth.data.patchCompliance.status),
                        'text-yellow-600': instanceHealth.data.patchCompliance.status === 'PENDING',
                        'text-gray-500': instanceHealth.data.patchCompliance.status === 'UNKNOWN'
                      }"
                    >
                      {{ instanceHealth.data.patchCompliance.status }}
                    </div>
                    <div class="text-xs text-gray-500">
                      {{ instanceHealth.data.patchCompliance.missingCount }} missing
                    </div>
                  </div>

                  <!-- Security -->
                  <div class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
                    <div class="text-xs text-gray-500 mb-1">Security</div>
                    <div class="font-semibold">
                      <span class="text-red-600">{{ instanceHealth.data.securityFindings.critical }}</span>
                      <span class="text-gray-400 mx-1">/</span>
                      <span class="text-orange-600">{{ instanceHealth.data.securityFindings.high }}</span>
                    </div>
                    <div class="text-xs text-gray-500">Critical / High</div>
                  </div>

                  <!-- Vulnerabilities -->
                  <div class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
                    <div class="text-xs text-gray-500 mb-1">Vulnerabilities</div>
                    <div class="font-semibold">
                      <span class="text-red-600">{{ instanceHealth.data.vulnerabilities.critical }}</span>
                      <span class="text-gray-400 mx-1">/</span>
                      <span class="text-orange-600">{{ instanceHealth.data.vulnerabilities.high }}</span>
                    </div>
                    <div class="text-xs text-gray-500">Critical / High</div>
                  </div>

                  <!-- Alarms -->
                  <div class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
                    <div class="text-xs text-gray-500 mb-1">Alarms</div>
                    <div class="font-semibold">
                      <span :class="instanceHealth.data.alarms.inAlarm > 0 ? 'text-red-600' : 'text-green-600'">
                        {{ instanceHealth.data.alarms.inAlarm }}
                      </span>
                      <span class="text-gray-400 mx-1">/</span>
                      <span class="text-green-600">{{ instanceHealth.data.alarms.ok }}</span>
                    </div>
                    <div class="text-xs text-gray-500">Alarm / OK</div>
                  </div>
                </div>

                <!-- Recommendations -->
                <div v-if="instanceHealth.data.recommendations.length > 0" class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
                  <h4 class="font-medium text-blue-800 dark:text-blue-200 mb-2">Recommendations</h4>
                  <ul class="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                    <li v-for="(rec, i) in instanceHealth.data.recommendations" :key="i">
                      {{ rec }}
                    </li>
                  </ul>
                </div>
              </div>

              <div v-if="instanceHealth.error" class="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
                <div class="flex items-center gap-2 text-red-600 dark:text-red-400">
                  <Icon name="i-heroicons-exclamation-triangle" class="w-5 h-5" />
                  <span>{{ instanceHealth.error }}</span>
                </div>
              </div>
            </div>
          </div>
        </UCard>

        <!-- Query Templates Card -->
        <UCard
          class="cursor-pointer transition-all duration-200"
          :class="{
            'col-span-full': expandedCard === 'query-templates',
            'hover:shadow-lg': expandedCard !== 'query-templates'
          }"
        >
          <div class="space-y-4">
            <div
              class="flex items-center justify-between cursor-pointer"
              @click="toggleCard('query-templates')"
            >
              <div class="flex items-center gap-3">
                <div class="p-2 bg-cyan-100 dark:bg-cyan-900/30 rounded-lg">
                  <Icon name="i-heroicons-document-duplicate" class="w-6 h-6 text-cyan-600 dark:text-cyan-400" />
                </div>
                <div>
                  <h3 class="font-semibold text-gray-900 dark:text-white">Query Templates</h3>
                  <p class="text-sm text-gray-600 dark:text-gray-400">Pre-built queries for common tasks</p>
                </div>
              </div>
              <Icon
                :name="expandedCard === 'query-templates' ? 'i-heroicons-minus' : 'i-heroicons-plus'"
                class="w-5 h-5 text-gray-400"
              />
            </div>

            <div v-if="expandedCard === 'query-templates'" class="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-4">
              <div class="flex gap-2 flex-wrap">
                <UButton
                  v-for="category in queryTemplates.categories"
                  :key="category"
                  size="xs"
                  :color="queryTemplates.selectedCategory === category ? 'primary' : 'gray'"
                  @click="queryTemplates.selectedCategory = queryTemplates.selectedCategory === category ? '' : category"
                >
                  {{ category }}
                </UButton>
              </div>

              <div v-if="!queryTemplates.loading && queryTemplates.templates.length > 0" class="space-y-2">
                <div
                  v-for="template in filteredTemplates"
                  :key="template.id"
                  class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/50"
                  @click="selectTemplate(template)"
                >
                  <div class="flex items-center justify-between">
                    <div>
                      <div class="font-medium text-gray-900 dark:text-white">{{ template.name }}</div>
                      <div class="text-xs text-gray-500">{{ template.description }}</div>
                    </div>
                    <div class="flex items-center gap-2">
                      <span
                        class="text-xs px-2 py-0.5 rounded"
                        :class="{
                          'bg-red-100 text-red-700': template.category === 'security',
                          'bg-amber-100 text-amber-700': template.category === 'cost',
                          'bg-blue-100 text-blue-700': template.category === 'compliance',
                          'bg-green-100 text-green-700': template.category === 'inventory',
                          'bg-purple-100 text-purple-700': template.category === 'performance'
                        }"
                      >
                        {{ template.category }}
                      </span>
                      <Icon name="i-heroicons-clipboard-document" class="w-4 h-4 text-gray-400" />
                    </div>
                  </div>
                </div>
              </div>

              <div v-if="queryTemplates.selectedTemplate" class="bg-gray-100 dark:bg-gray-800 rounded-lg p-3 space-y-2">
                <div class="flex items-center justify-between">
                  <span class="text-sm font-medium text-gray-700 dark:text-gray-300">{{ queryTemplates.selectedTemplate.name }}</span>
                  <UButton size="xs" variant="ghost" @click="copyToClipboard(queryTemplates.selectedTemplate.generatedQuery)">
                    <Icon name="i-heroicons-clipboard" class="w-4 h-4" />
                    Copy
                  </UButton>
                </div>
                <pre class="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap overflow-x-auto">{{ queryTemplates.selectedTemplate.generatedQuery }}</pre>
              </div>

              <UButton
                v-if="!queryTemplates.templates.length"
                :loading="queryTemplates.loading"
                @click="fetchQueryTemplates"
              >
                Load Templates
              </UButton>
            </div>
          </div>
        </UCard>
      </div>

      <!-- Query Results Modal -->
      <UModal v-model="showQueryResultsModal" :ui="{ width: 'max-w-6xl' }">
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Query Results</h3>
              <UButton
                color="gray"
                variant="ghost"
                icon="i-heroicons-x-mark"
                @click="showQueryResultsModal = false"
              />
            </div>
          </template>
          <QueryResultsViewer
            v-if="queryResults"
            :records="queryResults.records"
            :attribute-schema="queryResults.attributeSchema"
            :total-count="queryResults.totalCount"
            :query-type="queryResults.queryType"
            :execution-time="queryResults.executionTime"
            @close="showQueryResultsModal = false"
          />
        </UCard>
      </UModal>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useUserRoles } from '~/composables/useUserRoles'

definePageMeta({
  layout: 'default'
})

const { isAdmin } = useUserRoles()
const hasAdminAccess = computed(() => isAdmin.value)

// Global support context for account/environment selection
const supportContext = useSupportContext()

// Expanded card state
const expandedCard = ref<string | null>(null)

function toggleCard(card: string) {
  expandedCard.value = expandedCard.value === card ? null : card
}

// Environment options
const environmentOptions = [
  { label: 'GovCloud', value: 'govcloud' },
  { label: 'Commercial', value: 'commercial' }
]

// Resource type options
const resourceTypeOptions = [
  { label: 'EC2 Instance', value: 'AWS::EC2::Instance' },
  { label: 'S3 Bucket', value: 'AWS::S3::Bucket' },
  { label: 'Security Group', value: 'AWS::EC2::SecurityGroup' },
  { label: 'IAM Role', value: 'AWS::IAM::Role' },
  { label: 'Lambda Function', value: 'AWS::Lambda::Function' },
  { label: 'RDS Instance', value: 'AWS::RDS::DBInstance' },
  { label: 'Network Interface', value: 'AWS::EC2::NetworkInterface' },
  { label: 'EBS Volume', value: 'AWS::EC2::Volume' }
]

// Time range options
const timeRangeOptions = [
  { label: 'Last 1 hour', value: '1h' },
  { label: 'Last 6 hours', value: '6h' },
  { label: 'Last 24 hours', value: '24h' },
  { label: 'Last 7 days', value: '7d' }
]

// IP Lookup state
const ipLookup = reactive({
  ip: '',
  environment: 'govcloud' as 'commercial' | 'govcloud',
  mode: 'manual' as 'manual' | 'ai',
  aiQuery: '',
  generatedQuery: '',
  queryExplanation: '',
  loading: false,
  aiLoading: false,
  result: null as any,
  error: ''
})

// Instance Lookup state
const instanceLookup = reactive({
  query: '',
  environment: 'govcloud' as 'commercial' | 'govcloud',
  loading: false,
  result: null as any,
  error: ''
})

// Resource Search state
const resourceSearch = reactive({
  resourceType: '',
  query: '',
  environment: 'govcloud' as 'commercial' | 'govcloud',
  mode: 'manual' as 'manual' | 'ai',
  aiQuery: '',
  generatedQuery: '',
  queryExplanation: '',
  loading: false,
  aiLoading: false,
  results: [] as any[],
  error: ''
})

// CloudWatch Logs state (uses global context for accountId/environment)
const cloudwatchLogs = reactive({
  logGroup: '',
  filterPattern: '',
  timeRange: '24h',
  mode: 'manual' as 'manual' | 'ai',
  aiQuery: '',
  generatedFilter: '',
  filterExplanation: '',
  loading: false,
  aiLoading: false,
  loadingMore: false,
  results: [] as any[],
  hasMore: false,
  nextToken: '',
  error: ''
})

// Smart Discovery state
const smartDiscovery = reactive({
  query: '',
  environment: 'govcloud' as 'commercial' | 'govcloud',
  loading: false,
  results: [] as any[],
  confidence: 0,
  error: ''
})

// Security Posture state (uses global context for accountId/environment)
const securityPosture = reactive({
  loading: false,
  data: null as any,
  error: ''
})

// Patch Compliance state (uses global context for accountId/environment)
const patchCompliance = reactive({
  instanceId: '',
  loading: false,
  data: null as any,
  error: ''
})

// Cost Anomalies state (uses global context accountId, commercial-only)
const costAnomalies = reactive({
  daysBack: 30,
  loading: false,
  data: null as any,
  error: ''
})

// Access Audit state (uses global context for accountId/environment)
const accessAudit = reactive({
  resourceId: '',
  userName: '',
  loading: false,
  data: null as any,
  error: ''
})

// Instance Health state (uses global context for accountId/environment)
const instanceHealth = reactive({
  instanceId: '',
  loading: false,
  data: null as any,
  error: ''
})

// Query Templates state
const queryTemplates = reactive({
  templates: [] as any[],
  categories: [] as string[],
  selectedCategory: '',
  selectedTemplate: null as any,
  loading: false
})

// Query Results state (for unified results viewer)
const showQueryResultsModal = ref(false)
const queryResults = ref<{
  records: Record<string, any>[]
  attributeSchema: { name: string; type: string; label: string }[]
  totalCount: number
  queryType: string
  executionTime: number
} | null>(null)

const filteredTemplates = computed(() => {
  if (!queryTemplates.selectedCategory) return queryTemplates.templates
  return queryTemplates.templates.filter((t: any) => t.category === queryTemplates.selectedCategory)
})

// IP Lookup functions
async function searchIP() {
  if (!ipLookup.ip.trim()) {
    ipLookup.error = 'Please enter an IP address'
    return
  }

  ipLookup.loading = true
  ipLookup.error = ''
  ipLookup.result = null

  try {
    const response = await $fetch('/api/support/ip-lookup', {
      params: {
        ip: ipLookup.ip.trim(),
        environment: ipLookup.environment
      }
    })
    ipLookup.result = (response as any).data
  } catch (err: any) {
    ipLookup.error = err.data?.error?.message || err.message || 'Failed to lookup IP'
  } finally {
    ipLookup.loading = false
  }
}

async function generateIPQuery() {
  if (!ipLookup.aiQuery.trim()) {
    ipLookup.error = 'Please describe what you want to find'
    return
  }

  ipLookup.aiLoading = true
  ipLookup.error = ''

  try {
    const response = await $fetch('/api/support/ai-query-generator', {
      method: 'POST',
      body: {
        naturalLanguageQuery: ipLookup.aiQuery,
        queryType: 'config',
        context: {
          environment: ipLookup.environment
        }
      }
    })

    const data = (response as any).data
    ipLookup.generatedQuery = data.generatedQuery
    ipLookup.queryExplanation = data.explanation
  } catch (err: any) {
    ipLookup.error = err.data?.error?.message || err.message || 'Failed to generate query'
  } finally {
    ipLookup.aiLoading = false
  }
}

async function executeGeneratedIPQuery() {
  // Extract IP from generated query and execute
  const ipMatch = ipLookup.generatedQuery.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/)
  if (ipMatch) {
    ipLookup.ip = ipMatch[1]
    await searchIP()
  } else {
    ipLookup.error = 'Could not extract IP from generated query. Please use manual mode.'
  }
}

// Instance Lookup functions
async function searchInstance() {
  if (!instanceLookup.query.trim()) {
    instanceLookup.error = 'Please enter an instance ID, name, or IP'
    return
  }

  instanceLookup.loading = true
  instanceLookup.error = ''
  instanceLookup.result = null

  // Check if it looks like an IP
  const isIP = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(instanceLookup.query.trim())

  try {
    const response = await $fetch('/api/support/ip-lookup', {
      params: {
        ip: isIP ? instanceLookup.query.trim() : undefined,
        instanceId: !isIP ? instanceLookup.query.trim() : undefined,
        environment: instanceLookup.environment
      }
    })
    instanceLookup.result = (response as any).data
  } catch (err: any) {
    instanceLookup.error = err.data?.error?.message || err.message || 'Failed to lookup instance'
  } finally {
    instanceLookup.loading = false
  }
}

// Resource Search functions
async function searchResources() {
  resourceSearch.loading = true
  resourceSearch.error = ''
  resourceSearch.results = []

  try {
    const response = await $fetch('/api/config/resources', {
      params: {
        resourceType: resourceSearch.resourceType || undefined,
        resourceName: resourceSearch.query || undefined,
        environment: resourceSearch.environment,
        responseDetail: 'simple',
        limit: 50
      }
    })

    const data = (response as any).data
    resourceSearch.results = data.resources || []
  } catch (err: any) {
    resourceSearch.error = err.data?.error?.message || err.message || 'Failed to search resources'
  } finally {
    resourceSearch.loading = false
  }
}

async function generateResourceQuery() {
  if (!resourceSearch.aiQuery.trim()) {
    resourceSearch.error = 'Please describe what you want to find'
    return
  }

  resourceSearch.aiLoading = true
  resourceSearch.error = ''

  try {
    const response = await $fetch('/api/support/ai-query-generator', {
      method: 'POST',
      body: {
        naturalLanguageQuery: resourceSearch.aiQuery,
        queryType: 'config',
        context: {
          environment: resourceSearch.environment
        }
      }
    })

    const data = (response as any).data
    resourceSearch.generatedQuery = data.generatedQuery
    resourceSearch.queryExplanation = data.explanation
  } catch (err: any) {
    resourceSearch.error = err.data?.error?.message || err.message || 'Failed to generate query'
  } finally {
    resourceSearch.aiLoading = false
  }
}

async function executeGeneratedResourceQuery() {
  if (!resourceSearch.generatedQuery) {
    resourceSearch.error = 'No query to execute'
    return
  }

  resourceSearch.loading = true
  resourceSearch.error = ''

  try {
    const response = await $fetch('/api/support/execute-query', {
      method: 'POST',
      body: {
        queryType: 'config',
        query: resourceSearch.generatedQuery,
        environment: resourceSearch.environment,
        limit: 100
      }
    })

    const data = (response as any).data
    queryResults.value = data
    showQueryResultsModal.value = true
  } catch (err: any) {
    resourceSearch.error = err.data?.error?.message || err.message || 'Failed to execute query'
  } finally {
    resourceSearch.loading = false
  }
}

// CloudWatch Logs functions
async function searchLogs() {
  if (!cloudwatchLogs.logGroup || !supportContext.isAccountReady.value) {
    cloudwatchLogs.error = 'Log group and account selection are required'
    return
  }

  cloudwatchLogs.loading = true
  cloudwatchLogs.error = ''
  cloudwatchLogs.results = []
  cloudwatchLogs.nextToken = ''

  const timeRangeMs = getTimeRangeMs(cloudwatchLogs.timeRange)
  const now = Date.now()

  try {
    const response = await $fetch('/api/support/cloudwatch-logs', {
      params: {
        logGroup: cloudwatchLogs.logGroup,
        accountId: supportContext.state.accountId,
        filterPattern: cloudwatchLogs.filterPattern || undefined,
        environment: supportContext.state.environment,
        startTime: now - timeRangeMs,
        endTime: now,
        limit: 100
      }
    })

    const data = (response as any).data
    cloudwatchLogs.results = data.logs || []
    cloudwatchLogs.hasMore = data.hasMore
    cloudwatchLogs.nextToken = data.nextToken || ''
  } catch (err: any) {
    cloudwatchLogs.error = err.data?.error?.message || err.message || 'Failed to search logs'
  } finally {
    cloudwatchLogs.loading = false
  }
}

async function loadMoreLogs() {
  if (!cloudwatchLogs.nextToken) return

  cloudwatchLogs.loadingMore = true

  try {
    const response = await $fetch('/api/support/cloudwatch-logs', {
      params: {
        logGroup: cloudwatchLogs.logGroup,
        accountId: supportContext.state.accountId,
        filterPattern: cloudwatchLogs.filterPattern || undefined,
        environment: supportContext.state.environment,
        nextToken: cloudwatchLogs.nextToken,
        limit: 100
      }
    })

    const data = (response as any).data
    cloudwatchLogs.results.push(...(data.logs || []))
    cloudwatchLogs.hasMore = data.hasMore
    cloudwatchLogs.nextToken = data.nextToken || ''
  } catch (err: any) {
    cloudwatchLogs.error = err.data?.error?.message || err.message || 'Failed to load more logs'
  } finally {
    cloudwatchLogs.loadingMore = false
  }
}

async function generateLogFilter() {
  if (!cloudwatchLogs.aiQuery.trim()) {
    cloudwatchLogs.error = 'Please describe what you want to find'
    return
  }

  cloudwatchLogs.aiLoading = true
  cloudwatchLogs.error = ''

  try {
    const response = await $fetch('/api/support/ai-query-generator', {
      method: 'POST',
      body: {
        naturalLanguageQuery: cloudwatchLogs.aiQuery,
        queryType: 'cloudwatch'
      }
    })

    const data = (response as any).data
    cloudwatchLogs.generatedFilter = data.generatedQuery
    cloudwatchLogs.filterExplanation = data.explanation
  } catch (err: any) {
    cloudwatchLogs.error = err.data?.error?.message || err.message || 'Failed to generate filter'
  } finally {
    cloudwatchLogs.aiLoading = false
  }
}

// Helper functions
function getTimeRangeMs(range: string): number {
  const map: Record<string, number> = {
    '1h': 60 * 60 * 1000,
    '6h': 6 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000
  }
  return map[range] || map['24h']
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString()
}

function getLogLevelClass(level: string): string {
  const classes: Record<string, string> = {
    'ERROR': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    'FATAL': 'bg-red-200 text-red-900 dark:bg-red-800 dark:text-red-100',
    'WARN': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    'INFO': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    'DEBUG': 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
    'UNKNOWN': 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
  }
  return classes[level] || classes['UNKNOWN']
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch (err) {
    console.error('Failed to copy:', err)
  }
}

// Smart Discovery functions
async function runSmartDiscovery() {
  if (!smartDiscovery.query.trim()) {
    smartDiscovery.error = 'Please describe what you want to find'
    return
  }

  smartDiscovery.loading = true
  smartDiscovery.error = ''
  smartDiscovery.results = []

  try {
    const response = await $fetch('/api/support/ai-resource-discovery', {
      method: 'POST',
      body: {
        query: smartDiscovery.query,
        environment: smartDiscovery.environment
      }
    })
    const data = (response as any).data
    smartDiscovery.results = data.results || []
    smartDiscovery.confidence = data.confidence || 0
  } catch (err: any) {
    smartDiscovery.error = err.data?.error?.message || err.message || 'Failed to discover resources'
  } finally {
    smartDiscovery.loading = false
  }
}

// Security Posture functions
async function fetchSecurityPosture() {
  securityPosture.loading = true
  securityPosture.error = ''
  securityPosture.data = null

  try {
    const response = await $fetch('/api/support/security-posture', {
      params: {
        accountId: supportContext.isAccountReady.value ? supportContext.state.accountId : undefined,
        environment: supportContext.state.environment
      }
    })
    securityPosture.data = (response as any).data
  } catch (err: any) {
    securityPosture.error = err.data?.error?.message || err.message || 'Failed to fetch security posture'
  } finally {
    securityPosture.loading = false
  }
}

// Patch Compliance functions
async function fetchPatchCompliance() {
  if (!supportContext.isAccountReady.value) {
    patchCompliance.error = 'Account selection is required'
    return
  }

  patchCompliance.loading = true
  patchCompliance.error = ''
  patchCompliance.data = null

  try {
    const response = await $fetch('/api/support/patch-compliance', {
      params: {
        accountId: supportContext.state.accountId,
        instanceId: patchCompliance.instanceId || undefined,
        environment: supportContext.state.environment
      }
    })
    patchCompliance.data = (response as any).data
  } catch (err: any) {
    patchCompliance.error = err.data?.error?.message || err.message || 'Failed to fetch patch compliance'
  } finally {
    patchCompliance.loading = false
  }
}

// Cost Anomalies functions (always commercial)
async function fetchCostAnomalies() {
  costAnomalies.loading = true
  costAnomalies.error = ''
  costAnomalies.data = null

  // For cost anomalies, we need the commercial account ID if user selected an account
  // Cost Explorer is only available in commercial AWS
  let commercialAccountId: string | undefined
  if (supportContext.isAccountReady.value) {
    // If user is in govcloud mode, the accountId might be a govcloud ID
    // We need to look up the linked commercial ID
    const enclaveStore = useEnclaveStore()
    const enclaves = Object.values(enclaveStore.enclaves || {})
    for (const account of enclaves) {
      if (!account) continue
      const commercialId = account.awsStandardAccountID || account.accountId
      const govCloudId = account.awsGovCloudAccountID
      if (commercialId === supportContext.state.accountId || govCloudId === supportContext.state.accountId) {
        commercialAccountId = commercialId
        break
      }
    }
  }

  try {
    const response = await $fetch('/api/support/cost-anomalies', {
      params: {
        accountId: commercialAccountId || undefined,
        daysBack: costAnomalies.daysBack,
        environment: 'commercial' // Cost anomalies are in commercial
      }
    })
    costAnomalies.data = (response as any).data
  } catch (err: any) {
    costAnomalies.error = err.data?.error?.message || err.message || 'Failed to fetch cost anomalies'
  } finally {
    costAnomalies.loading = false
  }
}

// Access Audit functions
async function fetchAccessAudit() {
  if (!supportContext.isAccountReady.value) {
    accessAudit.error = 'Account selection is required'
    return
  }
  if (!accessAudit.resourceId && !accessAudit.userName) {
    accessAudit.error = 'Either Resource ID or User name is required'
    return
  }

  accessAudit.loading = true
  accessAudit.error = ''
  accessAudit.data = null

  try {
    const response = await $fetch('/api/support/access-audit', {
      params: {
        accountId: supportContext.state.accountId,
        resourceId: accessAudit.resourceId || undefined,
        userName: accessAudit.userName || undefined,
        environment: supportContext.state.environment,
        hoursBack: 24
      }
    })
    accessAudit.data = (response as any).data
  } catch (err: any) {
    accessAudit.error = err.data?.error?.message || err.message || 'Failed to fetch access audit'
  } finally {
    accessAudit.loading = false
  }
}

// Instance Health functions
async function fetchInstanceHealth() {
  if (!instanceHealth.instanceId || !supportContext.isAccountReady.value) {
    instanceHealth.error = 'Both Instance ID and Account selection are required'
    return
  }

  instanceHealth.loading = true
  instanceHealth.error = ''
  instanceHealth.data = null

  try {
    const response = await $fetch('/api/support/instance-health', {
      params: {
        instanceId: instanceHealth.instanceId,
        accountId: supportContext.state.accountId,
        environment: supportContext.state.environment
      }
    })
    instanceHealth.data = (response as any).data
  } catch (err: any) {
    instanceHealth.error = err.data?.error?.message || err.message || 'Failed to fetch instance health'
  } finally {
    instanceHealth.loading = false
  }
}

// Query Templates functions
async function fetchQueryTemplates() {
  queryTemplates.loading = true

  try {
    const response = await $fetch('/api/support/query-templates')
    const data = (response as any).data
    queryTemplates.templates = data.templates || []
    queryTemplates.categories = data.categories || []
  } catch (err: any) {
    console.error('Failed to fetch query templates:', err)
  } finally {
    queryTemplates.loading = false
  }
}

function selectTemplate(template: any) {
  queryTemplates.selectedTemplate = template
}

// Load query templates on mount if expanded
onMounted(() => {
  if (expandedCard.value === 'query-templates') {
    fetchQueryTemplates()
  }
})

watch(() => expandedCard.value, (newVal) => {
  if (newVal === 'query-templates' && queryTemplates.templates.length === 0) {
    fetchQueryTemplates()
  }
})
</script>
