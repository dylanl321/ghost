<template>
  <div class="space-y-6 p-6 max-w-[1600px] mx-auto">
    <UCard>
      <div class="p-2">
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          AWS Assistant
        </h1>
        <p class="text-gray-600 dark:text-gray-400">
          Get help with AWS services, cost optimization, and cloud architecture. The chatbot will appear in the bottom right corner.
        </p>
      </div>
    </UCard>

    <!-- Help Section -->
    <UCard>
      <template #header>
        <div class="flex items-center gap-2 p-2">
          <UIcon name="i-heroicons-information-circle" class="w-5 h-5 text-emerald-500" />
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">How to use AWS Assistant</h3>
            </div>
          </template>
          
          <div class="help-content">
            <div class="help-grid">
              <div class="help-item">
                <UIcon name="i-heroicons-currency-dollar" class="w-6 h-6 text-green-500 mb-2" />
                <h4 class="font-medium text-gray-900 dark:text-white">Cost Optimization</h4>
                <p class="text-sm text-gray-600 dark:text-gray-400">
                  Ask about cost analysis, budget optimization, and resource efficiency
                </p>
              </div>
              
              <div class="help-item">
                <UIcon name="i-heroicons-server" class="w-6 h-6 text-blue-500 mb-2" />
                <h4 class="font-medium text-gray-900 dark:text-white">AWS Services</h4>
                <p class="text-sm text-gray-600 dark:text-gray-400">
                  Get guidance on EC2, S3, Lambda, and other AWS services
                </p>
              </div>
              
              <div class="help-item">
                <UIcon name="i-heroicons-shield-check" class="w-6 h-6 text-purple-500 mb-2" />
                <h4 class="font-medium text-gray-900 dark:text-white">Security & Compliance</h4>
                <p class="text-sm text-gray-600 dark:text-gray-400">
                  Learn about IAM, security best practices, and compliance
                </p>
              </div>
              
              <div class="help-item">
                <UIcon name="i-heroicons-cog-6-tooth" class="w-6 h-6 text-orange-500 mb-2" />
                <h4 class="font-medium text-gray-900 dark:text-white">Architecture</h4>
                <p class="text-sm text-gray-600 dark:text-gray-400">
                  Design patterns, best practices, and architectural guidance
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
    <!-- <ClientOnly>
      <Chatbot />
    </ClientOnly> -->
    <ChatBot />
  </div>
</template>

<script setup lang="ts">
// Page metadata
definePageMeta({
  title: 'AWS Assistant',
  description: 'Get help with AWS services, cost optimization, and cloud architecture'
})

// Example questions
const exampleQuestions = [
  'How much does EC2 cost per hour?',
  'What are the current S3 storage pricing tiers?',
  'Compare RDS vs DynamoDB pricing for my workload',
  'How can I reduce my AWS costs?',
  'What are the pricing differences between regions?',
  'Show me Lambda pricing and free tier limits',
  'How much does CloudFront cost for content delivery?',
  'What are the best practices for cost optimization?'
]
</script>

<style scoped>
.chat-page {
  @apply min-h-screen bg-gray-50 dark:bg-gray-900;
}

.page-content {
  @apply max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8;
}

.page-header {
  @apply text-center mb-8;
}

.help-section {
  @apply max-w-4xl mx-auto;
}

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
