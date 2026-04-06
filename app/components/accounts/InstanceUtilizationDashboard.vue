<template>
  <div class="space-y-6">
    <!-- Header Section -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div class="flex items-center gap-3">
        <UIcon name="i-heroicons-chart-bar" class="text-blue-500 w-6 h-6" />
        <h2 class="text-xl font-bold text-gray-900 dark:text-white">Cost Optimization</h2>
        <UBadge v-if="analyzing" color="blue" variant="soft" size="sm">
          <UIcon name="i-heroicons-arrow-path" class="animate-spin mr-1 w-4 h-4" />
          Analyzing...
        </UBadge>
        <UBadge v-else-if="retrying" color="blue" variant="soft" size="sm">
          <UIcon name="i-heroicons-arrow-path" class="animate-spin mr-1 w-4 h-4" />
          Filling in missing metrics...
        </UBadge>
        <UBadge v-else-if="status?.hasResults" color="gray" variant="soft" size="sm">
          Updated {{ formatTimeAgo(status.latestAnalysis?.completedAt) }}
        </UBadge>
      </div>
      <UButton
        size="sm"
        color="blue"
        icon="i-heroicons-arrow-path"
        :loading="analyzing"
        :disabled="analyzing"
        @click="triggerAnalysis()"
      >
        {{ analyzing ? 'Analyzing...' : 'Run Analysis' }}
      </UButton>
    </div>

    <!-- Progress Section -->
    <UCard v-if="analyzing && status?.currentJob?.progress">
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-cog-6-tooth" class="text-blue-500 w-5 h-5 animate-spin" />
          <span class="text-sm font-semibold text-gray-900 dark:text-white">
            {{ progressPhaseLabel(status.currentJob.progress.phase) }}
          </span>
        </div>
        <span class="text-sm text-gray-500 dark:text-gray-400">
          {{ status.currentJob.progress.instancesProcessed }} / {{ status.currentJob.progress.totalInstances }} instances
        </span>
      </div>
      <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
        <div
          class="bg-blue-500 h-3 rounded-full transition-all duration-500"
          :style="{ width: progressPercent + '%' }"
        />
      </div>
      <div class="text-right mt-1 text-sm text-gray-500 dark:text-gray-400">{{ progressPercent }}%</div>
    </UCard>

    <!-- Stale Data Warning -->
    <UAlert
      v-if="staleData && !analyzing"
      color="yellow"
      variant="soft"
      icon="i-heroicons-exclamation-triangle"
      title="Outdated analysis results"
      :description="`Only ${data?.summary?.totalInstances || 0} instances were analyzed, but this account has ${expectedInstanceCount || 'more'} instances. A fresh analysis is starting automatically.`"
    />

    <!-- Loading State -->
    <CenteredLoadingSpinner v-if="loading && !data" />

    <!-- Error State -->
    <UAlert
      v-else-if="error && !data"
      color="red"
      variant="soft"
      icon="i-heroicons-exclamation-triangle"
      title="Failed to load utilization data"
      description="There was an error retrieving the instance utilization analysis. Try running a new analysis."
    >
      <template #actions>
        <UButton size="sm" color="blue" @click="triggerAnalysis()">
          Run Analysis
        </UButton>
      </template>
    </UAlert>

    <!-- Empty State -->
    <div v-else-if="!data || data.summary.totalInstances === 0" class="flex justify-center py-16">
      <template v-if="!status?.hasResults">
        <UCard class="max-w-md text-center">
          <div class="flex flex-col items-center gap-4 py-4">
            <UIcon name="i-heroicons-chart-bar" class="w-16 h-16 text-gray-300 dark:text-gray-600" />
            <div>
              <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-1">No Analysis Yet</h3>
              <p class="text-sm text-gray-500 dark:text-gray-400">
                Run your first utilization analysis to identify cost optimization opportunities.
              </p>
            </div>
            <UButton size="md" color="blue" icon="i-heroicons-play" @click="triggerAnalysis()">
              Run First Analysis
            </UButton>
          </div>
        </UCard>
      </template>
      <template v-else>
        <div class="text-center text-gray-500 dark:text-gray-400">
          <UIcon name="i-heroicons-inbox" class="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p class="text-base">No instances found in this account</p>
        </div>
      </template>
    </div>

    <!-- Main Dashboard Content -->
    <template v-else>
      <!-- Summary Stats Row -->
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <button
          v-for="cat in categories"
          :key="cat.key"
          class="relative rounded-lg border-l-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-4 text-left transition-all hover:shadow-md"
          :class="[
            cat.borderClass,
            activeFilter === cat.key ? 'ring-2 ring-blue-400 shadow-md' : '',
            cat.count === 0 ? 'opacity-50 cursor-default' : 'cursor-pointer'
          ]"
          :disabled="cat.count === 0"
          @click="cat.count > 0 && toggleFilter(cat.key)"
        >
          <div class="text-3xl font-bold" :class="cat.textClass">{{ cat.count }}</div>
          <div class="text-sm text-gray-600 dark:text-gray-400 mt-1">{{ cat.label }}</div>
          <UIcon
            v-if="activeFilter === cat.key"
            name="i-heroicons-funnel-solid"
            class="absolute top-2 right-2 w-4 h-4 text-blue-400"
          />
        </button>
      </div>

      <!-- Savings Banner + Donut Chart Row -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Donut Chart -->
        <UCard class="lg:col-span-1">
          <template #header>
            <div class="text-sm font-semibold text-gray-900 dark:text-white">Classification Breakdown</div>
          </template>
          <div class="h-56 flex items-center justify-center">
            <VChart :option="donutChartOptions" autoresize class="w-full h-full" />
          </div>
        </UCard>

        <!-- Savings + Summary -->
        <div class="lg:col-span-2 space-y-4">
          <!-- Savings Banner -->
          <UCard
            v-if="data.summary.totalPotentialMonthlySavings > 0"
            :ui="{ body: { padding: 'p-0 sm:p-0' } }"
          >
            <div class="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 p-6 rounded-lg">
              <div class="flex items-center gap-3 mb-3">
                <div class="p-2 bg-green-100 dark:bg-green-800/40 rounded-lg">
                  <UIcon name="i-heroicons-currency-dollar" class="text-green-600 dark:text-green-400 w-6 h-6" />
                </div>
                <div class="text-base font-semibold text-green-800 dark:text-green-300">Estimated Potential Savings</div>
              </div>
              <div class="flex flex-wrap items-baseline gap-4">
                <div>
                  <span class="text-3xl font-bold text-green-700 dark:text-green-300">
                    ${{ formatNumber(data.summary.totalPotentialMonthlySavings) }}
                  </span>
                  <span class="text-base text-green-600 dark:text-green-400 ml-1">/month</span>
                </div>
                <div class="text-lg text-green-600 dark:text-green-400">
                  <span class="font-semibold">${{ formatNumber(data.summary.totalPotentialMonthlySavings * 12) }}</span>
                  <span class="ml-1">/year</span>
                </div>
              </div>
            </div>
          </UCard>

          <!-- Quick Insights -->
          <UCard>
            <template #header>
              <div class="text-sm font-semibold text-gray-900 dark:text-white">Quick Insights</div>
            </template>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <div class="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">Total Instances</div>
                <div class="text-2xl font-bold text-gray-900 dark:text-white">{{ data.summary.totalInstances }}</div>
              </div>
              <div>
                <div class="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">Flagged for Review</div>
                <div class="text-2xl font-bold" :class="flaggedCount > 0 ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'">
                  {{ flaggedCount }}
                </div>
              </div>
              <div>
                <div class="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">Right-sized</div>
                <div class="text-2xl font-bold text-green-600 dark:text-green-400">{{ data.summary.rightSized }}</div>
              </div>
              <div>
                <div class="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">Insufficient Data</div>
                <div class="text-2xl font-bold text-gray-500 dark:text-gray-400">{{ data.summary.insufficientData }}</div>
              </div>
            </div>
          </UCard>
        </div>
      </div>

      <!-- Instance Table -->
      <UCard>
        <template #header>
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div class="text-base font-semibold text-gray-900 dark:text-white">
              Instance Details
              <UBadge color="gray" variant="soft" size="sm" class="ml-2">
                {{ filteredInstances.length }} instance{{ filteredInstances.length !== 1 ? 's' : '' }}
              </UBadge>
              <NuxtLink to="/support/docs#cost-optimization-guide" class="ml-2">
                <UButton
                  icon="i-heroicons-question-mark-circle"
                  color="gray"
                  variant="ghost"
                  size="xs"
                  title="Learn about classifications"
                />
              </NuxtLink>
            </div>
            <div class="flex items-center gap-2">
              <UBadge
                v-if="activeFilter"
                color="blue"
                variant="soft"
                size="sm"
                class="cursor-pointer"
                @click="activeFilter = null"
              >
                Filtering: {{ classificationLabel(activeFilter as Classification) }}
                <UIcon name="i-heroicons-x-mark" class="ml-1 w-3 h-3" />
              </UBadge>
              <UButton
                v-if="!showAll && nonFlaggedCount > 0 && !activeFilter"
                size="xs"
                color="gray"
                variant="soft"
                @click="showAll = true"
              >
                Show all {{ data.summary.totalInstances }} instances
              </UButton>
              <UButton
                v-if="showAll && !activeFilter"
                size="xs"
                color="gray"
                variant="soft"
                @click="showAll = false"
              >
                Show flagged only ({{ flaggedCount }})
              </UButton>
            </div>
          </div>
        </template>

        <!-- All Clear Message -->
        <div v-if="filteredInstances.length === 0 && flaggedCount === 0 && !activeFilter" class="text-center py-8">
          <UIcon name="i-heroicons-check-circle" class="text-green-500 w-10 h-10 mx-auto mb-2" />
          <div class="text-base text-gray-600 dark:text-gray-400">All instances appear well-utilized</div>
        </div>

        <div v-else-if="filteredInstances.length === 0" class="text-center py-8 text-gray-500 dark:text-gray-400">
          No instances match the current filter
        </div>

        <template v-else>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th
                    v-for="col in tableColumns"
                    :key="col.key"
                    class="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 whitespace-nowrap"
                    :class="col.sortable ? 'cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none' : ''"
                    @click="col.sortable && handleSort(col.key)"
                  >
                    <span class="inline-flex items-center gap-1">
                      {{ col.label }}
                      <UIcon
                        v-if="col.sortable && sortColumn === col.key"
                        :name="sortDirection === 'asc' ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
                        class="w-3 h-3"
                      />
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                <template v-for="inst in paginatedInstances" :key="inst.instanceId">
                  <!-- Data Row -->
                  <tr
                    class="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                    :class="expandedIds.has(inst.instanceId) ? 'bg-gray-50 dark:bg-gray-800/50' : ''"
                  >
                    <!-- Classification -->
                    <td class="px-3 py-3 whitespace-nowrap">
                      <UBadge :color="classificationColor(inst.classification)" variant="soft" size="sm">
                        {{ classificationLabel(inst.classification) }}
                      </UBadge>
                    </td>
                    <!-- Instance Name -->
                    <td class="px-3 py-3 whitespace-nowrap">
                      <button class="text-left hover:text-blue-500 transition-colors" @click="toggleExpand(inst.instanceId)">
                        <div class="font-medium text-gray-900 dark:text-white">{{ inst.instanceName || 'Unnamed' }}</div>
                      </button>
                    </td>
                    <!-- Instance ID -->
                    <td class="px-3 py-3 whitespace-nowrap">
                      <span class="font-mono text-xs text-gray-500 dark:text-gray-400">{{ inst.instanceId }}</span>
                    </td>
                    <!-- Type -->
                    <td class="px-3 py-3 whitespace-nowrap">
                      <UBadge color="gray" variant="soft" size="sm">{{ inst.instanceType }}</UBadge>
                    </td>
                    <!-- Active Days -->
                    <td class="px-3 py-3 whitespace-nowrap">
                      <span v-if="inst.totalDaysMonitored > 0" :class="cpuColor(inst.activeDaysCount / inst.totalDaysMonitored * 100)">
                        {{ inst.activeDaysCount }}/{{ inst.totalDaysMonitored }}d
                      </span>
                      <span v-else class="text-gray-400">&mdash;</span>
                    </td>
                    <!-- Peak CPU -->
                    <td class="px-3 py-3 whitespace-nowrap">
                      <span v-if="inst.metrics?.maxCpuPercent != null" :class="cpuColor(inst.metrics.maxCpuPercent)">
                        {{ inst.metrics.maxCpuPercent.toFixed(1) }}%
                      </span>
                      <span v-else class="text-gray-400">&mdash;</span>
                    </td>
                    <!-- Trend -->
                    <td class="px-3 py-3 whitespace-nowrap">
                      <div v-if="inst.maxCpuDailyValues && inst.maxCpuDailyValues.length > 1" style="width: 100px; height: 28px;">
                        <VChart :option="sparklineOptions(inst)" :init-options="{ width: 100, height: 28 }" :autoresize="false" />
                      </div>
                      <span v-else class="text-gray-400 text-xs">&mdash;</span>
                    </td>
                    <!-- Monthly Cost -->
                    <td class="px-3 py-3 whitespace-nowrap">
                      <span v-if="inst.monthlyEstimate" class="font-semibold text-gray-700 dark:text-gray-300">
                        ${{ inst.monthlyEstimate.toFixed(0) }}
                      </span>
                      <span v-else class="text-gray-400">&mdash;</span>
                    </td>
                    <!-- Expand -->
                    <td class="px-3 py-3 whitespace-nowrap">
                      <UButton
                        size="xs"
                        color="gray"
                        variant="ghost"
                        :icon="expandedIds.has(inst.instanceId) ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
                        @click="toggleExpand(inst.instanceId)"
                      />
                    </td>
                  </tr>

                  <!-- Expanded Detail Row (inline, directly below its parent) -->
                  <tr v-if="expandedIds.has(inst.instanceId)">
                    <td :colspan="tableColumns.length" class="p-0">
                      <div class="bg-gray-50 dark:bg-gray-800/30 px-6 py-5 space-y-5">
                        <!-- Key Activity Metrics -->
                        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
                          <div class="bg-white dark:bg-gray-900 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                            <div class="text-xs uppercase tracking-wider text-gray-500 mb-1">Last Active</div>
                            <div class="text-base font-semibold text-gray-900 dark:text-white">
                              {{ inst.lastActiveDate ? formatShortDate(inst.lastActiveDate) : 'No activity' }}
                            </div>
                            <div v-if="inst.lastActiveDate" class="text-xs text-gray-500 mt-1">
                              {{ daysAgo(inst.lastActiveDate) }} days ago
                            </div>
                          </div>
                          <div class="bg-white dark:bg-gray-900 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                            <div class="text-xs uppercase tracking-wider text-gray-500 mb-1">Active Days</div>
                            <div class="text-base font-semibold" :class="inst.activeDaysCount === 0 ? 'text-red-500' : inst.activeDaysCount < 3 ? 'text-yellow-500' : 'text-green-500'">
                              {{ inst.activeDaysCount }} of {{ inst.totalDaysMonitored }}
                            </div>
                            <div class="text-xs text-gray-500 mt-1">
                              {{ inst.totalDaysMonitored > 0 ? Math.round((inst.activeDaysCount / inst.totalDaysMonitored) * 100) : 0 }}% of monitored period
                            </div>
                          </div>
                          <div class="bg-white dark:bg-gray-900 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                            <div class="text-xs uppercase tracking-wider text-gray-500 mb-1">Launched</div>
                            <div class="text-base font-semibold text-gray-900 dark:text-white">
                              {{ inst.launchTime ? formatShortDate(inst.launchTime) : 'Unknown' }}
                            </div>
                            <div v-if="inst.launchTime" class="text-xs text-gray-500 mt-1">
                              {{ instanceAge(inst.launchTime) }}
                            </div>
                          </div>
                          <div class="bg-white dark:bg-gray-900 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                            <div class="text-xs uppercase tracking-wider text-gray-500 mb-1">Monthly Cost</div>
                            <div class="text-base font-semibold text-gray-900 dark:text-white">
                              {{ inst.monthlyEstimate ? `$${inst.monthlyEstimate.toFixed(2)}` : 'N/A' }}
                            </div>
                            <div v-if="inst.monthlyEstimate" class="text-xs text-gray-500 mt-1">
                              ${{ formatNumber(inst.monthlyEstimate * 12) }}/year
                            </div>
                          </div>
                        </div>

                        <!-- Data Sources Checklist -->
                        <div class="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                          <div class="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-3">Data Sources Used</div>
                          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                            <!-- CPU Metrics -->
                            <div class="flex items-start gap-2">
                              <UIcon
                                :name="inst.metrics?.avgCpuPercent != null || inst.metrics?.maxCpuPercent != null ? 'i-heroicons-check-circle-solid' : 'i-heroicons-x-circle-solid'"
                                :class="inst.metrics?.avgCpuPercent != null || inst.metrics?.maxCpuPercent != null ? 'text-green-500' : 'text-gray-300 dark:text-gray-600'"
                                class="w-5 h-5 flex-shrink-0 mt-0.5"
                              />
                              <div>
                                <div class="text-sm font-medium text-gray-900 dark:text-white">CPU</div>
                                <div class="text-xs text-gray-500 dark:text-gray-400">
                                  <template v-if="inst.metrics?.maxCpuPercent != null">Peak {{ inst.metrics.maxCpuPercent.toFixed(1) }}%</template>
                                  <template v-else>No data</template>
                                </div>
                              </div>
                            </div>

                            <!-- Network Metrics -->
                            <div class="flex items-start gap-2">
                              <UIcon
                                :name="inst.metrics?.networkBytesPerDay != null ? 'i-heroicons-check-circle-solid' : 'i-heroicons-x-circle-solid'"
                                :class="inst.metrics?.networkBytesPerDay != null ? 'text-green-500' : 'text-gray-300 dark:text-gray-600'"
                                class="w-5 h-5 flex-shrink-0 mt-0.5"
                              />
                              <div>
                                <div class="text-sm font-medium text-gray-900 dark:text-white">Network</div>
                                <div class="text-xs text-gray-500 dark:text-gray-400">
                                  <template v-if="inst.metrics?.networkBytesPerDay != null">{{ formatBytesShort(inst.metrics.networkBytesPerDay) }}/day</template>
                                  <template v-else>No data</template>
                                </div>
                              </div>
                            </div>

                            <!-- Disk I/O -->
                            <div class="flex items-start gap-2">
                              <UIcon
                                :name="inst.metrics?.diskOpsPerDay != null && inst.metrics.diskOpsPerDay > 0 ? 'i-heroicons-check-circle-solid' : 'i-heroicons-x-circle-solid'"
                                :class="inst.metrics?.diskOpsPerDay != null && inst.metrics.diskOpsPerDay > 0 ? 'text-green-500' : 'text-gray-300 dark:text-gray-600'"
                                class="w-5 h-5 flex-shrink-0 mt-0.5"
                              />
                              <div>
                                <div class="text-sm font-medium text-gray-900 dark:text-white">Disk I/O</div>
                                <div class="text-xs text-gray-500 dark:text-gray-400">
                                  <template v-if="inst.metrics?.diskOpsPerDay != null && inst.metrics.diskOpsPerDay > 0">{{ Math.round(inst.metrics.diskOpsPerDay) }} ops/day</template>
                                  <template v-else>No data</template>
                                </div>
                              </div>
                            </div>

                            <!-- Compute Optimizer -->
                            <div class="flex items-start gap-2">
                              <UIcon
                                :name="inst.optimization ? 'i-heroicons-check-circle-solid' : 'i-heroicons-x-circle-solid'"
                                :class="inst.optimization ? 'text-green-500' : 'text-gray-300 dark:text-gray-600'"
                                class="w-5 h-5 flex-shrink-0 mt-0.5"
                              />
                              <div>
                                <div class="text-sm font-medium text-gray-900 dark:text-white">Optimizer</div>
                                <div class="text-xs text-gray-500 dark:text-gray-400">
                                  <template v-if="inst.optimization">{{ formatFinding(inst.optimization.finding) }}</template>
                                  <template v-else>No finding</template>
                                </div>
                              </div>
                            </div>

                            <!-- CloudTrail API Activity -->
                            <div class="flex items-start gap-2">
                              <UIcon
                                :name="inst.apiActivity ? 'i-heroicons-check-circle-solid' : 'i-heroicons-x-circle-solid'"
                                :class="inst.apiActivity && inst.apiActivity.meaningfulCalls > 0 ? 'text-green-500' : inst.apiActivity ? 'text-yellow-500' : 'text-gray-300 dark:text-gray-600'"
                                class="w-5 h-5 flex-shrink-0 mt-0.5"
                              />
                              <div>
                                <div class="text-sm font-medium text-gray-900 dark:text-white">CloudTrail</div>
                                <div class="text-xs text-gray-500 dark:text-gray-400">
                                  <template v-if="inst.apiActivity && inst.apiActivity.meaningfulCalls > 0">
                                    {{ inst.apiActivity.meaningfulCalls }} API calls
                                  </template>
                                  <template v-else-if="inst.apiActivity">SSM only</template>
                                  <template v-else>No data</template>
                                </div>
                              </div>
                            </div>

                            <!-- Tags -->
                            <div class="flex items-start gap-2">
                              <UIcon
                                :name="inst.owner || inst.project || inst.schedule || inst.patchGroup ? 'i-heroicons-check-circle-solid' : 'i-heroicons-x-circle-solid'"
                                :class="inst.owner || inst.project || inst.schedule || inst.patchGroup ? 'text-green-500' : 'text-gray-300 dark:text-gray-600'"
                                class="w-5 h-5 flex-shrink-0 mt-0.5"
                              />
                              <div>
                                <div class="text-sm font-medium text-gray-900 dark:text-white">Tags</div>
                                <div class="text-xs text-gray-500 dark:text-gray-400">
                                  <template v-if="inst.schedule || inst.patchGroup">
                                    {{ [inst.schedule ? 'Schedule' : '', inst.patchGroup ? 'Patch' : ''].filter(Boolean).join(', ') }}
                                  </template>
                                  <template v-else-if="inst.owner || inst.project">Owner/Project</template>
                                  <template v-else>No key tags</template>
                                </div>
                              </div>
                            </div>
                          </div>

                          <!-- Utilization Score Bar -->
                          <div class="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                            <div class="flex items-center justify-between mb-1">
                              <span class="text-xs font-medium text-gray-500 dark:text-gray-400">Utilization Score</span>
                              <span class="text-xs font-bold" :class="scoreColor(inst.utilizationScore)">{{ inst.utilizationScore }}/100</span>
                            </div>
                            <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                              <div
                                class="h-2 rounded-full transition-all"
                                :class="scoreBarColor(inst.utilizationScore)"
                                :style="{ width: inst.utilizationScore + '%' }"
                              />
                            </div>
                          </div>
                        </div>

                        <!-- Tags Row -->
                        <div v-if="inst.owner || inst.project || inst.schedule || inst.patchGroup" class="flex flex-wrap gap-2">
                          <UBadge v-if="inst.owner" color="blue" variant="soft" size="sm">Owner: {{ inst.owner }}</UBadge>
                          <UBadge v-if="inst.project" color="purple" variant="soft" size="sm">Project: {{ inst.project }}</UBadge>
                          <UBadge v-if="inst.schedule" color="green" variant="soft" size="sm">Schedule: {{ inst.schedule }}</UBadge>
                          <UBadge v-if="inst.patchGroup" color="orange" variant="soft" size="sm">Patch Group: {{ inst.patchGroup }}</UBadge>
                        </div>

                        <!-- Charts Row -->
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div v-if="inst.maxCpuDailyValues && inst.maxCpuDailyValues.length > 1">
                            <div class="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">
                              Peak CPU Over {{ inst.metrics?.lookbackDays || 14 }} Days
                            </div>
                            <div class="h-[150px] bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-2">
                              <VChart :option="detailChartOptions(inst)" :init-options="{ height: 134 }" autoresize class="w-full h-full" />
                            </div>
                          </div>
                          <div v-if="inst.networkDailyValues && inst.networkDailyValues.length > 1">
                            <div class="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">
                              Network I/O Over {{ inst.metrics?.lookbackDays || 14 }} Days
                            </div>
                            <div class="h-[150px] bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-2">
                              <VChart :option="networkChartOptions(inst)" :init-options="{ height: 134 }" autoresize class="w-full h-full" />
                            </div>
                          </div>
                        </div>

                        <!-- Explanation -->
                        <div class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                          {{ inst.explanation }}
                        </div>

                        <!-- Evidence -->
                        <div v-if="inst.evidence && inst.evidence.length > 0">
                          <div class="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">Evidence</div>
                          <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                            <div
                              v-for="(item, idx) in inst.evidence"
                              :key="idx"
                              class="text-sm text-gray-600 dark:text-gray-400 flex items-start gap-2"
                            >
                              <span class="text-gray-400 mt-0.5 flex-shrink-0">&#8226;</span>
                              <span>{{ item }}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>

          <!-- Pagination -->
          <div class="flex justify-between items-center pt-4 border-t border-gray-200 dark:border-gray-700 mt-4">
            <div class="text-sm text-gray-500 dark:text-gray-400">
              Showing {{ paginationStart + 1 }}-{{ Math.min(paginationStart + pageSize, filteredInstances.length) }} of {{ filteredInstances.length }}
            </div>
            <UPagination
              v-model="currentPage"
              :page-count="pageSize"
              :total="filteredInstances.length"
            />
          </div>
        </template>
      </UCard>
    </template>
  </div>
</template>

<script setup lang="ts">
import * as echarts from 'echarts/core'
import { LineChart, PieChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'

echarts.use([LineChart, PieChart, GridComponent, TooltipComponent, LegendComponent])

interface Props {
  accountId: string
  environment: 'govcloud' | 'commercial'
  expectedInstanceCount?: number
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'loaded', data: Record<string, any>): void
}>()

const colorMode = useColorMode()
const environment = computed(() => props.environment)
const accountIdRef = computed(() => props.accountId)

const expectedCount = computed(() => props.expectedInstanceCount)

const {
  status,
  data,
  loading,
  analyzing,
  retrying,
  error,
  staleData,
  utilizationMap,
  triggerAnalysis,
  retryMissing,
  init
} = useUtilizationAnalysis(accountIdRef, environment, expectedCount)

const activeFilter = ref<string | null>(null)
const expandedIds = reactive(new Set<string>())
const showAll = ref(false)
const currentPage = ref(1)
const pageSize = 25
const sortColumn = ref('classification')
const sortDirection = ref<'asc' | 'desc'>('asc')

// Emit utilization map whenever data changes
watch(utilizationMap, (newMap) => {
  emit('loaded', newMap)
}, { immediate: true })

// Re-init when account changes
watch(() => props.accountId, () => {
  activeFilter.value = null
  expandedIds.clear()
  showAll.value = false
  currentPage.value = 1
  init()
})

onMounted(() => {
  init()
})

// Progress helpers
const progressPercent = computed(() => {
  const p = status.value?.currentJob?.progress
  if (!p || p.totalInstances === 0) return 0
  return Math.min(Math.round((p.instancesProcessed / p.totalInstances) * 100), 100)
})

function progressPhaseLabel(phase: string): string {
  const labels: Record<string, string> = {
    config: 'Fetching instance list...',
    cloudwatch: 'Collecting CloudWatch metrics...',
    optimizer: 'Getting Compute Optimizer data...',
    pricing: 'Fetching pricing data...',
    classifying: 'Classifying instances...',
    saving: 'Saving results...',
    done: 'Complete'
  }
  return labels[phase] || phase
}

function formatTimeAgo(dateStr?: string): string {
  if (!dateStr) return 'unknown'
  try {
    const d = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1) return 'just now'
    if (diffMin < 60) return `${diffMin}m ago`
    const diffHr = Math.floor(diffMin / 60)
    if (diffHr < 24) return `${diffHr}h ago`
    return `${Math.floor(diffHr / 24)}d ago`
  } catch { return 'unknown' }
}

// Classification type
type Classification = 'unused' | 'patching-only' | 'underutilized' | 'under-provisioned' | 'right-sized' | 'insufficient-data'

// Classification sort order for table sorting
const classificationOrder: Record<string, number> = {
  'unused': 0,
  'patching-only': 1,
  'underutilized': 2,
  'under-provisioned': 3,
  'right-sized': 4,
  'insufficient-data': 5
}

const categories = computed(() => {
  if (!data.value) return []
  const s = data.value.summary
  return [
    { key: 'unused', label: 'Unused', count: s.unused, borderClass: 'border-l-red-500', textClass: 'text-red-600 dark:text-red-400' },
    { key: 'patching-only', label: 'Patching Only', count: s.patchingOnly, borderClass: 'border-l-orange-500', textClass: 'text-orange-600 dark:text-orange-400' },
    { key: 'underutilized', label: 'Over-provisioned', count: s.underutilized, borderClass: 'border-l-yellow-500', textClass: 'text-yellow-600 dark:text-yellow-400' },
    { key: 'under-provisioned', label: 'Under-provisioned', count: s.underProvisioned, borderClass: 'border-l-purple-500', textClass: 'text-purple-600 dark:text-purple-400' },
    { key: 'right-sized', label: 'Right-sized', count: s.rightSized, borderClass: 'border-l-green-500', textClass: 'text-green-600 dark:text-green-400' },
    { key: 'insufficient-data', label: 'No Data', count: s.insufficientData, borderClass: 'border-l-gray-400', textClass: 'text-gray-500 dark:text-gray-400' }
  ]
})

const flaggedCount = computed(() => {
  if (!data.value) return 0
  const s = data.value.summary
  return s.unused + s.patchingOnly + s.underutilized + (s.underProvisioned || 0)
})

const nonFlaggedCount = computed(() => {
  if (!data.value) return 0
  const s = data.value.summary
  return s.rightSized + s.insufficientData
})

const filteredInstances = computed(() => {
  if (!data.value?.instances) return []
  const all: any[] = data.value.instances

  let result: any[]
  if (activeFilter.value) {
    result = all.filter((i: any) => i.classification === activeFilter.value)
  } else if (showAll.value) {
    result = [...all]
  } else {
    result = all.filter((i: any) =>
      ['unused', 'patching-only', 'underutilized', 'under-provisioned'].includes(i.classification)
    )
  }

  // Sort
  result.sort((a: any, b: any) => {
    let cmp = 0
    switch (sortColumn.value) {
      case 'classification':
        cmp = (classificationOrder[a.classification] ?? 99) - (classificationOrder[b.classification] ?? 99)
        break
      case 'instanceName':
        cmp = (a.instanceName || a.instanceId).localeCompare(b.instanceName || b.instanceId)
        break
      case 'instanceId':
        cmp = a.instanceId.localeCompare(b.instanceId)
        break
      case 'instanceType':
        cmp = (a.instanceType || '').localeCompare(b.instanceType || '')
        break
      case 'activeDays':
        cmp = (a.activeDaysCount || 0) - (b.activeDaysCount || 0)
        break
      case 'peakCpu':
        cmp = (a.metrics?.maxCpuPercent ?? -1) - (b.metrics?.maxCpuPercent ?? -1)
        break
      case 'monthlyCost':
        cmp = (a.monthlyEstimate || 0) - (b.monthlyEstimate || 0)
        break
      default:
        cmp = 0
    }
    return sortDirection.value === 'desc' ? -cmp : cmp
  })

  return result
})

// Keep backward compatibility alias
const displayInstances = filteredInstances

const paginationStart = computed(() => (currentPage.value - 1) * pageSize)

const paginatedInstances = computed(() => {
  return filteredInstances.value.slice(paginationStart.value, paginationStart.value + pageSize)
})

// Reset page when filter changes
watch([activeFilter, showAll], () => {
  currentPage.value = 1
})

// Table columns definition
const tableColumns = [
  { key: 'classification', label: 'Classification', sortable: true },
  { key: 'instanceName', label: 'Instance Name', sortable: true },
  { key: 'instanceId', label: 'Instance ID', sortable: true },
  { key: 'instanceType', label: 'Type', sortable: true },
  { key: 'activeDays', label: 'Active Days', sortable: true },
  { key: 'peakCpu', label: 'Peak CPU', sortable: true },
  { key: 'trend', label: 'Trend' },
  { key: 'monthlyCost', label: 'Monthly Cost', sortable: true },
  { key: 'expand', label: '' }
]

function onSort(sort: { column: string; direction: 'asc' | 'desc' }) {
  sortColumn.value = sort.column
  sortDirection.value = sort.direction
}

function handleSort(column: string) {
  if (sortColumn.value === column) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortColumn.value = column
    sortDirection.value = 'asc'
  }
}

function toggleFilter(key: string) {
  activeFilter.value = activeFilter.value === key ? null : key
}

function toggleExpand(id: string) {
  if (expandedIds.has(id)) {
    expandedIds.delete(id)
  } else {
    expandedIds.add(id)
  }
}

function classificationColor(classification: Classification): string {
  const colors: Record<Classification, string> = {
    'unused': 'red',
    'patching-only': 'orange',
    'underutilized': 'yellow',
    'under-provisioned': 'purple',
    'right-sized': 'green',
    'insufficient-data': 'gray'
  }
  return colors[classification] || 'gray'
}

function classificationLabel(classification: Classification): string {
  const labels: Record<Classification, string> = {
    'unused': 'Unused',
    'patching-only': 'Patch Only',
    'underutilized': 'Over-provisioned',
    'under-provisioned': 'Under-provisioned',
    'right-sized': 'Right-sized',
    'insufficient-data': 'No Data'
  }
  return labels[classification] || classification
}

function cpuColor(cpu: number): string {
  if (cpu < 5) return 'text-red-500'
  if (cpu < 15) return 'text-yellow-500'
  return 'text-green-500'
}

function formatFinding(finding: string): string {
  const labels: Record<string, string> = {
    'OVER_PROVISIONED': 'Over-provisioned',
    'UNDER_PROVISIONED': 'Under-provisioned',
    'OPTIMIZED': 'Optimized',
    'NOT_OPTIMIZED': 'Not optimized'
  }
  return labels[finding] || finding
}

function scoreColor(score: number): string {
  if (score <= 20) return 'text-red-500'
  if (score <= 50) return 'text-yellow-500'
  return 'text-green-500'
}

function scoreBarColor(score: number): string {
  if (score <= 20) return 'bg-red-500'
  if (score <= 50) return 'bg-yellow-500'
  return 'bg-green-500'
}

function formatBytesShort(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`
  return `${(bytes / 1_073_741_824).toFixed(1)} GB`
}

function formatNumber(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function formatShortDate(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch { return 'Unknown' }
}

function daysAgo(dateStr: string): number {
  try {
    const d = new Date(dateStr)
    const now = new Date()
    return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
  } catch { return 0 }
}

function instanceAge(launchTime: string): string {
  try {
    const launch = new Date(launchTime)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - launch.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays < 30) return `${diffDays} days old`
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months old`
    const years = Math.floor(diffDays / 365)
    const months = Math.floor((diffDays % 365) / 30)
    return months > 0 ? `${years}y ${months}m old` : `${years}y old`
  } catch { return '' }
}

// Donut chart options for classification breakdown
const donutChartOptions = computed(() => {
  if (!data.value) return {}
  const isDark = colorMode.value === 'dark'
  const s = data.value.summary

  const chartData = [
    { name: 'Unused', value: s.unused, itemStyle: { color: '#ef4444' } },
    { name: 'Patching Only', value: s.patchingOnly, itemStyle: { color: '#f97316' } },
    { name: 'Over-provisioned', value: s.underutilized, itemStyle: { color: '#eab308' } },
    { name: 'Under-provisioned', value: s.underProvisioned || 0, itemStyle: { color: '#a855f7' } },
    { name: 'Right-sized', value: s.rightSized, itemStyle: { color: '#22c55e' } },
    { name: 'No Data', value: s.insufficientData, itemStyle: { color: '#9ca3af' } }
  ].filter(d => d.value > 0)

  return {
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)'
    },
    legend: {
      orient: 'horizontal',
      bottom: 0,
      textStyle: {
        color: isDark ? '#9ca3af' : '#6b7280',
        fontSize: 11
      },
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 12
    },
    series: [{
      type: 'pie',
      radius: ['45%', '70%'],
      center: ['50%', '42%'],
      avoidLabelOverlap: true,
      label: {
        show: false
      },
      emphasis: {
        label: {
          show: true,
          fontSize: 14,
          fontWeight: 'bold'
        }
      },
      data: chartData
    }],
    animation: true
  }
})

// Sparkline chart options (compact inline -- uses daily max CPU)
function sparklineOptions(inst: any) {
  const values = inst.maxCpuDailyValues || []
  const peakCpu = inst.metrics?.maxCpuPercent ?? 0
  const lineColor = peakCpu < 5 ? '#ef4444' : peakCpu < 15 ? '#eab308' : '#22c55e'

  return {
    grid: { top: 2, right: 2, bottom: 2, left: 2 },
    xAxis: { type: 'category', show: false, data: values.map((_: any, i: number) => i) },
    yAxis: { type: 'value', show: false, min: 0 },
    series: [{
      type: 'line',
      data: values,
      smooth: true,
      symbol: 'none',
      lineStyle: { width: 1.5, color: lineColor },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: lineColor + '40' },
          { offset: 1, color: lineColor + '05' }
        ])
      }
    }],
    tooltip: { show: false },
    animation: false
  }
}

// Detail chart options (expanded view -- uses daily max CPU)
function detailChartOptions(inst: any) {
  const isDark = colorMode.value === 'dark'
  const values = inst.maxCpuDailyValues || []
  const timestamps = inst.cpuDailyTimestamps || []
  const peakCpu = inst.metrics?.maxCpuPercent ?? 0
  const lineColor = peakCpu < 5 ? '#ef4444' : peakCpu < 15 ? '#eab308' : '#22c55e'
  const textColor = isDark ? '#9ca3af' : '#6b7280'

  const labels = timestamps.map((t: string) => {
    try {
      const d = new Date(t)
      return `${d.getMonth() + 1}/${d.getDate()}`
    } catch { return '' }
  })

  return {
    grid: { top: 12, right: 12, bottom: 24, left: 40 },
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: { fontSize: 10, color: textColor, interval: Math.max(0, Math.floor(labels.length / 7) - 1) },
      axisLine: { show: false },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      min: 0,
      axisLabel: { fontSize: 10, color: textColor, formatter: '{value}%' },
      splitLine: { lineStyle: { color: isDark ? '#374151' : '#e5e7eb' } }
    },
    series: [{
      type: 'line',
      data: values,
      smooth: true,
      symbol: 'circle',
      symbolSize: 4,
      lineStyle: { width: 2, color: lineColor },
      itemStyle: { color: lineColor },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: lineColor + '30' },
          { offset: 1, color: lineColor + '05' }
        ])
      }
    }],
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        const p = params[0]
        return `${p.name}: <b>${p.value?.toFixed(1)}%</b> Peak CPU`
      },
      textStyle: { fontSize: 12 }
    },
    animation: false
  }
}

// Network I/O chart options (expanded view -- daily total bytes in+out)
function networkChartOptions(inst: any) {
  const isDark = colorMode.value === 'dark'
  const values = (inst.networkDailyValues || []) as number[]
  const timestamps = (inst.networkDailyTimestamps || []) as string[]
  const textColor = isDark ? '#9ca3af' : '#6b7280'

  // Determine scale: show in KB or MB
  const maxVal = values.length > 0 ? Math.max(...values) : 0
  const useMB = maxVal >= 1_048_576
  const scaledValues = values.map((v: number) => useMB ? v / 1_048_576 : v / 1024)
  const unit = useMB ? 'MB' : 'KB'

  // Color based on average daily traffic vs idle threshold (5 MB/day)
  const avgPerDay = values.length > 0 ? values.reduce((s: number, v: number) => s + v, 0) / values.length : 0
  const lineColor = avgPerDay < 5_000_000 ? '#ef4444' : avgPerDay < 50_000_000 ? '#3b82f6' : '#22c55e'

  const labels = timestamps.map((t: string) => {
    try {
      const d = new Date(t)
      return `${d.getMonth() + 1}/${d.getDate()}`
    } catch { return '' }
  })

  return {
    grid: { top: 12, right: 12, bottom: 24, left: 48 },
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: { fontSize: 10, color: textColor, interval: Math.max(0, Math.floor(labels.length / 7) - 1) },
      axisLine: { show: false },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      min: 0,
      axisLabel: { fontSize: 10, color: textColor, formatter: `{value} ${unit}` },
      splitLine: { lineStyle: { color: isDark ? '#374151' : '#e5e7eb' } }
    },
    series: [{
      type: 'line',
      data: scaledValues,
      smooth: true,
      symbol: 'circle',
      symbolSize: 4,
      lineStyle: { width: 2, color: lineColor },
      itemStyle: { color: lineColor },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: lineColor + '30' },
          { offset: 1, color: lineColor + '05' }
        ])
      }
    }],
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        const p = params[0]
        return `${p.name}: <b>${p.value?.toFixed(1)} ${unit}</b>`
      },
      textStyle: { fontSize: 12 }
    },
    animation: false
  }
}
</script>
