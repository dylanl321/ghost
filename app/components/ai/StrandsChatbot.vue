<template>
  <div id="chatwrapper" :class="isFullScreen">
    <div class="chat-header-rect">
      <div class="chat-header-row">
        <div class="chat-header-text">
          Strands Agent
          <span class="badge">MCP Tools</span>
        </div>
        <div class="chat-header-icons">
          <button class="fullscreen-toggle" @click="toggleFullscreen">
            <UIcon
              :name="isFullScreen === 'normal' ? 'i-heroicons-arrows-pointing-out' : 'i-heroicons-arrows-pointing-in'"
              class="w-5 h-5"
            />
          </button>
          <button class="chevron-container" @click="toggleVisibility">
            <UIcon
              :name="visible === 'open' ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-up'"
              class="w-5 h-5"
            />
          </button>
        </div>
      </div>
    </div>

    <div id="chat-container" :class="visible">
      <div id="chat-box" :class="isFullScreen" ref="chatBoxRef">
        <div v-for="(msg, index) in messages" :key="msg.messageId || `msg-${index}`" :class="`message ${msg.role === 'user' ? 'user' : 'bot'}`">
          <!-- Streaming status indicator -->
          <div v-if="msg.status?.status === 'pending' || msg.status?.status === 'streaming'" class="streaming-status">
            <div class="status-indicator">
              <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin text-purple-500" />
              <span class="text-xs text-gray-600 dark:text-gray-400">{{ msg.status.progress || pollingProgress || 'Processing...' }}</span>
            </div>
            <div v-if="(msg.status.toolsCalled && msg.status.toolsCalled.length > 0) || (pollingToolsCalled && pollingToolsCalled.length > 0)" class="tools-called">
              <span v-for="tool in (msg.status.toolsCalled || pollingToolsCalled)" :key="tool" class="tool-badge">
                {{ tool }}
              </span>
            </div>
          </div>

          <!-- Message content with typewriter cursor for streaming -->
          <div class="markdown-container" v-html="formatMessage(msg.content)" @click="handleEnrichedClick"></div>
          <span v-if="msg.streamBuffer && (msg.status?.status === 'pending' || msg.status?.status === 'streaming')" class="cursor-blink">|</span>

          <!-- Error status -->
          <div v-if="msg.status?.status === 'error'" class="error-status">
            <UIcon name="i-heroicons-exclamation-triangle" class="w-4 h-4 text-red-500" />
            <span class="text-xs text-red-600 dark:text-red-400">{{ msg.status.error }}</span>
            <button @click="retryLastMessage" class="ml-2 text-xs text-blue-600 dark:text-blue-400 hover:underline">
              Retry
            </button>
          </div>

          <div v-if="msg.links && msg.links.length > 0">
            <br />
            <div v-for="(link, linkIndex) in msg.links" :key="linkIndex" class="link-box">
              <span class="bullet">•</span>
              <a :href="link" target="_blank" class="external-link">
                {{ link }}
                <UIcon name="i-heroicons-arrow-top-right-on-square" class="external-link-icon" />
              </a>
            </div>
          </div>
          <div v-if="msg.metadata && (msg.metadata.accountId || msg.metadata.mcpUsed)" class="tools-used">
            <div class="metadata-container">
              <span v-if="msg.metadata.accountId" class="metadata-badge account-badge">
                <UIcon name="i-heroicons-building-library" class="w-3 h-3" />
                Account: {{ msg.metadata.accountId }}
              </span>
              <span v-if="msg.metadata.mcpUsed" class="metadata-badge mcp-badge" :class="{ 'permanent-mcp': msg.metadata.mcpType === 'permanent', 'temporary-mcp': msg.metadata.mcpType === 'temporary' }">
                <UIcon :name="msg.metadata.mcpType === 'permanent' ? 'i-heroicons-server-stack' : 'i-heroicons-cpu-chip'" class="w-3 h-3" />
                {{ msg.metadata.mcpUsed }}
              </span>
            </div>
          </div>

          <!-- Suggested Links -->
          <div v-if="msg.suggestedLinks && msg.suggestedLinks.length > 0" class="suggested-links">
            <StrandsLinkCard
              v-for="(link, linkIdx) in msg.suggestedLinks"
              :key="linkIdx"
              :link="link"
            />
          </div>
        </div>

        <div v-if="localShowExamples" class="example-questions">
          <div
            v-for="(question, index) in exampleQuestionsList"
            :key="index"
            class="example-question"
            :tabindex="index + 1"
            @click="handleExampleClick(question)"
            :style="{ animationDelay: `${0.1 * index}s` }"
          >
            {{ question }}
          </div>
        </div>

        <div v-if="showLoader" class="typing">
          <div class="flex gap-1">
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
          </div>
          <span v-if="pollingProgress" class="typing-text">
            {{ pollingProgress }}
            <span v-if="pollingPercent">({{ pollingPercent }}%)</span>
          </span>
        </div>
      </div>

      <form @submit.prevent="handleSubmit" class="input-form">
        <input
          v-model="userInput"
          type="text"
          :disabled="isLoading"
          placeholder="Ask about AWS costs, config, security..."
          ref="inputRef"
        />
        <button type="submit" :disabled="isLoading">
          <UIcon name="i-heroicons-paper-airplane" class="w-6 h-6" />
        </button>
      </form>
    </div>

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
  </div>
</template>

<script setup lang="ts">
/**
 * StrandsChatbot - Floating chat widget (legacy)
 * Uses unified useChatUI composable for all logic
 */

// Use the entity-aware response enricher
const { enrichStrandsResponse, handleEnrichedClick } = useStrandsResponseEnricher()

// Use unified chat logic
const {
  messages,
  isLoading,
  showLoader,
  sessionId,
  showDisambiguation,
  disambiguationData,
  pollingProgress,
  pollingPercent,
  pollingToolsCalled,
  sendMessage,
  retryLastMessage,
  handleAccountSelected,
  cancelDisambiguation,
  scrollTrigger,
  initialize
} = useChatUI({
  viewMode: 'popup',
  initialGreeting: "Hello! I'm a Strands agent connected to AWS MCP servers. I can help you with AWS cost analysis, configuration lookups, security hub queries, and more.\n\nFor best results, be explicit about AWS account IDs in your queries. Type \"help\" for example questions.\n\nNote: First-time queries for new accounts may take 2+ minutes while the MCP server initializes."
})

// UI state (specific to this widget)
const userInput = ref('')
const isFullScreen = ref('normal')
const visible = ref('closed')
const localShowExamples = ref(false)
const chatBoxRef = ref<HTMLDivElement | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)

// Example questions list for Strands agent
const exampleQuestionsList = [
  "What are the AWS costs for account 374673712317 this month?",
  "Show me security findings from Security Hub for the Gov Master account",
  "List EC2 instances in account 205950196477",
  "Analyze costs by service for account 083876038518",
  "What S3 buckets exist in account 374673712317?",
]

// Handle form submission
const handleSubmit = async (e: Event) => {
  e.preventDefault()
  if (!userInput.value.trim()) return

  if (userInput.value.trim().toLowerCase() === "help") {
    localShowExamples.value = true
    userInput.value = ''
    return
  }

  const messageToSend = userInput.value
  userInput.value = ''
  localShowExamples.value = false

  await sendMessage(messageToSend)
}

// Handle example question clicks
const handleExampleClick = async (message: string) => {
  localShowExamples.value = false
  await sendMessage(message)
}

// Toggle visibility
function toggleVisibility() {
  const newVisibility = (visible.value === "open" ? "closed" : "open")
  visible.value = newVisibility
  isFullScreen.value = newVisibility === "closed" ? "normal" : isFullScreen.value
}

// Toggle fullscreen
function toggleFullscreen() {
  const newFullScreen = (isFullScreen.value === "normal" ? "fullscreen" : "normal")
  isFullScreen.value = newFullScreen
  visible.value = newFullScreen === "fullscreen" ? "open" : visible.value
}

// Format message content using the entity-aware enricher
const formatMessage = (content: string) => {
  if (!content) return ''
  return enrichStrandsResponse(content)
}

// Auto scroll down when messages change or scrollTrigger increments
watch([scrollTrigger, localShowExamples, messages], () => {
  nextTick(() => {
    nextTick(() => {
      if (chatBoxRef.value) {
        chatBoxRef.value.scrollTop = chatBoxRef.value.scrollHeight
      }
    })
  })
}, { deep: true })

// Refocus after done loading
watch(isLoading, (newLoading) => {
  if (!newLoading && inputRef.value) {
    inputRef.value.focus()
  }
})

// Initialize on mount
onMounted(async () => {
  await initialize()
})
</script>

<style scoped>
#chatwrapper {
  @apply fixed bottom-4 right-4 w-96 max-w-md bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg z-50;
}

#chatwrapper.fullscreen {
  @apply fixed inset-4 w-auto max-w-none;
}

.chat-header-rect {
  @apply bg-purple-600 dark:bg-purple-700 text-white rounded-t-lg;
}

.chat-header-row {
  @apply flex items-center justify-between p-3;
}

.chat-header-text {
  @apply flex items-center gap-2 font-semibold;
}

.badge {
  @apply text-xs bg-purple-500 dark:bg-purple-600 px-2 py-0.5 rounded;
}

.chat-header-icons {
  @apply flex items-center gap-2;
}

.fullscreen-toggle,
.chevron-container {
  @apply p-1 hover:bg-purple-700 dark:hover:bg-purple-600 rounded transition-colors;
}

#chat-container {
  @apply hidden flex-col h-96;
}

#chat-container.open {
  @apply flex;
}

.fullscreen #chat-container.open {
  @apply h-full;
}

#chat-box {
  @apply flex-1 overflow-y-auto p-4 space-y-3;
}

.message {
  @apply max-w-[80%] p-3 rounded-lg;
}

.message.user {
  @apply ml-auto bg-purple-100 dark:bg-purple-900 text-purple-900 dark:text-purple-100;
}

.message.bot {
  @apply mr-auto bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100;
}

.link-box {
  @apply flex items-center gap-2 mt-2;
}

.bullet {
  @apply text-gray-500;
}

.external-link {
  @apply text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1;
}

.tools-used {
  @apply mt-2 pt-2 border-t border-gray-200 dark:border-gray-600;
}

.metadata-container {
  @apply flex flex-wrap gap-2 items-center;
}

.metadata-badge {
  @apply text-xs px-2 py-1 rounded flex items-center gap-1;
}

.account-badge {
  @apply bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200;
}

.mcp-badge {
  @apply bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300;
}

.permanent-mcp {
  @apply bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200;
}

.temporary-mcp {
  @apply bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200;
}

.suggested-links {
  @apply mt-3 space-y-2;
}

.example-questions {
  @apply space-y-2;
}

.example-question {
  @apply p-3 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg cursor-pointer transition-colors animate-fade-in;
}

.typing {
  @apply flex flex-col items-center gap-2 p-3;
}

.typing-dot {
  @apply w-2 h-2 bg-gray-400 rounded-full animate-bounce;
  animation-delay: 0.1s;
}

.typing-dot:nth-child(2) {
  animation-delay: 0.2s;
}

.typing-dot:nth-child(3) {
  animation-delay: 0.3s;
}

.typing-text {
  @apply text-sm text-gray-600 dark:text-gray-400 mt-1;
}

.input-form {
  @apply flex gap-2 p-3 border-t border-gray-200 dark:border-gray-600;
}

.input-form input {
  @apply flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400;
}

.input-form button {
  @apply p-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed;
}

@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in {
  animation: fade-in 0.3s ease-out;
}

/* Custom scrollbar */
#chat-box::-webkit-scrollbar {
  width: 6px;
}

#chat-box::-webkit-scrollbar-track {
  @apply bg-gray-100 dark:bg-gray-800;
}

#chat-box::-webkit-scrollbar-thumb {
  @apply bg-gray-300 dark:bg-gray-600 rounded;
}

#chat-box::-webkit-scrollbar-thumb:hover {
  @apply bg-gray-400 dark:bg-gray-500;
}

/* Markdown Content Styling */
.markdown-container :deep(h1) {
  @apply text-2xl font-bold text-gray-900 dark:text-white mb-3 mt-4 first:mt-0 pb-2 border-b-2 border-gray-200 dark:border-gray-600;
}

.markdown-container :deep(h2) {
  @apply text-xl font-bold text-gray-900 dark:text-white mb-2 mt-3 pb-1 border-b border-gray-200 dark:border-gray-600;
}

.markdown-container :deep(h3) {
  @apply text-lg font-semibold text-blue-600 dark:text-blue-400 mb-2 mt-3;
}

.markdown-container :deep(h4) {
  @apply text-base font-semibold text-gray-800 dark:text-gray-200 mb-2 mt-2;
}

.markdown-container :deep(h5) {
  @apply text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1 mt-2;
}

.markdown-container :deep(h6) {
  @apply text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1 mt-1;
}

.markdown-container :deep(p) {
  @apply text-sm leading-normal mb-2 text-gray-700 dark:text-gray-300;
}

.markdown-container :deep(ul) {
  @apply space-y-1 mb-3 pl-5 list-disc;
}

.markdown-container :deep(ol) {
  @apply space-y-1 mb-3 pl-5 list-decimal;
}

.markdown-container :deep(li) {
  @apply text-sm text-gray-700 dark:text-gray-300 leading-relaxed;
}

.markdown-container :deep(ul li::marker) {
  @apply text-blue-500 dark:text-blue-400;
}

.markdown-container :deep(ol li::marker) {
  @apply text-blue-600 dark:text-blue-400 font-semibold;
}

.markdown-container :deep(code) {
  @apply bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded font-mono text-xs text-blue-600 dark:text-blue-400 border border-gray-300 dark:border-gray-600;
}

.markdown-container :deep(pre) {
  @apply bg-gray-900 dark:bg-gray-950 p-3 rounded-lg overflow-x-auto my-3 border border-gray-700;
}

.markdown-container :deep(pre code) {
  @apply bg-transparent border-0 text-gray-100 text-xs leading-normal block p-0;
}

.markdown-container :deep(a) {
  @apply text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline decoration-blue-400/50 hover:decoration-blue-600 underline-offset-2 transition-colors;
}

.markdown-container :deep(blockquote) {
  @apply border-l-4 border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20 pl-3 pr-2 py-2 my-3 italic text-sm text-gray-700 dark:text-gray-300 rounded-r;
}

.markdown-container :deep(hr) {
  @apply my-4 border-0 border-t-2 border-gray-300 dark:border-gray-600;
}

.markdown-container :deep(strong) {
  @apply font-semibold text-gray-900 dark:text-white;
}

.markdown-container :deep(em) {
  @apply italic text-gray-600 dark:text-gray-400;
}

.markdown-container :deep(table) {
  @apply w-full my-3 border-collapse bg-white dark:bg-gray-800 rounded-lg overflow-hidden shadow-sm text-sm;
}

.markdown-container :deep(th) {
  @apply bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 px-2 py-1 text-left font-semibold text-gray-900 dark:text-white text-xs;
}

.markdown-container :deep(td) {
  @apply border border-gray-300 dark:border-gray-600 px-2 py-1 text-gray-700 dark:text-gray-300 text-xs;
}

.markdown-container :deep(tbody tr) {
  @apply hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors;
}

/* Streaming UI Styles */
.streaming-status {
  @apply mb-2 pb-2 border-b border-gray-200 dark:border-gray-600;
}

.status-indicator {
  @apply flex items-center gap-2 mb-1;
}

.tools-called {
  @apply flex flex-wrap gap-1 mt-2;
}

.tool-badge {
  @apply text-xs px-2 py-0.5 rounded bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200;
}

.cursor-blink {
  @apply inline-block ml-1 text-purple-600 dark:text-purple-400 animate-pulse;
}

.error-status {
  @apply flex items-center gap-2 mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded;
}
</style>
