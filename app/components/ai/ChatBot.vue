<template>
  <div class="chatbot-container">
    <!-- Chat Header -->
    <div class="chat-header">
      <div class="flex items-center gap-3">
        <UIcon name="i-heroicons-chat-bubble-left-right" class="w-6 h-6 text-primary-500" />
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">AWS Assistant</h3>
        <UBadge 
          v-if="isConnected" 
          color="green" 
          variant="soft" 
          size="xs"
        >
          Connected
        </UBadge>
        <UBadge 
          v-else-if="isConnecting" 
          color="yellow" 
          variant="soft" 
          size="xs"
        >
          Connecting...
        </UBadge>
        <UBadge 
          v-else 
          color="red" 
          variant="soft" 
          size="xs"
        >
          Disconnected
        </UBadge>
      </div>
      
      <!-- Chat Mode and Model Selectors -->
      <div class="flex items-center gap-2">
        <USelectMenu
          v-model="chatMode"
          :options="chatModeOptions"
          option-attribute="label"
          value-attribute="value"
          placeholder="Chat Mode"
          size="sm"
          class="w-40"
        />
        <USelectMenu
          v-model="selectedModel"
          :options="modelOptions"
          option-attribute="label"
          value-attribute="value"
          placeholder="Select AI Model"
          size="sm"
          class="w-48"
        />
      </div>
    </div>

    <!-- Messages Container -->
    <div 
      ref="messagesContainer"
      class="messages-container"
    >
      <div v-if="messages.length === 0" class="empty-state">
        <UIcon name="i-heroicons-sparkles" class="w-12 h-12 text-gray-400 mb-4" />
        <h4 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
          Welcome to {{ chatMode === 'pricing' ? 'AWS Pricing Specialist' : 'AWS Assistant' }}
        </h4>
        <p class="text-gray-600 dark:text-gray-400 text-sm">
          <span v-if="chatMode === 'pricing'">
            Ask me about AWS pricing, costs, service comparisons, or budget planning. I can access real-time pricing data!
          </span>
          <span v-else>
            Ask me anything about AWS services, cost optimization, or cloud architecture.
          </span>
        </p>
      </div>

      <div
        v-for="(message, index) in messages"
        :key="index"
        class="message-item"
        :class="{
          'user-message': message.role === 'user',
          'assistant-message': message.role === 'assistant'
        }"
      >
        <div class="message-content">
          <div class="message-header">
            <UIcon 
              :name="message.role === 'user' ? 'i-heroicons-user' : 'i-heroicons-cpu-chip'"
              class="w-4 h-4"
              :class="message.role === 'user' ? 'text-blue-500' : 'text-green-500'"
            />
            <span class="message-role">
              {{ message.role === 'user' ? 'You' : (chatMode === 'pricing' ? 'AWS Pricing Specialist' : 'AWS Assistant') }}
            </span>
            <span class="message-time">
              {{ formatTime(message.timestamp) }}
            </span>
          </div>
          
          <div class="message-text">
            <div v-if="message.role === 'assistant' && message.isLoading" class="loading-indicator">
              <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin" />
              <span>Thinking...</span>
            </div>
            <div v-else class="prose prose-sm max-w-none dark:prose-invert">
              <pre v-if="isCodeBlock(message.content)" class="whitespace-pre-wrap">{{ message.content }}</pre>
              <div v-else v-html="formatMessage(message.content)"></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Input Area -->
    <div class="input-area">
      <form @submit.prevent="sendMessage" class="input-form">
        <div class="input-container">
          <UTextarea
            v-model="inputMessage"
            :placeholder="chatMode === 'pricing' ? 'Ask about AWS pricing, costs, or service comparisons...' : 'Ask about AWS services, cost optimization, or cloud architecture...'"
            :rows="1"
            :maxrows="4"
            autoresize
            :disabled="isLoading"
            class="message-input"
            @keydown.enter.exact.prevent="sendMessage"
            @keydown.enter.shift.exact="inputMessage += '\n'"
          />
          <UButton
            type="submit"
            :loading="isLoading"
            :disabled="!inputMessage.trim() || isLoading"
            icon="i-heroicons-paper-airplane"
            size="sm"
            class="send-button"
          />
        </div>
      </form>
      
      <!-- Connection Status -->
      <div v-if="lastError" class="error-message">
        <UIcon name="i-heroicons-exclamation-triangle" class="w-4 h-4 text-red-500" />
        <span class="text-sm text-red-600 dark:text-red-400">{{ lastError }}</span>
        <UButton
          @click="clearError"
          icon="i-heroicons-x-mark"
          size="xs"
          variant="ghost"
          color="red"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ChatMessage, ChatRequest, ChatResponse } from '~/server/api/ai/chat.post'

// Reactive state
const messages = ref<ChatMessage[]>([])
const inputMessage = ref('')
const isLoading = ref(false)
const isConnecting = ref(false)
const isConnected = ref(false)
const lastError = ref('')
const selectedModel = ref('claude-sonnet')
const messagesContainer = ref<HTMLElement>()

// Model options
const modelOptions = [
  { label: 'Claude 3.5 Sonnet', value: 'claude-sonnet' },
  { label: 'Amazon Nova Pro', value: 'nova-pro' }
]

// Chat mode options
const chatMode = ref<'general' | 'pricing'>('general')
const chatModeOptions = [
  { label: 'General AWS Assistant', value: 'general' },
  { label: 'AWS Pricing Specialist', value: 'pricing' }
]

// Auto-scroll to bottom when new messages arrive
const scrollToBottom = () => {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

// Format timestamp for display
const formatTime = (timestamp: string) => {
  return new Date(timestamp).toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit' 
  })
}

// Check if content is a code block
const isCodeBlock = (content: string | undefined) => {
  if (!content || typeof content !== 'string') return false
  return content.includes('```') || content.startsWith('    ') || content.startsWith('\t')
}

// Format message content (basic markdown-like formatting)
const formatMessage = (content: string | undefined) => {
  if (!content || typeof content !== 'string') return ''
  return content
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code class="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-sm">$1</code>')
    .replace(/\n/g, '<br>')
}

// Clear error message
const clearError = () => {
  lastError.value = ''
}

// Send message to the chat API
const sendMessage = async (messageOverride?: string) => {
  const messageToSend = messageOverride || inputMessage.value.trim()
  if (!messageToSend || isLoading.value) return

  const userMessage: ChatMessage = {
    role: 'user',
    content: messageToSend,
    timestamp: new Date().toISOString()
  }

  // Add user message to chat
  messages.value.push(userMessage)
  
  // Add loading message for assistant
  const loadingMessage: ChatMessage = {
    role: 'assistant',
    content: '',
    timestamp: new Date().toISOString(),
    isLoading: true
  }
  messages.value.push(loadingMessage)
  
  // Clear input and scroll to bottom
  if (!messageOverride) {
    inputMessage.value = ''
  }
  scrollToBottom()
  
  isLoading.value = true
  lastError.value = ''

  try {
    // Prepare conversation history (exclude loading message)
    const conversationHistory = messages.value
      .filter(msg => !msg.isLoading)
      .map(msg => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp
      }))

    const request: ChatRequest = {
      message: messageToSend,
      model: selectedModel.value as any,
      conversationHistory
    }

    // Debug logging
    console.log('[ChatBot] Sending request with model:', selectedModel.value)

    // Choose endpoint based on chat mode
    const endpoint = chatMode.value === 'pricing' ? '/api/ai/pricing-chat' : '/api/ai/chat'
    
    const response = await $fetch<ChatResponse>(endpoint, {
      method: 'POST',
      body: request
    })

    // Check for success and extract message from correct location
    const aiMessage = response.data?.message || response.message
    
    if (response.success && aiMessage) {
      // Replace loading message with actual response
      const lastIndex = messages.value.length - 1
      messages.value[lastIndex] = {
        role: 'assistant',
        content: aiMessage,
        timestamp: new Date().toISOString()
      }
      
      isConnected.value = true
      
      // Log success for debugging
      console.log('[ChatBot] Received successful response, model:', response.data?.model || response.model)
    } else {
      // Log the full response for debugging
      console.error('[ChatBot] API returned response without message:', response)
      const errorInfo = {
        message: response.error?.message || response.data?.error?.message || 'Failed to get response from AI - no message in response',
        code: response.error?.code || response.data?.error?.code,
        details: response.error?.details || response.data?.error?.details || response
      }
      throw errorInfo
    }

  } catch (error: any) {
    console.error('[ChatBot] Full error object:', error)
    
    // Replace loading message with appropriate error message
    const lastIndex = messages.value.length - 1
    
    // Extract error details - handle different error structures
    let errorCode = error.code || error.statusCode
    let errorMessage = error.message || 'An unexpected error occurred'
    let errorDetails = error.details
    
    // Check if error is from $fetch (FetchError)
    if (error.data) {
      console.log('[ChatBot] Error has data property:', error.data)
      if (error.data.error) {
        errorCode = error.data.error.code || errorCode
        errorMessage = error.data.error.message || errorMessage
        errorDetails = error.data.error.details || errorDetails
      } else if (error.data.message) {
        errorMessage = error.data.message
      }
    }
    
    // Check for response body in error
    if (error.response) {
      console.log('[ChatBot] Error has response property:', error.response)
      if (error.response._data) {
        const responseData = error.response._data
        if (responseData.error) {
          errorCode = responseData.error.code || errorCode
          errorMessage = responseData.error.message || errorMessage
          errorDetails = responseData.error.details || errorDetails
        }
      }
    }
    
    console.log('[ChatBot] Extracted error info:', { errorCode, errorMessage, errorDetails })
    
    if (error.statusCode === 401 || errorMessage?.includes('401')) {
      // Authentication error
      messages.value[lastIndex] = {
        role: 'assistant',
        content: 'Please log in to use the AI Assistant. Once authenticated, I can help you with AWS services and cost optimization.',
        timestamp: new Date().toISOString()
      }
      lastError.value = 'Authentication required. Please log in to continue.'
    } else if (errorCode === 'MODEL_NOT_FOUND' || errorCode === 'INVALID_MODEL' || errorMessage.includes('model')) {
      // Model not available error
      messages.value[lastIndex] = {
        role: 'assistant',
        content: `The AI model is currently unavailable. Error: ${errorMessage}${errorDetails ? `. Details: ${JSON.stringify(errorDetails)}` : ''}`,
        timestamp: new Date().toISOString()
      }
      lastError.value = `Model Error: ${errorMessage}`
      
      // Log details for debugging
      if (errorDetails) {
        console.error('[ChatBot] Model error details:', errorDetails)
      }
    } else if (errorCode === 'INTERNAL_ERROR' || error.statusCode === 500) {
      // Server error - likely AWS credentials or Bedrock issue
      messages.value[lastIndex] = {
        role: 'assistant',
        content: `Server error: ${errorMessage}. This may be due to AWS configuration issues. Please check the server logs for more details.`,
        timestamp: new Date().toISOString()
      }
      lastError.value = `Server Error: ${errorMessage}`
      
      if (errorDetails) {
        console.error('[ChatBot] Server error details:', errorDetails)
      }
    } else {
      // Other errors
      messages.value[lastIndex] = {
        role: 'assistant',
        content: `Sorry, I encountered an error: ${errorMessage}${errorDetails ? `. Details: ${JSON.stringify(errorDetails)}` : ''}`,
        timestamp: new Date().toISOString()
      }
      lastError.value = errorMessage
    }
    
    isConnected.value = false
  } finally {
    isLoading.value = false
    scrollToBottom()
  }
}

// Test connection on component mount (skip if auth error)
onMounted(async () => {
  isConnecting.value = true
  
  try {
    // Send a simple test message to verify connection
    const testEndpoint = chatMode.value === 'pricing' ? '/api/ai/pricing-chat' : '/api/ai/chat'
    const testResponse = await $fetch<ChatResponse>(testEndpoint, {
      method: 'POST',
      body: {
        message: 'Hello, can you confirm you are working?',
        model: selectedModel.value
      }
    })
    
    // Check for successful response with message
    const testMessage = testResponse.data?.message || testResponse.message
    
    if (testResponse.success && testMessage) {
      isConnected.value = true
      // Add welcome message based on chat mode
      const welcomeMessage = chatMode.value === 'pricing' 
        ? 'Hello! I\'m your AWS Pricing Specialist. I can help you with AWS pricing, cost analysis, service comparisons, and budget planning. I have access to real-time pricing data! How can I assist you today?'
        : 'Hello! I\'m your AWS Assistant. I can help you with AWS services, cost optimization, account management, and cloud architecture questions. How can I assist you today?'
      
      messages.value.push({
        role: 'assistant',
        content: welcomeMessage,
        timestamp: new Date().toISOString()
      })
    } else {
      throw new Error(testResponse.error?.message || testResponse.data?.error?.message || 'Connection test failed')
    }
  } catch (error: any) {
    console.error('Connection test failed:', error)
    
    // Check if it's an authentication error
    if (error.statusCode === 401 || error.message?.includes('401')) {
      // Authentication required - show a different message
      isConnected.value = false
      messages.value.push({
        role: 'assistant',
        content: 'Welcome! Please ensure you are logged in to use the AI Assistant. Once authenticated, I can help you with AWS services, cost optimization, and cloud architecture questions.',
        timestamp: new Date().toISOString()
      })
    } else {
      // Other error - show generic error message
      lastError.value = 'Unable to connect to AI service. The service will try to connect when you send your first message.'
      isConnected.value = false
      
      // Add a friendly message even if connection fails
      messages.value.push({
        role: 'assistant',
        content: 'Hello! I\'m your AWS Assistant. Send me a message to get started.',
        timestamp: new Date().toISOString()
      })
    }
  } finally {
    isConnecting.value = false
  }
})

// Expose method for parent component to send messages
const sendQuickMessage = (message: string) => {
  inputMessage.value = message
  sendMessage(message)
}

// Expose the method to parent components
defineExpose({
  sendQuickMessage
})
</script>

<style scoped>
.chatbot-container {
  @apply flex flex-col h-full max-h-[600px] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm;
}

.chat-header {
  @apply flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800;
}

.messages-container {
  @apply flex-1 overflow-y-auto p-4 space-y-4;
  max-height: 400px;
}

.empty-state {
  @apply flex flex-col items-center justify-center h-full text-center py-8;
}

.message-item {
  @apply flex;
}

.user-message {
  @apply justify-end;
}

.assistant-message {
  @apply justify-start;
}

.message-content {
  @apply max-w-[80%] rounded-lg p-3;
}

.user-message .message-content {
  @apply bg-primary-500 text-white;
}

.assistant-message .message-content {
  @apply bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white;
}

.message-header {
  @apply flex items-center gap-2 mb-2 text-xs opacity-75;
}

.user-message .message-header {
  @apply text-primary-100;
}

.assistant-message .message-header {
  @apply text-gray-600 dark:text-gray-400;
}

.message-text {
  @apply text-sm leading-relaxed;
}

.loading-indicator {
  @apply flex items-center gap-2 text-gray-500 dark:text-gray-400;
}

.input-area {
  @apply p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800;
}

.input-form {
  @apply w-full;
}

.input-container {
  @apply flex items-end gap-2;
}

.message-input {
  @apply flex-1;
}

.send-button {
  @apply flex-shrink-0;
}

.error-message {
  @apply flex items-center gap-2 mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded;
}

/* Custom scrollbar */
.messages-container::-webkit-scrollbar {
  width: 6px;
}

.messages-container::-webkit-scrollbar-track {
  @apply bg-gray-100 dark:bg-gray-800;
}

.messages-container::-webkit-scrollbar-thumb {
  @apply bg-gray-300 dark:bg-gray-600 rounded;
}

.messages-container::-webkit-scrollbar-thumb:hover {
  @apply bg-gray-400 dark:bg-gray-500;
}
</style>
