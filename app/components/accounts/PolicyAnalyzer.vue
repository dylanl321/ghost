<template>
  <UModal fullscreen v-model="isOpen" :ui="{ width: 'w-full max-w-[98vw]', height: 'h-[98vh]' }">
    <UCard :ui="{ body: { padding: 'p-0' }, header: { padding: 'px-8 py-6' } }">
      <template #header>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-4">
            <UIcon name="i-heroicons-magnifying-glass-circle" class="w-8 h-8 text-blue-500" />
            <div>
              <h2 class="text-2xl font-semibold text-white">Policy Analyzer</h2>
              <p class="text-base text-gray-400">Analyze Service Control Policies and effective permissions</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <PolicyExportMenu
              v-if="analysis"
              :analysis-data="fullAnalysisData"
              :account-name="accountId"
              :environment="environment || 'govcloud'"
            />
            <UButton icon="i-heroicons-x-mark" variant="ghost" size="lg" @click="isOpen = false" />
          </div>
        </div>
      </template>

      <div class="flex flex-col h-[calc(98vh-10rem)]">
        <!-- Loading State -->
        <div v-if="loading" class="flex items-center justify-center py-12">
          <div class="text-center">
            <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-blue-400 mb-3 mx-auto" />
            <p class="text-gray-400">Analyzing policies...</p>
          </div>
        </div>

        <!-- Error State -->
        <div v-else-if="error" class="text-center py-12">
          <UIcon name="i-heroicons-exclamation-triangle" class="w-12 h-12 text-red-400 mb-3 mx-auto" />
          <p class="text-red-400">{{ error }}</p>
        </div>

        <!-- Analysis Results -->
        <div v-else-if="analysis" class="flex flex-col h-full">
          <!-- View Tabs -->
          <div class="flex gap-3 border-b border-gray-700 px-8 bg-gray-900/50">
            <button
              v-for="tab in tabs"
              :key="tab.id"
              @click="activeTab = tab.id"
              class="px-5 py-3.5 text-base font-medium transition-colors flex items-center gap-2.5"
              :class="activeTab === tab.id
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-gray-300'"
            >
              <UIcon :name="tab.icon" class="w-5 h-5" />
              {{ tab.label }}
            </button>
          </div>

          <!-- Summary View -->
          <div v-if="activeTab === 'summary'" class="flex-1 overflow-y-auto px-8 py-6">
            <div class="space-y-8 max-w-[1800px] mx-auto">
            <!-- Key Metrics -->
            <div class="grid grid-cols-2 md:grid-cols-5 gap-6">
              <div class="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
                <div class="text-sm text-gray-400 mb-2 font-medium">Total Policies</div>
                <div class="text-3xl font-bold text-white">{{ analysis.summary.totalPolicies }}</div>
              </div>
              <div class="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
                <div class="text-sm text-gray-400 mb-2 font-medium">Total Denials</div>
                <div class="text-3xl font-bold text-red-400">{{ analysis.summary.totalDenials }}</div>
              </div>
              <div class="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
                <div class="text-sm text-gray-400 mb-2 font-medium">Conditional Denials</div>
                <div class="text-3xl font-bold text-orange-400">{{ analysis.summary.totalConditionalDenials }}</div>
              </div>
              <div class="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
                <div class="text-sm text-gray-400 mb-2 font-medium">Conditional Allows</div>
                <div class="text-3xl font-bold text-yellow-400">{{ analysis.summary.totalConditional }}</div>
              </div>
              <div class="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
                <div class="text-sm text-gray-400 mb-2 font-medium">Services Affected</div>
                <div class="text-3xl font-bold text-blue-400">{{ Object.keys(analysis.services).length }}</div>
              </div>
            </div>

            <!-- All Applied Policies -->
            <div>
              <h3 class="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
                <UIcon name="i-heroicons-document-duplicate" class="w-4 h-4" />
                All Applied Policies
              </h3>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div
                  v-for="(stmt, index) in uniquePolicies"
                  :key="index"
                  class="bg-gray-800/50 border border-gray-700 rounded-lg p-3"
                >
                  <div class="flex items-start justify-between gap-2">
                    <div class="flex-1 min-w-0">
                      <div class="font-medium text-white text-sm mb-1">{{ stmt.policyName }}</div>
                      <div class="text-xs text-gray-400">
                        {{ stmt.statementCount }} statement{{ stmt.statementCount === 1 ? '' : 's' }}
                      </div>
                    </div>
                    <UBadge
                      :color="getPolicyBadgeColor(stmt)"
                      variant="soft"
                      size="xs"
                    >
                      {{ getPolicyType(stmt) }}
                    </UBadge>
                  </div>
                </div>
              </div>
            </div>

            <!-- Access Status -->
            <div v-if="analysis.summary.hasFullAccess" class="bg-green-900/20 border border-green-700 rounded-lg p-4">
              <div class="flex items-center gap-2">
                <UIcon name="i-heroicons-check-circle" class="w-5 h-5 text-green-400" />
                <span class="text-green-300 font-medium">FullAWSAccess policy is applied</span>
              </div>
              <p class="text-xs text-green-400 mt-1">This account has broad access to AWS services, with security controls applied where shown below.</p>
            </div>

            <!-- Services with Security Controls -->
            <div v-if="analysis.summary.mostRestrictedServices.length > 0">
              <h3 class="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
                <UIcon name="i-heroicons-shield-check" class="w-4 h-4 text-blue-400" />
                Services with Security Controls
              </h3>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div
                  v-for="service in analysis.summary.mostRestrictedServices"
                  :key="service"
                  class="bg-blue-900/10 border border-blue-700/30 rounded-lg p-4 hover:bg-blue-900/20 transition-colors cursor-pointer"
                  @click="activeTab = 'services'; selectedService = service"
                >
                  <div class="flex items-center justify-between mb-3">
                    <div class="flex items-center gap-2">
                      <UIcon name="i-heroicons-shield-check" class="w-5 h-5 text-blue-400" />
                      <span class="font-medium text-white text-lg">{{ service.toUpperCase() }}</span>
                    </div>
                    <UIcon name="i-heroicons-arrow-right" class="w-4 h-4 text-gray-400" />
                  </div>

                  <div class="space-y-2">
                    <div class="flex items-center justify-between text-sm">
                      <span class="text-gray-400">Security Requirements:</span>
                      <span class="text-blue-300 font-medium">{{ analysis.services[service]?.deniedActions.filter((d: any) => d.hasConditions).length || 0 }}</span>
                    </div>
                    <div class="flex items-center justify-between text-sm">
                      <span class="text-gray-400">Blocked Actions:</span>
                      <span class="text-red-300 font-medium">{{ analysis.services[service]?.deniedActions.filter((d: any) => !d.hasConditions).length || 0 }}</span>
                    </div>
                    <div class="flex items-center justify-between text-sm">
                      <span class="text-gray-400">Protection Policies:</span>
                      <span class="text-gray-300 font-medium">{{ analysis.services[service]?.restrictedBy.length || 0 }}</span>
                    </div>
                  </div>

                  <!-- Show sample of policies -->
                  <div class="mt-3 pt-3 border-t border-blue-700/30">
                    <div class="text-xs text-gray-400 mb-2">Active Policies:</div>
                    <div class="flex flex-wrap gap-1">
                      <UBadge
                        v-for="policyName in analysis.services[service]?.restrictedBy.slice(0, 3)"
                        :key="policyName"
                        color="blue"
                        variant="soft"
                        size="xs"
                      >
                        {{ policyName }}
                      </UBadge>
                      <UBadge
                        v-if="analysis.services[service]?.restrictedBy.length > 3"
                        color="gray"
                        variant="soft"
                        size="xs"
                      >
                        +{{ analysis.services[service]?.restrictedBy.length - 3 }} more
                      </UBadge>
                    </div>
                  </div>

                  <div class="mt-2 text-xs text-blue-400 italic">Click to view security details →</div>
                </div>
              </div>
            </div>
            </div>
          </div>

          <!-- AI Insights View -->
          <div v-if="activeTab === 'ai-insights'" class="flex-1 overflow-y-auto px-8 py-6">
            <div class="space-y-6 max-w-[1800px] mx-auto">
            <div v-if="fullAnalysisData?.aiInsights">
              <!-- AI Summary -->
              <div class="bg-gradient-to-r from-purple-900/20 to-blue-900/20 border border-purple-700/30 rounded-xl p-6">
                <div class="flex items-start gap-3 mb-4">
                  <UIcon name="i-heroicons-sparkles" class="w-6 h-6 text-purple-400 flex-shrink-0 mt-1" />
                  <div>
                    <h3 class="text-lg font-semibold text-white mb-2">AI-Powered Analysis</h3>
                    <p class="text-gray-300 leading-relaxed">{{ fullAnalysisData.aiInsights.summary }}</p>
                  </div>
                </div>
              </div>

              <!-- Key Findings -->
              <div v-if="fullAnalysisData.aiInsights.keyFindings?.length > 0">
                <h3 class="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
                  <UIcon name="i-heroicons-light-bulb" class="w-4 h-4" />
                  Key Findings
                </h3>
                <div class="grid grid-cols-1 gap-3">
                  <div
                    v-for="(finding, index) in fullAnalysisData.aiInsights.keyFindings"
                    :key="index"
                    class="bg-blue-900/10 border border-blue-700/30 rounded-lg p-4 flex items-start gap-3"
                  >
                    <div class="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
                      {{ index + 1 }}
                    </div>
                    <p class="text-gray-300 flex-1">{{ finding }}</p>
                  </div>
                </div>
              </div>

              <!-- Risk Assessment -->
              <div v-if="fullAnalysisData.aiInsights.riskAssessment">
                <h3 class="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
                  <UIcon name="i-heroicons-shield-exclamation" class="w-4 h-4" />
                  Risk Assessment
                </h3>
                <div
                  class="rounded-lg p-6 border"
                  :class="{
                    'bg-red-900/20 border-red-700/30': fullAnalysisData.aiInsights.riskAssessment.level === 'critical',
                    'bg-orange-900/20 border-orange-700/30': fullAnalysisData.aiInsights.riskAssessment.level === 'high',
                    'bg-yellow-900/20 border-yellow-700/30': fullAnalysisData.aiInsights.riskAssessment.level === 'medium',
                    'bg-green-900/20 border-green-700/30': fullAnalysisData.aiInsights.riskAssessment.level === 'low'
                  }"
                >
                  <div class="flex items-center gap-2 mb-4">
                    <UBadge
                      :color="fullAnalysisData.aiInsights.riskAssessment.level === 'critical' ? 'red' :
                              fullAnalysisData.aiInsights.riskAssessment.level === 'high' ? 'orange' :
                              fullAnalysisData.aiInsights.riskAssessment.level === 'medium' ? 'yellow' : 'green'"
                      variant="solid"
                      size="lg"
                    >
                      Risk Level: {{ fullAnalysisData.aiInsights.riskAssessment.level.toUpperCase() }}
                    </UBadge>
                  </div>
                  <div v-if="fullAnalysisData.aiInsights.riskAssessment.concerns?.length > 0" class="space-y-2">
                    <div
                      v-for="(concern, index) in fullAnalysisData.aiInsights.riskAssessment.concerns"
                      :key="index"
                      class="flex items-start gap-2 text-gray-300"
                    >
                      <UIcon name="i-heroicons-exclamation-triangle" class="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />
                      <span>{{ concern }}</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Recommendations -->
              <div v-if="fullAnalysisData.aiInsights.recommendations?.length > 0">
                <h3 class="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
                  <UIcon name="i-heroicons-clipboard-document-check" class="w-4 h-4" />
                  Recommendations
                </h3>
                <div class="space-y-3">
                  <div
                    v-for="(rec, index) in fullAnalysisData.aiInsights.recommendations"
                    :key="index"
                    class="bg-gray-800/50 border border-gray-700 rounded-lg p-4"
                  >
                    <div class="flex items-start justify-between gap-3 mb-2">
                      <div class="font-medium text-white">{{ rec.action }}</div>
                      <UBadge
                        :color="rec.priority === 'high' ? 'red' : rec.priority === 'medium' ? 'yellow' : 'blue'"
                        variant="soft"
                        size="sm"
                      >
                        {{ rec.priority }}
                      </UBadge>
                    </div>
                    <p class="text-sm text-gray-400">{{ rec.rationale }}</p>
                  </div>
                </div>
              </div>

              <!-- Common Scenarios -->
              <div v-if="fullAnalysisData.aiInsights.commonScenarios?.length > 0">
                <h3 class="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
                  <UIcon name="i-heroicons-beaker" class="w-4 h-4" />
                  Common Scenarios
                </h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div
                    v-for="(scenario, index) in fullAnalysisData.aiInsights.commonScenarios"
                    :key="index"
                    class="rounded-lg p-4"
                    :class="{
                      'bg-green-900/10 border border-green-700/30': scenario.result === 'allowed',
                      'bg-red-900/10 border border-red-700/30': scenario.result === 'denied',
                      'bg-yellow-900/10 border border-yellow-700/30': scenario.result === 'conditional'
                    }"
                  >
                    <div class="flex items-center gap-2 mb-2">
                      <UIcon
                        :name="scenario.result === 'allowed' ? 'i-heroicons-check-circle' :
                               scenario.result === 'denied' ? 'i-heroicons-x-circle' : 'i-heroicons-exclamation-triangle'"
                        :class="{
                          'text-green-400': scenario.result === 'allowed',
                          'text-red-400': scenario.result === 'denied',
                          'text-yellow-400': scenario.result === 'conditional'
                        }"
                        class="w-5 h-5"
                      />
                      <span class="font-medium text-white">{{ scenario.scenario }}</span>
                    </div>
                    <p class="text-sm text-gray-400">{{ scenario.explanation }}</p>
                  </div>
                </div>
              </div>
            </div>

            <!-- No AI insights available -->
            <div v-else class="text-center py-12">
              <UIcon name="i-heroicons-cpu-chip" class="w-12 h-12 mx-auto mb-3 text-gray-500" />
              <p class="text-gray-400">AI analysis not available for this account</p>
            </div>
            </div>
          </div>

          <!-- Service Impact View -->
          <div v-if="activeTab === 'impact'" class="flex-1 overflow-y-auto px-8 py-6">
            <div class="space-y-6 max-w-[1800px] mx-auto">
            <div v-if="fullAnalysisData?.serviceImpacts">
              <h3 class="text-sm font-medium text-gray-300 mb-4 flex items-center gap-2">
                <UIcon name="i-heroicons-chart-bar-square" class="w-4 h-4" />
                Service Restriction Impact Analysis
              </h3>
              <p class="text-sm text-gray-400 mb-6">
                This view shows the percentage of common actions that are restricted for each service. Higher percentages indicate more severe restrictions.
              </p>
              <ServiceImpactChart :service-impacts="fullAnalysisData.serviceImpacts" />
            </div>
            <div v-else class="text-center py-12 text-gray-400">
              <UIcon name="i-heroicons-chart-bar-square" class="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p class="text-sm">No service impact data available</p>
            </div>
            </div>
          </div>

          <!-- Services View -->
          <div v-if="activeTab === 'services'" class="flex-1 overflow-y-auto px-8 py-6">
            <div class="space-y-6 max-w-[1800px] mx-auto">
            <!-- Service Filter -->
            <UInput
              v-model="serviceSearch"
              placeholder="Search services..."
              icon="i-heroicons-magnifying-glass"
              size="lg"
            />

            <!-- Services List -->
            <div class="space-y-4">
              <div
                v-for="[serviceName, service] in filteredServices"
                :key="serviceName"
                class="bg-gray-800/50 border border-gray-700 rounded-xl"
              >
                <div
                  class="p-5 cursor-pointer hover:bg-gray-800 transition-colors"
                  @click="toggleService(serviceName)"
                >
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-4">
                      <UIcon
                        :name="expandedServices.has(serviceName) ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
                        class="w-5 h-5 text-gray-400"
                      />
                      <span class="font-semibold text-white text-xl">{{ serviceName.toUpperCase() }}</span>
                    </div>
                    <div class="flex items-center gap-3">
                      <UBadge v-if="service.deniedActions.length > 0" color="red" variant="soft" size="md">
                        {{ service.deniedActions.length }} denied
                      </UBadge>
                      <UBadge v-if="service.conditionalActions.length > 0" color="yellow" variant="soft" size="md">
                        {{ service.conditionalActions.length }} conditional
                      </UBadge>
                    </div>
                  </div>
                </div>

                <!-- Expanded Content -->
                <div v-if="expandedServices.has(serviceName)" class="border-t border-gray-700 p-4 space-y-4">
                  <!-- Denied Actions -->
                  <div v-if="service.deniedActions.length > 0">
                    <h4 class="text-sm font-medium text-red-300 mb-3">Denied Actions ({{ service.deniedActions.length }})</h4>
                    <div class="space-y-3">
                      <div
                        v-for="denial in service.deniedActions"
                        :key="denial.action"
                        class="bg-red-900/10 border border-red-700/30 rounded-lg p-4"
                      >
                        <div class="flex items-start justify-between gap-3 mb-3">
                          <div class="font-mono text-base text-red-300 font-medium">{{ denial.action }}</div>
                          <div class="flex gap-2">
                            <UBadge v-if="denial.hasConditions" color="orange" variant="solid" size="xs">CONDITIONAL DENY</UBadge>
                            <UBadge v-else color="red" variant="solid" size="xs">DENIED</UBadge>
                          </div>
                        </div>

                        <div class="space-y-2">
                          <div class="text-xs font-medium text-gray-400">Denied by these policies:</div>
                          <div class="flex flex-wrap gap-2">
                            <UBadge
                              v-for="(stmt, idx) in denial.statements"
                              :key="idx"
                              color="red"
                              variant="soft"
                              class="text-xs"
                            >
                              <div class="flex items-center gap-1">
                                <UIcon name="i-heroicons-document-text" class="w-3 h-3" />
                                {{ stmt.policyName }}
                              </div>
                            </UBadge>
                          </div>

                          <!-- Show condition details for conditional denials -->
                          <div v-if="denial.hasConditions && denial.conditions.length > 0" class="mt-3 pt-3 border-t border-red-700/30">
                            <div class="text-sm font-medium text-gray-300 mb-2">Deny Conditions:</div>
                            <div class="bg-gray-900/50 rounded-lg p-4 space-y-3">
                              <div v-for="(cond, idx) in formatConditions(denial.conditions[0])" :key="idx" class="space-y-2">
                                <div class="flex items-start gap-2">
                                  <UIcon
                                    :name="cond.isNegative ? 'i-heroicons-x-circle' : 'i-heroicons-check-circle'"
                                    :class="cond.isNegative ? 'text-red-400' : 'text-blue-400'"
                                    class="w-4 h-4 mt-0.5 flex-shrink-0"
                                  />
                                  <div class="flex-1 min-w-0">
                                    <div class="text-sm font-medium text-orange-200">
                                      {{ cond.keyFormatted }} <span class="text-gray-400">{{ cond.operatorDescription }}</span>
                                    </div>
                                    <div v-if="cond.isMultiValue" class="mt-2 space-y-1">
                                      <div v-for="(val, vIdx) in cond.values" :key="vIdx" class="text-xs font-mono text-gray-300 pl-4 break-all">
                                        • {{ val }}
                                      </div>
                                    </div>
                                    <div v-else class="text-sm font-mono text-gray-300 mt-1 break-all">
                                      {{ cond.values[0] }}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Conditional Actions -->
                  <div v-if="service.conditionalActions.length > 0">
                    <h4 class="text-sm font-medium text-yellow-300 mb-3">Conditional Actions ({{ service.conditionalActions.length }})</h4>
                    <div class="space-y-3">
                      <div
                        v-for="conditional in service.conditionalActions"
                        :key="conditional.action"
                        class="bg-yellow-900/10 border border-yellow-700/30 rounded-lg p-4"
                      >
                        <div class="flex items-start justify-between gap-3 mb-3">
                          <div class="font-mono text-base text-yellow-300 font-medium">{{ conditional.action }}</div>
                          <UBadge color="yellow" variant="solid" size="xs">CONDITIONAL</UBadge>
                        </div>

                        <div class="space-y-2">
                          <div class="text-xs font-medium text-gray-400">Conditions applied by these policies:</div>
                          <div class="flex flex-wrap gap-2">
                            <UBadge
                              v-for="(stmt, idx) in conditional.statements"
                              :key="idx"
                              color="yellow"
                              variant="soft"
                              class="text-xs"
                            >
                              <div class="flex items-center gap-1">
                                <UIcon name="i-heroicons-document-text" class="w-3 h-3" />
                                {{ stmt.policyName }}
                              </div>
                            </UBadge>
                          </div>

                          <!-- Show condition details -->
                          <div v-if="conditional.conditions.length > 0" class="mt-3 pt-3 border-t border-yellow-700/30">
                            <div class="text-sm font-medium text-gray-300 mb-2">Conditions:</div>
                            <div class="bg-gray-900/50 rounded-lg p-4 space-y-3">
                              <div v-for="(cond, idx) in formatConditions(conditional.conditions[0])" :key="idx" class="space-y-2">
                                <div class="flex items-start gap-2">
                                  <UIcon
                                    :name="cond.isNegative ? 'i-heroicons-x-circle' : 'i-heroicons-check-circle'"
                                    :class="cond.isNegative ? 'text-red-400' : 'text-blue-400'"
                                    class="w-4 h-4 mt-0.5 flex-shrink-0"
                                  />
                                  <div class="flex-1 min-w-0">
                                    <div class="text-sm font-medium text-yellow-200">
                                      {{ cond.keyFormatted }} <span class="text-gray-400">{{ cond.operatorDescription }}</span>
                                    </div>
                                    <div v-if="cond.isMultiValue" class="mt-2 space-y-1">
                                      <div v-for="(val, vIdx) in cond.values" :key="vIdx" class="text-xs font-mono text-gray-300 pl-4 break-all">
                                        • {{ val }}
                                      </div>
                                    </div>
                                    <div v-else class="text-sm font-mono text-gray-300 mt-1 break-all">
                                      {{ cond.values[0] }}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- All Restricting Policies Summary -->
                  <div>
                    <h4 class="text-sm font-medium text-gray-300 mb-2">All Policies Affecting This Service</h4>
                    <div class="flex flex-wrap gap-2">
                      <UBadge v-for="policyName in service.restrictedBy" :key="policyName" color="gray" variant="soft" size="sm">
                        <div class="flex items-center gap-1">
                          <UIcon name="i-heroicons-shield-check" class="w-3 h-3" />
                          {{ policyName }}
                        </div>
                      </UBadge>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            </div>
          </div>

          <!-- Search View -->
          <div v-if="activeTab === 'search'" class="flex-1 overflow-y-auto px-8 py-6">
            <div class="space-y-6 max-w-[1800px] mx-auto">
            <!-- Quick Action Tester -->
            <div v-if="fullAnalysisData?.commonActionTests">
              <div class="text-sm font-semibold text-gray-300 mb-3">Quick Action Tests</div>
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div
                  v-for="test in fullAnalysisData.commonActionTests"
                  :key="test.action"
                  class="flex items-center justify-between bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2"
                >
                  <span class="text-sm font-mono text-gray-300">{{ test.action }}</span>
                  <UBadge
                    :color="test.result === 'allowed' ? 'green' : test.result === 'denied' ? 'red' : 'yellow'"
                    variant="soft"
                    size="xs"
                  >
                    {{ test.result === 'allowed' ? 'Allowed' : test.result === 'denied' ? 'Denied' : 'Conditional' }}
                  </UBadge>
                </div>
              </div>
            </div>

            <div class="border-t border-gray-700 pt-6"></div>

            <!-- Manual Search -->
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-2">Search for Specific Action</label>
              <UInput
                v-model="searchQuery"
                placeholder="e.g., s3:PutObject, ec2:RunInstances, iam:*"
                icon="i-heroicons-magnifying-glass"
                @keyup.enter="performSearch"
              >
                <template #trailing>
                  <UButton size="xs" color="blue" @click="performSearch">
                    Search
                  </UButton>
                </template>
              </UInput>
              <p class="text-xs text-gray-400 mt-1">Supports wildcards: s3:*, iam:Create*</p>
            </div>

            <!-- Search Results -->
            <div v-if="searchResults" class="space-y-4">
              <div class="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                <div class="flex items-center gap-3 mb-3">
                  <UIcon
                    :name="searchResults.isDenied ? 'i-heroicons-x-circle' : 'i-heroicons-check-circle'"
                    :class="searchResults.isDenied ? 'text-red-400' : 'text-green-400'"
                    class="w-6 h-6"
                  />
                  <div>
                    <div class="font-medium text-white">
                      {{ searchResults.isDenied ? 'Action is DENIED' : 'Action is ALLOWED' }}
                    </div>
                    <div class="text-sm text-gray-400">{{ searchQuery }}</div>
                  </div>
                </div>

                <div v-if="searchResults.isDenied && searchResults.matchingDenials.length > 0" class="space-y-3">
                  <h4 class="text-sm font-medium text-red-300 mb-2">Denied by these policies:</h4>
                  <div
                    v-for="(denial, index) in searchResults.matchingDenials"
                    :key="index"
                    class="bg-red-900/10 border border-red-700/30 rounded-lg p-4"
                  >
                    <div class="font-mono text-sm text-red-300 mb-3">{{ denial.action }}</div>
                    <div class="flex flex-wrap gap-2">
                      <UBadge
                        v-for="(stmt, idx) in denial.statements"
                        :key="idx"
                        color="red"
                        variant="soft"
                        size="sm"
                      >
                        <div class="flex items-center gap-1">
                          <UIcon name="i-heroicons-document-text" class="w-4 h-4" />
                          {{ stmt.policyName }}
                        </div>
                      </UBadge>
                    </div>
                  </div>
                </div>

                <div v-if="searchResults.isConditional && searchResults.matchingConditionals.length > 0" class="space-y-3 mt-4">
                  <h4 class="text-sm font-medium text-yellow-300 mb-2">With conditions from these policies:</h4>
                  <div
                    v-for="(conditional, index) in searchResults.matchingConditionals"
                    :key="index"
                    class="bg-yellow-900/10 border border-yellow-700/30 rounded-lg p-4"
                  >
                    <div class="font-mono text-sm text-yellow-300 mb-3">{{ conditional.action }}</div>
                    <div class="flex flex-wrap gap-2">
                      <UBadge
                        v-for="(stmt, idx) in conditional.statements"
                        :key="idx"
                        color="yellow"
                        variant="soft"
                        size="sm"
                      >
                        <div class="flex items-center gap-1">
                          <UIcon name="i-heroicons-document-text" class="w-4 h-4" />
                          {{ stmt.policyName }}
                        </div>
                      </UBadge>
                    </div>

                    <!-- Show conditions if available -->
                    <div v-if="conditional.conditions && conditional.conditions.length > 0" class="mt-3 pt-3 border-t border-yellow-700/30">
                      <div class="text-sm font-medium text-gray-300 mb-3">Condition Details:</div>
                      <div class="bg-gray-900/50 rounded-lg p-4 space-y-3">
                        <div v-for="(cond, idx) in formatConditions(conditional.conditions[0])" :key="idx" class="space-y-2">
                          <div class="flex items-start gap-2">
                            <UIcon
                              :name="cond.isNegative ? 'i-heroicons-x-circle' : 'i-heroicons-check-circle'"
                              :class="cond.isNegative ? 'text-red-400' : 'text-blue-400'"
                              class="w-5 h-5 mt-0.5 flex-shrink-0"
                            />
                            <div class="flex-1 min-w-0">
                              <div class="text-base font-medium text-yellow-200">
                                {{ cond.keyFormatted }} <span class="text-gray-400">{{ cond.operatorDescription }}</span>
                              </div>
                              <div v-if="cond.isMultiValue" class="mt-2 space-y-1.5">
                                <div v-for="(val, vIdx) in cond.values" :key="vIdx" class="text-sm font-mono text-gray-300 pl-4 break-all">
                                  • {{ val }}
                                </div>
                              </div>
                              <div v-else class="text-base font-mono text-gray-300 mt-1 break-all">
                                {{ cond.values[0] }}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            </div>
          </div>

          <!-- All Statements View -->
          <div v-if="activeTab === 'statements'" class="flex-1 overflow-y-auto px-8 py-6">
            <div class="space-y-4 max-w-[1800px] mx-auto">
            <div
              v-for="(stmt, index) in analysis.allStatements"
              :key="index"
              class="bg-gray-800/50 border rounded-lg p-4"
              :class="stmt.statement.Effect === 'Deny' ? 'border-red-700/30' : 'border-blue-700/30'"
            >
              <div class="flex items-start justify-between mb-2">
                <UBadge
                  :color="stmt.statement.Effect === 'Deny' ? 'red' : 'blue'"
                  variant="solid"
                  size="sm"
                >
                  {{ stmt.statement.Effect }}
                </UBadge>
                <span class="text-xs text-gray-400">{{ stmt.policyName }}</span>
              </div>

              <div class="space-y-2 text-sm">
                <div v-if="stmt.statement.Action">
                  <span class="text-gray-400">Actions:</span>
                  <div class="font-mono text-gray-300 ml-4">
                    {{ Array.isArray(stmt.statement.Action) ? stmt.statement.Action.join(', ') : stmt.statement.Action }}
                  </div>
                </div>

                <div v-if="stmt.statement.Condition" class="mt-3 pt-3 border-t border-gray-700">
                  <div class="text-sm font-medium text-gray-400 mb-3">Conditions:</div>
                  <div class="bg-gray-900/50 rounded-lg p-4 space-y-3">
                    <div v-for="(cond, idx) in formatConditions(stmt.statement.Condition)" :key="idx" class="space-y-2">
                      <div class="flex items-start gap-2">
                        <UIcon
                          :name="cond.isNegative ? 'i-heroicons-x-circle' : 'i-heroicons-check-circle'"
                          :class="cond.isNegative ? 'text-red-400' : 'text-blue-400'"
                          class="w-4 h-4 mt-0.5 flex-shrink-0"
                        />
                        <div class="flex-1 min-w-0">
                          <div class="text-sm font-medium text-gray-200">
                            {{ cond.keyFormatted }} <span class="text-gray-400">{{ cond.operatorDescription }}</span>
                          </div>
                          <div v-if="cond.isMultiValue" class="mt-2 space-y-1">
                            <div v-for="(val, vIdx) in cond.values" :key="vIdx" class="text-xs font-mono text-gray-300 pl-4 break-all">
                              • {{ val }}
                            </div>
                          </div>
                          <div v-else class="text-sm font-mono text-gray-300 mt-1 break-all">
                            {{ cond.values[0] }}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            </div>
          </div>
        </div>
      </div>
    </UCard>
  </UModal>
</template>

<script setup lang="ts">
const props = defineProps<{
  accountId: string
  environment?: 'commercial' | 'govcloud'
}>()

const isOpen = defineModel<boolean>()

const loading = ref(true)
const error = ref<string | null>(null)
const analysis = ref<any>(null)
const fullAnalysisData = ref<any>(null)
const activeTab = ref('summary')
const serviceSearch = ref('')
const searchQuery = ref('')
const searchResults = ref<any>(null)
const expandedServices = ref(new Set<string>())
const selectedService = ref<string | null>(null)

const tabs = [
  { id: 'summary', label: 'Summary', icon: 'i-heroicons-chart-bar' },
  { id: 'ai-insights', label: 'AI Insights', icon: 'i-heroicons-sparkles' },
  { id: 'services', label: 'Services', icon: 'i-heroicons-server-stack' },
  { id: 'impact', label: 'Service Impact', icon: 'i-heroicons-chart-bar-square' },
  { id: 'search', label: 'Search Actions', icon: 'i-heroicons-magnifying-glass' },
  { id: 'statements', label: 'All Statements', icon: 'i-heroicons-document-text' }
]

const filteredServices = computed((): Array<[string, any]> => {
  if (!analysis.value?.services) return []

  const services = Object.entries(analysis.value.services)

  if (!serviceSearch.value) return services

  const search = serviceSearch.value.toLowerCase()
  return services.filter(([name]) => name.toLowerCase().includes(search))
})

const toggleService = (serviceName: string) => {
  if (expandedServices.value.has(serviceName)) {
    expandedServices.value.delete(serviceName)
  } else {
    expandedServices.value.add(serviceName)
  }
}

const performSearch = () => {
  if (!searchQuery.value || !analysis.value) {
    searchResults.value = null
    return
  }

  // Extract service and search in analysis
  const service = (searchQuery.value.split(':')[0] || '').toLowerCase()
  const serviceData = analysis.value.services[service]

  if (!serviceData) {
    searchResults.value = {
      isDenied: false,
      isConditional: false,
      matchingDenials: [],
      matchingConditionals: []
    }
    return
  }

  const matchingDenials = serviceData.deniedActions.filter((d: any) =>
    matchesPattern(searchQuery.value, d.action)
  )

  const matchingConditionals = serviceData.conditionalActions.filter((c: any) =>
    matchesPattern(searchQuery.value, c.action)
  )

  searchResults.value = {
    isDenied: matchingDenials.length > 0,
    isConditional: matchingConditionals.length > 0,
    matchingDenials,
    matchingConditionals
  }
}

const matchesPattern = (action: string, pattern: string): boolean => {
  const regexPattern = pattern.replace(/\*/g, '.*').replace(/\?/g, '.')
  const regex = new RegExp(`^${regexPattern}$`, 'i')
  return regex.test(action)
}

// Get unique policies from all statements
const uniquePolicies = computed(() => {
  if (!analysis.value?.allStatements) return []

  const policyMap = new Map()

  for (const stmt of analysis.value.allStatements) {
    if (!policyMap.has(stmt.policyName)) {
      policyMap.set(stmt.policyName, {
        policyName: stmt.policyName,
        policyId: stmt.policyId,
        statementCount: 1,
        hasDeny: stmt.statement.Effect === 'Deny',
        hasCondition: !!stmt.statement.Condition
      })
    } else {
      const existing = policyMap.get(stmt.policyName)
      existing.statementCount++
      if (stmt.statement.Effect === 'Deny') existing.hasDeny = true
      if (stmt.statement.Condition) existing.hasCondition = true
    }
  }

  return Array.from(policyMap.values())
})

const getPolicyBadgeColor = (policy: any) => {
  if (policy.hasDeny) return 'red'
  if (policy.hasCondition) return 'yellow'
  return 'blue'
}

const getPolicyType = (policy: any) => {
  if (policy.hasDeny && policy.hasCondition) return 'Deny + Conditional'
  if (policy.hasDeny) return 'Has Denials'
  if (policy.hasCondition) return 'Conditional'
  return 'Allow'
}

// Condition formatting helper
interface FormattedCondition {
  operator: string
  operatorDescription: string
  key: string
  keyFormatted: string
  values: string[]
  isNegative: boolean
  isMultiValue: boolean
}

const formatConditions = (condition: Record<string, any>): FormattedCondition[] => {
  const CONDITION_OPERATORS: Record<string, { description: string, isNegative: boolean }> = {
    'StringEquals': { description: 'must equal', isNegative: false },
    'StringNotEquals': { description: 'must NOT equal', isNegative: true },
    'StringLike': { description: 'must match pattern', isNegative: false },
    'StringNotLike': { description: 'must NOT match pattern', isNegative: true },
    'NumericEquals': { description: 'must equal', isNegative: false },
    'NumericNotEquals': { description: 'must NOT equal', isNegative: true },
    'NumericLessThan': { description: 'must be less than', isNegative: false },
    'NumericLessThanEquals': { description: 'must be ≤', isNegative: false },
    'NumericGreaterThan': { description: 'must be greater than', isNegative: false },
    'NumericGreaterThanEquals': { description: 'must be ≥', isNegative: false },
    'DateEquals': { description: 'must equal', isNegative: false },
    'DateNotEquals': { description: 'must NOT equal', isNegative: true },
    'DateLessThan': { description: 'must be before', isNegative: false },
    'DateGreaterThan': { description: 'must be after', isNegative: false },
    'Bool': { description: 'must be', isNegative: false },
    'IpAddress': { description: 'must be from IP', isNegative: false },
    'NotIpAddress': { description: 'must NOT be from IP', isNegative: true },
    'ArnEquals': { description: 'must equal', isNegative: false },
    'ArnNotEquals': { description: 'must NOT equal', isNegative: true },
    'ArnLike': { description: 'must match ARN pattern', isNegative: false },
    'ArnNotLike': { description: 'must NOT match ARN pattern', isNegative: true },
    'Null': { description: 'must be null', isNegative: false },
  }

  const formatKey = (key: string): string => {
    if (key.startsWith('aws:')) {
      const withoutPrefix = key.substring(4)
      return withoutPrefix.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim()
    }
    return key
  }

  const formatValue = (value: any, operator: string): string => {
    const valueStr = String(value)
    if (operator.includes('Arn') && valueStr.startsWith('arn:')) {
      return valueStr.replace(/\$\{[^}]+\}/g, (match) => `[${match}]`)
    }
    return valueStr
  }

  const formatted: FormattedCondition[] = []

  for (const [operator, conditionValues] of Object.entries(condition)) {
    const operatorInfo = CONDITION_OPERATORS[operator] || {
      description: operator.toLowerCase(),
      isNegative: operator.toLowerCase().includes('not')
    }

    for (const [key, value] of Object.entries(conditionValues as Record<string, any>)) {
      const valueArray = Array.isArray(value) ? value : [value]
      formatted.push({
        operator,
        operatorDescription: operatorInfo.description,
        key,
        keyFormatted: formatKey(key),
        values: valueArray.map(v => formatValue(v, operator)),
        isNegative: operatorInfo.isNegative,
        isMultiValue: valueArray.length > 1
      })
    }
  }

  return formatted
}

watch(isOpen, async (newValue) => {
  if (newValue && !analysis.value) {
    await loadAnalysis()
  }
})

watch(() => selectedService.value, (newService) => {
  if (newService) {
    expandedServices.value.add(newService)
    selectedService.value = null
  }
})

const loadAnalysis = async () => {
  try {
    loading.value = true
    error.value = null

    const env = props.environment || 'govcloud'
    const response = await fetch(`/api/organization/accounts/${props.accountId}/policy-analysis?environment=${env}`)
    const data = await response.json()

    if (!data.success) {
      throw new Error(data.message || 'Failed to analyze policies')
    }

    analysis.value = data.data.analysis
    fullAnalysisData.value = data.data
  } catch (err: any) {
    error.value = err.message || 'Failed to load policy analysis'
    console.error('Error loading policy analysis:', err)
  } finally {
    loading.value = false
  }
}
</script>
