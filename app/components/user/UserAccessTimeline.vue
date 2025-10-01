<template>
  <div class="space-y-6">
    <!-- Loading State -->
    <div v-if="loading" class="flex items-center justify-center p-8">
      <USkeleton class="h-64 w-full" />
    </div>

    <!-- No Data State -->
    <div v-else-if="!events || events.length === 0" class="text-center py-12">
      <UIcon name="i-heroicons-clock" class="w-12 h-12 mx-auto mb-4 text-gray-400" />
      <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">No Session Data Available</h3>
      <p class="text-gray-600 dark:text-gray-400">
        No user sessions found for the selected time period. Try adjusting your filters or date range.
      </p>
    </div>

    <!-- Main Content -->
    <div v-else class="space-y-6">
      <!-- Session Timeline Help Text -->
      <div class="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <div class="flex items-start gap-3">
          <UIcon name="i-heroicons-information-circle" class="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
          <div class="text-sm">
            <h4 class="font-medium text-blue-900 dark:text-blue-100 mb-1">Understanding Session Timeline</h4>
            <p class="text-blue-700 dark:text-blue-300 mb-2">
              This timeline shows <strong>user sessions</strong> - periods of continuous activity in AWS accounts. 
              Each horizontal bar represents time spent in a specific AWS account or role.
            </p>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div>
                <strong>Session Length:</strong> How long each bar extends shows duration of activity
              </div>
              <div>
                <strong>Account Context:</strong> Each row shows a different AWS account accessed
              </div>
              <div>
                <strong>Time Gaps:</strong> Breaks between bars indicate periods of inactivity (15+ minutes)
              </div>
              <div>
                <strong>Risk Levels:</strong> Color coding shows potential security concerns
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Session Summary Cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <UCard class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <div class="text-center p-4">
            <div class="text-3xl font-bold text-blue-600 dark:text-blue-400">
              {{ sessionData?.length || 0 }}
            </div>
            <div class="text-sm text-gray-600 dark:text-gray-400">Total Sessions</div>
            <div class="text-xs text-gray-500 dark:text-gray-500 mt-1">Distinct periods of activity</div>
          </div>
        </UCard>

        <UCard class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <div class="text-center p-4">
            <div class="text-3xl font-bold text-green-600 dark:text-green-400">
              {{ formatDuration(averageSessionDuration || 0) }}
            </div>
            <div class="text-sm text-gray-600 dark:text-gray-400">Avg Duration</div>
            <div class="text-xs text-gray-500 dark:text-gray-500 mt-1">Per session length</div>
          </div>
        </UCard>
        
        <UCard class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <div class="text-center p-4">
            <div class="text-3xl font-bold text-purple-600 dark:text-purple-400">
              {{ uniqueAccountsAccessed || 0 }}
            </div>
            <div class="text-sm text-gray-600 dark:text-gray-400">AWS Accounts</div>
            <div class="text-xs text-gray-500 dark:text-gray-500 mt-1">Different accounts accessed</div>
          </div>
        </UCard>

        <UCard class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <div class="text-center p-4">
            <div class="flex items-center justify-center gap-1 mb-1">
              <div class="text-lg font-bold text-blue-500">{{ commercialSessions }}</div>
              <div class="text-xs text-gray-400">/</div>
              <div class="text-lg font-bold text-green-500">{{ govCloudSessions }}</div>
              <div class="text-xs text-gray-400">/</div>
              <div class="text-lg font-bold text-purple-500">{{ mixedSessions }}</div>
            </div>
            <div class="text-sm text-gray-600 dark:text-gray-400">Environment Split</div>
            <div class="text-xs text-gray-500 dark:text-gray-500 mt-1">Commercial / GovCloud / Mixed</div>
          </div>
        </UCard>

        <UCard class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <div class="text-center p-4">
            <div class="text-3xl font-bold" :class="getRiskColorClass(averageRiskScore || 0)">
              {{ averageRiskScore || 0 }}/100
            </div>
            <div class="text-sm text-gray-600 dark:text-gray-400">Risk Score</div>
            <div class="text-xs text-gray-500 dark:text-gray-500 mt-1">Security assessment</div>
          </div>
        </UCard>
      </div>

      <!-- User Journey Flow Diagram -->
      <UserJourneyFlowDiagram 
        :sessions="enrichedSessions" 
        :loading="loading"
        @view-event-details="openEventDetailsModal"
        @step-clicked="handleStepClick"
      />

      <!-- Sessions List with Inline Expansion -->
      <UCard class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <template #header>
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Session Timeline</h3>
              <p class="text-sm text-gray-600 dark:text-gray-400">Click any session to view detailed information</p>
            </div>
            <div class="flex items-center gap-2">
              <USelectMenu
                v-model="sessionSortBy"
                :options="[
                  { label: 'Most Recent', value: 'startTime' },
                  { label: 'Longest Duration', value: 'duration' },
                  { label: 'Highest Risk', value: 'riskScore' },
                  { label: 'Account Name', value: 'accountId' }
                ]"
                size="sm"
                class="bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600"
              />
              <UButton
                icon="i-heroicons-arrow-path"
                size="sm"
                variant="outline"
                @click="refreshTimeline"
                class="border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300"
              >
                Refresh
              </UButton>
            </div>
          </div>
        </template>
        
        <div class="divide-y divide-gray-200 dark:divide-gray-700">
          <div v-if="!sessions || sessions.length === 0" class="text-center py-8 text-gray-500 dark:text-gray-400">
            No session timeline data available
          </div>
          <div v-else>
            <div 
              v-for="(session, index) in sortedSessions" 
              :key="session.id || index"
              class="transition-all duration-200"
            >
              <!-- Session Row -->
              <div 
                class="p-4 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors"
                @click="toggleSessionExpansion(session)"
              >
                <div class="flex items-center justify-between">
                  <div class="flex-1 min-w-0">
                    <!-- Session Header -->
                    <div class="flex items-center gap-2 mb-2">
                      <h4 class="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {{ getReadableSessionTitle(session) }}
                      </h4>
                      <UBadge :color="getSessionTypeColor(session.type)" size="xs" class="text-gray-800 dark:text-gray-200">
                        {{ (session.type || 'Unknown').replace('Session', '') }}
                      </UBadge>
                      <UBadge :color="getPartitionColor(session.partition)" size="xs">
                        <UIcon :name="getPartitionIcon(session.partition)" class="w-3 h-3 mr-1" />
                        {{ session.partition === 'mixed' ? 'Multi-Env' : session.partition?.toUpperCase() }}
                      </UBadge>
                      <UBadge :color="getRiskColor(session.riskScore || 0)" size="xs">
                        {{ getRiskLevel(session.riskScore || 0) }}
                      </UBadge>
                      <div v-if="session.hasAssumeRole" class="flex items-center">
                        <UBadge color="purple" size="xs" class="text-gray-800 dark:text-gray-200">
                          <UIcon name="i-heroicons-key" class="w-3 h-3 mr-1" />
                          Role Chain
                        </UBadge>
                      </div>
                      <div v-if="session.crossPartitionActivity" class="flex items-center">
                        <UBadge color="orange" size="xs" class="text-gray-800 dark:text-gray-200">
                          <UIcon name="i-heroicons-exclamation-triangle" class="w-3 h-3 mr-1" />
                          Cross-Partition
                        </UBadge>
                      </div>
                    </div>
                    
                    <!-- Session Context -->
                    <div class="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                      <span class="flex items-center gap-1">
                        <UIcon name="i-heroicons-clock" class="w-3 h-3" />
                        {{ formatSessionTime(session) }}
                      </span>
                      <span class="flex items-center gap-1">
                        <UIcon name="i-heroicons-play" class="w-3 h-3" />
                        {{ formatDuration(session.duration || 0) }}
                      </span>
                      <span class="flex items-center gap-1">
                        <UIcon name="i-heroicons-bolt" class="w-3 h-3" />
                        {{ (session.activities && session.activities.length) || 0 }} events
                      </span>
                      <span v-if="session.sourceIPs && session.sourceIPs.length > 0" class="flex items-center gap-1">
                        <UIcon name="i-heroicons-globe-alt" class="w-3 h-3" />
                        {{ session.sourceIPs.slice(0, 2).join(', ') }}{{ session.sourceIPs.length > 2 ? ` +${session.sourceIPs.length - 2}` : '' }}
                      </span>
                      <span v-if="session.services && session.services.length > 0" class="flex items-center gap-1">
                        <UIcon name="i-heroicons-squares-2x2" class="w-3 h-3" />
                        {{ session.services.slice(0, 2).join(', ') }}{{ session.services.length > 2 ? ` +${session.services.length - 2}` : '' }}
                      </span>
                    </div>
                    
                    <!-- Activity Summary -->
                    <div class="mt-2 flex items-center gap-2">
                      <span class="text-xs text-gray-600 dark:text-gray-400">Primary activities:</span>
                      <div class="flex items-center gap-1">
                        <template v-for="category in getTopCategories(session.activities || [])" :key="category">
                          <UBadge :color="getCategoryColor(category)" size="xs" variant="soft">
                            {{ category }}
                          </UBadge>
                        </template>
                      </div>
                    </div>
                  </div>
                  
                  <div class="ml-4 flex items-center">
                    <UIcon 
                      :name="expandedSessions.has(session.id) ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'" 
                      class="w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform"
                    />
                  </div>
                </div>
                      </div>
                      
              <!-- Expanded Session Details -->
              <div 
                v-if="expandedSessions.has(session.id)" 
                class="px-4 pb-6 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-600"
              >
                <div class="pt-4 space-y-4">
                  <!-- Session Metadata -->
                  <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label class="text-sm font-medium text-gray-700 dark:text-gray-300">AWS Account</label>
                      <p class="text-sm text-gray-900 dark:text-white font-mono">
                        {{ getReadableAccountName((session.accountIds && session.accountIds[0]) || 'Unknown') }}
                      </p>
                    </div>
                    <div>
                      <label class="text-sm font-medium text-gray-700 dark:text-gray-300">Session Duration</label>
                      <p class="text-sm text-gray-900 dark:text-white">
                        {{ formatDuration(session.duration || 0) }}
                      </p>
                    </div>
                    <div>
                      <label class="text-sm font-medium text-gray-700 dark:text-gray-300">Environment</label>
                      <div class="flex items-center gap-2">
                        <UBadge :color="getPartitionColor(session.partition)" size="sm">
                          <UIcon :name="getPartitionIcon(session.partition)" class="w-3 h-3 mr-1" />
                          {{ session.partition === 'mixed' ? 'Multi-Environment' : session.partition?.toUpperCase() }}
                        </UBadge>
                        <UBadge v-if="session.crossPartitionActivity" color="orange" size="xs" variant="soft">
                          Cross-Partition
                        </UBadge>
                      </div>
                    </div>
                  </div>

                  <!-- Environment Transitions (if present) -->
                  <div v-if="session.environmentTransitions && session.environmentTransitions.length > 0" class="space-y-2">
                    <label class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">Environment Transitions</label>
                    <div class="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg p-3">
                      <div class="flex items-center gap-2 mb-2">
                        <UIcon name="i-heroicons-exclamation-triangle" class="w-4 h-4 text-orange-600 dark:text-orange-400" />
                        <span class="text-sm font-medium text-orange-900 dark:text-orange-100">
                          {{ session.environmentTransitions.length }} cross-partition transition{{ session.environmentTransitions.length > 1 ? 's' : '' }} detected
                        </span>
                      </div>
                      <div class="space-y-2">
                        <div v-for="(transition, transIndex) in session.environmentTransitions" :key="transIndex" 
                             class="flex items-center justify-between text-sm p-2 bg-white dark:bg-gray-800 rounded border border-orange-200 dark:border-orange-600">
                          <div class="flex items-center gap-2">
                            <UBadge :color="getPartitionColor(transition.fromPartition)" size="xs">
                              {{ transition.fromPartition.toUpperCase() }}
                            </UBadge>
                            <UIcon name="i-heroicons-arrow-right" class="w-3 h-3 text-orange-500" />
                            <UBadge :color="getPartitionColor(transition.toPartition)" size="xs">
                              {{ transition.toPartition.toUpperCase() }}
                            </UBadge>
                            <span class="text-gray-600 dark:text-gray-400">{{ transition.eventName }}</span>
                          </div>
                          <span class="text-xs text-gray-500 dark:text-gray-400">
                            {{ formatTime(transition.timestamp) }}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Assume Role Chain (if present) -->
                  <div v-if="session.assumeRoleChain && session.assumeRoleChain.length > 0" class="space-y-2">
                    <label class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">Assume Role Chain</label>
                    <div class="flex items-center space-x-2 overflow-x-auto pb-2">
                      <div v-for="(role, roleIndex) in session.assumeRoleChain" :key="roleIndex" class="flex items-center">
                        <div class="flex-shrink-0 px-2 py-1 bg-purple-100 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded text-center min-w-[100px]">
                          <div class="text-xs font-medium text-purple-900 dark:text-purple-200 truncate">
                            {{ getReadableAccountName(role.accountId) }}
                          </div>
                          <div class="text-xs text-purple-600 dark:text-purple-400 truncate">
                            {{ role.roleName }}
                          </div>
                        </div>
                        <div v-if="roleIndex < session.assumeRoleChain.length - 1" class="flex-shrink-0 mx-1">
                          <UIcon name="i-heroicons-arrow-right" class="w-3 h-3 text-purple-400 dark:text-purple-500" />
                        </div>
                      </div>
                    </div>
                      </div>
                      
                  <!-- Security Insights -->
                  <div v-if="session.insights && session.insights.length > 0">
                    <label class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">Security Insights</label>
                    <div class="space-y-2">
                      <div 
                        v-for="insight in session.insights" 
                        :key="insight.type"
                        class="flex items-center justify-between text-sm p-2 rounded-lg cursor-pointer hover:bg-opacity-80 transition-colors"
                        :class="getInsightSeverity(insight.type) === 'high' ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300' :
                               getInsightSeverity(insight.type) === 'medium' ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300' :
                               'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'"
                        @click="handleInsightClick(insight, session)"
                      >
                        <div class="flex items-center gap-2">
                          <UIcon 
                            :name="getInsightSeverity(insight.type) === 'high' ? 'i-heroicons-exclamation-triangle' : 
                                   getInsightSeverity(insight.type) === 'medium' ? 'i-heroicons-exclamation-circle' : 
                                   'i-heroicons-information-circle'"
                            class="w-4 h-4 flex-shrink-0"
                          />
                          <span>{{ insight.message || 'No details available' }}</span>
                        </div>
                        <UButton
                          size="2xs" 
                          variant="ghost"
                          icon="i-heroicons-chevron-right"
                          @click.stop="handleInsightClick(insight, session)"
                        />
                      </div>
                    </div>
                  </div>

                  <!-- Activity Timeline -->
                  <div v-if="session.activities && session.activities.length > 0">
                    <div class="flex items-center justify-between mb-3">
                      <label class="text-sm font-medium text-gray-700 dark:text-gray-300">Activity Breakdown</label>
                      <div class="text-xs text-gray-500 dark:text-gray-400">
                        {{ session.activities.length }} total events
                        <span v-if="session.activities.filter(a => isRoleAssumptionEvent(a)).length > 0">
                          • {{ session.activities.filter(a => isRoleAssumptionEvent(a)).length }} role changes
                        </span>
                      </div>
                    </div>
                    <div class="space-y-2 max-h-64 overflow-y-auto">
                      <div 
                        v-for="(activity, index) in session.activities" 
                        :key="index"
                        class="flex items-center justify-between p-3 bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 cursor-pointer transition-colors"
                        @click="openEventDetailsModal(activity)"
                      >
                        <div class="flex items-center gap-3">
                          <UBadge :color="getCategoryColor(activity.category)" size="xs">
                            {{ activity.category || 'General' }}
                          </UBadge>
                          <span class="text-sm font-medium text-gray-900 dark:text-white">{{ activity.eventName || 'Unknown Event' }}</span>
                          <!-- Role Assumption Indicator -->
                          <UBadge 
                            v-if="isRoleAssumptionEvent(activity)" 
                            color="purple" 
                            size="xs" 
                            variant="soft"
                          >
                            <UIcon name="i-heroicons-key" class="w-3 h-3 mr-1" />
                            {{ extractRoleNameFromActivity(activity) }}
                          </UBadge>
                          <!-- Debug badge for troubleshooting -->
                          <UBadge 
                            v-if="activity.eventName?.toLowerCase().includes('switch') && extractRoleNameFromActivity(activity) === 'Unknown Role'"
                            color="orange"
                            size="xs"
                            variant="soft"
                          >
                            Debug Switch
                          </UBadge>
                          </div>
                        <div class="text-right">
                          <div class="text-xs text-gray-500 dark:text-gray-400">{{ formatTime(activity.eventTime) }}</div>
                          <div class="text-xs text-gray-400 dark:text-gray-500">{{ activity.eventSource || 'Unknown Service' }}</div>
                          <UButton 
                            size="2xs" 
                            variant="ghost" 
                            icon="i-heroicons-eye" 
                            class="mt-1"
                            @click.stop="openEventDetailsModal(activity)"
                          >
                            Details
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
      </UCard>
                    </div>

    <!-- Event Details Modal -->
    <UModal v-model="eventDetailsModalOpen" :ui="{ width: 'sm:max-w-4xl' }">
      <UCard :ui="{ ring: '', divide: 'divide-y divide-gray-200 dark:divide-gray-700' }">
        <template #header>
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                CloudTrail Event Details
              </h3>
              <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {{ selectedEventForModal?.eventName || 'Unknown Event' }} - 
                {{ selectedEventForModal?.eventSource || 'Unknown Service' }}
              </p>
                  </div>
            <UButton 
              color="gray" 
              variant="ghost" 
              icon="i-heroicons-x-mark-20-solid" 
              class="-my-1" 
              @click="eventDetailsModalOpen = false" 
            />
                  </div>
        </template>

        <div v-if="selectedEventForModal" class="space-y-6">
          <!-- Event Overview -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label class="text-sm font-medium text-gray-700 dark:text-gray-300">Event Time</label>
              <p class="text-sm text-gray-900 dark:text-white font-mono">
                {{ formatTimeWithTimezone(selectedEventForModal.eventTime) }}
              </p>
                </div>
            <div>
              <label class="text-sm font-medium text-gray-700 dark:text-gray-300">Event Source</label>
              <p class="text-sm text-gray-900 dark:text-white">
                {{ selectedEventForModal.eventSource || 'Unknown' }}
              </p>
              </div>
            <div>
              <label class="text-sm font-medium text-gray-700 dark:text-gray-300">AWS Region</label>
              <p class="text-sm text-gray-900 dark:text-white">
                {{ (selectedEventForModal as any).awsRegion || 'Unknown' }}
              </p>
            </div>
          </div>

                     <!-- Role Assumption Details (if applicable) -->
           <div v-if="isRoleAssumptionEvent(selectedEventForModal)" class="p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded-lg">
             <div class="flex items-center gap-2 mb-3">
               <UIcon name="i-heroicons-key" class="w-5 h-5 text-purple-600 dark:text-purple-400" />
               <h4 class="text-sm font-medium text-purple-900 dark:text-purple-100">Role Assumption Details</h4>
             </div>
             <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm mb-4">
               <div>
                 <label class="font-medium text-purple-700 dark:text-purple-300">Extracted Role Name</label>
                 <p class="text-purple-900 dark:text-purple-100 font-bold">
                   {{ selectedEventForModal ? extractRoleNameFromActivity({
                     eventTime: new Date(selectedEventForModal.eventTime),
                     eventName: selectedEventForModal.eventName,
                     eventSource: selectedEventForModal.eventSource?.replace('.amazonaws.com', '') || 'unknown',
                     accountId: selectedEventForModal.accountId,
                     sourceIP: selectedEventForModal.sourceIPAddress,
                     isSignificant: false,
                     category: 'auth',
                     originalEvent: selectedEventForModal,
                     userIdentity: selectedEventForModal.userIdentity,
                     requestParameters: selectedEventForModal.requestParameters,
                     responseElements: selectedEventForModal.responseElements,
                     additionalEventData: (selectedEventForModal as any).additionalEventData,
                     awsRegion: selectedEventForModal.awsRegion
                   }) : 'Unknown Role' }}
                 </p>
               </div>
               <div>
                 <label class="font-medium text-purple-700 dark:text-purple-300">Target Role ARN</label>
                 <p class="text-purple-900 dark:text-purple-100 font-mono text-xs break-all">
                   {{ extractRoleArnFromEvent(selectedEventForModal) }}
                 </p>
               </div>
               <div>
                 <label class="font-medium text-purple-700 dark:text-purple-300">Role Session Name</label>
                 <p class="text-purple-900 dark:text-purple-100">
                   {{ extractRoleSessionNameFromEvent(selectedEventForModal) }}
                 </p>
               </div>
             </div>
             <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
               <div>
                 <label class="font-medium text-purple-700 dark:text-purple-300">Principal</label>
                 <p class="text-purple-900 dark:text-purple-100 font-mono text-xs">
                   {{ (selectedEventForModal as any).userIdentity?.principalId || 'Unknown' }}
                 </p>
               </div>
               <div>
                 <label class="font-medium text-purple-700 dark:text-purple-300">Source IP</label>
                 <p class="text-purple-900 dark:text-purple-100">
                   {{ (selectedEventForModal as any).sourceIPAddress || 'Unknown' }}
                 </p>
               </div>
             </div>

             <!-- Debug Section for Role Issues -->
             <div v-if="selectedEventForModal.eventName?.toLowerCase().includes('switch')" class="mt-4 p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded">
               <h5 class="text-xs font-medium text-orange-700 dark:text-orange-300 mb-2">Debug: SwitchRole Event Structure</h5>
               <div class="text-xs font-mono text-orange-600 dark:text-orange-400 space-y-1">
                 <div>Event Name: {{ selectedEventForModal.eventName }}</div>
                 <div>Event Source: {{ selectedEventForModal.eventSource }}</div>
                 <div>User Identity Type: {{ (selectedEventForModal as any).userIdentity?.type }}</div>
                 <div>User Identity ARN: {{ (selectedEventForModal as any).userIdentity?.arn }}</div>
                 <div>Has Request Params: {{ !!(selectedEventForModal as any).requestParameters }}</div>
                 <div>Has Response Elements: {{ !!(selectedEventForModal as any).responseElements }}</div>
                 <div v-if="(selectedEventForModal as any).additionalEventData?.SwitchTo" class="text-green-600 dark:text-green-400">
                   <strong>✓ SwitchTo ARN Found:</strong> {{ (selectedEventForModal as any).additionalEventData.SwitchTo }}
                 </div>
                 <div v-if="(selectedEventForModal as any).errorMessage" class="text-red-600 dark:text-red-400">
                   <strong>⚠ Error Message:</strong> {{ (selectedEventForModal as any).errorMessage }}
                      </div>
                 <div v-if="(selectedEventForModal as any).responseElements?.SwitchRole">
                   <strong>Response Status:</strong> {{ (selectedEventForModal as any).responseElements.SwitchRole }}
                    </div>
                  </div>
                </div>
              </div>

          <!-- User Identity -->
          <div v-if="(selectedEventForModal as any).userIdentity">
            <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">User Identity</h4>
            <div class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <pre class="text-xs text-gray-900 dark:text-white overflow-x-auto whitespace-pre-wrap">{{ JSON.stringify((selectedEventForModal as any).userIdentity, null, 2) }}</pre>
            </div>
          </div>

          <!-- Request Parameters -->
          <div v-if="(selectedEventForModal as any).requestParameters">
            <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Request Parameters</h4>
            <div class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <pre class="text-xs text-gray-900 dark:text-white overflow-x-auto whitespace-pre-wrap">{{ JSON.stringify((selectedEventForModal as any).requestParameters, null, 2) }}</pre>
            </div>
          </div>

          <!-- Response Elements -->
          <div v-if="(selectedEventForModal as any).responseElements">
            <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Response Elements</h4>
            <div class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <pre class="text-xs text-gray-900 dark:text-white overflow-x-auto whitespace-pre-wrap">{{ JSON.stringify((selectedEventForModal as any).responseElements, null, 2) }}</pre>
            </div>
          </div>

          <!-- Additional Event Data (for SwitchRole and other console events) -->
          <div v-if="(selectedEventForModal as any).additionalEventData">
            <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Additional Event Data</h4>
            <div class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <pre class="text-xs text-gray-900 dark:text-white overflow-x-auto whitespace-pre-wrap">{{ JSON.stringify((selectedEventForModal as any).additionalEventData, null, 2) }}</pre>
            </div>
          </div>

          <!-- Full Event Data -->
                    <div>
            <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Full Event Data</h4>
            <div class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg max-h-96 overflow-y-auto">
              <pre class="text-xs text-gray-900 dark:text-white overflow-x-auto whitespace-pre-wrap">{{ JSON.stringify(selectedEventForModal, null, 2) }}</pre>
                    </div>
                  </div>
                </div>

        <template #footer>
          <div class="flex justify-end">
            <UButton color="gray" @click="eventDetailsModalOpen = false">
              Close
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Failed Operations Modal -->
    <UModal v-model="failedOperationsModalOpen" :ui="{ width: 'sm:max-w-4xl' }">
      <UCard :ui="{ ring: '', divide: 'divide-y divide-gray-200 dark:divide-gray-700' }">
        <template #header>
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                Failed Operations Details
              </h3>
              <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {{ selectedFailedOperations?.length || 0 }} failed operations in this session
              </p>
            </div>
            <UButton 
              color="gray" 
              variant="ghost" 
              icon="i-heroicons-x-mark-20-solid" 
              class="-my-1" 
              @click="failedOperationsModalOpen = false" 
            />
          </div>
        </template>

        <div v-if="selectedFailedOperations && selectedFailedOperations.length > 0" class="space-y-4">
          <div 
            v-for="(operation, index) in selectedFailedOperations" 
            :key="index"
            class="p-4 border border-red-200 dark:border-red-700 rounded-lg bg-red-50 dark:bg-red-900/20"
          >
            <div class="flex items-start justify-between mb-3">
              <div>
                <h4 class="text-sm font-medium text-red-900 dark:text-red-100">
                  {{ operation.eventName || 'Unknown Operation' }}
                </h4>
                <p class="text-xs text-red-600 dark:text-red-400 mt-1">
                  {{ operation.eventSource || 'Unknown Service' }} • {{ formatTimeWithTimezone(operation.eventTime) }}
                </p>
              </div>
              <UBadge color="red" size="xs">
                {{ operation.errorCode || 'Error' }}
              </UBadge>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <label class="font-medium text-red-700 dark:text-red-300">Error Code</label>
                <p class="text-red-900 dark:text-red-100">{{ operation.errorCode || 'Unknown' }}</p>
              </div>
              <div>
                <label class="font-medium text-red-700 dark:text-red-300">Error Message</label>
                <p class="text-red-900 dark:text-red-100">{{ operation.errorMessage || 'No message available' }}</p>
              </div>
              <div>
                <label class="font-medium text-red-700 dark:text-red-300">AWS Region</label>
                <p class="text-red-900 dark:text-red-100">{{ (operation as any).awsRegion || 'Unknown' }}</p>
              </div>
              <div>
                <label class="font-medium text-red-700 dark:text-red-300">Source IP</label>
                <p class="text-red-900 dark:text-red-100">{{ (operation as any).sourceIPAddress || 'Unknown' }}</p>
              </div>
            </div>

            <div class="mt-3">
              <UButton 
                size="xs" 
                variant="outline" 
                color="red"
                @click="openEventDetailsModal(operation)"
              >
                View Full Event Details
              </UButton>
            </div>
          </div>
        </div>

        <div v-else class="text-center py-8 text-gray-500 dark:text-gray-400">
          No failed operations found for this session.
        </div>

        <template #footer>
          <div class="flex justify-end">
            <UButton color="gray" @click="failedOperationsModalOpen = false">
              Close
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { SessionManager, type AccessEvent, type UserSession, type SessionActivity } from '~/utils/sessionManager'

// Extended interfaces to handle additional properties
interface ExtendedUserSession extends UserSession {
  hasAssumeRole?: boolean
  assumeRoleChain?: Array<{
  accountId: string
    roleName: string
    timestamp?: string
  }>
  // Add partition-specific properties
  partition: 'commercial' | 'govcloud' | 'mixed'
  crossPartitionActivity?: boolean
  environmentTransitions?: Array<{
    fromPartition: 'commercial' | 'govcloud'
    toPartition: 'commercial' | 'govcloud'
    timestamp: Date
    eventName: string
  }>
}

interface Props {
  events: AccessEvent[]
  loading: boolean
  userEmail?: string
  analysisData?: any
}

const props = defineProps<Props>()

// State
const sessionManager = new SessionManager()
const selectedSession = ref<ExtendedUserSession | null>(null)
const timelineView = ref<'time' | 'account' | 'risk'>('time')
const sessionSortBy = ref<'startTime' | 'duration' | 'riskScore' | 'accountId'>('startTime')
const refreshing = ref(false)
const showAllSessions = ref(false)

// Timeline view options
const timelineViewOptions = [
  { label: 'Chronological', value: 'chronological' },
  { label: 'By Account', value: 'account' },
  { label: 'By Risk Level', value: 'risk' }
]

// Sort options
const sortOptions = [
  { label: 'Start Time', value: 'start-time' },
  { label: 'Duration', value: 'duration' },
  { label: 'Risk Score', value: 'risk-score' },
  { label: 'Event Count', value: 'event-count' }
]

// Reactive data
const sessions = ref<ExtendedUserSession[]>([])
const expandedSessions = ref<Set<string>>(new Set())
const assumeRolePaths = ref<any[]>([])

// Timezone handling
const userTimezone = computed(() => {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
})

// Computed
const sessionsComputed = computed(() => {
  if (!props.events?.length) return []
  const computedSessions = sessionManager.createSessionsFromEvents(props.events)
  sessions.value = computedSessions as ExtendedUserSession[]
  return computedSessions as ExtendedUserSession[]
})

const totalSessions = computed(() => sessionsComputed.value.length)

const sessionData = computed(() => sessionsComputed.value || [])

const averageSessionDuration = computed(() => {
  if (!sessionsComputed.value || sessionsComputed.value.length === 0) return 0
  const totalDuration = sessionsComputed.value.reduce((sum, session) => sum + (session.duration || 0), 0)
  return Math.round(totalDuration / sessionsComputed.value.length)
})

const uniqueAccountsAccessed = computed(() => {
  if (!sessionsComputed.value || sessionsComputed.value.length === 0) return 0
  const accountIds = new Set()
  sessionsComputed.value.forEach(session => {
    if (session.accountIds && Array.isArray(session.accountIds)) {
      session.accountIds.forEach(id => accountIds.add(id))
    }
  })
  return accountIds.size
})

const averageRiskScore = computed(() => {
  if (!sessionsComputed.value.length) return 0
  return Math.round(sessionsComputed.value.reduce((sum, s) => sum + s.riskScore, 0) / sessionsComputed.value.length)
})

// Environment distribution metrics
const commercialSessions = computed(() => {
  return enrichedSessions.value.filter(s => s.partition === 'commercial').length
})

const govCloudSessions = computed(() => {
  return enrichedSessions.value.filter(s => s.partition === 'govcloud').length
})

const mixedSessions = computed(() => {
  return enrichedSessions.value.filter(s => s.partition === 'mixed').length
})

// Enhanced sessions with additional computed properties
const enrichedSessions = computed(() => {
  if (!sessionsComputed.value) return []
  
  return sessionsComputed.value.map(session => {
    const extended: ExtendedUserSession = {
      ...session,
      hasAssumeRole: session.activities?.some(activity => 
        isRoleAssumptionEvent(activity)
      ) || false,
      assumeRoleChain: generateAssumeRoleChain(session)
    }
    return extended
  })
})

// Single sortedSessions computed property
const sortedSessions = computed(() => {
  if (!enrichedSessions.value || enrichedSessions.value.length === 0) return []
  
  const sorted = [...enrichedSessions.value]
  
  switch (sessionSortBy.value) {
    case 'duration':
      return sorted.sort((a, b) => (b.duration || 0) - (a.duration || 0))
    case 'riskScore':
      return sorted.sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0))
    case 'accountId':
      return sorted.sort((a, b) => {
        const aAccount = a.accountIds?.[0] || ''
        const bAccount = b.accountIds?.[0] || ''
        return aAccount.localeCompare(bAccount)
      })
    default: // startTime
      return sorted.sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime())
  }
})

// Safe session selection
const selectSession = (session: ExtendedUserSession | any) => {
  if (session && typeof session === 'object') {
    selectedSession.value = session
  }
}

// Methods
function getSessionTypeColor(type: string): 'blue' | 'green' | 'purple' | 'orange' | 'gray' {
  switch (type) {
    case 'console': return 'blue'
    case 'assumed-role': return 'green'
    case 'api': return 'purple'
    case 'mixed': return 'orange'
    default: return 'gray'
  }
}

function getRiskColor(score: number): 'red' | 'orange' | 'yellow' | 'green' {
  if (score >= 70) return 'red'
  if (score >= 50) return 'orange'
  if (score >= 25) return 'yellow'
  return 'green'
}

function getRiskLevel(score: number): string {
  if (score >= 70) return 'Critical'
  if (score >= 50) return 'High'
  if (score >= 25) return 'Medium'
  return 'Low'
}

function getCategoryColor(category: string): 'blue' | 'green' | 'purple' | 'red' | 'orange' | 'gray' {
  switch (category) {
    case 'auth': return 'blue'
    case 'data': return 'green'
    case 'compute': return 'purple'
    case 'security': return 'red'
    case 'admin': return 'orange'
    default: return 'gray'
  }
}

function getSessionIcon(type: string): string {
  switch (type) {
    case 'console': return 'i-heroicons-computer-desktop'
    case 'assumed-role': return 'i-heroicons-key'
    case 'api': return 'i-heroicons-cog-6-tooth'
    case 'mixed': return 'i-heroicons-squares-plus'
    default: return 'i-heroicons-clock'
  }
}

function formatDuration(durationMs: number): string {
  if (!durationMs || durationMs <= 0) return '0 min'
  
  const minutes = Math.floor(durationMs / 60000)
  const hours = Math.floor(minutes / 60)
  
  if (hours > 0) {
    const remainingMinutes = minutes % 60
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`
  }
  
  return `${minutes}m`
}

function formatTime(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date
  return dateObj.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false,
    timeZone: userTimezone.value
  })
}

function formatSessionTime(session: ExtendedUserSession): string {
  if (!session || !session.start) return 'Unknown Time'
  
  try {
    const startDate = new Date(session.start)
    return startDate.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: userTimezone.value,
      timeZoneName: 'short'
    })
  } catch (error) {
    return 'Invalid Date'
  }
}

function formatTimeWithTimezone(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date
  return dateObj.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: userTimezone.value,
    timeZoneName: 'short'
  })
}

async function refreshTimeline(): Promise<void> {
  refreshing.value = true
  // Simulate refresh delay
  await new Promise(resolve => setTimeout(resolve, 500))
  refreshing.value = false
}

// Helper methods for better session display
const getReadableAccountName = (accountId: string) => {
  if (!accountId) return 'Unknown Account'
  
  // Extract readable name from ARO account ID (GovCloud specific)
  if (accountId.startsWith('ARO')) {
    const parts = accountId.split(':')
    if (parts.length >= 2) {
      return parts[1] || 'Unknown Account'
    }
  }
  return accountId
}

const getReadableSessionTitle = (session: ExtendedUserSession) => {
  if (!session) return 'Unknown Session'
  
  // Try to extract a meaningful user/role name from the session
  let userInfo = 'User'
  
  // Check if we have original principal ID (AWS SSO format)
  if (session.originalPrincipalId) {
    if (session.originalPrincipalId.includes('::')) {
      const parts = session.originalPrincipalId.split('::')
      if (parts.length >= 3) {
        userInfo = parts[2] // User name part from AWS SSO
      }
    } else if (session.originalPrincipalId.includes('@')) {
      userInfo = session.originalPrincipalId.split('@')[0]
    } else if (session.originalPrincipalId.includes('/')) {
      const parts = session.originalPrincipalId.split('/')
      userInfo = parts[parts.length - 1]
    }
  }
  
  // Try to get the primary role from assume role chain
  let primaryRole = ''
  if (session.assumeRoleChain && session.assumeRoleChain.length > 0) {
    const lastRole = session.assumeRoleChain[session.assumeRoleChain.length - 1]
    if (lastRole.roleName && lastRole.roleName !== 'Unknown Role') {
      primaryRole = ` → ${lastRole.roleName}`
    }
  }
  
  // Get account info
  const accountId = (session.accountIds && session.accountIds[0]) || 'Unknown'
  const accountName = getReadableAccountName(accountId)
  const partitionLabel = getPartitionLabel(session.partition)
  
  // Build a more informative title
  if (primaryRole) {
    return `${userInfo}${primaryRole} (${accountName}) ${partitionLabel}`
  } else {
    const sessionType = (session.type || 'Console').replace('Session', '').replace('-', ' ')
    return `${userInfo} → ${sessionType} (${accountName}) ${partitionLabel}`
  }
}

// New helper functions for partition handling
const getPartitionLabel = (partition: 'commercial' | 'govcloud' | 'mixed') => {
  switch (partition) {
    case 'commercial': return '[COMMERCIAL]'
    case 'govcloud': return '[GOVCLOUD]'
    case 'mixed': return '[MULTI-ENV]'
    default: return ''
  }
}

const getPartitionColor = (partition: 'commercial' | 'govcloud' | 'mixed'): 'blue' | 'green' | 'purple' => {
  switch (partition) {
    case 'commercial': return 'blue'
    case 'govcloud': return 'green'
    case 'mixed': return 'purple'
    default: return 'blue'
  }
}

const getPartitionIcon = (partition: 'commercial' | 'govcloud' | 'mixed'): string => {
  switch (partition) {
    case 'commercial': return 'i-heroicons-building-office'
    case 'govcloud': return 'i-heroicons-shield-check'
    case 'mixed': return 'i-heroicons-arrows-right-left'
    default: return 'i-heroicons-cloud'
  }
}

const getTopCategories = (activities: any[]) => {
  if (!activities || !Array.isArray(activities)) return []
  
  const categoryCount = new Map()
  activities.forEach(activity => {
    const category = activity?.category || 'General'
    categoryCount.set(category, (categoryCount.get(category) || 0) + 1)
  })
  
  return Array.from(categoryCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([category]) => category)
}

// Fix the insight severity mapping
const getInsightSeverity = (insightType: string): 'high' | 'medium' | 'low' => {
  if (!insightType) return 'low'
  
  switch (insightType) {
    case 'critical': return 'high'
    case 'warning': return 'medium'
    default: return 'low'
  }
}

// Additional helper functions
function getRiskColorClass(score: number): string {
  if (score >= 80) return 'text-red-600 dark:text-red-400'
  if (score >= 60) return 'text-orange-600 dark:text-orange-400'
  if (score >= 40) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-green-600 dark:text-green-400'
}

function toggleSessionExpansion(session: ExtendedUserSession): void {
  if (!session.id) return
  
  const sessionId = session.id
  if (expandedSessions.value.has(sessionId)) {
    expandedSessions.value.delete(sessionId)
  } else {
    expandedSessions.value.add(sessionId)
  }
}

// Generate assume role chain from session data
function generateAssumeRoleChain(session: UserSession): Array<{accountId: string, roleName: string, timestamp?: string}> {
  if (!session.activities) return []
  
  const assumeRoleEvents = session.activities.filter(activity => 
    isRoleAssumptionEvent(activity)
  )
  
  return assumeRoleEvents.map(activity => ({
    accountId: activity.accountId || 'Unknown',
    roleName: extractRoleNameFromActivity(activity),
    timestamp: activity.eventTime.toISOString()
  }))
}

function extractRoleNameFromActivity(activity: SessionActivity): string {
  if (!isRoleAssumptionEvent(activity)) {
    return 'Unknown Role'
  }

  // Prefer originalEvent data if available (new format)
  const activityData = (activity as any).originalEvent || activity as any
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
          // Enhanced AWS SSO role name extraction
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
        console.log(`✅ Found SwitchRole target: ${rolePart} from ${switchToArn}`)
        // Handle paths like GD/CloudTeam_Operations
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
  
  // Method 6: For console events, check if eventName contains role information
  if (eventName.includes('switch') || eventName.includes('role')) {
    // Sometimes role switching events might have role info in other fields
    const allFields = JSON.stringify(activityData).toLowerCase()
    const roleMatch = allFields.match(/:role\/([^"'\s,}]+)/i)
    if (roleMatch && roleMatch[1]) {
      return extractMeaningfulRoleName(roleMatch[1])
    }
  }
  
  // Method 7: Last resort - check for any ARN-like pattern
  const fullEventString = JSON.stringify(activityData)
  const rolePattern = /arn:aws[^:]*:iam::\d+:role\/([^"',\s}]+)/gi
  const match = rolePattern.exec(fullEventString)
  if (match && match[1]) {
    return extractMeaningfulRoleName(match[1])
  }
  
  // If all else fails, provide a more specific unknown message
  if (eventName.includes('switch')) {
    console.warn(`⚠️ SwitchRole event found but no role extracted:`, {
      eventName: activity.eventName,
      hasOriginalEvent: !!(activity as any).originalEvent,
      hasAdditionalEventData: !!activityData.additionalEventData,
      additionalEventData: activityData.additionalEventData,
      hasUserIdentity: !!activityData.userIdentity,
      userIdentityType: activityData.userIdentity?.type
    })
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
      const extractedName = meaningfulParts.join('_')
      console.log(`🔍 AWS SSO Role extracted: "${extractedName}" from "${fullRoleName}"`)
      return extractedName
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

// Computed property to generate assume role paths from sessions
const assumeRolePathsComputed = computed(() => {
  if (!sessionsComputed.value) return []
  
  return sessionsComputed.value
    .filter(session => session.activities && session.activities.some(activity => 
      isRoleAssumptionEvent(activity)
    ))
    .map(session => ({
      id: session.id,
      riskScore: session.riskScore || 0,
      duration: session.duration || 0,
      eventCount: (session.activities || []).length,
      startTime: session.start,
      endTime: session.end,
      steps: generateRoleSteps(session)
    }))
})

function generateRoleSteps(session: UserSession) {
  const steps = []
  
  // Add initial role/account
  if (session.accountIds && session.accountIds.length > 0) {
    steps.push({
      account: session.accountIds[0],
      role: session.originalPrincipalId || 'Initial Session',
      timestamp: typeof session.start === 'string' ? session.start : session.start?.toISOString()
    })
  }
  
  // Look for role assumption events in activities
  if (session.activities) {
    session.activities
      .filter(activity => isRoleAssumptionEvent(activity))
      .forEach(activity => {
        steps.push({
          account: activity.accountId || 'Unknown',
          role: extractRoleNameFromActivity(activity),
          timestamp: activity.eventTime.toISOString()
        })
      })
  }
  
  return steps
}

// Watch for changes in computed paths and update the ref
watch(assumeRolePathsComputed, (newPaths) => {
  assumeRolePaths.value = newPaths
}, { immediate: true })

// Watchers
watch(() => props.events, () => {
  selectedSession.value = null
}, { deep: true })

// Event details modal state
const eventDetailsModalOpen = ref(false)
const selectedEventForModal = ref<AccessEvent | null>(null)

// Failed operations modal state
const failedOperationsModalOpen = ref(false)
const selectedFailedOperations = ref<AccessEvent[]>([])
const selectedInsightSession = ref<ExtendedUserSession | null>(null)

// Event details modal methods
function openEventDetailsModal(event: AccessEvent | SessionActivity) {
  // If this is a SessionActivity, use the originalEvent if available
  const eventData = (event as any).originalEvent || event
  selectedEventForModal.value = eventData
  eventDetailsModalOpen.value = true
}

function isRoleAssumptionEvent(event: AccessEvent | SessionActivity): boolean {
  // Handle both AccessEvent and SessionActivity types
  const eventData = (event as any).originalEvent || event
  const eventName = eventData.eventName?.toLowerCase() || ''
  const eventSource = eventData.eventSource?.toLowerCase() || ''
  
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
  const isAssumedRoleUser = eventData.userIdentity?.type === 'AssumedRole'
  
  return isAssumeRoleEvent || isSwitchRoleEvent || isStsEvent || isStsSource || 
         (isConsoleSource && isAssumedRoleUser)
}

function extractRoleArnFromEvent(event: AccessEvent): string {
  const eventData = event as any
  
  // Check additionalEventData for SwitchRole events (most important for console switches)
  if (eventData.additionalEventData?.SwitchTo) {
    return eventData.additionalEventData.SwitchTo
  }
  
  // Check request parameters
  if (eventData.requestParameters) {
    const roleArn = eventData.requestParameters.roleArn ||
                    eventData.requestParameters.roleName ||
                    eventData.requestParameters.roleSessionName
    if (roleArn) return roleArn
  }
  
  // Check response elements
  if (eventData.responseElements) {
    const roleArn = eventData.responseElements.assumedRoleUser?.arn ||
                    eventData.responseElements.credentials?.sessionName ||
                    eventData.responseElements.roleName
    if (roleArn) return roleArn
  }
  
  // Check user identity for assumed roles
  if (eventData.userIdentity?.type === 'AssumedRole') {
    const arn = eventData.userIdentity.arn
    if (arn) return arn
  }
  
  return 'Unknown'
}

function extractRoleSessionNameFromEvent(event: AccessEvent): string {
  const eventData = event as any
  
  // Check request parameters
  if (eventData.requestParameters) {
    const sessionName = eventData.requestParameters.roleSessionName ||
                        eventData.requestParameters.sessionName ||
                        eventData.requestParameters.roleName
    if (sessionName) return sessionName
  }
  
  // Check response elements
  if (eventData.responseElements) {
    const sessionName = eventData.responseElements.credentials?.sessionName ||
                        eventData.responseElements.assumedRoleUser?.assumedRoleId?.split('/')[1]
    if (sessionName) return sessionName
  }
  
  // Extract from user identity ARN
  if (eventData.userIdentity?.type === 'AssumedRole' && eventData.userIdentity.arn) {
    const arnParts = eventData.userIdentity.arn.split('/')
    if (arnParts.length > 1) {
      return arnParts[arnParts.length - 1]
    }
  }
  
  return 'Unknown'
}

function handleStepClick(step: any, path: any) {
  // Handle journey step clicks - could show additional details or navigate
  console.log('Step clicked:', step, path)
}

function handleInsightClick(insight: any, session: ExtendedUserSession) {
  selectedInsightSession.value = session
  
  // If this is about failed operations, show the failed operations modal
  if (insight.type === 'errors' || insight.message?.toLowerCase().includes('failed')) {
    const failedOps = session.activities?.filter(activity => 
      (activity as any).errorCode || 
      (activity as any).errorMessage ||
      activity.eventName?.toLowerCase().includes('error') ||
      activity.eventName?.toLowerCase().includes('fail') ||
      // Check for SwitchRole failures specifically
      (activity.eventName === 'SwitchRole' && (activity as any).responseElements?.SwitchRole === 'Failure')
    ).map(activity => {
      // Convert SessionActivity back to AccessEvent format using originalEvent if available
      return (activity as any).originalEvent || {
        eventId: `${activity.eventName}-${activity.eventTime.getTime()}`,
        eventTime: activity.eventTime.toISOString(),
        eventName: activity.eventName,
        eventSource: activity.eventSource + '.amazonaws.com',
        awsRegion: activity.awsRegion || 'us-east-1',
        sourceIPAddress: activity.sourceIP,
        userAgent: 'Unknown',
        accountId: activity.accountId,
        errorCode: (activity as any).errorCode,
        errorMessage: (activity as any).errorMessage,
        userIdentity: (activity as any).userIdentity || {
          type: 'Unknown',
          principalId: 'Unknown',
          arn: 'Unknown',
          accountId: activity.accountId
        }
      }
    }) || []
    
    selectedFailedOperations.value = failedOps
    failedOperationsModalOpen.value = true
  } else {
    // For other insights, could show different modals or details
    console.log('Insight clicked:', insight, session)
  }
}
</script> 