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
        <div v-for="(msg, index) in messages" :key="index" :class="`message ${msg.sender}`">
          <div class="markdown-container" v-html="formatMessage(msg.text)"></div>
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
          <div v-if="msg.metadata?.toolsUsed && msg.metadata.toolsUsed.length > 0" class="tools-used">
            <div class="tools-label">Tools used:</div>
            <div class="tools-list">
              <span v-for="(tool, toolIndex) in msg.metadata.toolsUsed" :key="toolIndex" class="tool-badge">
                {{ tool }}
              </span>
            </div>
          </div>
        </div>

        <div v-if="exampleQuestions" class="example-questions">
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

        <div v-if="isLoading" class="typing">
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        </div>
      </div>

      <form @submit.prevent="handleSubmit" class="input-form">
        <input
          v-model="inputValue"
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
  </div>
</template>

<script setup lang="ts">
// Reactive state
const messages = ref([{
  text: "Hello! I'm a Strands agent connected to AWS MCP servers. I can help you with AWS cost analysis, configuration lookups, security hub queries, and more. Type \"help\" for example questions.",
  links: [],
  sender: 'bot',
  metadata: {}
}])

const inputValue = ref('')
const isLoading = ref(false)
const isFullScreen = ref('normal')
const visible = ref('closed')
const exampleQuestions = ref(false)
const chatBoxRef = ref(null)
const inputRef = ref(null)
const sessionId = ref<string | undefined>(undefined)

// Configuration
const endpoint = "/api/strands/chat"

// Example questions list for Strands agent
const exampleQuestionsList = [
  "What are my AWS costs for this month?",
  "Show me security findings from Security Hub",
  "What EC2 instances are running in us-east-1?",
  "Analyze my AWS costs by service",
  "Check my S3 bucket configurations",
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
      sessionId: sessionId.value
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
      metadata: data.data.metadata || {}
    }

    messages.value.push(botMessage)
  } catch (error: any) {
    console.error('Error:', error)
    const errorMessage = {
      text: error.data?.error?.message || 'Sorry, something went wrong. The Strands server may be unavailable.',
      links: [],
      sender: 'bot' as const,
      metadata: {}
    }
    messages.value.push(errorMessage)
  } finally {
    isLoading.value = false
  }
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

// Format message content
const formatMessage = (content: string) => {
  if (!content) return ''
  return content
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>')
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

.tools-label {
  @apply text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1;
}

.tools-list {
  @apply flex flex-wrap gap-1;
}

.tool-badge {
  @apply text-xs bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 px-2 py-0.5 rounded;
}

.example-questions {
  @apply space-y-2;
}

.example-question {
  @apply p-3 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg cursor-pointer transition-colors animate-fade-in;
}

.typing {
  @apply flex justify-center gap-1 p-3;
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
</style>

