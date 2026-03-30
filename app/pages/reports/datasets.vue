<template>
  <div class="flex flex-col h-full overflow-hidden bg-gray-900">
    <!-- Compressed Header: Beta Badge + Title + Tabs in One Row -->
    <div class="bg-gray-800 border-b border-gray-700 px-6 py-3 flex-shrink-0">
      <div class="flex items-center justify-between gap-4">
        <!-- Left: Title + Beta Badge -->
        <div class="flex items-center gap-3">
          <h1 class="text-lg font-semibold text-white">Dataset Reports</h1>
          <UBadge color="yellow" variant="soft" size="xs" class="flex items-center gap-1">
            <UIcon name="i-heroicons-exclamation-triangle" class="w-3 h-3" />
            <span>Beta</span>
          </UBadge>
        </div>

        <!-- Right: Tab Navigation -->
        <UTabs
          :items="tabItems"
          :ui="{
            wrapper: 'inline-flex',
            list: {
              base: 'flex items-center gap-1 bg-gray-900/50 rounded-lg p-1'
            },
            container: 'hidden'
          }"
          v-model="activeTab"
        />
      </div>
    </div>

    <!-- Main Content Area with Tab Panels -->
    <div class="flex-1 flex flex-col min-h-0 overflow-hidden">
      <!-- Query Builder Tab -->
      <div v-if="activeTab === 0" class="flex-1 flex overflow-hidden h-full min-h-0 relative">
        <!-- LEFT SIDEBAR: Query Configuration (Accordion) -->
        <div class="w-80 bg-gray-800 border-r border-gray-700 flex flex-col h-full min-h-0 flex-shrink-0">
          <!-- Sidebar Header -->
          <div class="px-4 py-3 border-b border-gray-700 flex-shrink-0">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <UIcon name="i-heroicons-adjustments-horizontal" class="w-5 h-5 text-blue-400" />
                <h2 class="text-sm font-semibold text-white">Query Configuration</h2>
              </div>
              <UButton
                icon="i-heroicons-sparkles"
                size="xs"
                color="purple"
                variant="soft"
                @click="showPresetModal = true"
              >
                Presets
              </UButton>
            </div>
          </div>

          <!-- Scrollable Accordion Sections -->
          <div class="flex-1 overflow-y-auto min-h-0">
            <UAccordion
              v-model="openAccordionIndex"
              :items="accordionItems"
              :ui="{
                wrapper: 'flex flex-col',
                item: {
                  base: 'border-b border-gray-700',
                  padding: 'p-0'
                }
              }"
              :multiple="false"
            >
              <!-- Section 1: Select Accounts -->
              <template #accounts>
                <div class="p-4 space-y-3">
                  <div class="flex items-center justify-between mb-2">
                    <span class="text-xs font-medium text-gray-400">Selected Accounts</span>
                    <UBadge v-if="selectedAccounts.length > 0" color="blue" variant="soft" size="xs">
                      {{ selectedAccounts.length }}
                    </UBadge>
                  </div>
                  <DatasetAccountSelector v-model="selectedAccounts" />
                </div>
              </template>

              <!-- Section 2: Choose Datasets -->
              <template #datasets>
                <div class="p-4 space-y-2">
                  <div class="flex items-center justify-between mb-2">
                    <span class="text-xs font-medium text-gray-400">Active Datasets</span>
                    <UBadge v-if="selectedDatasetsCount > 0" color="blue" variant="soft" size="xs">
                      {{ selectedDatasetsCount }}
                    </UBadge>
                  </div>
                  <div
                    v-for="dataset in datasetOptions"
                    :key="dataset.key"
                    :class="[
                      'p-3 rounded-lg border cursor-pointer transition-all',
                      queryBuilder.datasets[dataset.key].enabled
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-gray-700 hover:border-gray-600 bg-gray-900/50'
                    ]"
                    @click="toggleDataset(dataset.key)"
                  >
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-2">
                        <UIcon :name="dataset.icon" class="w-4 h-4 text-gray-400" />
                        <div>
                          <div class="text-sm font-medium text-white">{{ dataset.label }}</div>
                          <div class="text-xs text-gray-400">{{ dataset.description }}</div>
                        </div>
                      </div>
                      <UToggle :model-value="queryBuilder.datasets[dataset.key].enabled" size="sm" />
                    </div>
                  </div>
                </div>
              </template>

              <!-- Section 3: Apply Filters -->
              <template #filters>
                <div class="p-4 space-y-3">
                  <div v-if="!hasAnyDatasetSelected" class="text-xs text-gray-500 italic py-2">
                    Select datasets above to configure filters
                  </div>

                  <!-- AWS Config Filters -->
                  <div v-if="queryBuilder.datasets.config.enabled" class="space-y-2">
                    <div class="flex items-center gap-2 text-xs font-semibold text-gray-300">
                      <UIcon name="i-heroicons-cog-6-tooth" class="w-4 h-4 text-blue-400" />
                      <span>AWS Config</span>
                    </div>
                    <div class="pl-6">
                      <ConfigFilters v-model="queryBuilder.datasets.config.filters" />
                    </div>
                  </div>

                  <!-- Security Hub Filters -->
                  <div v-if="queryBuilder.datasets.securityHub.enabled" class="space-y-2">
                    <div class="flex items-center gap-2 text-xs font-semibold text-gray-300">
                      <UIcon name="i-heroicons-shield-check" class="w-4 h-4 text-red-400" />
                      <span>Security Hub</span>
                    </div>
                    <div class="pl-6">
                      <SecurityHubFilters v-model="queryBuilder.datasets.securityHub.filters" />
                    </div>
                  </div>

                  <!-- CloudTrail Filters -->
                  <div v-if="queryBuilder.datasets.cloudtrail.enabled" class="space-y-2">
                    <div class="flex items-center gap-2 text-xs font-semibold text-gray-300">
                      <UIcon name="i-heroicons-document-text" class="w-4 h-4 text-green-400" />
                      <span>CloudTrail</span>
                    </div>
                    <div class="pl-6">
                      <CloudTrailFilters v-model="queryBuilder.datasets.cloudtrail.filters" />
                    </div>
                  </div>

                  <!-- Entra Users Filters -->
                  <div v-if="queryBuilder.datasets.entraUsers.enabled" class="space-y-2">
                    <div class="flex items-center gap-2 text-xs font-semibold text-gray-300">
                      <UIcon name="i-heroicons-users" class="w-4 h-4 text-purple-400" />
                      <span>Entra ID Users</span>
                    </div>
                    <div class="pl-6">
                      <EntraUsersFilters v-model="queryBuilder.datasets.entraUsers.filters" />
                    </div>
                  </div>
                </div>
              </template>
            </UAccordion>
          </div>

          <!-- Sticky Sidebar Footer -->
          <div class="p-4 border-t border-gray-700 bg-gray-800 flex-shrink-0 space-y-3">
            <!-- Progress Indicator -->
            <div class="flex items-center justify-between text-xs">
              <span class="text-gray-400">Configuration:</span>
              <div class="flex items-center gap-2">
                <span :class="[
                  'font-medium',
                  configurationProgress >= 75 ? 'text-green-400' : 'text-yellow-400'
                ]">
                  {{ configurationProgress }}% Complete
                </span>
                <UIcon
                  v-if="configurationProgress === 100"
                  name="i-heroicons-check-circle"
                  class="w-4 h-4 text-green-400"
                />
              </div>
            </div>

            <!-- Action Button -->
            <UButton
              block
              color="primary"
              size="md"
              @click="handlePreviewQuery"
              :disabled="!canRunQuery"
              :loading="previewLoading"
            >
              <UIcon name="i-heroicons-eye" class="w-4 h-4 mr-2" />
              Preview Query
            </UButton>
          </div>
        </div>

        <!-- CENTER PANEL: Main Preview Area -->
        <div class="flex-1 flex flex-col overflow-hidden bg-gray-900 min-w-0">
          <!-- Preview Header with Workflow Stage -->
          <div class="px-6 py-3 border-b border-gray-700 bg-gray-800/50 flex-shrink-0">
            <div class="flex items-center justify-between">
              <div>
                <div class="flex items-center gap-3 mb-1">
                  <h2 class="text-sm font-semibold text-white">Query Preview</h2>
                  <UBadge
                    v-if="workflowStage > 0"
                    color="blue"
                    variant="soft"
                    size="xs"
                  >
                    Step {{ workflowStage }} of 3
                  </UBadge>
                </div>
                <p class="text-xs text-gray-400">
                  <span v-if="!hasAnyDatasetSelected">Select datasets to preview query results</span>
                  <span v-else-if="previewLoading">Loading preview data...</span>
                  <span v-else-if="hasPreviewData">Showing sample of {{ previewRowCount }} total records</span>
                  <span v-else>Click "Preview Query" to see results</span>
                </p>
              </div>

              <!-- Header Actions (only show when has preview data) -->
              <div v-if="hasPreviewData" class="flex items-center gap-2">
                <UButton
                  color="gray"
                  variant="ghost"
                  icon="i-heroicons-arrow-path"
                  size="sm"
                  @click="refreshPreview"
                >
                  Refresh
                </UButton>
              </div>
            </div>
          </div>

          <!-- Preview Content -->
          <div class="flex-1 overflow-auto p-6 min-h-0">
            <!-- Empty State - No Datasets Selected -->
            <div v-if="!hasAnyDatasetSelected" class="flex flex-col items-center justify-center h-full text-center">
              <UIcon name="i-heroicons-table-cells" class="w-16 h-16 text-gray-700 mb-4" />
              <h3 class="text-lg font-semibold text-white mb-2">Build Your Query</h3>
              <p class="text-sm text-gray-400 max-w-md mb-6">
                Use the accordion sections on the left to configure your report query.
              </p>
              <div class="flex flex-col gap-3 text-xs text-gray-500">
                <div class="flex items-center gap-2">
                  <div class="flex items-center justify-center w-6 h-6 rounded-full bg-gray-800 text-gray-400 text-xs font-medium">1</div>
                  <span>Select AWS accounts (left sidebar)</span>
                </div>
                <div class="flex items-center gap-2">
                  <div class="flex items-center justify-center w-6 h-6 rounded-full bg-gray-800 text-gray-400 text-xs font-medium">2</div>
                  <span>Choose datasets (Config, Security Hub, CloudTrail)</span>
                </div>
                <div class="flex items-center gap-2">
                  <div class="flex items-center justify-center w-6 h-6 rounded-full bg-gray-800 text-gray-400 text-xs font-medium">3</div>
                  <span>Apply filters to refine results (optional)</span>
                </div>
                <div class="flex items-center gap-2">
                  <div class="flex items-center justify-center w-6 h-6 rounded-full bg-gray-800 text-gray-400 text-xs font-medium">4</div>
                  <span>Configure output options (right sidebar)</span>
                </div>
              </div>
            </div>

            <!-- Loading State -->
            <div v-else-if="previewLoading" class="flex flex-col items-center justify-center h-full">
              <UIcon name="i-heroicons-arrow-path" class="w-12 h-12 animate-spin text-blue-500 mb-4" />
              <p class="text-sm text-gray-300 font-medium">Generating preview...</p>
              <p class="text-xs text-gray-500 mt-1">Fetching data from selected datasets</p>
            </div>

            <!-- Preview Data with Tabs -->
            <div v-else-if="hasPreviewData" class="space-y-4 h-full flex flex-col min-h-0">
              <!-- Query Summary Stats -->
              <div class="grid grid-cols-4 gap-4 flex-shrink-0">
                <div class="bg-gray-800 rounded-lg border border-gray-700 p-4">
                  <div class="text-xs text-gray-400 mb-1">Accounts</div>
                  <div class="text-2xl font-bold text-white">{{ selectedAccounts.length || 'All' }}</div>
                </div>
                <div class="bg-gray-800 rounded-lg border border-gray-700 p-4">
                  <div class="text-xs text-gray-400 mb-1">Datasets</div>
                  <div class="text-2xl font-bold text-white">{{ selectedDatasetsCount }}</div>
                </div>
                <div class="bg-gray-800 rounded-lg border border-gray-700 p-4">
                  <div class="text-xs text-gray-400 mb-1">Preview Records</div>
                  <div class="text-2xl font-bold text-white">{{ previewRowCount.toLocaleString() }}</div>
                </div>
                <div class="bg-gray-800 rounded-lg border border-gray-700 p-4">
                  <div class="text-xs text-gray-400 mb-1">Est. Full Size</div>
                  <div class="text-2xl font-bold text-white">{{ estimatedSize }}</div>
                </div>
              </div>

              <!-- Tabbed Dataset Preview -->
              <div class="flex-1 min-h-0 bg-gray-800 rounded-lg border border-gray-700 overflow-hidden flex flex-col">
                <UTabs
                  :items="previewTabs"
                  class="flex-1 flex flex-col min-h-0"
                  :ui="{
                    wrapper: 'flex flex-col h-full min-h-0',
                    list: {
                      base: 'border-b border-gray-700 bg-gray-900/30',
                      background: 'bg-transparent',
                      marker: {
                        background: 'bg-blue-500'
                      }
                    },
                    container: 'flex-1 overflow-auto'
                  }"
                >
                  <template #item="{ item }">
                    <div class="p-4 overflow-auto">
                      <!-- Resource Type Filter (if multiple types exist) -->
                      <div v-if="getResourceTypesInTab(item.dataset).length > 1" class="mb-4 flex items-center gap-3">
                        <USelectMenu
                          v-model="selectedResourceType[item.dataset]"
                          :options="[
                            { label: 'All Types', value: null },
                            ...getResourceTypesInTab(item.dataset).map(rt => ({ label: rt, value: rt }))
                          ]"
                          placeholder="Filter by resource type"
                          size="sm"
                          class="w-80"
                        />
                        <UBadge v-if="selectedResourceType[item.dataset]" color="blue" variant="soft" size="xs">
                          {{ getFilteredDatasetRows(item.dataset).length }} resources
                        </UBadge>
                      </div>

                      <div class="overflow-x-auto">
                        <table class="w-full text-sm">
                          <thead class="sticky top-0 bg-gray-900/50 backdrop-blur">
                            <tr>
                              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-400">Account</th>
                              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-400">Region</th>

                              <!-- Dynamic columns based on schema -->
                              <th
                                v-for="column in getCurrentColumns(item.dataset)"
                                :key="column.key"
                                class="px-4 py-3 text-left text-xs font-semibold text-gray-400"
                              >
                                {{ column.label }}
                              </th>

                              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-400">Timestamp</th>
                              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-400">Actions</th>
                            </tr>
                          </thead>
                          <tbody class="divide-y divide-gray-700">
                            <tr
                              v-for="(row, idx) in getFilteredDatasetRows(item.dataset)"
                              :key="idx"
                              class="hover:bg-gray-900/30 transition-colors"
                            >
                              <td class="px-4 py-3 text-gray-300">
                                <div class="text-xs font-mono">{{ row.accountId }}</div>
                                <div class="text-xs text-gray-500">{{ row.accountName }}</div>
                              </td>
                              <td class="px-4 py-3 text-gray-400 text-xs">{{ row.region }}</td>

                              <!-- Dynamic attribute columns -->
                              <td
                                v-for="column in getCurrentColumns(item.dataset)"
                                :key="column.key"
                                class="px-4 py-3 text-gray-300 text-xs max-w-xs truncate"
                                :title="formatColumnValue(row, column)"
                              >
                                {{ formatColumnValue(row, column) }}
                              </td>

                              <td class="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                                {{ formatDateTime(row.timestamp) }}
                              </td>
                              <td class="px-4 py-3">
                                <UButton
                                  icon="i-heroicons-eye"
                                  size="xs"
                                  variant="ghost"
                                  color="gray"
                                  @click="viewResourceDetails(row)"
                                >
                                  Details
                                </UButton>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </template>
                </UTabs>
              </div>

              <!-- Bottom Action Bar (Progressive Flow) -->
              <div class="flex-shrink-0 flex items-center justify-between p-4 bg-gray-800 rounded-lg border border-gray-700">
                <UButton
                  color="gray"
                  variant="outline"
                  icon="i-heroicons-arrow-left"
                  @click="adjustFilters"
                >
                  Adjust Filters
                </UButton>

                <div class="flex items-center gap-3">
                  <UButton
                    color="gray"
                    variant="outline"
                    icon="i-heroicons-bookmark"
                    @click="handleSaveQuery"
                  >
                    Save Query
                  </UButton>

                  <UButton
                    color="primary"
                    trailing-icon="i-heroicons-arrow-right"
                    @click="proceedToExport"
                  >
                    Looks Good, Continue
                  </UButton>
                </div>
              </div>
            </div>

            <!-- No Results State -->
            <div v-else class="flex flex-col items-center justify-center h-full text-center">
              <UIcon name="i-heroicons-play-circle" class="w-16 h-16 text-gray-700 mb-4" />
              <h3 class="text-lg font-semibold text-white mb-2">Ready to Preview</h3>
              <p class="text-sm text-gray-400 max-w-md mb-6">
                Click "Preview Query" in the sidebar footer to execute your query and see a sample of the results.
              </p>
              <div class="flex items-center gap-2 px-4 py-2 bg-blue-500/10 border border-blue-500/30 rounded-lg text-xs text-blue-300">
                <UIcon name="i-heroicons-information-circle" class="w-4 h-4" />
                <span>Preview shows a sample. Full data available on export.</span>
              </div>
            </div>
          </div>
        </div>

        <!-- RIGHT PANEL: Output Options & Actions -->
        <div class="w-80 bg-gray-800 border-l border-gray-700 flex flex-col flex-shrink-0">
          <!-- Panel Header -->
          <div class="px-4 py-3 border-b border-gray-700">
            <div class="flex items-center gap-2">
              <UIcon name="i-heroicons-adjustments-horizontal" class="w-5 h-5 text-blue-400" />
              <h3 class="text-sm font-semibold text-white">Output & Actions</h3>
            </div>
          </div>

          <!-- Panel Content -->
          <div class="flex-1 overflow-y-auto p-4 space-y-6">
            <!-- Output Configuration Section -->
            <div class="space-y-4">
              <h4 class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Output Configuration</h4>

              <!-- Export/Schedule Mode Toggle -->
              <div class="space-y-2">
                <label class="text-xs font-medium text-gray-400">Report Mode</label>
                <div class="flex gap-2">
                  <UButton
                    :color="reportMode === 'export' ? 'primary' : 'gray'"
                    :variant="reportMode === 'export' ? 'solid' : 'outline'"
                    size="sm"
                    @click="reportMode = 'export'"
                    class="flex-1"
                  >
                    <UIcon name="i-heroicons-arrow-down-tray" class="w-4 h-4 mr-1" />
                    Export
                  </UButton>
                  <UButton
                    :color="reportMode === 'schedule' ? 'primary' : 'gray'"
                    :variant="reportMode === 'schedule' ? 'solid' : 'outline'"
                    size="sm"
                    @click="reportMode = 'schedule'"
                    class="flex-1"
                  >
                    <UIcon name="i-heroicons-calendar" class="w-4 h-4 mr-1" />
                    Schedule
                  </UButton>
                </div>
              </div>

              <!-- Format Selection -->
              <div class="space-y-2">
                <label class="text-xs font-medium text-gray-400">Output Format</label>
                <USelectMenu
                  v-model="outputFormat"
                  :options="formatOptions"
                  value-attribute="value"
                  option-attribute="label"
                  size="sm"
                  class="w-full"
                />
              </div>

              <!-- AI Insights Toggle -->
              <div class="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg border border-gray-700">
                <div>
                  <div class="text-sm font-medium text-white">AI Insights</div>
                  <div class="text-xs text-gray-400">Include AI summary</div>
                </div>
                <UToggle v-model="enableAI" size="sm" />
              </div>
            </div>

            <div class="border-t border-gray-700"></div>

            <!-- Export Actions Section -->
            <div class="space-y-3">
              <h4 class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Export Actions</h4>

              <UButton
                block
                color="gray"
                variant="outline"
                icon="i-heroicons-adjustments-horizontal"
                size="sm"
                @click="showColumnPickerModal = true"
                :disabled="!hasPreviewData"
              >
                Customize Columns
              </UButton>

              <UButton
                block
                color="primary"
                icon="i-heroicons-arrow-down-tray"
                size="md"
                @click="handleQuickExport"
                :disabled="!hasPreviewData || exportLoading"
                :loading="exportLoading"
              >
                {{ exportLoading ? 'Exporting...' : 'Download Now' }}
              </UButton>

              <UButton
                block
                color="blue"
                variant="outline"
                icon="i-heroicons-share"
                size="sm"
                @click="showShareModal = true"
                :disabled="!hasPreviewData"
              >
                Share Report
              </UButton>

              <div class="text-xs text-gray-500 text-center">
                Format: {{ typeof outputFormat === 'string' ? outputFormat.toUpperCase() : outputFormat?.value?.toUpperCase() || 'PDF' }}
                <span v-if="selectedExportColumns.length > 0" class="text-blue-400">
                  ({{ selectedExportColumns.length }} custom columns)
                </span>
              </div>
            </div>

            <div class="border-t border-gray-700"></div>

            <!-- Schedule Options Section -->
            <div class="space-y-3">
              <h4 class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Schedule Options</h4>

              <UButton
                block
                color="gray"
                variant="outline"
                icon="i-heroicons-calendar"
                size="sm"
                @click="openScheduleModal"
                :disabled="!hasAnyDatasetSelected"
              >
                Create Schedule
              </UButton>

              <UButton
                v-if="hasPreviewData"
                block
                color="gray"
                variant="outline"
                icon="i-heroicons-calendar-days"
                size="sm"
                @click="quickSchedule"
              >
                Quick Schedule
              </UButton>
            </div>

            <div class="border-t border-gray-700"></div>

            <!-- Other Actions Section -->
            <div class="space-y-3">
              <h4 class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Other Actions</h4>

              <UButton
                block
                color="gray"
                variant="ghost"
                icon="i-heroicons-bookmark"
                size="sm"
                @click="handleSaveQuery"
                :disabled="!hasAnyDatasetSelected"
              >
                Save Query Template
              </UButton>
            </div>

            <div v-if="hasPreviewData" class="border-t border-gray-700"></div>

            <!-- Estimated Report Info (when preview available) -->
            <div v-if="hasPreviewData" class="space-y-3">
              <h4 class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Full Report Estimate</h4>

              <div class="bg-gray-900/50 rounded-lg border border-gray-700 p-3 space-y-2 text-xs">
                <div class="flex items-center justify-between">
                  <span class="text-gray-400">Total Records:</span>
                  <span class="text-white font-medium">{{ previewRowCount.toLocaleString() }}</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-gray-400">Estimated Size:</span>
                  <span class="text-white font-medium">{{ estimatedSize }}</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-gray-400">Processing Time:</span>
                  <span class="text-white font-medium">~{{ estimatedProcessingTime }}</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-gray-400">AI Insights:</span>
                  <span :class="[enableAI ? 'text-green-400' : 'text-gray-500']">
                    {{ enableAI ? 'Enabled' : 'Disabled' }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Schedules Tab -->
      <div v-else-if="activeTab === 1" class="h-full overflow-y-auto bg-gray-900">
            <div class="max-w-7xl mx-auto py-6">
                <div class="flex justify-between items-center px-6 mb-6">
                    <h2 class="text-lg font-semibold text-white">Scheduled Reports</h2>
                    <UButton
                        color="primary"
                        icon="i-heroicons-plus"
                        @click="openCreateModal"
                        :disabled="!canCreateMore"
                    >
                        Create Schedule
                    </UButton>
                </div>
                <ReportSchedules 
                    @edit="handleEdit"
                    @delete="handleDelete"
                    @test="handleTest"
                    @toggle-pause="handleTogglePause"
                    @view-history="handleViewHistory"
                />
            </div>
          </div>

      <!-- History Tab -->
      <div v-else-if="activeTab === 2" class="h-full overflow-y-auto bg-gray-900">
             <div class="max-w-7xl mx-auto py-6">
                <div class="px-6 mb-6">
                    <h2 class="text-lg font-semibold text-white">Run History</h2>
                </div>
                <ReportHistory @view-details="handleViewHistory" />
            </div>
      </div>
    </div>

    <!-- Export Progress Overlay -->
    <div
      v-if="exportLoading"
      class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center"
    >
      <div class="bg-gray-800 rounded-lg border border-gray-700 p-6 max-w-md w-full mx-4 shadow-2xl">
        <div class="flex items-center gap-3 mb-4">
          <UIcon name="i-heroicons-arrow-down-tray" class="w-6 h-6 text-blue-400 animate-pulse" />
          <h3 class="text-lg font-semibold text-white">Exporting Report</h3>
        </div>

        <!-- Progress Bar -->
        <div class="mb-4">
          <div class="flex items-center justify-between text-xs text-gray-400 mb-2">
            <span>{{ exportStatus }}</span>
            <span>{{ exportProgress }}%</span>
          </div>
          <div class="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
            <div
              class="bg-blue-500 h-full transition-all duration-300 ease-out"
              :style="{ width: `${exportProgress}%` }"
            ></div>
          </div>
        </div>

        <!-- Info Text -->
        <p class="text-sm text-gray-400">
          This may take a few moments depending on the amount of data...
        </p>
      </div>
    </div>

    <!-- Share Report Modal -->
    <DatasetShareModal
      v-model="showShareModal"
      :config="{
        accounts: selectedAccounts,
        datasets: queryBuilder.datasets,
        format: outputFormat,
        enableAI: enableAI
      }"
    />

    <!-- Column Picker Modal -->
    <UModal v-model="showColumnPickerModal" :ui="{ width: 'max-w-2xl' }">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-lg font-semibold text-white">Customize Export Columns</h3>
              <p class="text-sm text-gray-400 mt-1">
                Select which columns to include in your export. By default, all columns are included.
              </p>
            </div>
            <UButton
              icon="i-heroicons-x-mark"
              variant="ghost"
              color="gray"
              size="sm"
              @click="showColumnPickerModal = false"
            />
          </div>
        </template>

        <div class="space-y-4">
          <!-- Quick Actions -->
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <UButton
                size="xs"
                variant="outline"
                @click="selectAllColumns"
              >
                Select All
              </UButton>
              <UButton
                size="xs"
                variant="outline"
                @click="deselectAllColumns"
              >
                Deselect All
              </UButton>
              <UButton
                size="xs"
                variant="outline"
                @click="resetToDefaults"
              >
                Reset to Defaults
              </UButton>
            </div>
            <UBadge color="blue" variant="soft">
              {{ selectedExportColumns.length }} / {{ availableExportColumns.length }} selected
            </UBadge>
          </div>

          <!-- Column List -->
          <div class="border border-gray-700 rounded-lg max-h-96 overflow-y-auto">
            <div class="divide-y divide-gray-700">
              <div
                v-for="column in availableExportColumns"
                :key="column.key"
                class="flex items-center gap-3 px-4 py-3 hover:bg-gray-900/50 transition-colors"
              >
                <UCheckbox
                  :model-value="selectedExportColumns.includes(column.key)"
                  @update:model-value="toggleColumn(column.key)"
                />
                <div class="flex-1">
                  <div class="text-sm text-white font-medium">{{ column.label }}</div>
                  <div class="text-xs text-gray-500">{{ column.key }}</div>
                </div>
                <UBadge
                  v-if="column.category"
                  size="xs"
                  :color="getCategoryColor(column.category)"
                  variant="soft"
                >
                  {{ column.category }}
                </UBadge>
              </div>
            </div>
          </div>

          <!-- Info Note -->
          <div class="flex items-start gap-2 px-3 py-2 bg-blue-500/10 border border-blue-500/30 rounded text-xs text-blue-300">
            <UIcon name="i-heroicons-information-circle" class="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>
              Your column selection will be used for this export only. The preview table will continue to show smart defaults.
            </span>
          </div>
        </div>

        <template #footer>
          <div class="flex items-center justify-end gap-3">
            <UButton
              variant="ghost"
              color="gray"
              @click="showColumnPickerModal = false"
            >
              Cancel
            </UButton>
            <UButton
              color="primary"
              @click="applyColumnSelection"
            >
              Apply Selection
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Resource Details Modal -->
    <UModal v-model="showResourceDetailsModal" :ui="{ width: 'max-w-4xl' }">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-lg font-semibold text-white">Resource Details</h3>
              <p class="text-sm text-gray-400 mt-1">
                {{ selectedResourceForDetails?.resourceType || 'Resource' }}
              </p>
            </div>
            <UButton
              icon="i-heroicons-x-mark"
              variant="ghost"
              color="gray"
              size="sm"
              @click="showResourceDetailsModal = false"
            />
          </div>
        </template>

        <div v-if="selectedResourceForDetails" class="space-y-4">
          <!-- Key attributes in cards -->
          <div class="grid grid-cols-2 gap-4">
            <div class="bg-gray-900/50 rounded-lg p-3 border border-gray-700">
              <div class="text-xs text-gray-400">Account</div>
              <div class="text-sm text-white font-mono">{{ selectedResourceForDetails.accountId }}</div>
              <div class="text-xs text-gray-500">{{ selectedResourceForDetails.accountName }}</div>
            </div>
            <div class="bg-gray-900/50 rounded-lg p-3 border border-gray-700">
              <div class="text-xs text-gray-400">Region</div>
              <div class="text-sm text-white">{{ selectedResourceForDetails.region }}</div>
            </div>
          </div>

          <!-- Resource-specific attributes -->
          <div v-if="selectedResourceForDetails.resourceAttributes && Object.keys(selectedResourceForDetails.resourceAttributes).length > 0" class="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
            <h4 class="text-sm font-semibold text-white mb-3">Resource Attributes</h4>
            <div class="grid grid-cols-2 gap-3">
              <div
                v-for="(value, key) in selectedResourceForDetails.resourceAttributes"
                :key="key"
                class="flex flex-col"
              >
                <span class="text-xs text-gray-400">{{ formatAttributeName(String(key)) }}</span>
                <span class="text-sm text-white">{{ formatAttributeValue(value) }}</span>
              </div>
            </div>
          </div>

          <!-- Full configuration (collapsible) -->
          <UAccordion :items="[{ label: 'Full Configuration (JSON)', slot: 'config', defaultOpen: false }]">
            <template #config>
              <pre class="bg-gray-950 rounded p-4 text-xs text-gray-300 overflow-auto max-h-96">{{ JSON.stringify(selectedResourceForDetails.configuration, null, 2) }}</pre>
            </template>
          </UAccordion>
        </div>
      </UCard>
    </UModal>

    <!-- Modals -->
    <DatasetReportFormModal
      v-model="showModal"
      :report="selectedReport"
      @saved="handleSaved"
    />

    <!-- Delete Confirmation Modal -->
    <UModal v-model="showDeleteModal">
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-exclamation-triangle" class="w-6 h-6 text-red-500" />
            <h3 class="text-lg font-semibold">Delete Dataset Report</h3>
          </div>
        </template>

        <p class="text-gray-700 dark:text-gray-300 mb-4">
          Are you sure you want to delete <strong>{{ reportToDelete?.reportName }}</strong>?
          This action cannot be undone.
        </p>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="gray" variant="ghost" @click="showDeleteModal = false">Cancel</UButton>
            <UButton color="red" :loading="deleting" @click="confirmDelete">Delete</UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Preset Selector Modal -->
    <DatasetPresetSelector v-model="showPresetModal" @select="applyPreset" />
  </div>
</template>

<script setup lang="ts">
import type { ScheduledReport } from '#shared/types/scheduled-reports'
import type { DatasetPreset } from '#shared/types/dataset-presets'
import ReportSchedules from '../../components/reports/ReportSchedules.vue'
import ReportHistory from '../../components/reports/ReportHistory.vue'

const logger = createLogger('Datasets')

const { fetchReports, reports, loading } = useDatasetReports()
const toast = useToast()

// Tabs
const tabItems = [
  {
    label: 'Query Builder',
    key: 'builder',
    icon: 'i-heroicons-wrench-screwdriver'
  },
  {
    label: 'Saved Schedules',
    key: 'schedules',
    icon: 'i-heroicons-calendar-days'
  },
  {
    label: 'Run History',
    key: 'history',
    icon: 'i-heroicons-clock'
  }
]

// State
const showModal = ref(false)
const showDeleteModal = ref(false)
const showResourceDetailsModal = ref(false)
const showColumnPickerModal = ref(false)
const showShareModal = ref(false)
const showPresetModal = ref(false)
const selectedReport = ref<ScheduledReport | null>(null)
const reportToDelete = ref<ScheduledReport | null>(null)
const selectedResourceForDetails = ref<any>(null)
const deleting = ref(false)
const selectedResourceType = ref<Record<string, string | null>>({})

// Column customization state
const availableExportColumns = ref<Array<{ key: string; label: string; category?: string }>>([])
const selectedExportColumns = ref<string[]>([])
const tempSelectedColumns = ref<string[]>([])

// Tab State (UTabs expects numeric index, not string key)
const activeTab = ref(0) // 0: builder, 1: schedules, 2: history

// Accordion state - controls which accordion is open (single mode)
const openAccordionIndex = ref(0) // Start with "Select Accounts" open

// Query Builder State
const selectedAccounts = ref<string[]>([])
const enableAI = ref(false)
const outputFormat = ref('pdf')
const reportMode = ref<'export' | 'schedule'>('export')
const workflowStage = ref(1) // 1: Configure, 2: Preview, 3: Export

const queryBuilder = ref({
  datasets: {
    config: {
      enabled: false,
      filters: {}
    },
    securityHub: {
      enabled: false,
      filters: {}
    },
    cloudtrail: {
      enabled: false,
      filters: {}
    },
    entraUsers: {
      enabled: false,
      filters: {}
    }
  }
})

// Preview State
const previewLoading = ref(false)
const previewData = ref<any[]>([])
const previewLimit = ref(25)
const previewRowCount = ref(0)

// Export State
const exportLoading = ref(false)
const exportProgress = ref(0)
const exportStatus = ref('')

// Constants
const MAX_REPORTS = 10

const formatOptions = [
  { label: 'PDF', value: 'pdf' },
  { label: 'Excel (XLSX)', value: 'xlsx' },
  { label: 'JSON', value: 'json' },
  { label: 'CSV', value: 'csv' }
]

const datasetOptions = [
  {
    key: 'config',
    label: 'AWS Config',
    description: 'Resource configurations',
    icon: 'i-heroicons-cog-6-tooth'
  },
  {
    key: 'securityHub',
    label: 'Security Hub',
    description: 'Security findings',
    icon: 'i-heroicons-shield-check'
  },
  {
    key: 'cloudtrail',
    label: 'CloudTrail',
    description: 'API activity logs',
    icon: 'i-heroicons-document-text'
  },
  {
    key: 'entraUsers',
    label: 'Entra ID Users',
    description: 'User access & roles',
    icon: 'i-heroicons-users'
  }
]

// Accordion Items for Sidebar - dynamically computed to show completion status
const accordionItems = computed(() => [
  {
    label: selectedAccounts.value.length > 0
      ? `1. Select Accounts ✓ (${selectedAccounts.value.length})`
      : '1. Select Accounts',
    icon: 'i-heroicons-user-group',
    slot: 'accounts'
  },
  {
    label: selectedDatasetsCount.value > 0
      ? `2. Choose Datasets ✓ (${selectedDatasetsCount.value})`
      : '2. Choose Datasets',
    icon: 'i-heroicons-folder-open',
    slot: 'datasets'
  },
  {
    label: '3. Apply Filters (Optional)',
    icon: 'i-heroicons-funnel',
    slot: 'filters'
  }
])

// Computed
const canCreateMore = computed(() => reports.value.length < MAX_REPORTS)

const hasAnyDatasetSelected = computed(() => {
  return Object.values(queryBuilder.value.datasets).some((ds: any) => ds.enabled)
})

const selectedDatasetsCount = computed(() => {
  return Object.values(queryBuilder.value.datasets).filter((ds: any) => ds.enabled).length
})

const canRunQuery = computed(() => {
  return hasAnyDatasetSelected.value && (selectedAccounts.value.length > 0 || true)
})

const hasPreviewData = computed(() => previewData.value.length > 0)

const estimatedSize = computed(() => {
  const sizeInMB = previewRowCount.value * 0.002
  if (sizeInMB < 1) return `${Math.round(sizeInMB * 1024)} KB`
  return `${sizeInMB.toFixed(1)} MB`
})

const estimatedProcessingTime = computed(() => {
  const seconds = Math.ceil(previewRowCount.value / 100)
  if (seconds < 60) return `${seconds}s`
  return `${Math.ceil(seconds / 60)}m`
})

// Configuration progress percentage for sidebar footer
const configurationProgress = computed(() => {
  let progress = 0
  if (selectedAccounts.value.length > 0) progress += 50
  if (hasAnyDatasetSelected.value) progress += 50
  return progress
})

// Preview tabs - one tab per enabled dataset
const previewTabs = computed(() => {
  const tabs: any[] = []
  if (queryBuilder.value.datasets.config.enabled) {
    tabs.push({
      label: 'AWS Config',
      icon: 'i-heroicons-cog-6-tooth',
      dataset: 'Config'
    })
  }
  if (queryBuilder.value.datasets.securityHub.enabled) {
    tabs.push({
      label: 'Security Hub',
      icon: 'i-heroicons-shield-check',
      dataset: 'SecurityHub'
    })
  }
  if (queryBuilder.value.datasets.cloudtrail.enabled) {
    tabs.push({
      label: 'CloudTrail',
      icon: 'i-heroicons-document-text',
      dataset: 'CloudTrail'
    })
  }
  if (queryBuilder.value.datasets.entraUsers.enabled) {
    tabs.push({
      label: 'Entra Users',
      icon: 'i-heroicons-users',
      dataset: 'EntraUsers'
    })
  }
  return tabs
})

// Watchers for automated UI flow
// Auto-advance to datasets section when account is selected
watch(selectedAccounts, (newAccounts, oldAccounts) => {
  if (newAccounts.length > 0 && oldAccounts.length === 0 && openAccordionIndex.value === 0) {
    // User just selected their first account, auto-open datasets
    setTimeout(() => {
      openAccordionIndex.value = 1
    }, 300)
  }
})

// Auto-advance to filters when a dataset is enabled
watch(() => queryBuilder.value.datasets, (newDatasets, oldDatasets) => {
  const hasEnabledDataset = Object.values(newDatasets).some((ds: any) => ds.enabled)
  const hadEnabledDataset = oldDatasets ? Object.values(oldDatasets).some((ds: any) => ds.enabled) : false

  // If user just enabled their first dataset and currently on datasets section
  if (hasEnabledDataset && !hadEnabledDataset && openAccordionIndex.value === 1) {
    setTimeout(() => {
      openAccordionIndex.value = 2 // Open filters
    }, 300)
  }
}, { deep: true })

// Methods
function toggleDataset(key: string) {
  const dataset = queryBuilder.value.datasets[key as keyof typeof queryBuilder.value.datasets]
  if (dataset) {
    dataset.enabled = !dataset.enabled
  }
}

function getDatasetColor(dataset: string) {
  const colors: Record<string, string> = {
    'Config': 'blue',
    'SecurityHub': 'red',
    'CloudTrail': 'green'
  }
  return colors[dataset] || 'gray'
}

// Get preview rows for a specific dataset
function getDatasetPreviewRows(dataset: string) {
  return previewData.value.filter((row: any) => row.dataset === dataset)
}

// Progressive flow actions
function adjustFilters() {
  workflowStage.value = 1
  // Auto-open filters accordion when user clicks "Adjust Filters"
  openAccordionIndex.value = 2
}

function proceedToExport() {
  workflowStage.value = 3
  // Close accordion to focus on export options in right panel
  openAccordionIndex.value = -1
}

function handlePreviewQuery() {
  workflowStage.value = 2
  handleRunNow()
  const enabledDatasets = Object.entries(queryBuilder.value.datasets).filter(([, ds]: [string, any]) => ds.enabled).map(([key]) => key)
  enabledDatasets.forEach(ds => useEventBus().emit('dataset.query_executed', { datasetType: ds }))
  // Accordion will auto-close after successful preview in handleRunNow
}

function handleQuickExport() {
  // Ensure we pass a string value
  const format = typeof outputFormat.value === 'string'
    ? outputFormat.value
    : outputFormat.value?.value || 'pdf'
  handleExport(format)
}

function openScheduleModal() {
  selectedReport.value = null
  showModal.value = true
}

function quickSchedule() {
  // Validate query is configured
  if (selectedAccounts.value.length === 0) {
    toast.add({
      title: 'No accounts selected',
      description: 'Please select at least one account',
      color: 'orange'
    })
    return
  }

  if (!hasAnyDatasetSelected.value) {
    toast.add({
      title: 'No datasets selected',
      description: 'Please enable at least one dataset',
      color: 'orange'
    })
    return
  }

  // Generate report name based on enabled datasets
  const enabledDatasetNames = Object.entries(queryBuilder.value.datasets)
    .filter(([_, ds]: [string, any]) => ds.enabled)
    .map(([key]) => {
      const names: Record<string, string> = {
        config: 'Config',
        securityHub: 'Security Hub',
        cloudtrail: 'CloudTrail',
        entraUsers: 'Entra Users'
      }
      return names[key] || key
    })

  // Pre-populate modal with current configuration
  selectedReport.value = {
    reportName: `${enabledDatasetNames.join(' + ')} Report`,
    reportType: 'dataset',
    config: {
      accounts: selectedAccounts.value,
      datasets: queryBuilder.value.datasets,
      format: outputFormat.value,
      enableAI: enableAI.value
    } as any,
    schedule: {
      frequency: 'weekly',
      dayOfWeek: 1,
      hour: 9,
      minute: 0,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York'
    },
    recipients: [],
    status: 'active'
  } as any

  // Open schedule modal
  showModal.value = true

  toast.add({
    title: 'Pre-populated schedule',
    description: 'Configure schedule and recipients to save',
    color: 'blue'
  })
}

function openCreateModal() {
  selectedReport.value = null
  showModal.value = true
}

// Apply a preset configuration
function applyPreset(preset: DatasetPreset) {
  // Reset query builder
  queryBuilder.value.datasets = {
    config: { enabled: false, filters: {} },
    securityHub: { enabled: false, filters: {} },
    cloudtrail: { enabled: false, filters: {} },
    entraUsers: { enabled: false, filters: {} }
  }

  // Apply preset datasets configuration
  if (preset.datasets.config) {
    queryBuilder.value.datasets.config = { ...preset.datasets.config }
  }
  if (preset.datasets.securityHub) {
    queryBuilder.value.datasets.securityHub = { ...preset.datasets.securityHub }
  }
  if (preset.datasets.cloudtrail) {
    queryBuilder.value.datasets.cloudtrail = { ...preset.datasets.cloudtrail }
  }
  if (preset.datasets.entraUsers) {
    queryBuilder.value.datasets.entraUsers = { ...preset.datasets.entraUsers }
  }

  // Apply suggested format if provided
  if (preset.suggestedFormat) {
    outputFormat.value = preset.suggestedFormat
  }

  // Apply AI setting if provided
  if (preset.enableAI !== undefined) {
    enableAI.value = preset.enableAI
  }

  // Show toast notification
  toast.add({
    title: 'Preset Applied',
    description: `${preset.name} configuration loaded`,
    icon: 'i-heroicons-sparkles',
    color: 'green'
  })

  // Auto-open datasets accordion if not already open
  if (openAccordionIndex.value !== 1) {
    openAccordionIndex.value = 1
  }
}

function handleEdit(report: ScheduledReport) {
  selectedReport.value = report
  showModal.value = true
}

function handleDelete(report: ScheduledReport) {
  reportToDelete.value = report
  showDeleteModal.value = true
}

async function confirmDelete() {
  if (!reportToDelete.value) return

  deleting.value = true
  try {
    const { deleteReport } = useDatasetReports()
    await deleteReport(reportToDelete.value.reportId)
    await fetchReports()
    showDeleteModal.value = false
    reportToDelete.value = null
  } catch (err: any) {
    logger.error('Failed to delete report:', err)
  } finally {
    deleting.value = false
  }
}

async function handleTest(report: ScheduledReport) {
  try {
    const { sendTestReport } = useDatasetReports()
    await sendTestReport(report.reportId)
  } catch (err: any) {
    logger.error('Failed to send test report:', err)
  }
}

async function handleTogglePause(report: ScheduledReport) {
  try {
    const { togglePause } = useDatasetReports()
    const newStatus = report.status === 'active' ? 'paused' : 'active'
    await togglePause(report.reportId, newStatus === 'paused')
    await fetchReports()
  } catch (err: any) {
    logger.error('Failed to toggle pause:', err)
  }
}

async function handleViewHistory(report: ScheduledReport) {
  // TODO: Implement view history details
  logger.info('View history for:', report.reportId)
}

function handleSaved() {
  showModal.value = false
  selectedReport.value = null
  fetchReports()
}

async function handleRunNow() {
  previewLoading.value = true
  try {
    const response = await $fetch<{
      success: boolean
      data: {
        previewData: any[]
        totalRecords: number
        previewLimit: number
        estimatedSize: number
        query: any
      }
    }>('/api/dataset-reports/preview', {
      method: 'POST',
      body: {
        accountIds: selectedAccounts.value,
        reportConfig: {
          // format: outputFormat.value, // Moved to export
          enableAI: enableAI.value,
          datasets: queryBuilder.value.datasets
        }
      }
    })

    if (response.success) {
      previewData.value = response.data.previewData
      previewRowCount.value = response.data.totalRecords

      // Auto-collapse accordion after successful preview to focus on results
      openAccordionIndex.value = -1
    } else {
      throw new Error('Failed to fetch preview data')
    }
  } catch (err: any) {
    logger.error('Failed to run query:', err)
    const toast = useToast()
    toast.add({
      title: 'Preview Failed',
      description: err.message || 'Failed to generate preview',
      icon: 'i-heroicons-x-circle',
      color: 'red'
    })
    // Show error to user
    previewData.value = []
    previewRowCount.value = 0
  } finally {
    previewLoading.value = false
  }
}

function refreshPreview() {
  handleRunNow()
}

function handleSaveQuery() {
  // TODO: Implement save query functionality
  logger.info('Saving query:', queryBuilder.value)
}

async function handleExport(format: string) {
  const toast = useToast()

  exportLoading.value = true
  exportProgress.value = 0
  exportStatus.value = 'Preparing export...'

  try {
    // Simulate progress updates
    exportProgress.value = 10
    exportStatus.value = 'Fetching data from AWS...'

    toast.add({
      title: 'Export Started',
      description: `Generating ${format.toUpperCase()} report...`,
      icon: 'i-heroicons-arrow-down-tray',
      color: 'blue'
    })

    exportProgress.value = 30
    exportStatus.value = 'Processing datasets...'

    const response = await fetch('/api/dataset-reports/export', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        accountIds: selectedAccounts.value,
        reportConfig: {
          accounts: selectedAccounts.value,
          datasets: queryBuilder.value.datasets,
          format: format,
          enableAI: enableAI.value
        }
      })
    })

    exportProgress.value = 80
    exportStatus.value = 'Generating file...'

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Export failed: ${errorText}`)
    }

    const exportResponse = await response.blob()

    exportProgress.value = 90
    exportStatus.value = 'Preparing download...'

    // Extract filename from Content-Disposition header or use default
    const contentDisposition = response.headers.get('Content-Disposition')
    let filename = `dataset-report-${new Date().toISOString().split('T')[0]}.${format}`

    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="(.+)"/)
      if (filenameMatch) {
        filename = filenameMatch[1]
      }
    }

    // Create download link
    const url = window.URL.createObjectURL(exportResponse)
    const link = document.createElement('a')
    link.href = url
    link.download = filename

    // Trigger download
    document.body.appendChild(link)
    link.click()

    // Cleanup
    setTimeout(() => {
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    }, 100)

    exportProgress.value = 100
    exportStatus.value = 'Complete!'

    toast.add({
      title: 'Export Complete',
      description: `${format.toUpperCase()} report downloaded successfully`,
      icon: 'i-heroicons-check-circle',
      color: 'green',
      timeout: 3000
    })

  } catch (error: any) {
    logger.error('Export failed:', error)

    toast.add({
      title: 'Export Failed',
      description: error.message || 'An error occurred while generating the report',
      icon: 'i-heroicons-x-circle',
      color: 'red',
      timeout: 5000
    })
  } finally {
    // Reset loading state after a brief delay
    setTimeout(() => {
      exportLoading.value = false
      exportProgress.value = 0
      exportStatus.value = ''
    }, 1000)
  }
}

function formatDateTime(value?: string) {
  if (!value) return 'Not run yet'
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(value))
  } catch {
    return value
  }
}

// Get resource types present in a specific dataset tab
function getResourceTypesInTab(dataset: string) {
  const datasetRows = previewData.value.filter((row: any) => row.dataset === dataset)
  const types = [...new Set(datasetRows.map((row: any) => row.resourceType).filter(Boolean))]
  return types
}

// Get filtered rows based on selected resource type
function getFilteredDatasetRows(dataset: string) {
  let rows = previewData.value.filter((row: any) => row.dataset === dataset)

  // Apply resource type filter if selected
  const selectedType = selectedResourceType.value[dataset]
  if (selectedType) {
    rows = rows.filter((row: any) => row.resourceType === selectedType)
  }

  return rows
}

// Get columns for the currently displayed resource type
function getCurrentColumns(dataset: string) {
  const rows = getFilteredDatasetRows(dataset)
  if (rows.length === 0) return []

  // If we have schema information, use it
  const firstRowWithSchema = rows.find((row: any) => row.attributeSchema && row.attributeSchema.length > 0)
  if (firstRowWithSchema) {
    return firstRowWithSchema.attributeSchema
  }

  // Fallback: no schema available
  return []
}

// Format column value using the schema's format function if defined
function formatColumnValue(row: any, column: any) {
  const value = row.resourceAttributes?.[column.key]

  if (value === undefined || value === null) return '-'

  // Use custom formatter if provided
  if (column.format && typeof column.format === 'function') {
    try {
      return column.format(value)
    } catch {
      return String(value)
    }
  }

  // Default formatting based on type
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return `${value.length} items`
  if (typeof value === 'object') return JSON.stringify(value)

  return String(value)
}

// View full resource details in a modal
function viewResourceDetails(row: any) {
  selectedResourceForDetails.value = row
  showResourceDetailsModal.value = true
}

// Format attribute name for display
function formatAttributeName(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/^./, str => str.toUpperCase())
    .trim()
    .replace(/\bIp\b/g, 'IP')
    .replace(/\bId\b/g, 'ID')
    .replace(/\bVpc\b/g, 'VPC')
    .replace(/\bDb\b/g, 'DB')
    .replace(/\bDns\b/g, 'DNS')
    .replace(/\bIops\b/g, 'IOPS')
    .replace(/\bAz\b/g, 'AZ')
    .replace(/\bArn\b/g, 'ARN')
}

// Format attribute value for display in modal
function formatAttributeValue(value: any): string {
  if (value === undefined || value === null) return '-'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) {
    if (value.length === 0) return 'None'
    if (value.length <= 3) return value.join(', ')
    return `${value.slice(0, 3).join(', ')} ... (+${value.length - 3} more)`
  }
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  return String(value)
}

// Column Picker Functions
watch(showColumnPickerModal, (isOpen) => {
  if (isOpen) {
    // Build available columns from preview data when modal opens
    buildAvailableColumns()
    // Copy current selection to temp
    tempSelectedColumns.value = [...selectedExportColumns.value]
  }
})

function buildAvailableColumns() {
  const columnsMap = new Map<string, { key: string; label: string; category?: string }>()

  // Always include standard columns
  const standardColumns = [
    { key: 'accountName', label: 'Account', category: 'standard' },
    { key: 'region', label: 'Region', category: 'standard' },
    { key: 'resourceType', label: 'Resource Type', category: 'standard' },
    { key: 'resourceId', label: 'Resource ID', category: 'standard' },
    { key: 'resourceName', label: 'Resource Name', category: 'standard' },
    { key: 'configurationItemCaptureTime', label: 'Last Updated', category: 'standard' }
  ]

  for (const col of standardColumns) {
    columnsMap.set(col.key, col)
  }

  // Extract dynamic columns from preview data
  for (const row of previewData.value) {
    if (row.attributeSchema && Array.isArray(row.attributeSchema)) {
      for (const attr of row.attributeSchema) {
        if (!columnsMap.has(attr.key)) {
          columnsMap.set(attr.key, {
            key: attr.key,
            label: attr.label || attr.key,
            category: attr.category || 'attribute'
          })
        }
      }
    }
  }

  availableExportColumns.value = Array.from(columnsMap.values())

  // If no selection yet, select all by default
  if (selectedExportColumns.value.length === 0) {
    selectedExportColumns.value = availableExportColumns.value.map(c => c.key)
    tempSelectedColumns.value = [...selectedExportColumns.value]
  }
}

function toggleColumn(key: string) {
  const index = tempSelectedColumns.value.indexOf(key)
  if (index > -1) {
    tempSelectedColumns.value.splice(index, 1)
  } else {
    tempSelectedColumns.value.push(key)
  }
}

function selectAllColumns() {
  tempSelectedColumns.value = availableExportColumns.value.map(c => c.key)
}

function deselectAllColumns() {
  tempSelectedColumns.value = []
}

function resetToDefaults() {
  tempSelectedColumns.value = availableExportColumns.value.map(c => c.key)
}

function applyColumnSelection() {
  selectedExportColumns.value = [...tempSelectedColumns.value]
  showColumnPickerModal.value = false

  const toast = useToast()
  toast.add({
    title: 'Column selection applied',
    description: `${selectedExportColumns.value.length} columns selected for export`,
    color: 'green'
  })
}

function getCategoryColor(category: string): string {
  const colors: Record<string, string> = {
    standard: 'gray',
    identity: 'blue',
    state: 'green',
    config: 'purple',
    network: 'cyan',
    security: 'red',
    performance: 'yellow',
    metadata: 'gray'
  }
  return colors[category] || 'gray'
}

// Parse URL parameters and pre-populate query builder
function parseUrlParameters() {
  const route = useRoute()

  try {
    // Pre-populate accounts
    if (route.query.accounts) {
      const accounts = JSON.parse(route.query.accounts as string)
      if (Array.isArray(accounts)) {
        selectedAccounts.value = accounts
      }
    }

    // Pre-populate datasets
    if (route.query.datasets) {
      const datasets = (route.query.datasets as string).split(',')
      datasets.forEach(ds => {
        if (queryBuilder.value.datasets[ds as keyof typeof queryBuilder.value.datasets]) {
          (queryBuilder.value.datasets[ds as keyof typeof queryBuilder.value.datasets] as any).enabled = true
        }
      })
    }

    // Pre-populate Config filters
    if (route.query.configFilters) {
      const filters = JSON.parse(route.query.configFilters as string)
      queryBuilder.value.datasets.config.filters = filters
    }

    // Pre-populate SecurityHub filters
    if (route.query.securityHubFilters) {
      const filters = JSON.parse(route.query.securityHubFilters as string)
      queryBuilder.value.datasets.securityHub.filters = filters
    }

    // Pre-populate CloudTrail filters
    if (route.query.cloudtrailFilters) {
      const filters = JSON.parse(route.query.cloudtrailFilters as string)
      queryBuilder.value.datasets.cloudtrail.filters = filters
    }

    // Pre-populate Entra Users filters
    if (route.query.entraUsersFilters) {
      const filters = JSON.parse(route.query.entraUsersFilters as string)
      queryBuilder.value.datasets.entraUsers.filters = filters
    }

    // Pre-populate format
    if (route.query.format && typeof route.query.format === 'string') {
      outputFormat.value = route.query.format
    }

    // Pre-populate AI toggle
    if (route.query.enableAI === 'true') {
      enableAI.value = true
    }

    // Auto-trigger preview if requested
    if (route.query.autoPreview === 'true') {
      nextTick(() => {
        handlePreviewQuery()
      })
    }
  } catch (error) {
    logger.error('Error parsing URL parameters:', error)
  }
}

// Load reports on mount
onMounted(() => {
  fetchReports()
  parseUrlParameters()
})
</script>

<style>
/* Ensure tabs take full height */
div[role="tabpanel"] {
    height: 100%;
}
</style>
