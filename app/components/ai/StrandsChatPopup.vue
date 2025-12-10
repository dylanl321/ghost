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
        <ChatMessage
          v-for="(msg, idx) in messages"
          :key="msg.messageId || `msg-${idx}`"
          :message="msg"
          :view-mode="'popup'"
          @retry="retryLastMessage"
          @cancel="cancelQuery"
          @copy="copyMessageMarkdown"
          @prompt-click="handlePromptClick"
          @enriched-click="handleEnrichedClick"
        />

        <!-- Loading indicator (fallback) -->
        <div v-if="showLoader" class="flex justify-start">
          <div class="bg-gray-100 dark:bg-gray-800 rounded-lg px-3 py-2 w-full">
            <div class="flex items-start gap-2 mb-1">
              <div class="flex items-center gap-2 flex-1">
                <div class="w-2 h-2 bg-purple-600 rounded-full animate-bounce" style="animation-delay: 0ms"></div>
                <div class="w-2 h-2 bg-purple-600 rounded-full animate-bounce" style="animation-delay: 150ms"></div>
                <div class="w-2 h-2 bg-purple-600 rounded-full animate-bounce" style="animation-delay: 300ms"></div>
                <span class="text-xs text-gray-700 dark:text-gray-200">
                  {{ pollingProgress || 'Processing...' }}
                  <span v-if="pollingPercent">({{ pollingPercent }}%)</span>
                </span>
              </div>
              <button
                @click="cancelQuery"
                class="px-2 py-1 text-[11px] rounded bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300 transition-colors flex items-center gap-1 flex-shrink-0"
                title="Cancel query"
              >
                <UIcon name="i-heroicons-x-circle" class="w-3 h-3" />
                Cancel
              </button>
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

import mermaid from 'mermaid'

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
  cancelQuery,
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

// Entity enrichment for click handling only
const { handleEnrichedClick } = useStrandsResponseEnricher()

// Toast notifications
const toast = useToast()

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

// Copy message markdown to clipboard
async function copyMessageMarkdown(message: any) {
  try {
    // Combine reasoning and content for full context
    let fullText = ''
    if (message.reasoning) {
      fullText = `## AI Reasoning\n\n${message.reasoning}\n\n## Response\n\n${message.content}`
    } else {
      fullText = message.content
    }

    await navigator.clipboard.writeText(fullText)
    toast.add({
      title: 'Copied to clipboard',
      description: message.reasoning ? 'Full markdown copied (including AI reasoning)' : 'Message copied',
      icon: 'i-heroicons-clipboard-document-check',
      color: 'green',
      timeout: 3000
    })
  } catch (err) {
    console.error('Failed to copy:', err)
    toast.add({
      title: 'Copy failed',
      description: 'Please try selecting and copying manually',
      icon: 'i-heroicons-exclamation-triangle',
      color: 'red',
      timeout: 3000
    })
  }
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

// Watch for mermaid chart rendering
watch(messages, async () => {
  await nextTick()

  // Render mermaid charts
  const mermaidElements = document.querySelectorAll('.mermaid-chart')
  for (const element of mermaidElements) {
    // Skip already rendered
    if (element.getAttribute('data-rendered') === 'true') continue

    try {
      const code = element.textContent || ''
      const id = element.id
      const { svg } = await mermaid.render(id + '-svg', code)

      // Store the original code as a data attribute
      element.setAttribute('data-mermaid-code', code)

      // Create wrapper with expand button
      element.innerHTML = `
        <div class="relative group">
          <div class="mermaid-svg-container">${svg}</div>
          <button
            class="absolute top-1 right-1 p-1.5 bg-white dark:bg-gray-800 rounded shadow-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-50 dark:hover:bg-gray-700 z-10"
            onclick="window.open('/chat', '_blank')"
            title="View in full page"
          >
            <svg class="w-3 h-3 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
            </svg>
          </button>
        </div>
      `
      element.setAttribute('data-rendered', 'true')

      // FIX: Reorder SVG elements to move text/labels to the end (renders on top)
      await nextTick()
      const svgElement = element.querySelector('svg')
      if (svgElement) {
        // Get all text-containing groups
        const labelGroups = svgElement.querySelectorAll('g.label, g.cluster-label, g.edgeLabel, g.nodeLabel')
        const textElements = svgElement.querySelectorAll('text')

        // Move all label groups to the end of their parent
        labelGroups.forEach(group => {
          const parent = group.parentNode
          if (parent) {
            parent.appendChild(group)
          }
        })

        // Move all text elements to the end of their parent
        textElements.forEach(text => {
          const parent = text.parentNode
          if (parent && parent !== svgElement) {
            parent.appendChild(text)
          }
        })
      }
    } catch (error) {
      console.error('Error rendering mermaid chart:', error)
      element.innerHTML = `
        <div class="p-2 bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800 text-xs">
          <span class="text-red-700 dark:text-red-300">Unable to render chart</span>
        </div>
      `
      element.setAttribute('data-rendered', 'true')
    }
  }
}, { deep: true })

// Initialize on mount
onMounted(async () => {
  // Initialize mermaid with dark mode support
  const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
  const htmlElement = document.documentElement
  const hasDataTheme = htmlElement.getAttribute('data-theme')
  const hasDarkClass = htmlElement.classList.contains('dark')
  const prefersDark = isDark || hasDataTheme === 'dark' || hasDarkClass

  mermaid.initialize({
    startOnLoad: false,
    theme: prefersDark ? 'dark' : 'default',
    securityLevel: 'loose',
    themeVariables: prefersDark ? {
      // Dark mode customization with enhanced visibility
      darkMode: true,
      background: '#1f2937',
      primaryColor: '#a855f7',
      primaryTextColor: '#fff',
      primaryBorderColor: '#9333ea',
      // IMPROVED: Much brighter lines for better visibility
      lineColor: '#d1d5db', // gray-300
      edgeLabelBackground: '#374151',
      clusterBkg: '#374151',
      clusterBorder: '#9ca3af',
      defaultLinkColor: '#d1d5db',
      titleColor: '#fff',
      secondaryColor: '#7c3aed',
      tertiaryColor: '#6366f1',
      textColor: '#f3f4f6',
      mainBkg: '#4b5563',
      secondBkg: '#6b7280',
      border1: '#9ca3af',
      border2: '#d1d5db',
      arrowheadColor: '#d1d5db',
      note: '#312e81',
      noteBkgColor: '#4c1d95',
      noteBorderColor: '#8b5cf6',
      noteTextColor: '#e0e7ff',
      actorBkg: '#4b5563',
      actorBorder: '#9ca3af',
      actorTextColor: '#f3f4f6',
      actorLineColor: '#d1d5db',
      signalColor: '#d1d5db',
      signalTextColor: '#f3f4f6',
      labelBoxBkgColor: '#374151',
      labelBoxBorderColor: '#9ca3af',
      labelTextColor: '#f3f4f6',
      loopTextColor: '#f3f4f6',
      activationBorderColor: '#9ca3af',
      activationBkgColor: '#4b5563',
      sequenceNumberColor: '#fff',
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      fontSize: '12px'
    } : {
      lineColor: '#374151',
      defaultLinkColor: '#374151',
      fontSize: '12px'
    }
  })

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
/* Mermaid charts (keep styling for mermaid rendering) */
.markdown-container :deep(.mermaid-chart) {
  @apply my-2 p-2 bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700 overflow-x-auto text-xs;
}

.markdown-container :deep(.mermaid-chart svg) {
  @apply max-w-full h-auto mx-auto;
}

/* Ensure mermaid diagrams are visible in dark mode */
.markdown-container :deep(.mermaid-chart svg) {
  background-color: transparent !important;
}

/* Fix text layering issues in mermaid diagrams */
.markdown-container :deep(.mermaid-chart svg text) {
  paint-order: stroke fill markers;
  stroke: none !important;
  fill: currentColor !important;
  pointer-events: none;
}

.markdown-container :deep(.mermaid-chart svg g.label) {
  isolation: isolate;
}

.markdown-container :deep(.mermaid-chart svg .cluster-label text) {
  font-weight: 600 !important;
  font-size: 14px !important;
  fill: currentColor !important;
  stroke: none !important;
}

.markdown-container :deep(.mermaid-chart svg .nodeLabel) {
  fill: currentColor !important;
  stroke: none !important;
}

.markdown-container :deep(.mermaid-chart svg .edgeLabel) {
  background-color: transparent !important;
}

.markdown-container :deep(.mermaid-chart svg .edgeLabel text) {
  fill: currentColor !important;
  stroke: none !important;
}

/* Improve line visibility with thicker strokes */
.markdown-container :deep(.mermaid-chart svg path.flowchart-link) {
  stroke-width: 2.5px !important;
}

.markdown-container :deep(.mermaid-chart svg line) {
  stroke-width: 2px !important;
}

.markdown-container :deep(.mermaid-chart svg .arrow) {
  stroke-width: 2.5px !important;
}

/* Hover effect for expand button */
.markdown-container :deep(.mermaid-chart .group:hover button) {
  opacity: 1;
}
</style>
