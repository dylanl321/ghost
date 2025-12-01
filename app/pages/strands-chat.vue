<template>
  <div class="space-y-6 p-6 max-w-[1600px] mx-auto">
    <!-- Feature Disabled Notice -->
    <UCard v-if="!strandsEnabled">
      <div class="p-8 text-center">
        <UIcon name="i-heroicons-no-symbol" class="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Strands Chat is Currently Disabled
        </h2>
        <p class="text-gray-600 dark:text-gray-400 mb-6">
          This feature has been temporarily disabled by an administrator.
          Please check back later or contact support if you need access.
        </p>
        <UButton
          icon="i-heroicons-home"
          label="Return to Dashboard"
          @click="navigateTo('/')"
        />
      </div>
    </UCard>

    <!-- Strands Chat Content (when enabled) -->
    <template v-else>
      <UCard>
        <div class="p-2">
          <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Strands Agent
          </h1>
          <p class="text-gray-600 dark:text-gray-400">
            Conversational AI agent powered by Strands with AWS MCP tool integration. Ask questions about AWS costs, configurations, security findings, and more.
          </p>
        </div>
      </UCard>

    <!-- Help Section -->
    <UCard>
      <template #header>
        <div class="flex items-center gap-2 p-2">
          <UIcon name="i-heroicons-information-circle" class="w-5 h-5 text-purple-500" />
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">How to use Strands Agent</h3>
        </div>
      </template>
      
      <div class="help-content">
        <div class="help-grid">
          <div class="help-item">
            <UIcon name="i-heroicons-currency-dollar" class="w-6 h-6 text-green-500 mb-2" />
            <h4 class="font-medium text-gray-900 dark:text-white">Cost Analysis</h4>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              Query AWS Cost Explorer through MCP tools for detailed cost breakdowns and analysis
            </p>
          </div>
          
          <div class="help-item">
            <UIcon name="i-heroicons-cog-6-tooth" class="w-6 h-6 text-blue-500 mb-2" />
            <h4 class="font-medium text-gray-900 dark:text-white">Config Aggregator</h4>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              Look up AWS resource configurations and compliance data across accounts
            </p>
          </div>
          
          <div class="help-item">
            <UIcon name="i-heroicons-shield-check" class="w-6 h-6 text-purple-500 mb-2" />
            <h4 class="font-medium text-gray-900 dark:text-white">Security Hub</h4>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              Query security findings, vulnerabilities, and compliance status
            </p>
          </div>
          
          <div class="help-item">
            <UIcon name="i-heroicons-chat-bubble-left-right" class="w-6 h-6 text-orange-500 mb-2" />
            <h4 class="font-medium text-gray-900 dark:text-white">Conversational</h4>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              Maintains conversation context and can answer follow-up questions
            </p>
          </div>
        </div>
        
        <div class="help-examples">
          <h4 class="font-medium text-gray-900 dark:text-white mb-3">Example Questions:</h4>
          <div class="example-list">
            <div 
              v-for="example in exampleQuestions"
              :key="example"
              class="example-item"
            >
              <UIcon name="i-heroicons-chat-bubble-left" class="w-4 h-4 text-gray-400" />
              <span class="text-sm text-gray-600 dark:text-gray-400">{{ example }}</span>
            </div>
          </div>
        </div>
      </div>
    </UCard>

      <!-- Chatbot Component -->
      <StrandsChatbot />
    </template>
  </div>
</template>

<script setup lang="ts">
// Check if Strands chat is enabled
const siteConfigStore = useSiteConfigStore()
const strandsEnabled = computed(() => siteConfigStore.isStrandsChatEnabled)

// Page metadata
definePageMeta({
  title: 'Strands Agent',
  description: 'Conversational AI agent with AWS MCP tool integration for cost analysis, config lookups, and security queries'
})

// Example questions - Be explicit about account IDs
const exampleQuestions = [
  'What are the AWS costs for account 374673712317 this month?',
  'Show me security findings from Security Hub for account 374673712317',
  'List EC2 instances in account 205950196477',
  'Analyze costs by service for account 083876038518',
  'What S3 buckets exist in account 374673712317?',
  'Show me the top cost drivers for Gov Master account this quarter',
  'What compliance findings exist in account 205950196477?',
  'Compare costs between account 374673712317 and 205950196477'
]
</script>

<style scoped>
.help-content {
  @apply space-y-6;
}

.help-grid {
  @apply grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4;
}

.help-item {
  @apply text-center p-4 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700;
}

.help-examples {
  @apply bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700;
}

.example-list {
  @apply space-y-2;
}

.example-item {
  @apply flex items-center gap-3 p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors;
}
</style>

