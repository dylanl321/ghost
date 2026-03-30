<template>
  <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 h-full overflow-hidden flex flex-col">
    <!-- Header -->
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-2">
        <div class="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
          <UIcon name="i-heroicons-sparkles" class="w-4.5 h-4.5 text-purple-500" />
        </div>
        <div>
          <h2 class="text-sm font-semibold text-gray-900 dark:text-white">Quick Chat</h2>
          <p class="text-[11px] text-gray-400 dark:text-gray-500">Ask GHOST anything</p>
        </div>
      </div>
      <NuxtLink to="/chat">
        <UButton size="xs" variant="ghost" icon="i-heroicons-arrow-top-right-on-square" trailing>
          Open Full Chat
        </UButton>
      </NuxtLink>
    </div>

    <!-- Feature flag guard -->
    <div v-if="!siteConfigStore.isStrandsChatEnabled" class="flex-1 flex items-center justify-center">
      <div class="text-center">
        <UIcon name="i-heroicons-chat-bubble-left-right" class="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
        <p class="text-xs text-gray-400 dark:text-gray-500">AI Chat is not currently available</p>
      </div>
    </div>

    <!-- Third layout: prompt chips only -->
    <template v-else-if="displayStyle === 'third'">
      <div class="flex-1 space-y-2">
        <button
          v-for="prompt in suggestedPrompts.slice(0, 3)"
          :key="prompt.text"
          class="w-full text-left px-3 py-2 rounded-lg text-xs text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/50 hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:text-purple-700 dark:hover:text-purple-300 transition-colors truncate"
          @click="handlePromptClick(prompt.text)"
        >
          <UIcon :name="prompt.icon" class="w-3.5 h-3.5 inline mr-1.5 align-text-bottom" />
          {{ prompt.label }}
        </button>
      </div>
    </template>

    <!-- Half / Full / Two-thirds layout: messages + input -->
    <template v-else>
      <!-- Message area -->
      <div
        ref="messageArea"
        class="flex-1 overflow-y-auto space-y-2 mb-3"
        :class="messageAreaMaxHeight"
      >
        <!-- Welcome state -->
        <div v-if="showWelcome && displayedMessages.length === 0" class="flex flex-col items-center justify-center h-full text-center py-4">
          <UIcon name="i-heroicons-sparkles" class="w-10 h-10 text-purple-300 dark:text-purple-600 mb-3" />
          <p class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">How can I help?</p>
          <p class="text-xs text-gray-400 dark:text-gray-500 mb-4">Ask about your AWS accounts, costs, or resources</p>
          <div class="flex flex-wrap gap-2 justify-center max-w-sm">
            <button
              v-for="prompt in suggestedPrompts"
              :key="prompt.text"
              class="px-3 py-1.5 rounded-full text-xs text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:text-purple-700 dark:hover:text-purple-300 transition-colors"
              @click="handlePromptClick(prompt.text)"
            >
              {{ prompt.label }}
            </button>
          </div>
        </div>

        <!-- Conversation messages -->
        <template v-else>
          <ChatMessage
            v-for="(msg, idx) in displayedMessages"
            :key="msg.messageId || `msg-${idx}`"
            :message="msg"
            :view-mode="'popup'"
            @retry="retryLastMessage"
            @cancel="cancelQuery"
            @prompt-click="handlePromptClick"
          />

          <!-- Loading indicator -->
          <div v-if="showLoader" class="flex justify-start">
            <div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700/50">
              <div class="flex gap-1">
                <div class="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style="animation-delay: 0ms" />
                <div class="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style="animation-delay: 150ms" />
                <div class="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style="animation-delay: 300ms" />
              </div>
              <span class="text-xs text-gray-500 dark:text-gray-400">{{ pollingProgress }}</span>
            </div>
          </div>
        </template>
      </div>

      <!-- Error message -->
      <div v-if="errorMessage" class="mb-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-xs text-red-600 dark:text-red-400">
        {{ errorMessage }}
      </div>

      <!-- Input bar -->
      <div class="flex items-center gap-2">
        <input
          v-model="inputValue"
          type="text"
          :disabled="isLoading"
          placeholder="Ask GHOST..."
          class="flex-1 text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50"
          @keydown.enter.prevent="handleSend"
        />
        <UButton
          icon="i-heroicons-paper-airplane"
          size="sm"
          color="purple"
          :disabled="!inputValue.trim() || isLoading"
          :loading="isLoading"
          @click="handleSend"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { DisplayStyle } from '#shared/types/dashboard-layout'

const props = withDefaults(defineProps<{
  displayStyle?: DisplayStyle
}>(), {
  displayStyle: 'half'
})

const siteConfigStore = useSiteConfigStore()

const {
  messages,
  chatState,
  inputValue,
  showWelcome,
  isLoading,
  errorMessage,
  showLoader,
  pollingProgress,
  scrollTrigger,
  sendMessage,
  retryLastMessage,
  cancelQuery,
  initialize,
} = useChatUI({ viewMode: 'dashboard', initialGreeting: '' })

const messageArea = ref<HTMLElement | null>(null)

const suggestedPrompts = [
  { label: 'Top cost drivers', text: 'What are my top cost drivers this month?', icon: 'i-heroicons-currency-dollar' },
  { label: 'Security findings', text: 'Show me recent security findings', icon: 'i-heroicons-shield-exclamation' },
  { label: 'EC2 instances', text: 'List my running EC2 instances', icon: 'i-heroicons-server' },
  { label: 'Spending trends', text: 'What are my spending trends over the last 3 months?', icon: 'i-heroicons-chart-bar' },
]

// Limit displayed messages to keep the card lightweight
const messageDisplayLimit = computed(() => {
  if (props.displayStyle === 'full' || props.displayStyle === 'two-thirds') return 10
  return 5
})

const displayedMessages = computed(() => {
  const msgs = messages.value
  if (msgs.length <= messageDisplayLimit.value) return msgs
  return msgs.slice(msgs.length - messageDisplayLimit.value)
})

const messageAreaMaxHeight = computed(() => {
  if (props.displayStyle === 'full' || props.displayStyle === 'two-thirds') return 'max-h-[500px]'
  return 'max-h-[400px]'
})

function handlePromptClick(text: string) {
  sendMessage(text)
}

function handleSend() {
  if (inputValue.value.trim() && !isLoading.value) {
    sendMessage()
  }
}

// Auto-scroll on new messages
watch(scrollTrigger, () => {
  nextTick(() => {
    if (messageArea.value) {
      messageArea.value.scrollTop = messageArea.value.scrollHeight
    }
  })
})

onMounted(() => {
  initialize()
})
</script>
