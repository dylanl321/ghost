<template>
  <div class="chat-page">
    <!-- Page Header -->
    <div class="page-header">
      <div class="header-content">
        <div class="header-title">
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
            AWS Assistant
          </h1>
          <p class="text-gray-600 dark:text-gray-400 mt-1">
            Get help with AWS services, cost optimization, and cloud architecture
          </p>
        </div>
        
        <!-- Quick Actions -->
        <div class="quick-actions">
          <UButton
            v-for="action in quickActions"
            :key="action.label"
            @click="sendQuickMessage(action.message)"
            :icon="action.icon"
            variant="outline"
            size="sm"
            class="quick-action-btn"
          >
            {{ action.label }}
          </UButton>
        </div>
      </div>
    </div>

    <!-- Chat Container -->
    <div class="chat-container">
      <div class="chat-wrapper">
        <ClientOnly>
          <ChatBot ref="chatBotRef" />
          <template #fallback>
            <div class="text-center py-8">
              <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 text-gray-400 animate-spin" />
              <p class="text-gray-500 mt-2">Loading chat...</p>
            </div>
          </template>
        </ClientOnly>
      </div>
    </div>

    <!-- Help Section -->
    <div class="help-section">
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-information-circle" class="w-5 h-5 text-blue-500" />
            <h3 class="text-lg font-semibold">How to use AWS Assistant</h3>
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
                @click="sendQuickMessage(example)"
                class="example-item"
              >
                <UIcon name="i-heroicons-chat-bubble-left" class="w-4 h-4 text-gray-400" />
                <span class="text-sm text-gray-600 dark:text-gray-400">{{ example }}</span>
              </div>
            </div>
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
// Component refs
const chatBotRef = ref()

// Page metadata
definePageMeta({
  title: 'AWS Assistant',
  description: 'Get help with AWS services, cost optimization, and cloud architecture'
})

// Quick action buttons
const quickActions = [
  {
    label: 'Cost Analysis',
    icon: 'i-heroicons-currency-dollar',
    message: 'Help me analyze my AWS costs and identify optimization opportunities'
  },
  {
    label: 'EC2 Pricing',
    icon: 'i-heroicons-server',
    message: 'What are the current EC2 pricing options and how much do they cost?'
  },
  {
    label: 'S3 Pricing',
    icon: 'i-heroicons-archive-box',
    message: 'Show me S3 storage pricing and help me choose the right storage class'
  },
  {
    label: 'Service Comparison',
    icon: 'i-heroicons-scale',
    message: 'Compare pricing between different AWS services for my use case'
  },
  {
    label: 'Budget Planning',
    icon: 'i-heroicons-chart-bar',
    message: 'Help me create a budget plan for my AWS infrastructure'
  },
  {
    label: 'Architecture Help',
    icon: 'i-heroicons-cog-6-tooth',
    message: 'Help me design a scalable AWS architecture for my application'
  }
]

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

// Function to send quick messages
const sendQuickMessage = (message: string) => {
  if (chatBotRef.value?.sendQuickMessage) {
    chatBotRef.value.sendQuickMessage(message)
  }
}
</script>

<style scoped>
.chat-page {
  @apply min-h-screen bg-gray-50 dark:bg-gray-900;
}

.page-header {
  @apply bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700;
}

.header-content {
  @apply max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6;
}

.header-title {
  @apply mb-4;
}

.quick-actions {
  @apply flex flex-wrap gap-2;
}

.quick-action-btn {
  @apply transition-all duration-200 hover:scale-105;
}

.chat-container {
  @apply max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6;
}

.chat-wrapper {
  @apply max-w-4xl mx-auto;
}

.help-section {
  @apply max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-6;
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
  @apply flex items-center gap-3 p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .header-content {
    @apply px-4 py-4;
  }
  
  .chat-container {
    @apply px-4 py-4;
  }
  
  .help-section {
    @apply px-4 pb-4;
  }
  
  .quick-actions {
    @apply flex-col;
  }
  
  .quick-action-btn {
    @apply w-full justify-center;
  }
}
</style>
