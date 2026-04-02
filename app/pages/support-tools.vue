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
        <div class="flex items-center justify-between mb-2">
          <div>
            <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
              Support Tools
            </h1>
            <p class="text-gray-600 dark:text-gray-400 mt-1">
              Investigation, security, and operational tools for AWS resources
            </p>
          </div>
          <div class="flex items-center gap-3">
            <!-- Quick Stats -->
            <div class="hidden md:flex items-center gap-2 text-xs text-gray-500">
              <span class="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded-md">
                {{ toolDefinitions.length }} tools
              </span>
              <span v-if="expandedCard" class="px-2 py-1 bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 rounded-md">
                1 active
              </span>
            </div>
            <UButton
              v-if="expandedCard"
              size="xs"
              variant="ghost"
              color="gray"
              @click="expandedCard = null"
            >
              <Icon name="i-heroicons-x-mark" class="w-4 h-4 mr-1" />
              Close Tool
            </UButton>
          </div>
        </div>
      </div>

      <!-- Global Context Bar -->
      <SupportContextBar class="mb-6" />

      <!-- Category Tabs + Search -->
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <!-- Category Tabs -->
        <div class="flex items-center gap-1 flex-wrap">
          <UButton
            size="xs"
            :color="activeCategory === 'all' ? 'primary' : 'gray'"
            :variant="activeCategory === 'all' ? 'solid' : 'ghost'"
            @click="activeCategory = 'all'"
          >
            All
            <UBadge size="xs" :color="activeCategory === 'all' ? 'white' : 'gray'" variant="subtle" class="ml-1">
              {{ toolDefinitions.length }}
            </UBadge>
          </UButton>
          <UButton
            v-for="cat in categories"
            :key="cat.id"
            size="xs"
            :color="activeCategory === cat.id ? 'primary' : 'gray'"
            :variant="activeCategory === cat.id ? 'solid' : 'ghost'"
            @click="activeCategory = cat.id"
          >
            <Icon :name="cat.icon" class="w-3.5 h-3.5 mr-1" />
            {{ cat.label }}
            <UBadge size="xs" :color="activeCategory === cat.id ? 'white' : 'gray'" variant="subtle" class="ml-1">
              {{ cat.count }}
            </UBadge>
          </UButton>
        </div>

        <!-- Search -->
        <UInput
          v-model="searchQuery"
          placeholder="Search tools..."
          icon="i-heroicons-magnifying-glass"
          size="sm"
          class="w-full sm:w-64"
          :ui="{ icon: { trailing: { pointer: '' } } }"
        >
          <template v-if="searchQuery" #trailing>
            <UButton
              size="2xs"
              variant="ghost"
              color="gray"
              icon="i-heroicons-x-mark"
              @click="searchQuery = ''"
            />
          </template>
        </UInput>
      </div>

      <!-- No results -->
      <div
        v-if="filteredTools.length === 0"
        class="text-center py-12 text-gray-500"
      >
        <Icon name="i-heroicons-magnifying-glass" class="w-12 h-12 mx-auto mb-3 text-gray-300" />
        <p class="text-lg font-medium">No tools match your search</p>
        <p class="text-sm mt-1">Try a different search term or category</p>
      </div>

      <!-- Tool Cards Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <SupportToolCard
          v-for="tool in filteredTools"
          :key="tool.id"
          :data-tool-id="tool.id"
          :title="tool.title"
          :description="tool.description"
          :detail-description="tool.detailDescription"
          :icon="tool.icon"
          :color="tool.color"
          :category="tool.category"
          :is-expanded="expandedCard === tool.id"
          @toggle="toggleCard(tool.id)"
        >
          <!-- Quick hints for collapsed cards -->
          <template #quick-hints>
            <span
              v-if="tool.requiresAccount && !supportContext.isAccountReady.value"
              class="text-[10px] text-amber-500 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded"
            >
              Needs account
            </span>
            <span
              v-if="tool.hasAI"
              class="text-[10px] text-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 px-1.5 py-0.5 rounded"
            >
              AI
            </span>
          </template>

          <!-- Tool Content -->
          <SupportToolIPLookup v-if="tool.id === 'ip-lookup'" @navigate-tool="handleNavigateTool" />
          <SupportToolInstanceLookup v-else-if="tool.id === 'instance-lookup'" @navigate-tool="handleNavigateTool" />
          <SupportToolResourceSearch v-else-if="tool.id === 'resource-search'" />
          <SupportToolCloudWatchLogs v-else-if="tool.id === 'cloudwatch-logs'" />
          <SupportToolSmartDiscovery v-else-if="tool.id === 'smart-discovery'" />
          <SupportToolSecurityPosture v-else-if="tool.id === 'security-posture'" @navigate-tool="handleNavigateTool" />
          <SupportToolPatchCompliance v-else-if="tool.id === 'patch-compliance'" />
          <SupportToolCostAnomalies v-else-if="tool.id === 'cost-anomalies'" />
          <SupportToolAccessAudit v-else-if="tool.id === 'access-audit'" />
          <SupportToolInstanceHealth v-else-if="tool.id === 'instance-health'" />
          <SupportToolQueryTemplates v-else-if="tool.id === 'query-templates'" />
          <SupportToolAITroubleshooter v-else-if="tool.id === 'ai-troubleshooter'" @navigate-tool="handleNavigateTool" />
          <SupportToolAIAccountSummary v-else-if="tool.id === 'ai-account-summary'" @navigate-tool="handleNavigateTool" />
        </SupportToolCard>
      </div>

      <!-- Keyboard hint -->
      <div class="mt-8 text-center text-xs text-gray-400">
        <span>Click a tool card to expand. Press <kbd class="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-gray-500 font-mono">Esc</kbd> to close.</span>
      </div>
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

// Global support context
const supportContext = useSupportContext()

// UI State
const expandedCard = ref<string | null>(null)
const activeCategory = ref('all')
const searchQuery = ref('')

function toggleCard(card: string) {
  expandedCard.value = expandedCard.value === card ? null : card
}

// Cross-tool navigation: open a different tool, optionally with pre-filled params
function handleNavigateTool(toolId: string, _params: Record<string, string> = {}) {
  // Reset category filter so target tool is visible
  const targetTool = toolDefinitions.find(t => t.id === toolId)
  if (targetTool && activeCategory.value !== 'all' && targetTool.category !== activeCategory.value) {
    activeCategory.value = 'all'
  }
  // Clear search if target tool would be hidden
  if (searchQuery.value) {
    searchQuery.value = ''
  }
  // Expand the target tool
  nextTick(() => {
    expandedCard.value = toolId
    // Scroll to the tool card
    const el = document.querySelector(`[data-tool-id="${toolId}"]`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}

// Keyboard shortcut: Escape to close expanded card
onMounted(() => {
  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && expandedCard.value) {
      expandedCard.value = null
    }
  }
  window.addEventListener('keydown', handleKeydown)
  onUnmounted(() => window.removeEventListener('keydown', handleKeydown))
})

// Tool definitions with enhanced metadata
interface ToolDefinition {
  id: string
  title: string
  description: string
  detailDescription: string
  icon: string
  color: string
  category: string
  requiresAccount: boolean
  hasAI: boolean
  keywords: string[]
}

const toolDefinitions: ToolDefinition[] = [
  {
    id: 'ip-lookup',
    title: 'IP Lookup',
    description: 'Find which account owns an IP',
    detailDescription: 'Search across all AWS accounts to find the EC2 instance or ENI associated with a specific IP address. Supports both manual lookup and AI-assisted natural language queries.',
    icon: 'i-heroicons-globe-alt',
    color: 'blue',
    category: 'investigation',
    requiresAccount: false,
    hasAI: true,
    keywords: ['ip', 'address', 'network', 'eni', 'interface', 'ec2']
  },
  {
    id: 'instance-lookup',
    title: 'Instance Lookup',
    description: 'Get full instance details',
    detailDescription: 'Look up any EC2 instance by ID, Name tag, or IP address. Returns full instance details including state, type, networking, and tags.',
    icon: 'i-heroicons-server',
    color: 'green',
    category: 'investigation',
    requiresAccount: false,
    hasAI: false,
    keywords: ['instance', 'ec2', 'server', 'compute', 'vm']
  },
  {
    id: 'resource-search',
    title: 'Resource Search',
    description: 'Find any AWS resource',
    detailDescription: 'Search across 12+ AWS resource types including EC2, S3, IAM, Lambda, RDS, and more. Use manual filters or AI-powered Config SQL queries for complex searches.',
    icon: 'i-heroicons-magnifying-glass',
    color: 'purple',
    category: 'investigation',
    requiresAccount: false,
    hasAI: true,
    keywords: ['resource', 'search', 'find', 'config', 's3', 'lambda', 'rds', 'iam']
  },
  {
    id: 'cloudwatch-logs',
    title: 'CloudWatch Logs',
    description: 'Search and filter log streams',
    detailDescription: 'Search CloudWatch log groups with filter patterns. Supports CloudWatch filter syntax and AI-assisted filter generation from natural language descriptions.',
    icon: 'i-heroicons-document-text',
    color: 'orange',
    category: 'investigation',
    requiresAccount: true,
    hasAI: true,
    keywords: ['logs', 'cloudwatch', 'filter', 'stream', 'error', 'debug']
  },
  {
    id: 'smart-discovery',
    title: 'Smart Discovery',
    description: 'AI-powered resource search',
    detailDescription: 'Describe what you\'re looking for in plain English and let AI find matching accounts, instances, and resources across your AWS environment with confidence scoring.',
    icon: 'i-heroicons-sparkles',
    color: 'indigo',
    category: 'ai',
    requiresAccount: false,
    hasAI: true,
    keywords: ['ai', 'smart', 'discover', 'find', 'natural', 'language']
  },
  {
    id: 'security-posture',
    title: 'Security Posture',
    description: 'Security Hub + Inspector findings',
    detailDescription: 'Comprehensive security assessment combining Security Hub findings and Inspector vulnerabilities. Shows risk score, severity breakdown, and actionable recommendations.',
    icon: 'i-heroicons-shield-check',
    color: 'red',
    category: 'security',
    requiresAccount: false,
    hasAI: false,
    keywords: ['security', 'hub', 'inspector', 'vulnerability', 'risk', 'findings', 'posture']
  },
  {
    id: 'patch-compliance',
    title: 'Patch Compliance',
    description: 'SSM patch status check',
    detailDescription: 'Check Systems Manager patch compliance status across instances. Shows compliant/non-compliant counts, missing patches, and compliance percentage with recommendations.',
    icon: 'i-heroicons-arrow-path',
    color: 'teal',
    category: 'security',
    requiresAccount: true,
    hasAI: false,
    keywords: ['patch', 'ssm', 'compliance', 'update', 'missing']
  },
  {
    id: 'cost-anomalies',
    title: 'Cost Anomalies',
    description: 'Unusual spending patterns',
    detailDescription: 'Detect unusual cost spikes using AWS Cost Anomaly Detection. Shows ongoing and resolved anomalies with impact amounts and percentage above expected spending.',
    icon: 'i-heroicons-currency-dollar',
    color: 'amber',
    category: 'operations',
    requiresAccount: false,
    hasAI: false,
    keywords: ['cost', 'anomaly', 'spending', 'money', 'billing', 'budget']
  },
  {
    id: 'access-audit',
    title: 'Access Audit',
    description: 'CloudTrail activity analysis',
    detailDescription: 'Audit IAM access patterns using CloudTrail events. Search by resource ID or user name to see who accessed what, detect anomalies, and review event breakdowns.',
    icon: 'i-heroicons-eye',
    color: 'violet',
    category: 'security',
    requiresAccount: true,
    hasAI: false,
    keywords: ['access', 'audit', 'cloudtrail', 'iam', 'who', 'activity', 'trail']
  },
  {
    id: 'instance-health',
    title: 'Instance Health',
    description: 'Comprehensive health dashboard',
    detailDescription: 'Full health assessment for any EC2 instance combining patch compliance, security findings, vulnerabilities, and CloudWatch alarms into a single health score.',
    icon: 'i-heroicons-heart',
    color: 'emerald',
    category: 'operations',
    requiresAccount: true,
    hasAI: false,
    keywords: ['health', 'instance', 'monitoring', 'status', 'alarm', 'metric']
  },
  {
    id: 'query-templates',
    title: 'Query Templates',
    description: 'Pre-built queries for common tasks',
    detailDescription: 'Library of pre-built AWS Config SQL queries organized by category. Copy queries directly or use them as a starting point for custom investigations.',
    icon: 'i-heroicons-document-duplicate',
    color: 'cyan',
    category: 'ai',
    requiresAccount: false,
    hasAI: false,
    keywords: ['template', 'query', 'preset', 'common', 'sql', 'config']
  },
  {
    id: 'ai-troubleshooter',
    title: 'AI Troubleshooter',
    description: 'Diagnose AWS issues with AI',
    detailDescription: 'Describe any AWS problem in plain English and get an AI-generated diagnostic plan with step-by-step investigation steps, each linked to the appropriate dashboard tool. Includes severity assessment, possible causes, and escalation guidance.',
    icon: 'i-heroicons-wrench-screwdriver',
    color: 'orange',
    category: 'ai',
    requiresAccount: false,
    hasAI: true,
    keywords: ['troubleshoot', 'diagnose', 'debug', 'fix', 'problem', 'issue', 'ai', 'help']
  },
  {
    id: 'ai-account-summary',
    title: 'AI Account Summary',
    description: 'AI-powered account health report',
    detailDescription: 'Generate a comprehensive AI health summary for any account. Aggregates security findings, cost anomalies, compliance data, and resource inventory into a single scored report with prioritized recommendations.',
    icon: 'i-heroicons-chart-bar',
    color: 'emerald',
    category: 'ai',
    requiresAccount: true,
    hasAI: true,
    keywords: ['summary', 'health', 'report', 'account', 'ai', 'overview', 'score']
  }
]

// Categories
const categories = computed(() => [
  {
    id: 'investigation',
    label: 'Investigation',
    icon: 'i-heroicons-magnifying-glass',
    count: toolDefinitions.filter(t => t.category === 'investigation').length
  },
  {
    id: 'security',
    label: 'Security',
    icon: 'i-heroicons-shield-check',
    count: toolDefinitions.filter(t => t.category === 'security').length
  },
  {
    id: 'ai',
    label: 'AI & Templates',
    icon: 'i-heroicons-sparkles',
    count: toolDefinitions.filter(t => t.category === 'ai').length
  },
  {
    id: 'operations',
    label: 'Operations',
    icon: 'i-heroicons-cog-6-tooth',
    count: toolDefinitions.filter(t => t.category === 'operations').length
  }
])

// Filtered tools based on category and search
const filteredTools = computed(() => {
  let tools = toolDefinitions

  // Filter by category
  if (activeCategory.value !== 'all') {
    tools = tools.filter(t => t.category === activeCategory.value)
  }

  // Filter by search
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    tools = tools.filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.keywords.some(k => k.includes(q))
    )
  }

  return tools
})

// Reset expanded card when it's filtered out
watch(filteredTools, (tools) => {
  if (expandedCard.value && !tools.find(t => t.id === expandedCard.value)) {
    expandedCard.value = null
  }
})
</script>
