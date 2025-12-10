<template>
  <div class="ghost-chat-container">
    <!-- Chat Messages Area -->
    <div class="chat-messages" ref="chatBoxRef">
      <ChatMessage
        v-for="(msg, index) in messages"
        :key="msg.messageId || `msg-${index}`"
        :message="msg"
        :view-mode="'fullpage'"
        @retry="retryLastMessage"
        @cancel="cancelQuery"
        @copy="copyMessageMarkdown"
        @prompt-click="handlePromptClick"
        @enriched-click="handleEnrichedClick"
      />

      <!-- Example Questions (when welcome is shown) -->
      <div v-if="showWelcome" class="example-questions">
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

      <!--
        NOTE: Loading indicators are now shown ONLY inside ChatMessage component
        when a message has status.status === 'pending' or 'streaming'.
        The showLoader fallback is removed to prevent duplicate indicators.
      -->
    </div>

    <!-- Chat Input Area -->
    <div class="chat-input-container">
      <form @submit.prevent="handleSubmit" class="input-form">
        <div class="input-wrapper">
          <!-- Account Mention Dropdown -->
          <div
            v-if="showMentionDropdown"
            class="mention-dropdown"
            ref="mentionDropdownRef"
          >
            <div
              v-for="(account, index) in filteredAccounts"
              :key="account.accountId"
              :class="['mention-item', { 'mention-item-selected': index === selectedMentionIndex }]"
              @click="handleMentionClick(account)"
              @mouseenter="setMentionIndex(index)"
            >
              <UIcon name="i-heroicons-building-library" class="w-4 h-4 text-blue-500 flex-shrink-0" />
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {{ getAccountDisplay(account) }}
                </div>
                <div class="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {{ getAccountSubtitle(account) }}
                </div>
              </div>
            </div>
            <div v-if="filteredAccounts.length === 0" class="mention-empty">
              No accounts found
            </div>
          </div>

          <input
            v-model="inputValue"
            type="text"
            :disabled="isLoading"
            placeholder="Ask about AWS costs, configurations, security... (use @ to mention accounts)"
            ref="inputRef"
            class="chat-input"
            @input="handleInputUpdate"
            @keydown="handleKeyDown"
          />
          <button type="submit" :disabled="isLoading || !inputValue.trim()" class="send-button">
            <UIcon name="i-heroicons-paper-airplane" class="w-5 h-5" />
          </button>
        </div>
        <p class="input-hint">
          Tip: Use <kbd class="kbd">@</kbd> to mention accounts or type "help" for examples.
          <span v-if="selectedAccountForMessage" class="ml-2 inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-xs">
            <UIcon name="i-heroicons-building-library" class="w-3 h-3" />
            Context: {{ getAccountDisplay(selectedAccountForMessage) }}
          </span>
        </p>
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

    <!-- Mermaid Fullscreen Modal -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition-opacity duration-200"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition-opacity duration-150"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div
          v-if="fullscreenMermaid"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          @click="closeMermaidFullscreen"
        >
          <div
            class="relative w-[95vw] h-[95vh] bg-white dark:bg-gray-900 rounded-xl shadow-2xl overflow-hidden flex flex-col"
            @click.stop
          >
            <!-- Header -->
            <div class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
              <div class="flex items-center gap-3">
                <UIcon name="i-heroicons-chart-bar" class="w-5 h-5 text-purple-600 dark:text-purple-400" />
                <h3 class="text-sm font-semibold text-gray-900 dark:text-white">Diagram Viewer</h3>
                <span class="text-xs text-gray-500 dark:text-gray-400">{{ Math.round(mermaidZoom * 100) }}%</span>
              </div>
              <div class="flex items-center gap-2">
                <!-- Zoom controls -->
                <div class="flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded-lg">
                  <button
                    @click="zoomOut"
                    class="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                    title="Zoom out"
                  >
                    <UIcon name="i-heroicons-minus" class="w-4 h-4 text-gray-700 dark:text-gray-300" />
                  </button>
                  <button
                    @click="resetZoom"
                    class="px-2 py-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors text-xs text-gray-700 dark:text-gray-300"
                    title="Reset zoom"
                  >
                    Reset
                  </button>
                  <button
                    @click="zoomIn"
                    class="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                    title="Zoom in"
                  >
                    <UIcon name="i-heroicons-plus" class="w-4 h-4 text-gray-700 dark:text-gray-300" />
                  </button>
                </div>
                <button
                  @click="copyToClipboard(fullscreenMermaid.code)"
                  class="px-3 py-1.5 text-xs rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 transition-colors flex items-center gap-1.5"
                  title="Copy diagram code"
                >
                  <UIcon name="i-heroicons-clipboard-document" class="w-3.5 h-3.5" />
                  Copy Code
                </button>
                <button
                  @click="closeMermaidFullscreen"
                  class="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  title="Close fullscreen"
                >
                  <UIcon name="i-heroicons-x-mark" class="w-5 h-5 text-gray-700 dark:text-gray-300" />
                </button>
              </div>
            </div>

            <!-- Diagram Content with Pan/Zoom -->
            <div
              class="flex-1 overflow-hidden bg-gray-50 dark:bg-gray-900 relative"
              @mousedown="startPan"
              @mousemove="doPan"
              @mouseup="endPan"
              @mouseleave="endPan"
              @wheel="handleWheel"
              :style="{ cursor: isPanning ? 'grabbing' : 'grab' }"
            >
              <div class="absolute inset-0 flex items-center justify-center">
                <div
                  class="mermaid-fullscreen-content transition-transform"
                  :style="{
                    transform: `translate(${mermaidPan.x}px, ${mermaidPan.y}px) scale(${mermaidZoom})`,
                    transformOrigin: 'center center'
                  }"
                  v-html="fullscreenMermaid.svg"
                ></div>
              </div>

              <!-- Instructions overlay -->
              <div class="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded-lg text-xs backdrop-blur-sm">
                <div class="flex items-center gap-4">
                  <span>🖱️ Drag to pan</span>
                  <span>🔍 Scroll to zoom</span>
                  <span>⌨️ ESC to close</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
/**
 * GhostChatFullPage - Full-page chat interface
 * Uses unified useChatUI composable for all logic
 */

import mermaid from 'mermaid'

// Get unified chat logic
const {
  // Core state
  messages,
  chatState,
  inputValue,
  showWelcome,
  isLoading,
  showLoader,
  scrollTrigger,
  
  // Polling state
  pollingProgress,
  pollingPercent,
  pollingToolsCalled,
  
  // Actions
  sendMessage,
  retryLastMessage,
  cancelQuery,

  // Mention system
  showMentionDropdown,
  filteredAccounts,
  selectedAccountForMessage,
  selectedMentionIndex,
  handleMentionInput,
  selectAccount,
  navigateMentions,
  selectHighlightedAccount,
  closeMentionDropdown,
  getAccountDisplay,
  getAccountSubtitle,
  setMentionIndex,
  
  // Disambiguation
  showDisambiguation,
  disambiguationData,
  handleAccountSelected,
  cancelDisambiguation,
  
  // Session
  sessionId,
  
  // Initialize
  initialize
} = useChatUI({ viewMode: 'fullpage' })

// Entity enrichment for click handling only
const { handleEnrichedClick } = useStrandsResponseEnricher()

// Get user's favorite and recent accounts for personalized prompts
const { favorites } = useFavoriteAccounts()
const { recentAccounts } = useRecentAccounts()

// Local UI refs
const chatBoxRef = ref<HTMLDivElement | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)
const mentionDropdownRef = ref<HTMLDivElement | null>(null)

// Default prompts
const defaultPrompts = [
  "What are the AWS costs for this month?",
  "Show me security findings from Security Hub",
  "List all EC2 instances across accounts",
  "What are the top cost drivers this month?",
  "Show me recent CloudTrail events",
]

// Personalized example questions
const exampleQuestionsList = computed(() => {
  const prompts: string[] = []
  const userAccounts = favorites.value.length > 0 ? favorites.value : recentAccounts.value

  if (userAccounts.length === 0) {
    return defaultPrompts
  }

  const account1 = userAccounts[0]
  const account2 = userAccounts[1]
  const account3 = userAccounts[2]

  if (account1) {
    prompts.push(`What are the AWS costs for ${account1.projectName || account1.accountId} this month?`)
    prompts.push(`Show me security findings from Security Hub for ${account1.projectName || account1.accountId}`)
  }

  if (account2) {
    prompts.push(`List EC2 instances in ${account2.projectName || account2.accountId}`)
  } else if (account1) {
    prompts.push(`List EC2 instances in ${account1.projectName || account1.accountId}`)
  }

  if (account3 || account2 || account1) {
    const account = account3 || account2 || account1
    prompts.push(`Analyze costs by service for ${account.projectName || account.accountId}`)
  }

  if (account1) {
    prompts.push(`What S3 buckets exist in ${account1.projectName || account1.accountId}?`)
  }

  while (prompts.length < 5) {
    prompts.push(defaultPrompts[prompts.length])
  }

  return prompts
})

// Copy message markdown to clipboard
const toast = useToast()
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

// Handle input updates for @ mention detection
function handleInputUpdate(event: Event) {
  const target = event.target as HTMLInputElement
  const cursorPosition = target.selectionStart || 0
  handleMentionInput(inputValue.value, cursorPosition)
}

// Handle keyboard events for mention navigation
function handleKeyDown(event: KeyboardEvent) {
  if (!showMentionDropdown.value) return

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    navigateMentions('down')
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    navigateMentions('up')
  } else if (event.key === 'Enter' && showMentionDropdown.value) {
    event.preventDefault()
    selectHighlightedAccount()
    nextTick(() => {
      if (inputRef.value) {
        inputRef.value.focus()
        inputRef.value.setSelectionRange(inputValue.value.length, inputValue.value.length)
      }
    })
  } else if (event.key === 'Escape') {
    closeMentionDropdown()
  }
}

// Handle mention click
function handleMentionClick(account: any) {
  selectAccount(account)
  nextTick(() => {
    if (inputRef.value) {
      inputRef.value.focus()
      inputRef.value.setSelectionRange(inputValue.value.length, inputValue.value.length)
    }
  })
}

// Handle form submission
async function handleSubmit(e: Event) {
  e.preventDefault()
  if (!inputValue.value.trim()) return

  if (inputValue.value.trim().toLowerCase() === "help") {
    // Show examples - the welcome computed will handle this based on messages
    inputValue.value = ''
    return
  }

  await sendMessage()
}

// Handle example question clicks
async function handleExampleClick(message: string) {
  console.log('[GhostChatFullPage] Example clicked:', message)
  // Set the input value so sendMessage can use it
  inputValue.value = message
  await sendMessage()
}

// Handle suggested prompt clicks
async function handlePromptClick(promptText: string) {
  console.log('[GhostChatFullPage] Prompt clicked:', promptText)
  // Set the input value so sendMessage can use it
  inputValue.value = promptText
  await sendMessage()
}

// Auto scroll when messages change
watch(scrollTrigger, () => {
  nextTick(() => {
    if (chatBoxRef.value) {
      chatBoxRef.value.scrollTo({
        top: chatBoxRef.value.scrollHeight,
        behavior: 'smooth'
      })
    }
  })
})

// Also scroll on messages change and render mermaid charts
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

      // Store the original code as a data attribute for fullscreen
      element.setAttribute('data-mermaid-code', code)

      // Create wrapper with fullscreen button
      element.innerHTML = `
        <div class="relative group">
          <div class="mermaid-svg-container">${svg}</div>
          <button
            class="absolute top-2 right-2 p-2 bg-white dark:bg-gray-800 rounded-lg shadow-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-50 dark:hover:bg-gray-700 z-10"
            onclick="this.closest('.mermaid-chart').dispatchEvent(new CustomEvent('mermaid-fullscreen', { bubbles: true }))"
            title="View fullscreen"
          >
            <svg class="w-4 h-4 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"></path>
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
      const code = element.textContent || ''
      element.innerHTML = `
        <div class="p-3 bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800">
          <div class="flex items-center gap-2 mb-2">
            <span class="text-xs font-medium text-red-700 dark:text-red-300">
              Unable to render chart
            </span>
          </div>
          <details class="text-xs text-gray-600 dark:text-gray-400">
            <summary class="cursor-pointer hover:text-gray-900 dark:hover:text-gray-200">
              Show diagram code
            </summary>
            <pre class="mt-2 p-2 bg-gray-900 text-gray-100 rounded overflow-x-auto text-[10px]"><code>${code}</code></pre>
          </details>
        </div>
      `
      element.setAttribute('data-rendered', 'true')
    }
  }

  // Auto scroll
  if (chatBoxRef.value) {
    chatBoxRef.value.scrollTo({
      top: chatBoxRef.value.scrollHeight,
      behavior: 'smooth'
    })
  }
}, { deep: true })

// Refocus input after loading completes
watch(isLoading, (newLoading) => {
  if (!newLoading && inputRef.value) {
    inputRef.value.focus()
  }
})

// Mermaid fullscreen state
const fullscreenMermaid = ref<{ svg: string; code: string } | null>(null)
const mermaidZoom = ref(1)
const mermaidPan = ref({ x: 0, y: 0 })
const isPanning = ref(false)
const panStart = ref({ x: 0, y: 0 })

function openMermaidFullscreen(svg: string, code: string) {
  fullscreenMermaid.value = { svg, code }
  mermaidZoom.value = 1
  mermaidPan.value = { x: 0, y: 0 }
}

function closeMermaidFullscreen() {
  fullscreenMermaid.value = null
  mermaidZoom.value = 1
  mermaidPan.value = { x: 0, y: 0 }
}

function zoomIn() {
  mermaidZoom.value = Math.min(mermaidZoom.value + 0.2, 3)
}

function zoomOut() {
  mermaidZoom.value = Math.max(mermaidZoom.value - 0.2, 0.5)
}

function resetZoom() {
  mermaidZoom.value = 1
  mermaidPan.value = { x: 0, y: 0 }
}

function startPan(e: MouseEvent) {
  isPanning.value = true
  panStart.value = { x: e.clientX - mermaidPan.value.x, y: e.clientY - mermaidPan.value.y }
}

function doPan(e: MouseEvent) {
  if (!isPanning.value) return
  mermaidPan.value = {
    x: e.clientX - panStart.value.x,
    y: e.clientY - panStart.value.y
  }
}

function endPan() {
  isPanning.value = false
}

function handleWheel(e: WheelEvent) {
  e.preventDefault()
  const delta = e.deltaY > 0 ? -0.1 : 0.1
  mermaidZoom.value = Math.max(0.5, Math.min(3, mermaidZoom.value + delta))
}

// Copy to clipboard helper
async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.add({
      title: 'Copied to clipboard',
      description: 'Diagram code copied',
      icon: 'i-heroicons-clipboard-document-check',
      color: 'green',
      timeout: 2000
    })
  } catch (err) {
    console.error('Failed to copy:', err)
    toast.add({
      title: 'Copy failed',
      icon: 'i-heroicons-exclamation-triangle',
      color: 'red',
      timeout: 2000
    })
  }
}

// Initialize on mount
onMounted(async () => {
  await initialize()

  // Initialize mermaid with dark mode support
  // Detect if user prefers dark mode
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
      lineColor: '#d1d5db', // gray-300 (was gray-500)
      edgeLabelBackground: '#374151',
      clusterBkg: '#374151',
      clusterBorder: '#9ca3af',
      defaultLinkColor: '#d1d5db', // gray-300 for all connection lines
      titleColor: '#fff',
      // Shape colors
      secondaryColor: '#7c3aed', // purple-600
      tertiaryColor: '#6366f1', // indigo-500
      textColor: '#f3f4f6', // gray-100 for better text visibility
      mainBkg: '#4b5563', // gray-600
      secondBkg: '#6b7280', // gray-500
      border1: '#9ca3af', // gray-400
      border2: '#d1d5db', // gray-300
      arrowheadColor: '#d1d5db', // gray-300
      // Notes and special elements
      note: '#312e81',
      noteBkgColor: '#4c1d95',
      noteBorderColor: '#8b5cf6', // purple-500
      noteTextColor: '#e0e7ff',
      // Actor/participant colors (for sequence diagrams)
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
      // Font
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      fontSize: '14px'
    } : {
      // Light mode - also improve line visibility
      lineColor: '#374151', // gray-700
      defaultLinkColor: '#374151',
      fontSize: '14px'
    }
  })

  // Add event listener for mermaid fullscreen
  document.addEventListener('mermaid-fullscreen', (e: Event) => {
    const target = e.target as HTMLElement
    const code = target.getAttribute('data-mermaid-code')
    const svgContainer = target.querySelector('.mermaid-svg-container')
    if (code && svgContainer) {
      openMermaidFullscreen(svgContainer.innerHTML, code)
    }
  })

  // Add ESC key handler for closing fullscreen
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape' && fullscreenMermaid.value) {
      closeMermaidFullscreen()
    }
  })

  if (inputRef.value) {
    inputRef.value.focus()
  }
})
</script>

<style scoped>
.ghost-chat-container {
  @apply flex flex-col h-full bg-white dark:bg-gray-900;
}

.chat-messages {
  @apply flex-1 overflow-y-auto p-6 space-y-6 max-w-[1400px] mx-auto w-full min-h-0;
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

/* Mermaid charts (keep styling for mermaid rendering) */
.markdown-container :deep(.mermaid-chart) {
  @apply my-4 p-4 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-x-auto;
}

.markdown-container :deep(.mermaid-chart svg) {
  @apply max-w-full h-auto mx-auto;
}

/* Mermaid fullscreen viewer */
.mermaid-fullscreen-content :deep(svg) {
  @apply w-full h-auto;
  min-width: 800px; /* Ensure diagrams are large enough */
  max-width: none; /* Allow full width scaling */
}

/* Ensure mermaid diagrams are visible in dark mode */
.markdown-container :deep(.mermaid-chart svg),
.mermaid-fullscreen-content :deep(svg) {
  /* Override any inline styles that might conflict with dark mode */
  background-color: transparent !important;
}

/* Fix text layering issues in mermaid diagrams */
.markdown-container :deep(.mermaid-chart svg text),
.mermaid-fullscreen-content :deep(svg text) {
  /* Force text to render on top with paint-order */
  paint-order: stroke fill markers;
  stroke: none !important;
  fill: currentColor !important;
  pointer-events: none;
}

/* Ensure all text groups are rendered last */
.markdown-container :deep(.mermaid-chart svg g.label),
.mermaid-fullscreen-content :deep(svg g.label) {
  /* Move to front by re-appending (done via JS) */
  isolation: isolate;
}

/* Subgraph titles and labels */
.markdown-container :deep(.mermaid-chart svg .cluster-label text),
.mermaid-fullscreen-content :deep(svg .cluster-label text) {
  font-weight: 600 !important;
  font-size: 16px !important;
  fill: currentColor !important;
  stroke: none !important;
}

/* Node labels */
.markdown-container :deep(.mermaid-chart svg .nodeLabel),
.mermaid-fullscreen-content :deep(svg .nodeLabel) {
  fill: currentColor !important;
  stroke: none !important;
}

/* Edge labels */
.markdown-container :deep(.mermaid-chart svg .edgeLabel),
.mermaid-fullscreen-content :deep(svg .edgeLabel) {
  background-color: transparent !important;
}

.markdown-container :deep(.mermaid-chart svg .edgeLabel text),
.mermaid-fullscreen-content :deep(svg .edgeLabel text) {
  fill: currentColor !important;
  stroke: none !important;
}

/* Improve line visibility with thicker strokes */
.markdown-container :deep(.mermaid-chart svg path.flowchart-link),
.mermaid-fullscreen-content :deep(svg path.flowchart-link) {
  stroke-width: 2.5px !important; /* Thicker connection lines */
}

.markdown-container :deep(.mermaid-chart svg line),
.mermaid-fullscreen-content :deep(svg line) {
  stroke-width: 2px !important; /* Thicker lines */
}

.markdown-container :deep(.mermaid-chart svg .arrow),
.mermaid-fullscreen-content :deep(svg .arrow) {
  stroke-width: 2.5px !important; /* Thicker arrows */
}

/* Hover effect for fullscreen button container */
.markdown-container :deep(.mermaid-chart .group:hover button) {
  opacity: 1;
}

.chat-input-container {
  @apply flex-shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4;
}

.input-form {
  @apply max-w-[1400px] mx-auto;
}

.input-wrapper {
  @apply flex gap-3 items-center relative;
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

.kbd {
  @apply inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-mono bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded border border-gray-300 dark:border-gray-600;
}

/* Mention Dropdown Styles */
.mention-dropdown {
  @apply absolute bottom-full left-0 right-0 mb-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-64 overflow-y-auto z-50;
}

.mention-item {
  @apply flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border-b border-gray-200 dark:border-gray-700 last:border-b-0;
}

.mention-item-selected {
  @apply bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/30;
}

.mention-empty {
  @apply px-4 py-3 text-sm text-gray-500 dark:text-gray-400 text-center;
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
  @apply mb-3 pb-2 border-b border-gray-200 dark:border-gray-700;
}

.cursor-blink {
  @apply inline-block ml-1 text-purple-600 dark:text-purple-400 animate-pulse font-bold;
}

.error-status {
  @apply flex items-center gap-2 mt-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg;
}
</style>
