<template>
  <UModal v-model="isOpen" :ui="{ width: 'sm:max-w-4xl' }">
    <UCard class="sm:min-w-[800px]">
      <template #header>
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-xl font-semibold text-white">Policy Troubleshooter</h2>
            <p class="text-sm text-gray-400">Test if actions are allowed in this account</p>
          </div>
          <div class="flex items-center gap-2">
            <UButton
              v-if="!loading && !error"
              icon="i-heroicons-arrow-path"
              size="xs"
              variant="ghost"
              @click="loadAnalysis"
            />
            <UButton icon="i-heroicons-x-mark" variant="ghost" @click="isOpen = false" />
          </div>
        </div>
      </template>

      <!-- Loading -->
      <div v-if="loading" class="py-12 text-center">
        <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-blue-400 mx-auto mb-3" />
        <p class="text-gray-400">Analyzing policies...</p>
      </div>

      <!-- Error -->
      <div v-else-if="error" class="py-12 text-center">
        <UIcon name="i-heroicons-exclamation-triangle" class="w-12 h-12 text-red-400 mx-auto mb-3" />
        <p class="text-red-400">{{ error }}</p>
        <UButton class="mt-4" @click="loadAnalysis">Try Again</UButton>
      </div>

      <!-- Main Content -->
      <div v-else-if="analysisData" class="space-y-6">
        <!-- Search Box -->
        <div>
          <UInput
            v-model="searchQuery"
            size="xl"
            placeholder="Test an action: ec2:RunInstances, s3:PutObject, iam:CreateUser..."
            icon="i-heroicons-magnifying-glass"
            @keyup.enter="testAction"
          >
            <template #trailing>
              <UButton
                size="sm"
                :disabled="!searchQuery"
                @click="testAction"
              >
                Test
              </UButton>
            </template>
          </UInput>
          <p class="text-xs text-gray-500 mt-1">Supports wildcards: s3:*, iam:Create*</p>
        </div>

        <!-- Quick Actions -->
        <div>
          <div class="text-sm font-medium text-gray-400 mb-2">Quick Tests:</div>
          <div class="flex flex-wrap gap-2">
            <UButton
              v-for="action in quickActions"
              :key="action.action"
              size="sm"
              variant="outline"
              @click="quickTest(action.action)"
            >
              <UIcon :name="action.icon" class="w-4 h-4 mr-1" />
              {{ action.label }}
            </UButton>
          </div>
        </div>

        <!-- Test Results -->
        <div v-if="testResults.length > 0" class="space-y-3">
          <div class="flex items-center justify-between">
            <div class="text-sm font-medium text-gray-400">Results:</div>
            <UButton size="xs" variant="ghost" @click="testResults = []">Clear</UButton>
          </div>

          <div
            v-for="result in testResults"
            :key="result.action"
            class="rounded-lg border p-4"
            :class="{
              'bg-green-900/10 border-green-700/30': result.result === 'allowed',
              'bg-red-900/10 border-red-700/30': result.result === 'denied',
              'bg-blue-900/10 border-blue-700/30': result.result === 'conditional'
            }"
          >
            <div class="flex items-start justify-between gap-4">
              <div class="flex-1">
                <!-- Action & Status -->
                <div class="flex items-center gap-2 mb-2">
                  <UIcon
                    :name="result.result === 'allowed' ? 'i-heroicons-check-circle' :
                           result.result === 'denied' ? 'i-heroicons-x-circle' :
                           'i-heroicons-shield-check'"
                    :class="{
                      'text-green-400': result.result === 'allowed',
                      'text-red-400': result.result === 'denied',
                      'text-blue-400': result.result === 'conditional'
                    }"
                    class="w-6 h-6"
                  />
                  <code class="text-base font-medium text-white">{{ result.action }}</code>
                </div>

                <!-- Explanation -->
                <div class="pl-8 mb-3">
                  <div
                    v-if="result.result === 'conditional'"
                    class="bg-blue-900/20 border border-blue-700/30 rounded-lg p-3"
                  >
                    <div class="text-xs font-medium text-blue-300 mb-2 flex items-center gap-1">
                      <UIcon name="i-heroicons-shield-check" class="w-4 h-4" />
                      Security Requirements
                    </div>
                    <div class="space-y-1">
                      <div
                        v-for="(requirement, idx) in result.explanation.replace('Allowed when: ', '').split(' AND ')"
                        :key="idx"
                        class="flex items-start gap-2 text-sm text-blue-100"
                      >
                        <UIcon name="i-heroicons-check" class="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                        <span>{{ requirement.trim() }}</span>
                      </div>
                    </div>
                  </div>
                  <div
                    v-else
                    class="text-sm"
                    :class="{
                      'text-green-200': result.result === 'allowed',
                      'text-red-200': result.result === 'denied'
                    }"
                  >
                    {{ result.explanation }}
                  </div>
                </div>

                <!-- Policies -->
                <div v-if="result.policies.length > 0" class="pl-8">
                  <div class="text-xs text-gray-400 mb-1">
                    {{ result.result === 'denied' ? 'Blocked by:' : 'Required by:' }}
                  </div>
                  <div class="flex flex-wrap gap-1">
                    <UBadge
                      v-for="policy in result.policies"
                      :key="policy"
                      :color="result.result === 'denied' ? 'red' : 'blue'"
                      variant="soft"
                      size="xs"
                    >
                      {{ policy }}
                    </UBadge>
                  </div>
                </div>
              </div>

              <!-- Result Badge -->
              <UBadge
                :color="result.result === 'allowed' ? 'green' : result.result === 'denied' ? 'red' : 'blue'"
                variant="solid"
              >
                {{ result.result.toUpperCase() }}
              </UBadge>
            </div>
          </div>
        </div>

        <!-- Active Policies -->
        <div v-if="filteredPolicies.length > 0" class="border-t border-gray-700 pt-4">
          <div class="text-sm font-medium text-gray-400 mb-3">
            Active Security Policies ({{ filteredPolicies.length }})
          </div>

          <div class="space-y-2">
            <div
              v-for="policy in filteredPolicies"
              :key="policy.id"
              class="bg-gray-800/30 rounded-lg overflow-hidden"
            >
              <div class="p-3">
                <div class="flex items-start justify-between gap-3">
                  <div class="flex-1 min-w-0">
                    <div class="font-medium text-white mb-1">{{ policy.name }}</div>
                    <div class="text-xs text-gray-400 mb-2">
                      {{ policy.source === 'direct' ? '📌 Direct' : '⬇️ Inherited' }} from {{ policy.attachedAt }}
                      • {{ policy.statementCount }} statements
                    </div>
                    <div v-if="policy.description" class="text-xs text-gray-500 mb-2">
                      {{ policy.description }}
                    </div>
                  </div>
                  <UButton
                    size="xs"
                    variant="ghost"
                    :icon="expandedPolicies.has(policy.id) ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
                    @click="togglePolicy(policy.id)"
                  />
                </div>
              </div>

              <!-- Expanded Policy Details -->
              <div v-if="expandedPolicies.has(policy.id)" class="border-t border-gray-700 bg-gray-900/50">
                <div class="p-3 space-y-3">
                  <!-- Plain Language Statements -->
                  <div v-if="policy.enhancedStatements && policy.enhancedStatements.length > 0">
                    <div class="text-xs font-medium text-gray-400 mb-2">Policy Statements:</div>
                    <div class="space-y-2">
                      <div
                        v-for="(stmt, idx) in policy.enhancedStatements"
                        :key="idx"
                        class="text-xs rounded p-2"
                        :class="stmt.effect === 'Deny' ? 'bg-red-900/10 border border-red-700/20' : 'bg-green-900/10 border border-green-700/20'"
                      >
                        <div class="flex items-center gap-2 mb-1">
                          <UBadge
                            :color="stmt.effect === 'Deny' ? 'red' : 'green'"
                            variant="solid"
                            size="xs"
                          >
                            {{ stmt.effect }}
                          </UBadge>
                          <span v-if="stmt.sid" class="text-gray-500">{{ stmt.sid }}</span>
                        </div>
                        <div class="text-gray-300">{{ stmt.plainLanguage }}</div>
                        <div v-if="stmt.conditionsPlainEnglish && stmt.conditionsPlainEnglish.length > 0" class="mt-2 space-y-1">
                          <div
                            v-for="(condition, cIdx) in stmt.conditionsPlainEnglish"
                            :key="cIdx"
                            class="flex items-start gap-1 text-xs text-blue-300"
                          >
                            <UIcon name="i-heroicons-arrow-right" class="w-3 h-3 mt-0.5 flex-shrink-0" />
                            <span>{{ condition }}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Raw JSON Toggle -->
                  <div class="pt-2 border-t border-gray-700">
                    <button
                      @click="toggleRawPolicy(policy.id)"
                      class="text-xs text-gray-400 hover:text-gray-300 flex items-center gap-1"
                    >
                      <UIcon
                        :name="showRawPolicies.has(policy.id) ? 'i-heroicons-eye-slash' : 'i-heroicons-eye'"
                        class="w-4 h-4"
                      />
                      {{ showRawPolicies.has(policy.id) ? 'Hide' : 'Show' }} Raw JSON
                    </button>
                  </div>

                  <!-- Raw JSON -->
                  <div v-if="showRawPolicies.has(policy.id)" class="relative">
                    <button
                      @click="copyPolicyJson(policy)"
                      class="absolute top-2 right-2 z-10"
                    >
                      <UButton
                        size="xs"
                        icon="i-heroicons-clipboard-document"
                        variant="soft"
                        color="gray"
                      >
                        Copy
                      </UButton>
                    </button>
                    <pre class="bg-gray-950 rounded p-3 text-xs text-gray-300 overflow-x-auto max-h-96 overflow-y-auto">{{ formatPolicyJson(policy) }}</pre>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex items-center justify-between">
          <div class="text-xs text-gray-500">
            {{ analysisData ? `${analysisData.analysis.summary.totalDenials} unconditional blocks, ${analysisData.analysis.summary.totalConditionalDenials} security requirements` : '' }}
          </div>
          <UButton color="gray" variant="ghost" @click="isOpen = false">Close</UButton>
        </div>
      </template>
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
const analysisData = ref<any>(null)
const searchQuery = ref('')
const testResults = ref<any[]>([])
const showPolicies = ref(false)
const expandedPolicies = ref(new Set<string>())
const showRawPolicies = ref(new Set<string>())

const quickActions = [
  { action: 'ec2:RunInstances', label: 'Launch EC2', icon: 'i-heroicons-server' },
  { action: 's3:PutObject', label: 'Upload S3', icon: 'i-heroicons-arrow-up-tray' },
  { action: 'iam:CreateUser', label: 'Create User', icon: 'i-heroicons-user-plus' },
  { action: 'lambda:CreateFunction', label: 'Create Lambda', icon: 'i-heroicons-bolt' },
  { action: 'rds:CreateDBInstance', label: 'Create RDS', icon: 'i-heroicons-circle-stack' }
]

// Filter out FullAWSAccess (AWS default policy) - it's just noise
const filteredPolicies = computed(() => {
  return analysisData.value?.policies?.filter(p => p.name !== 'FullAWSAccess') || []
})

watch(isOpen, async (newValue) => {
  if (newValue && !analysisData.value) {
    await loadAnalysis()
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

    analysisData.value = data.data
  } catch (err: any) {
    error.value = err.message || 'Failed to load policy analysis'
    console.error('Error loading policy analysis:', err)
  } finally {
    loading.value = false
  }
}

const translateConditionsToEnglish = (condition: Record<string, any>): string[] => {
  const translations: string[] = []

  const conditionTranslations: Record<string, string> = {
    'StringEquals': 'equals',
    'StringNotEquals': 'does not equal',
    'StringLike': 'matches',
    'StringNotLike': 'does not match',
    'NumericEquals': 'equals',
    'NumericLessThan': 'is less than',
    'NumericGreaterThan': 'is greater than',
    'Bool': 'is',
    'IpAddress': 'is from IP',
    'NotIpAddress': 'is NOT from IP',
    'DateLessThan': 'is before',
    'DateGreaterThan': 'is after',
    'ArnEquals': 'ARN equals',
    'ArnLike': 'ARN matches'
  }

  const keyTranslations: Record<string, string> = {
    'aws:MultiFactorAuthPresent': 'MFA',
    'aws:MultiFactorAuthAge': 'MFA age',
    'aws:SourceIp': 'Source IP',
    'aws:SourceVpc': 'Source VPC',
    'aws:RequestedRegion': 'Region',
    'aws:SecureTransport': 'HTTPS',
    'aws:CurrentTime': 'Current time',
    'aws:PrincipalOrgID': 'Organization ID',
    'aws:PrincipalAccount': 'Account ID',
    'aws:userid': 'User ID',
    'aws:username': 'Username'
  }

  for (const [operator, conditionValues] of Object.entries(condition)) {
    const operatorText = conditionTranslations[operator] || operator.toLowerCase()

    for (const [key, value] of Object.entries(conditionValues as Record<string, any>)) {
      const keyText = keyTranslations[key] || key
      const values = Array.isArray(value) ? value : [value]

      // Special handling for booleans
      if (operator === 'Bool') {
        const boolValue = String(values[0]).toLowerCase() === 'true' ? 'enabled' : 'disabled'
        translations.push(`${keyText} must be ${boolValue}`)
      }
      // Special handling for IP addresses
      else if (operator.includes('IpAddress')) {
        const ipList = values.length > 1 ? values.join(' or ') : values[0]
        const verb = operator.includes('Not') ? 'must NOT be from' : 'must be from'
        translations.push(`${verb} IP ${ipList}`)
      }
      // Special handling for regions
      else if (key === 'aws:RequestedRegion') {
        const regionList = values.length > 1 ? values.join(', ') : values[0]
        if (operator === 'StringNotEquals') {
          translations.push(`Region must NOT be ${regionList}`)
        } else {
          translations.push(`Region must be ${regionList}`)
        }
      }
      // Default handling
      else {
        const valueList = values.length > 1 ? values.join(' or ') : values[0]
        translations.push(`${keyText} ${operatorText} ${valueList}`)
      }
    }
  }

  return translations
}

const togglePolicy = (policyId: string) => {
  if (expandedPolicies.value.has(policyId)) {
    expandedPolicies.value.delete(policyId)
  } else {
    expandedPolicies.value.add(policyId)
  }
}

const toggleRawPolicy = (policyId: string) => {
  if (showRawPolicies.value.has(policyId)) {
    showRawPolicies.value.delete(policyId)
  } else {
    showRawPolicies.value.add(policyId)
  }
}

const formatPolicyJson = (policy: any) => {
  // Extract the actual policy document from enhancedStatements
  const policyDocument = {
    Version: '2012-10-17',
    Statement: policy.enhancedStatements?.map((stmt: any) => {
      const statement: any = {
        Effect: stmt.effect
      }

      // Add Sid if exists
      if (stmt.sid) {
        statement.Sid = stmt.sid
      }

      // We don't have the full statement details in enhancedStatements
      // So we'll show what we have
      statement.PlainLanguage = stmt.plainLanguage

      if (stmt.conditionsPlainEnglish && stmt.conditionsPlainEnglish.length > 0) {
        statement.Conditions = stmt.conditionsPlainEnglish
      }

      return statement
    }) || []
  }

  return JSON.stringify(policyDocument, null, 2)
}

const copyPolicyJson = async (policy: any) => {
  try {
    await navigator.clipboard.writeText(formatPolicyJson(policy))
  } catch (error) {
    console.error('Failed to copy:', error)
  }
}

const quickTest = (action: string) => {
  searchQuery.value = action
  testAction()
}

const testAction = () => {
  if (!searchQuery.value || !analysisData.value) return

  const action = searchQuery.value.trim()

  // Check if already tested
  if (testResults.value.find(r => r.action === action)) {
    return
  }

  // Match against wildcard patterns
  const matchesPattern = (testAction: string, pattern: string): boolean => {
    const regexPattern = pattern.replace(/\*/g, '.*').replace(/\?/g, '.')
    const regex = new RegExp(`^${regexPattern}$`, 'i')
    return regex.test(testAction)
  }

  const service = action.split(':')[0] || ''
  const serviceData = service ? analysisData.value.analysis.services[service] : undefined

  if (!serviceData) {
    testResults.value.unshift({
      action,
      result: analysisData.value.analysis.summary.hasFullAccess ? 'allowed' : 'unknown',
      explanation: analysisData.value.analysis.summary.hasFullAccess
        ? 'Allowed by FullAWSAccess policy'
        : 'No policies found for this service',
      policies: []
    })
    return
  }

  // Check for unconditional denials
  const unconditionalDenials = serviceData.deniedActions.filter((d: any) =>
    !d.hasConditions && matchesPattern(action, d.action)
  )

  if (unconditionalDenials.length > 0) {
    testResults.value.unshift({
      action,
      result: 'denied',
      explanation: 'This action is blocked by policy for compliance/security reasons',
      policies: [...new Set(unconditionalDenials.flatMap((d: any) => d.statements.map((s: any) => s.policyName)))]
    })
    return
  }

  // Check for conditional denials (security requirements)
  const conditionalDenials = serviceData.deniedActions.filter((d: any) =>
    d.hasConditions && matchesPattern(action, d.action)
  )

  const conditionalAllows = serviceData.conditionalActions.filter((c: any) =>
    matchesPattern(action, c.action)
  )

  if (conditionalDenials.length > 0 || conditionalAllows.length > 0) {
    // Get actual conditions and translate to plain English
    const allConditions: string[] = []

    conditionalDenials.forEach((d: any) => {
      if (d.conditions && d.conditions.length > 0) {
        const condition = d.conditions[0] // Get first condition object
        allConditions.push(...translateConditionsToEnglish(condition))
      }
    })

    conditionalAllows.forEach((c: any) => {
      if (c.conditions && c.conditions.length > 0) {
        const condition = c.conditions[0]
        allConditions.push(...translateConditionsToEnglish(condition))
      }
    })

    // Remove duplicates
    const uniqueConditions = [...new Set(allConditions)]

    const explanation = uniqueConditions.length > 0
      ? `Allowed when: ${uniqueConditions.join(' AND ')}`
      : 'Allowed when security requirements are met'

    testResults.value.unshift({
      action,
      result: 'conditional',
      explanation,
      policies: [
        ...new Set([
          ...conditionalDenials.flatMap((d: any) => d.statements.map((s: any) => s.policyName)),
          ...conditionalAllows.flatMap((c: any) => c.statements.map((s: any) => s.policyName))
        ])
      ]
    })
    return
  }

  // Allowed
  testResults.value.unshift({
    action,
    result: 'allowed',
    explanation: 'Fully allowed with no additional requirements',
    policies: []
  })
}
</script>
