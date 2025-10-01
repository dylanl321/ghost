<template>
  <div id="chatwrapper" :class="isFullScreen">
    <div class="chat-header-rect">
      <div class="chat-header-row">
        <div class="chat-header-text">
          AWS Assistant
          <a href="https://docs.engcollab.gd-ms.us/docs/about/chatbot-faq" target="_blank" class="faq-link">
            Learn More
            <UIcon name="i-heroicons-arrow-top-right-on-square" class="external-link-icon" />
          </a>
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
              <a :href="`https://docs.engcollab.gd-ms.us/${link}`" target="_blank" class="external-link">
                {{ link }}
                <UIcon name="i-heroicons-arrow-top-right-on-square" class="external-link-icon" />
              </a>
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
          placeholder="Type your message"
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
  text: "Hello! Let me know if you have any questions relating to AWS services and documentation. Note that some of the information I provide may be inaccurate, so double-check my responses. Type \"help\" for a list of example questions.",
  links: [],
  sender: 'bot'
}])

const inputValue = ref('')
const isLoading = ref(false)
const isFullScreen = ref('normal')
const visible = ref('closed')
const exampleQuestions = ref(false)
const chatBoxRef = ref(null)
const inputRef = ref(null)

// Configuration
const endpoint = "/api/ai/chat"

// Example questions list
const exampleQuestionsList = [
  "I'm having issues launching an instance.",
  "What is AWS CloudWatch?",
  "Tell me about EC2 pricing.",
  "How can I optimize my AWS costs?",
  "What is a VPC?",
]

// Handle form submission
const handleSubmit = async (e) => {
  console.log("handling submit")
  
  e.preventDefault()
  if (!inputValue.value.trim()) return // Can't submit with empty input box

  if (inputValue.value.trim().toLowerCase() === "help") {
    exampleQuestions.value = true
    inputValue.value = ''
    return
  }

  const userMessage = { text: inputValue.value, links: [], sender: 'user' }
  messages.value.push(userMessage)
  inputValue.value = ''
  isLoading.value = true
  exampleQuestions.value = false

  await fetchData(userMessage.text)
}

// Handle example question clicks
const handleExampleClick = async (message) => {
  const userMessage = { text: message, sender: 'user' }
  messages.value.push(userMessage)
  isLoading.value = true
  exampleQuestions.value = false

  await fetchData(message)
}

// Fetch data from API
const fetchData = async (inputVal) => {
  console.log("Fetching data")

  const requestData = { userInput: inputVal }

  try {
    const data = await $fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: requestData,
    })
    
    console.log(data)

    let message = data.responseBody

    // Remove any markdown code spans from response
    message = message.replaceAll("```markdown", "")
    message = message.replaceAll("```", "")

    // Remove .md from all links
    const links = data.references.map(reference => reference.document.replace(".md", ""))

    // Remove duplicates with Set()
    const uniqueLinks = [...new Set(links)]

    // Remove any links that begin with "new"
    const filteredLinks = uniqueLinks.filter(link => link.split("/")[0] !== "new")

    const botMessage = { text: message, links: filteredLinks, sender: 'bot' }

    messages.value.push(botMessage)
  } catch (error) {
    console.error('Error:', error)
    const errorMessage = { text: 'Sorry, something went wrong.', links: [], sender: 'bot' }
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
const formatMessage = (content) => {
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
  @apply bg-blue-600 dark:bg-blue-700 text-white rounded-t-lg;
}

.chat-header-row {
  @apply flex items-center justify-between p-3;
}

.chat-header-text {
  @apply flex items-center gap-2 font-semibold;
}

.faq-link {
  @apply text-blue-200 hover:text-white text-sm flex items-center gap-1;
}

.external-link-icon {
  @apply w-3 h-3;
}

.chat-header-icons {
  @apply flex items-center gap-2;
}

.fullscreen-toggle,
.chevron-container {
  @apply p-1 hover:bg-blue-700 dark:hover:bg-blue-600 rounded transition-colors;
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
  @apply ml-auto bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100;
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
  @apply p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed;
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