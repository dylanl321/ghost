<template>
  <div class="ghost-chat-container">
    <!-- Chat Header -->
    <div class="chat-header">
      <div class="chat-header-content">
        <div class="flex items-center gap-3">
          <UIcon name="i-heroicons-chat-bubble-left-right" class="w-8 h-8 text-purple-500" />
          <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
              GHOST Chat
            </h1>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              AI-powered assistant for AWS operations
            </p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <UBadge color="green" variant="subtle">
            <div class="flex items-center gap-1">
              <div class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span>Connected</span>
            </div>
          </UBadge>
        </div>
      </div>
    </div>

    <!-- Chat Messages Area -->
    <div class="chat-messages" ref="chatBoxRef">
      <div v-for="(msg, index) in messages" :key="index" :class="`message ${msg.sender}`">
        <div class="message-content">
          <div class="markdown-container" v-html="formatMessage(msg.text)" @click="handleLinkClick"></div>

          <!-- External Links -->
          <div v-if="msg.links && msg.links.length > 0" class="mt-3">
            <div v-for="(link, linkIndex) in msg.links" :key="linkIndex" class="link-box">
              <span class="bullet">•</span>
              <a :href="link" target="_blank" class="external-link">
                {{ link }}
                <UIcon name="i-heroicons-arrow-top-right-on-square" class="external-link-icon" />
              </a>
            </div>
          </div>

          <!-- Metadata -->
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
      </div>

      <!-- Example Questions -->
      <div v-if="exampleQuestions" class="example-questions">
        <div class="flex items-center gap-2 mb-3">
          <UIcon name="i-heroicons-light-bulb" class="w-5 h-5 text-purple-500" />
          <p class="text-sm font-medium text-gray-700 dark:text-gray-300">Try these examples (click to use):</p>
        </div>
        <div
          v-for="(question, index) in exampleQuestionsList"
          :key="index"
          class="example-question group"
          :tabindex="index + 1"
          @click="handleExampleClick(question)"
          @keydown.enter="handleExampleClick(question)"
          @keydown.space.prevent="handleExampleClick(question)"
          :style="{ animationDelay: `${0.1 * index}s` }"
        >
          <UIcon name="i-heroicons-chat-bubble-left-right" class="w-5 h-5 text-purple-500 flex-shrink-0" />
          <span class="flex-1">{{ question }}</span>
          <UIcon name="i-heroicons-arrow-right" class="w-4 h-4 text-gray-400 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>

      <!-- Typing Indicator -->
      <div v-if="isLoading" class="message bot">
        <div class="message-content">
          <div class="typing">
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Chat Input Area -->
    <div class="chat-input-container">
      <form @submit.prevent="handleSubmit" class="input-form">
        <div class="input-wrapper">
          <input
            v-model="inputValue"
            type="text"
            :disabled="isLoading"
            placeholder="Ask about AWS costs, configurations, security..."
            ref="inputRef"
            class="chat-input"
          />
          <button type="submit" :disabled="isLoading || !inputValue.trim()" class="send-button">
            <UIcon name="i-heroicons-paper-airplane" class="w-5 h-5" />
          </button>
        </div>
        <p class="input-hint">
          Tip: Be specific about account IDs for best results. Type "help" for examples.
        </p>
      </form>
    </div>

    <!-- Account Disambiguation Modal -->
    <AccountDisambiguationModal
      v-if="showDisambiguation && disambiguationData"
      :disambiguation="disambiguationData"
      :sessionId="sessionId || ''"
      @selected="handleAccountSelected"
      @cancel="handleDisambiguationCancel"
    />
  </div>
</template>

<script setup lang="ts">
// Use the markdown link parser composable
const { parseMarkdownWithLinks, handleLinkClick } = useMarkdownLinkParser()

// Reactive state
const messages = ref([{
  text: "Hello! I'm GHOST Chat, your AI assistant for AWS operations. I can help you with:\n\n• **Cost Analysis** - Query spending and forecasts\n• **Configuration** - Look up resource configurations\n• **Security** - Check security findings and compliance\n• **Resources** - List and analyze AWS resources\n\nClick any example below to get started, or ask your own question. For best results, be explicit about AWS account IDs.",
  links: [],
  sender: 'bot',
  metadata: {}
}])

const inputValue = ref('')
const isLoading = ref(false)
const exampleQuestions = ref(true) // Show examples by default
const chatBoxRef = ref(null)
const inputRef = ref(null)
const sessionId = ref<string | undefined>(undefined)

// Detect user's timezone
const userTimezone = ref<string>(
  Intl.DateTimeFormat().resolvedOptions().timeZone
)

// Disambiguation state
const showDisambiguation = ref(false)
const disambiguationData = ref<any>(null)
const pendingMessage = ref<string>('')

// Configuration
const endpoint = "/api/strands/chat"

// Example questions list
const exampleQuestionsList = [
  "What are the AWS costs for account 374673712317 this month?",
  "Show me security findings from Security Hub for the Gov Master account",
  "List EC2 instances in account 205950196477",
  "Analyze costs by service for account 083876038518",
  "What S3 buckets exist in account 374673712317?",
]

// Build conversation history from messages
const getConversationHistory = () => {
  return messages.value
    .filter(msg => msg.sender === 'user' || msg.sender === 'bot')
    .map(msg => ({
      role: msg.sender === 'user' ? 'user' as const : 'assistant' as const,
      content: msg.text
    }))
    .slice(1) // Skip the initial greeting message
}

// Handle form submission
const handleSubmit = async (e) => {
  e.preventDefault()
  if (!inputValue.value.trim()) return

  if (inputValue.value.trim().toLowerCase() === "help") {
    exampleQuestions.value = true
    inputValue.value = ''
    return
  }

  const userMessage = { text: inputValue.value, links: [], sender: 'user' as const, metadata: {} }
  messages.value.push(userMessage)
  const userInput = inputValue.value
  inputValue.value = ''
  isLoading.value = true
  exampleQuestions.value = false

  await fetchData(userInput)
}

// Handle example question clicks
const handleExampleClick = async (message) => {
  const userMessage = { text: message, sender: 'user' as const, links: [], metadata: {} }
  messages.value.push(userMessage)
  isLoading.value = true
  exampleQuestions.value = false

  await fetchData(message)
}

// Fetch data from API
const fetchData = async (inputVal: string) => {
  try {
    const conversationHistory = getConversationHistory()

    const requestData = {
      message: inputVal,
      conversationHistory,
      sessionId: sessionId.value,
      timezone: userTimezone.value // Send user's timezone
    }

    const data = await $fetch<{
      data: {
        responseBody: string
        sessionId?: string
        metadata?: {
          model?: string
          tokens?: {
            input?: number
            output?: number
          }
          toolsUsed?: string[]
        }
        references?: Array<{ document: string }>
        disambiguation?: any
        suggestedLinks?: any[]
        error?: string | null
      }
    }>(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: requestData,
    })

    // Update session ID if provided
    if (data.data?.sessionId) {
      sessionId.value = data.data.sessionId
    }

    // Check for disambiguation first
    if (data.data?.disambiguation) {
      disambiguationData.value = data.data.disambiguation
      pendingMessage.value = inputVal
      showDisambiguation.value = true
      isLoading.value = false
      return
    }

    // Check for error field (Strands returns errors with HTTP 200)
    if (data.data?.error) {
      const errorMessage = {
        text: data.data.error,
        links: [],
        sender: 'bot' as const,
        metadata: data.data.metadata || {}
      }
      messages.value.push(errorMessage)
      return
    }

    let message = data.data.responseBody || 'No response generated'

    // Remove any markdown code spans from response
    message = message.replaceAll("```markdown", "")
    message = message.replaceAll("```", "")

    // Handle references if provided
    const links = (data.data.references || []).map(ref => ref.document)

    // Remove duplicates
    const uniqueLinks = [...new Set(links)]

    const botMessage = {
      text: message,
      links: uniqueLinks,
      sender: 'bot' as const,
      metadata: data.data.metadata || {},
      suggestedLinks: data.data.suggestedLinks || []
    }

    messages.value.push(botMessage)
  } catch (error: any) {
    console.error('Error:', error)
    const errorMessage = {
      text: error.data?.error?.message || 'Sorry, something went wrong. The GHOST Chat service may be unavailable.',
      links: [],
      sender: 'bot' as const,
      metadata: {}
    }
    messages.value.push(errorMessage)
  } finally {
    isLoading.value = false
  }
}

// Format message content using the link parser (handles markdown + internal links)
const formatMessage = (content: string) => {
  if (!content) return ''
  return parseMarkdownWithLinks(content)
}

// Auto scroll down
watch([messages, exampleQuestions], () => {
  nextTick(() => {
    if (chatBoxRef.value) {
      chatBoxRef.value.scrollTop = chatBoxRef.value.scrollHeight
    }
  })
})

// Refocus after done loading
watch(isLoading, (newLoading) => {
  if (!newLoading && inputRef.value) {
    inputRef.value.focus()
  }
})

// Auto-focus input on mount
onMounted(() => {
  if (inputRef.value) {
    inputRef.value.focus()
  }
})

// Handle account selection from disambiguation modal
const handleAccountSelected = async (requestId: string) => {
  try {
    // Submit selection to backend
    await $fetch('/api/strands/account/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        session_id: sessionId.value,
        request_id: requestId
      }
    })

    // Close modal
    showDisambiguation.value = false

    // Re-execute the original query with the selected account
    isLoading.value = true
    await fetchData(pendingMessage.value)
    pendingMessage.value = ''

  } catch (error: any) {
    console.error('Error selecting account:', error)
    const errorMessage = {
      text: error.data?.error?.message || 'Failed to select account. Please try again.',
      links: [],
      sender: 'bot' as const,
      metadata: {}
    }
    messages.value.push(errorMessage)
    showDisambiguation.value = false
    isLoading.value = false
  }
}

// Handle disambiguation cancel
const handleDisambiguationCancel = () => {
  showDisambiguation.value = false
  disambiguationData.value = null
  pendingMessage.value = ''
  isLoading.value = false
}
</script>

<style scoped>
.ghost-chat-container {
  @apply flex flex-col h-full bg-white dark:bg-gray-900;
}

.chat-header {
  @apply flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800;
}

.chat-header-content {
  @apply flex items-center justify-between p-4 max-w-[1400px] mx-auto;
}

.chat-messages {
  @apply flex-1 overflow-y-auto p-6 space-y-6 max-w-[1400px] mx-auto w-full min-h-0;
}

.message {
  @apply flex;
}

.message.user {
  @apply justify-end;
}

.message.bot {
  @apply justify-start;
}

.message-content {
  @apply max-w-[80%] p-4 rounded-lg;
}

.message.user .message-content {
  @apply bg-purple-600 text-white;
}

.message.bot .message-content {
  @apply bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700;
}

.markdown-container {
  @apply prose prose-sm dark:prose-invert max-w-none;
}

.message.user .markdown-container {
  @apply text-white;
}

.message.user .markdown-container strong {
  @apply text-white font-bold;
}

.message.user .markdown-container code {
  @apply bg-purple-700 text-purple-100 px-1 py-0.5 rounded;
}

.link-box {
  @apply flex items-center gap-2 mt-2;
}

.bullet {
  @apply text-gray-500;
}

.external-link {
  @apply text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 text-sm;
}

.tools-used {
  @apply mt-3 pt-3 border-t border-gray-200 dark:border-gray-600;
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
  @apply space-y-2 max-w-2xl mx-auto my-6;
}

.example-question {
  @apply flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg cursor-pointer transition-all duration-200 border border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-600 animate-fade-in hover:shadow-md hover:scale-[1.02] active:scale-[0.98];
}

.example-question:hover {
  @apply transform translate-x-1;
}

.example-question span {
  @apply text-sm text-gray-700 dark:text-gray-300;
}

.typing {
  @apply flex justify-start gap-1 py-2;
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

.chat-input-container {
  @apply flex-shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4;
}

.input-form {
  @apply max-w-[1400px] mx-auto;
}

.input-wrapper {
  @apply flex gap-3 items-center;
}

.chat-input {
  @apply flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent;
}

.send-button {
  @apply p-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed;
}

.input-hint {
  @apply text-xs text-gray-500 dark:text-gray-400 mt-2;
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
.chat-messages::-webkit-scrollbar {
  width: 8px;
}

.chat-messages::-webkit-scrollbar-track {
  @apply bg-gray-100 dark:bg-gray-800;
}

.chat-messages::-webkit-scrollbar-thumb {
  @apply bg-gray-300 dark:bg-gray-600 rounded;
}

.chat-messages::-webkit-scrollbar-thumb:hover {
  @apply bg-gray-400 dark:bg-gray-500;
}

/* Markdown Content Styling (matching GHOST MarkdownContent component) */
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
</style>
