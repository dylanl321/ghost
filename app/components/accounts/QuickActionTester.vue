<template>
  <div class="space-y-6">
    <!-- Quick test buttons for common actions -->
    <div>
      <h4 class="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
        <UIcon name="i-heroicons-bolt" class="w-4 h-4" />
        Quick Action Tests
      </h4>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="action in commonActions"
          :key="action"
          @click="testAction(action)"
          class="px-3 py-2 rounded-lg text-sm font-medium transition-colors"
          :class="getActionButtonClass(action)"
        >
          <div class="flex items-center gap-2">
            <UIcon :name="getActionIcon(action)" class="w-4 h-4" />
            <span>{{ getActionLabel(action) }}</span>
            <UIcon
              v-if="getActionResult(action)"
              :name="getResultIcon(getActionResult(action)!)"
              :class="getResultIconClass(getActionResult(action)!)"
              class="w-4 h-4"
            />
          </div>
        </button>
      </div>
    </div>

    <!-- Results display -->
    <div v-if="testedActions.length > 0" class="space-y-3">
      <h4 class="text-sm font-medium text-gray-300 flex items-center gap-2">
        <UIcon name="i-heroicons-clipboard-document-list" class="w-4 h-4" />
        Test Results
      </h4>

      <div class="space-y-2">
        <div
          v-for="test in testedActions"
          :key="test.action"
          class="rounded-lg p-4"
          :class="getResultCardClass(test.result)"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="flex-1">
              <div class="flex items-center gap-2 mb-2">
                <UIcon
                  :name="getResultIcon(test.result)"
                  :class="getResultIconClass(test.result)"
                  class="w-5 h-5"
                />
                <span class="font-mono text-sm font-medium" :class="getResultTextClass(test.result)">
                  {{ test.action }}
                </span>
                <UBadge :color="getResultBadgeColor(test.result)" variant="solid" size="xs">
                  {{ test.result.toUpperCase() }}
                </UBadge>
              </div>

              <!-- Explanation -->
              <div v-if="test.explanation" class="mt-3 text-sm text-gray-300 bg-gray-900/50 rounded-lg p-3">
                {{ test.explanation }}
              </div>

              <!-- Denied explanation -->
              <div v-if="test.result === 'denied' && test.deniedBy.length > 0" class="space-y-2 mt-3">
                <div class="text-sm text-red-200">
                  <strong>⛔ Unconditionally blocked by:</strong>
                </div>
                <div class="flex flex-wrap gap-2">
                  <UBadge
                    v-for="policy in test.deniedBy"
                    :key="policy.policyId"
                    color="red"
                    variant="soft"
                    size="sm"
                  >
                    {{ policy.policyName }}
                  </UBadge>
                </div>
                <div class="text-xs text-red-300 mt-2 italic">
                  This action cannot be performed in this account under any circumstances. This is typically for compliance or security policy reasons.
                </div>
              </div>

              <!-- Conditional explanation -->
              <div v-if="test.result === 'conditional' && test.conditionalBy.length > 0" class="space-y-2 mt-3">
                <div class="text-sm text-yellow-200">
                  <strong>🔒 Security requirements enforced by:</strong>
                </div>
                <div class="flex flex-wrap gap-2">
                  <UBadge
                    v-for="policy in test.conditionalBy"
                    :key="policy.policyId"
                    :color="policy.type === 'security-requirement' ? 'blue' : 'yellow'"
                    variant="soft"
                    size="sm"
                  >
                    <div class="flex items-center gap-1">
                      <UIcon
                        :name="policy.type === 'security-requirement' ? 'i-heroicons-shield-check' : 'i-heroicons-key'"
                        class="w-3 h-3"
                      />
                      {{ policy.policyName }}
                    </div>
                  </UBadge>
                </div>
                <div class="text-xs text-blue-300 mt-2 p-2 bg-blue-900/20 rounded border border-blue-700/30">
                  <strong>✓ This action IS allowed</strong> when you meet the security requirements (e.g., MFA enabled, approved IP address, correct region).
                  These are protective measures, not blocks.
                </div>
              </div>

              <!-- Allowed explanation -->
              <div v-if="test.result === 'allowed'" class="mt-3">
                <div class="text-xs text-green-300 p-2 bg-green-900/20 rounded border border-green-700/30">
                  ✓ This action is fully allowed with no additional security requirements.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Clear results button -->
      <div class="flex justify-end">
        <UButton
          size="sm"
          color="gray"
          variant="soft"
          @click="testedActions = []"
        >
          Clear Results
        </UButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  commonActionTests: Array<{
    action: string
    result: 'allowed' | 'denied' | 'conditional' | 'unknown'
    deniedBy: Array<{ policyName: string; policyId: string }>
    conditionalBy: Array<{ policyName: string; policyId: string; type?: 'security-requirement' | 'conditional-allow' }>
    explanation?: string
  }>
}>()

const commonActions = [
  'ec2:RunInstances',
  's3:CreateBucket',
  's3:PutObject',
  'iam:CreateUser',
  'lambda:CreateFunction',
  'rds:CreateDBInstance'
]

const testedActions = ref<typeof props.commonActionTests>([])

const testAction = (action: string) => {
  const result = props.commonActionTests.find(t => t.action === action)
  if (result && !testedActions.value.find(t => t.action === action)) {
    testedActions.value.push(result)
  }
}

const getActionResult = (action: string) => {
  const result = testedActions.value.find(t => t.action === action)
  return result?.result
}

const getActionLabel = (action: string) => {
  const labels: Record<string, string> = {
    'ec2:RunInstances': 'Launch EC2',
    'ec2:StopInstances': 'Stop EC2',
    's3:CreateBucket': 'Create S3 Bucket',
    's3:PutObject': 'Upload to S3',
    's3:DeleteObject': 'Delete from S3',
    'iam:CreateUser': 'Create IAM User',
    'iam:CreateRole': 'Create IAM Role',
    'lambda:CreateFunction': 'Create Lambda',
    'rds:CreateDBInstance': 'Create RDS DB'
  }
  return labels[action] || action
}

const getActionIcon = (action: string) => {
  const service = action.split(':')[0]
  const icons: Record<string, string> = {
    'ec2': 'i-heroicons-server',
    's3': 'i-heroicons-archive-box',
    'iam': 'i-heroicons-user-group',
    'lambda': 'i-heroicons-bolt',
    'rds': 'i-heroicons-circle-stack'
  }
  return icons[service] || 'i-heroicons-cube'
}

const getActionButtonClass = (action: string) => {
  const result = getActionResult(action)
  if (!result) {
    return 'bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700'
  }

  switch (result) {
    case 'allowed':
      return 'bg-green-900/30 border-green-700 text-green-300'
    case 'denied':
      return 'bg-red-900/30 border-red-700 text-red-300'
    case 'conditional':
      return 'bg-yellow-900/30 border-yellow-700 text-yellow-300'
    default:
      return 'bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700'
  }
}

const getResultIcon = (result: string) => {
  switch (result) {
    case 'allowed': return 'i-heroicons-check-circle'
    case 'denied': return 'i-heroicons-x-circle'
    case 'conditional': return 'i-heroicons-exclamation-triangle'
    default: return 'i-heroicons-question-mark-circle'
  }
}

const getResultIconClass = (result: string) => {
  switch (result) {
    case 'allowed': return 'text-green-400'
    case 'denied': return 'text-red-400'
    case 'conditional': return 'text-yellow-400'
    default: return 'text-gray-400'
  }
}

const getResultTextClass = (result: string) => {
  switch (result) {
    case 'allowed': return 'text-green-300'
    case 'denied': return 'text-red-300'
    case 'conditional': return 'text-yellow-300'
    default: return 'text-gray-300'
  }
}

const getResultCardClass = (result: string) => {
  switch (result) {
    case 'allowed':
      return 'bg-green-900/10 border border-green-700/30'
    case 'denied':
      return 'bg-red-900/10 border border-red-700/30'
    case 'conditional':
      return 'bg-yellow-900/10 border border-yellow-700/30'
    default:
      return 'bg-gray-800/50 border border-gray-700'
  }
}

const getResultBadgeColor = (result: string) => {
  switch (result) {
    case 'allowed': return 'green'
    case 'denied': return 'red'
    case 'conditional': return 'yellow'
    default: return 'gray'
  }
}
</script>
