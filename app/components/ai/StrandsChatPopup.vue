<template>
  <!-- Floating Chat Button -->
  <div v-if="!isOpen" class="fixed bottom-6 right-6 z-40">
    <button
      @click="toggleChat"
      class="w-14 h-14 rounded-full bg-purple-600 hover:bg-purple-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center group hover:scale-110"
      :title="'Open AI Assistant'"
    >
      <UIcon name="i-heroicons-sparkles" class="w-6 h-6" />
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
            v-if="showWelcome"
            @click="localShowExamples = !localShowExamples"
            class="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
            title="Example questions"
          >
            <UIcon name="i-heroicons-light-bulb" class="w-4 h-4 text-white" />
          </button>
          <button
            @click="handleClearChat"
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
        v-if="localShowExamples && showWelcome"
        class="p-3 bg-purple-50 dark:bg-purple-900/20 border-b border-purple-200 dark:border-purple-800"
      >
        <p class="text-xs font-medium text-purple-900 dark:text-purple-100 mb-2">Try asking:</p>
        <div class="space-y-1">
          <button
            v-for="(example, idx) in exampleQuestions"
            :key="idx"
            @click="handleExampleClick(example)"
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
        <div v-if="showWelcome" class="text-center py-8">
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

        <!-- Sample Prompts (only show when no messages) -->
        <div v-if="showWelcome" class="space-y-2 px-2">
          <div class="flex items-center gap-1.5 mb-2">
            <UIcon name="i-heroicons-light-bulb" class="w-4 h-4 text-purple-500" />
            <p class="text-xs font-medium text-gray-700 dark:text-gray-300">Try asking:</p>
          </div>
          <button
            v-for="(sample, idx) in samplePrompts"
            :key="idx"
            @click="handleExampleClick(sample)"
            class="w-full text-left text-xs px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 hover:bg-purple-50 dark:hover:bg-purple-900/20 text-gray-700 dark:text-gray-300 transition-colors border border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-700"
          >
            <div class="flex items-start gap-2">
              <UIcon name="i-heroicons-chat-bubble-left-right" class="w-3.5 h-3.5 text-purple-500 flex-shrink-0 mt-0.5" />
              <span class="flex-1">{{ sample }}</span>
            </div>
          </button>
        </div>

        <!-- Chat messages -->
        <div
          v-for="(msg, idx) in messages"
          :key="msg.messageId || `msg-${idx}`"
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
            <!-- Streaming status indicator -->
            <div v-if="msg.status?.status === 'pending' || msg.status?.status === 'streaming'" class="streaming-status mb-2">
              <div class="flex items-center gap-2 mb-1.5">
                <div class="ghost-loading">
                  <UIcon name="i-fa6-solid-ghost" class="ghost-icon text-emerald-400" style="width: 20px; height: 20px;" />
                  <div class="ghost-dots">
                    <div class="ghost-dot"></div>
                    <div class="ghost-dot"></div>
                    <div class="ghost-dot"></div>
                  </div>
                </div>
                <div class="flex flex-col gap-0.5">
                  <span class="text-xs font-medium text-gray-700 dark:text-gray-300">GHOST is thinking...</span>
                  <span class="text-xs text-gray-600 dark:text-gray-400">{{ msg.status.progress || pollingProgress || 'Starting...' }}</span>
                </div>
              </div>
              <div v-if="(msg.status.toolsCalled && msg.status.toolsCalled.length > 0) || (pollingToolsCalled && pollingToolsCalled.length > 0)" class="flex flex-wrap gap-1">
                <span v-for="tool in (msg.status.toolsCalled || pollingToolsCalled)" :key="tool" class="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                  <UIcon name="i-heroicons-wrench-screwdriver" class="w-3 h-3" />
                  {{ tool }}
                </span>
              </div>
              <div class="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                Complex queries may take 30-120 seconds
              </div>
            </div>

            <div class="text-sm leading-relaxed prose prose-sm max-w-none" :class="msg.role === 'user' ? 'prose-invert' : ''" v-html="enrichStrandsResponse(msg.content)" @click="handleEnrichedClick"></div>
            <span v-if="msg.streamBuffer && (msg.status?.status === 'pending' || msg.status?.status === 'streaming')" class="cursor-blink">|</span>

            <!-- Error status -->
            <div v-if="msg.status?.status === 'error'" class="error-status">
              <UIcon name="i-heroicons-exclamation-triangle" class="w-3.5 h-3.5 text-red-500" />
              <span class="text-xs text-red-600 dark:text-red-400">{{ msg.status.error }}</span>
              <button @click="retryLastMessage" class="ml-2 text-xs text-blue-600 dark:text-blue-400 hover:underline">
                Retry
              </button>
            </div>

            <!-- Metadata for bot responses -->
            <div v-if="msg.role === 'assistant' && msg.metadata && (msg.metadata.accountId || msg.metadata.mcpType)" class="flex gap-2 mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
              <UBadge
                v-if="msg.metadata.accountId"
                :color="msg.metadata.accountId === 'aggregated' ? 'purple' : 'blue'"
                size="xs"
              >
                {{ msg.metadata.accountId === 'aggregated' ? 'Organization-wide' : msg.metadata.accountId }}
              </UBadge>
              <UBadge
                v-if="msg.metadata.mcpType"
                :color="msg.metadata.mcpType === 'permanent' ? 'green' : 'orange'"
                size="xs"
              >
                {{ msg.metadata.mcpType === 'permanent' ? 'Permanent MCP' : 'Temporary MCP' }}
              </UBadge>
            </div>

            <!-- Suggested links -->
            <div v-if="msg.role === 'assistant' && msg.suggestedLinks && msg.suggestedLinks.length > 0" class="mt-3 space-y-2">
              <StrandsLinkCard
                v-for="(link, linkIdx) in msg.suggestedLinks"
                :key="linkIdx"
                :link="link"
                @click="toggleChat"
              />
            </div>

            <!-- Suggested Prompts -->
            <div v-if="msg.role === 'assistant' && msg.suggestedPrompts && msg.suggestedPrompts.length > 0" class="mt-3 space-y-2">
              <p class="text-xs text-gray-600 dark:text-gray-400 mb-1.5 flex items-center gap-1">
                <UIcon name="i-heroicons-chat-bubble-bottom-center-text" class="w-3.5 h-3.5" />
                Continue:
              </p>
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="(prompt, promptIdx) in msg.suggestedPrompts"
                  :key="promptIdx"
                  @click="handlePromptClick(prompt.text)"
                  class="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-purple-200 dark:border-purple-800 bg-white dark:bg-purple-900/20 hover:bg-purple-50 dark:hover:bg-purple-900/40 text-purple-700 dark:text-purple-300 transition-colors hover:scale-105"
                >
                  <UIcon
                    :name="prompt.type === 'question' ? 'i-heroicons-question-mark-circle' : prompt.type === 'action' ? 'i-heroicons-arrow-right-circle' : 'i-heroicons-information-circle'"
                    class="w-3 h-3 flex-shrink-0"
                  />
                  <span>{{ prompt.text }}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Loading indicator (fallback) -->
        <div v-if="showLoader" class="flex justify-start">
          <div class="bg-gray-100 dark:bg-gray-800 rounded-lg px-3 py-2">
            <div class="flex items-center gap-2 mb-1">
              <div class="w-2 h-2 bg-purple-600 rounded-full animate-bounce" style="animation-delay: 0ms"></div>
              <div class="w-2 h-2 bg-purple-600 rounded-full animate-bounce" style="animation-delay: 150ms"></div>
              <div class="w-2 h-2 bg-purple-600 rounded-full animate-bounce" style="animation-delay: 300ms"></div>
              <span class="text-xs text-gray-700 dark:text-gray-200">
                {{ pollingProgress || 'Processing...' }}
                <span v-if="pollingPercent">({{ pollingPercent }}%)</span>
              </span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Complex queries may take 30-120 seconds</p>
            <div v-if="pollingToolsCalled && pollingToolsCalled.length" class="flex flex-wrap gap-1 mt-1">
              <span
                v-for="tool in pollingToolsCalled"
                :key="tool"
                class="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] rounded bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-200"
              >
                <UIcon name="i-heroicons-wrench-screwdriver" class="w-3 h-3" />
                {{ tool }}
              </span>
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
        <form @submit.prevent="handleSendMessage" class="flex gap-2">
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
    @cancel="cancelDisambiguation"
  />

  <!-- Entity Popover -->
  <EntityPopover />
</template>

<script setup lang="ts">
/**
 * StrandsChatPopup - Floating chat popup
 * Uses unified useChatUI composable for all logic
 */

// Get unified chat logic
const {
  // Core state
  messages,
  showWelcome,
  isLoading,
  showLoader,
  errorMessage,
  scrollTrigger,
  
  // Polling state
  pollingProgress,
  pollingPercent,
  pollingToolsCalled,
  
  // Actions
  sendMessage,
  retryLastMessage,
  clearConversation,
  
  // Disambiguation
  showDisambiguation,
  disambiguationData,
  handleAccountSelected,
  cancelDisambiguation,
  
  // Session
  sessionId,
  
  // Initialize
  initialize
} = useChatUI({ viewMode: 'popup', initialGreeting: '' })

// Entity enrichment
const { enrichStrandsResponse, handleEnrichedClick } = useStrandsResponseEnricher()

// Local UI state (popup-specific)
const isOpen = ref(false)
const localShowExamples = ref(false)
const showHint = ref(false)
const userInput = ref('')
const messagesContainer = ref<HTMLElement>()

// Sample prompts
const samplePrompts = [
  "What are the top AWS cost drivers this month?",
  "Show me security findings from Security Hub",
  "List all EC2 instances across accounts",
  "What are recent CloudTrail events?"
]

const exampleQuestions = [
  "What are costs for account 374673712317 this month?",
  "List EC2 instances in account 205950196477",
  "Show me S3 buckets in the Gov Master account",
  "Analyze security findings for monitoring account"
]

// Toggle chat window
function toggleChat() {
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    showHint.value = false
  }
}

// Clear chat
async function handleClearChat() {
  await clearConversation()
}

// Send message
async function handleSendMessage() {
  if (!userInput.value.trim() || isLoading.value) return
  const message = userInput.value.trim()
  userInput.value = ''
  await sendMessage(message)
}

// Handle example click
async function handleExampleClick(example: string) {
  localShowExamples.value = false
  await sendMessage(example)
}

// Handle suggested prompt click
async function handlePromptClick(promptText: string) {
  await sendMessage(promptText)
}

// Auto-scroll when messages change
watch([scrollTrigger, messages], () => {
  nextTick(() => {
    nextTick(() => {
      if (messagesContainer.value) {
        messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
      }
    })
  })
}, { deep: true })

// Initialize on mount
onMounted(async () => {
  // Show hint for first-time users
  const hasVisited = localStorage.getItem('strands-popup-visited')
  if (!hasVisited) {
    showHint.value = true
    setTimeout(() => {
      showHint.value = false
      localStorage.setItem('strands-popup-visited', 'true')
    }, 5000)
  }

  await initialize()
  localStorage.removeItem('strands-popup-chat')
})

// Reload thread when popup opens
watch(isOpen, async (newValue) => {
  if (newValue) {
    await initialize()
  }
})
</script>

<style scoped>
/* Streaming UI Styles */
.streaming-status {
  @apply pb-2 border-b border-gray-200 dark:border-gray-700;
}

/* Ghost Loading Animation */
.ghost-loading {
  @apply flex items-center gap-2;
}

.ghost-icon {
  @apply w-5 h-5 text-emerald-400;
  animation: ghostFloat 2s ease-in-out infinite;
}

.ghost-dots {
  @apply flex gap-1;
}

.ghost-dot {
  @apply w-1.5 h-1.5 bg-emerald-400 rounded-full;
  animation: ghostDotPulse 1.4s ease-in-out infinite;
}

.ghost-dot:nth-child(1) {
  animation-delay: 0s;
}

.ghost-dot:nth-child(2) {
  animation-delay: 0.2s;
}

.ghost-dot:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes ghostFloat {
  0%, 100% {
    transform: translateY(0px);
  }
  50% {
    transform: translateY(-6px);
  }
}

@keyframes ghostDotPulse {
  0%, 100% {
    opacity: 0.3;
    transform: scale(0.8);
  }
  50% {
    opacity: 1;
    transform: scale(1.2);
  }
}

.cursor-blink {
  @apply inline-block ml-0.5 text-purple-600 dark:text-purple-400 animate-pulse font-bold;
}

.error-status {
  @apply flex items-center gap-1.5 mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded text-xs;
}
</style>
