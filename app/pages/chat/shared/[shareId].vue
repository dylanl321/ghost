<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <!-- Header -->
    <div class="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
      <div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between h-16">
          <div class="flex items-center gap-3">
            <UIcon name="i-heroicons-sparkles" class="w-6 h-6 text-purple-600 dark:text-purple-400" />
            <div>
              <h1 class="text-lg font-semibold text-gray-900 dark:text-white">
                {{ threadData?.title || 'Shared Chat Thread' }}
              </h1>
              <p v-if="threadData?.description" class="text-xs text-gray-500 dark:text-gray-400">
                {{ threadData.description }}
              </p>
            </div>
          </div>
          <UButton
            color="gray"
            variant="ghost"
            icon="i-heroicons-arrow-top-right-on-square"
            @click="navigateTo('/')"
          >
            Open GHOST
          </UButton>
        </div>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex items-center justify-center py-20">
      <div class="text-center space-y-4">
        <UIcon name="i-heroicons-arrow-path" class="w-12 h-12 animate-spin text-purple-600 mx-auto" />
        <p class="text-gray-600 dark:text-gray-400">Loading shared conversation...</p>
      </div>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="flex items-center justify-center py-20">
      <div class="text-center space-y-4 max-w-md">
        <UIcon name="i-heroicons-exclamation-triangle" class="w-12 h-12 text-red-500 mx-auto" />
        <div>
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Unable to Load Thread
          </h2>
          <p class="text-gray-600 dark:text-gray-400 mb-6">{{ error }}</p>
          <UButton
            color="purple"
            @click="navigateTo('/')"
          >
            Go to Dashboard
          </UButton>
        </div>
      </div>
    </div>

    <!-- Thread Content -->
    <div v-else-if="threadData" class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <!-- Thread Info -->
      <div class="mb-6 p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
        <div class="flex items-start gap-3">
          <UIcon name="i-heroicons-information-circle" class="w-5 h-5 text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
          <div class="flex-1">
            <h3 class="text-sm font-medium text-purple-900 dark:text-purple-100 mb-1">
              Shared Conversation
            </h3>
            <p class="text-xs text-purple-700 dark:text-purple-300">
              This is a read-only view of a shared chat thread with GHOST AI Assistant.
              <span v-if="threadData.shareExpiresAt">
                This link expires {{ formatExpiryDate(threadData.shareExpiresAt) }}.
              </span>
            </p>
          </div>
        </div>
      </div>

      <!-- Messages -->
      <div class="space-y-6">
        <ChatMessage
          v-for="(msg, index) in threadData.messages"
          :key="msg.messageId || `msg-${index}`"
          :message="msg"
          :view-mode="'fullpage'"
          :read-only="true"
          @copy="copyMessageMarkdown"
        />
      </div>

      <!-- Empty State -->
      <div v-if="!threadData.messages || threadData.messages.length === 0" class="text-center py-12">
        <UIcon name="i-heroicons-chat-bubble-left-right" class="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <p class="text-gray-600 dark:text-gray-400">This thread has no messages yet.</p>
      </div>

      <!-- Footer -->
      <div class="mt-12 pt-8 border-t border-gray-200 dark:border-gray-700">
        <div class="text-center space-y-4">
          <p class="text-sm text-gray-600 dark:text-gray-400">
            Want to have your own conversations with GHOST?
          </p>
          <UButton
            color="purple"
            size="lg"
            icon="i-heroicons-sparkles"
            @click="navigateTo('/chat')"
          >
            Start Chatting with GHOST
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Shared Chat Thread View
 * Public, read-only view of a shared chat thread
 * No authentication required
 */

import type { ChatThread } from '#shared/types/chat-threads'
import mermaid from 'mermaid'

const route = useRoute()
const shareId = route.params.shareId as string

// State
const isLoading = ref(true)
const error = ref<string | null>(null)
const threadData = ref<ChatThread | null>(null)


// Toast notifications
const toast = useToast()

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

// Format expiry date
function formatExpiryDate(expiresAt: string): string {
  const date = new Date(expiresAt)
  const now = new Date()
  const diffTime = date.getTime() - now.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays < 0) {
    return 'soon'
  } else if (diffDays === 0) {
    return 'today'
  } else if (diffDays === 1) {
    return 'tomorrow'
  } else if (diffDays < 7) {
    return `in ${diffDays} days`
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7)
    return `in ${weeks} ${weeks === 1 ? 'week' : 'weeks'}`
  } else {
    return `on ${date.toLocaleDateString()}`
  }
}

// Load shared thread
onMounted(async () => {
  if (!shareId) {
    error.value = 'No share ID provided'
    isLoading.value = false
    return
  }

  // Initialize mermaid
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
      darkMode: true,
      background: '#1f2937',
      primaryColor: '#a855f7',
      primaryTextColor: '#fff',
      primaryBorderColor: '#9333ea',
      lineColor: '#d1d5db',
      edgeLabelBackground: '#374151',
      clusterBkg: '#374151',
      clusterBorder: '#9ca3af',
      defaultLinkColor: '#d1d5db',
      titleColor: '#fff',
      textColor: '#f3f4f6',
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      fontSize: '14px'
    } : {
      lineColor: '#374151',
      defaultLinkColor: '#374151',
      fontSize: '14px'
    }
  })

  try {
    const response = await $fetch<{ success: boolean; data: any }>(`/api/chat/threads/shared/${shareId}`)

    if (!response.success || !response.data) {
      throw new Error('Thread not found or has expired')
    }

    threadData.value = response.data

    // Render mermaid charts after messages load
    await nextTick()
    await renderMermaidCharts()
  } catch (err: any) {
    console.error('Error loading shared thread:', err)
    error.value = err?.data?.message || err?.message || 'This shared link is no longer available or has expired.'
  } finally {
    isLoading.value = false
  }
})

// Render mermaid charts
async function renderMermaidCharts() {
  await nextTick()
  const mermaidElements = document.querySelectorAll('.mermaid-chart')

  for (const element of mermaidElements) {
    if (element.getAttribute('data-rendered') === 'true') continue

    try {
      const code = element.textContent || ''
      const id = element.id
      const { svg } = await mermaid.render(id + '-svg', code)

      element.setAttribute('data-mermaid-code', code)
      element.innerHTML = `<div class="mermaid-svg-container">${svg}</div>`
      element.setAttribute('data-rendered', 'true')
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
        </div>
      `
      element.setAttribute('data-rendered', 'true')
    }
  }
}

// Set page metadata - use public layout for isolated, read-only view
definePageMeta({
  keepalive: false,
  layout: 'public',
  auth: false // No authentication required for shared threads
})

useHead({
  title: () => threadData.value?.title || 'Shared Chat Thread',
  meta: [
    {
      name: 'description',
      content: () => threadData.value?.description || 'View a shared conversation with GHOST AI Assistant'
    }
  ]
})
</script>

<style scoped>
/* Mermaid chart styles */
:deep(.mermaid-chart) {
  @apply my-4 p-4 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-x-auto;
}

:deep(.mermaid-chart svg) {
  @apply max-w-full h-auto mx-auto;
}

/* Ensure mermaid diagrams are visible in dark mode */
:deep(.mermaid-chart svg) {
  background-color: transparent !important;
}

/* Fix text layering issues in mermaid diagrams */
:deep(.mermaid-chart svg text) {
  paint-order: stroke fill markers;
  stroke: none !important;
  fill: currentColor !important;
  pointer-events: none;
}

/* Improve line visibility */
:deep(.mermaid-chart svg path.flowchart-link) {
  stroke-width: 2.5px !important;
}

:deep(.mermaid-chart svg line) {
  stroke-width: 2px !important;
}
</style>
