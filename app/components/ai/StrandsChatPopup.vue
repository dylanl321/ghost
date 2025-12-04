<template>
  <!-- Floating Chat Button -->
  <div v-if="!isOpen" class="fixed bottom-6 right-6 z-40">
    <button
      @click="toggleChat"
      class="w-14 h-14 rounded-full bg-purple-600 hover:bg-purple-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center group hover:scale-110"
      :title="'Open AI Assistant'"
    >
      <UIcon name="i-heroicons-sparkles" class="w-6 h-6" />

      <!-- Notification badge (if we want to add hints) -->
      <span
        v-if="showHint"
        class="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse"
      ></span>
    </button>
  </div>

  <!-- Chat Window -->
  <Transition
    enter-active-class="transition-all duration-300 ease-out"
    enter-from-class="opacity-0 translate-y-4 scale-95"
    enter-to-class="opacity-100 translate-y-0 scale-100"
    leave-active-class="transition-all duration-200 ease-in"
    leave-from-class="opacity-100 translate-y-0 scale-100"
    leave-to-class="opacity-0 translate-y-4 scale-95"
  >
    <div
      v-if="isOpen"
      class="fixed bottom-6 right-6 z-40 w-[400px] h-[600px] max-h-[calc(100vh-3rem)] flex flex-col bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700"
    >
      <!-- Header -->
      <div class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-purple-600 to-purple-700 rounded-t-2xl">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
            <UIcon name="i-heroicons-sparkles" class="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 class="text-white font-semibold text-sm">AI Assistant</h3>
            <p class="text-purple-100 text-xs">Ask about AWS resources</p>
          </div>
        </div>

        <div class="flex items-center gap-1">
          <button
            @click="showExamples = !showExamples"
            class="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
            title="Example questions"
          >
            <UIcon name="i-heroicons-light-bulb" class="w-4 h-4 text-white" />
          </button>
          <button
            @click="clearChat"
            class="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
            title="Clear chat"
          >
            <UIcon name="i-heroicons-trash" class="w-4 h-4 text-white" />
          </button>
          <button
            @click="toggleChat"
            class="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
            title="Close"
          >
            <UIcon name="i-heroicons-x-mark" class="w-4 h-4 text-white" />
          </button>
        </div>
      </div>

      <!-- Example Questions (collapsible) -->
      <div
        v-if="showExamples"
        class="p-3 bg-purple-50 dark:bg-purple-900/20 border-b border-purple-200 dark:border-purple-800"
      >
        <p class="text-xs font-medium text-purple-900 dark:text-purple-100 mb-2">Try asking:</p>
        <div class="space-y-1">
          <button
            v-for="(example, idx) in exampleQuestions"
            :key="idx"
            @click="sendExample(example)"
            class="block w-full text-left text-xs px-2 py-1.5 rounded bg-white dark:bg-gray-800 hover:bg-purple-100 dark:hover:bg-purple-900/40 text-gray-700 dark:text-gray-300 transition-colors"
          >
            {{ example }}
          </button>
        </div>
      </div>

      <!-- Messages -->
      <div
        ref="messagesContainer"
        class="flex-1 overflow-y-auto p-4 space-y-3"
      >
        <!-- Welcome message -->
        <div v-if="messages.length === 0" class="text-center py-8">
          <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
            <UIcon name="i-heroicons-sparkles" class="w-8 h-8 text-purple-600 dark:text-purple-400" />
          </div>
          <h4 class="text-sm font-semibold text-gray-900 dark:text-white mb-2">
            How can I help you today?
          </h4>
          <p class="text-xs text-gray-600 dark:text-gray-400 max-w-xs mx-auto">
            Ask me about AWS costs, resources, users, or anything related to your accounts.
          </p>
        </div>

        <!-- Chat messages -->
        <div
          v-for="(msg, idx) in messages"
          :key="idx"
          class="flex gap-2"
          :class="msg.role === 'user' ? 'justify-end' : 'justify-start'"
        >
          <div
            class="max-w-[80%] rounded-2xl px-4 py-2.5 shadow-sm"
            :class="
              msg.role === 'user'
                ? 'bg-purple-600 text-white rounded-br-sm'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700 rounded-bl-sm'
            "
          >
            <div class="text-sm leading-relaxed prose prose-sm max-w-none" :class="msg.role === 'user' ? 'prose-invert' : ''" v-html="parseMarkdownWithLinks(msg.content)" @click="handleLinkClick"></div>

            <!-- Metadata for bot responses -->
            <div v-if="msg.role === 'assistant' && msg.metadata" class="flex gap-2 mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
              <UBadge
                v-if="msg.metadata.accountId"
                color="blue"
                size="xs"
              >
                {{ msg.metadata.accountId }}
              </UBadge>
              <UBadge
                v-if="msg.metadata.mcpType"
                :color="msg.metadata.mcpType === 'permanent' ? 'green' : 'orange'"
                size="xs"
              >
                {{ msg.metadata.mcpType === 'permanent' ? 'Permanent MCP' : 'Temporary MCP' }}
              </UBadge>
            </div>

            <!-- Suggested links for bot responses -->
            <div v-if="msg.role === 'assistant' && msg.suggestedLinks && msg.suggestedLinks.length > 0" class="mt-3 space-y-2">
              <StrandsLinkCard
                v-for="(link, linkIdx) in msg.suggestedLinks"
                :key="linkIdx"
                :link="link"
                @click="toggleChat"
              />
            </div>
          </div>
        </div>

        <!-- Loading indicator -->
        <div v-if="isLoading" class="flex justify-start">
          <div class="bg-gray-100 dark:bg-gray-800 rounded-lg px-3 py-2">
            <div class="flex items-center gap-1">
              <div class="w-2 h-2 bg-purple-600 rounded-full animate-bounce" style="animation-delay: 0ms"></div>
              <div class="w-2 h-2 bg-purple-600 rounded-full animate-bounce" style="animation-delay: 150ms"></div>
              <div class="w-2 h-2 bg-purple-600 rounded-full animate-bounce" style="animation-delay: 300ms"></div>
            </div>
          </div>
        </div>

        <!-- Error message -->
        <div v-if="errorMessage" class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
          <div class="flex items-start gap-2">
            <UIcon name="i-heroicons-exclamation-triangle" class="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div class="flex-1 min-w-0">
              <p class="text-xs text-red-800 dark:text-red-200">{{ errorMessage }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Input -->
      <div class="p-4 border-t border-gray-200 dark:border-gray-700">
        <form @submit.prevent="sendMessage" class="flex gap-2">
          <input
            v-model="userInput"
            type="text"
            placeholder="Ask about your AWS accounts..."
            class="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            :disabled="isLoading"
          />
          <button
            type="submit"
            :disabled="!userInput.trim() || isLoading"
            class="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white rounded-lg transition-colors disabled:cursor-not-allowed flex items-center justify-center"
          >
            <UIcon
              :name="isLoading ? 'i-heroicons-arrow-path' : 'i-heroicons-paper-airplane'"
              class="w-4 h-4"
              :class="{ 'animate-spin': isLoading }"
            />
          </button>
        </form>
      </div>
    </div>
  </Transition>

  <!-- Mobile Overlay -->
  <div
    v-if="isOpen"
    @click="toggleChat"
    class="fixed inset-0 bg-black/20 z-30 md:hidden"
  ></div>

  <!-- Account Disambiguation Modal -->
  <AccountDisambiguationModal
    v-if="showDisambiguation && disambiguationData"
    :disambiguation="disambiguationData"
    :sessionId="sessionId || ''"
    @selected="handleAccountSelected"
    @cancel="handleDisambiguationCancel"
  />
</template>

<script setup lang="ts">
import { useChatThreadsStore } from '~/stores/useChatThreadsStore'

// Use markdown link parser composable
const { parseMarkdownWithLinks, handleLinkClick } = useMarkdownLinkParser()

// Get the threads store to persist messages
const threadsStore = useChatThreadsStore()

// Use shared chat logic with thread persistence
const {
  messages: chatMessages,
  isLoading,
  sessionId,
  showDisambiguation,
  disambiguationData,
  sendMessage: sendChatMessage,
  handleAccountSelected,
  handleDisambiguationCancel,
  clearChat: clearChatMessages,
  scrollTrigger
} = useStrandsChat({
  initialGreeting: "", // No initial greeting for popup
  threadsStore: threadsStore,
  loadMessagesFromThread: !!threadsStore.currentThread
})

// UI state (specific to popup)
const isOpen = ref(false)
const showExamples = ref(false)
const showHint = ref(false)
const userInput = ref('')
const errorMessage = ref('')
const messagesContainer = ref<HTMLElement>()

// Convert chat messages to popup format
interface PopupMessage {
  role: 'user' | 'assistant'
  content: string
  metadata?: {
    accountId?: string
    mcpType?: 'permanent' | 'temporary'
  }
  suggestedLinks?: any[]
}

const messages = computed<PopupMessage[]>(() => {
  return chatMessages.value.map(msg => ({
    role: msg.sender === 'user' ? 'user' as const : 'assistant' as const,
    content: msg.text,
    metadata: msg.metadata,
    suggestedLinks: msg.suggestedLinks
  }))
})

// Example questions
const exampleQuestions = [
  "What are costs for account 374673712317 this month?",
  "List EC2 instances in account 205950196477",
  "Show me S3 buckets in the Gov Master account",
  "Analyze security findings for monitoring account"
]

// Initialize on mount
onMounted(async () => {
  // Show hint for first-time users
  const hasVisited = localStorage.getItem('strands-popup-visited')
  if (!hasVisited) {
    showHint.value = true
    // Auto-dismiss hint after 5 seconds
    setTimeout(() => {
      showHint.value = false
      localStorage.setItem('strands-popup-visited', 'true')
    }, 5000)
  }

  // Load active thread from store if exists
  // This ensures popup shows the same conversation as the /chat page
  if (threadsStore.activeThreadId && !threadsStore.currentThread) {
    await threadsStore.loadThread(threadsStore.activeThreadId)
  }

  // Clean up old localStorage-based persistence (migration)
  localStorage.removeItem('strands-popup-chat')
})

// Toggle chat window
function toggleChat() {
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    showHint.value = false
  }
}

// Clear chat
async function clearChat() {
  if (threadsStore.activeThreadId) {
    // Clear messages from the thread in database
    await threadsStore.clearThread(threadsStore.activeThreadId)
  } else {
    // No thread yet, just clear local messages
    clearChatMessages()
  }
  errorMessage.value = ''
}

// Send example question
function sendExample(example: string) {
  userInput.value = example
  showExamples.value = false
  sendMessage()
}

// Auto-scroll when messages change or scrollTrigger increments
watch(scrollTrigger, () => {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
})

// Send message
async function sendMessage() {
  if (!userInput.value.trim() || isLoading.value) return

  const userMessage = userInput.value.trim()
  userInput.value = ''

  await sendChatMessage(userMessage)
}


</script>
