<template>
  <!-- Feature Disabled Notice -->
  <div v-if="!strandsEnabled" class="disabled-notice">
    <UCard>
      <div class="p-8 text-center">
        <UIcon name="i-heroicons-no-symbol" class="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          GHOST Chat is Currently Disabled
        </h2>
        <p class="text-gray-600 dark:text-gray-400 mb-6">
          This feature has been temporarily disabled by an administrator.
          Please check back later or contact support if you need access.
        </p>
        <UButton
          icon="i-heroicons-home"
          label="Return to Dashboard"
          @click="navigateTo('/')"
        />
      </div>
    </UCard>
  </div>

  <!-- Full-Page Chat with Thread Management (when enabled) -->
  <div v-else class="flex h-full overflow-hidden">
    <!-- Thread List Sidebar -->
    <ThreadListSidebar
      @thread-selected="handleThreadSelected"
      @new-thread="handleNewThread"
      @share-thread="handleShareThread"
      @export-thread="handleExportThread"
    />

    <!-- Main Chat Area -->
    <div class="flex-1 flex flex-col min-w-0">
      <!-- Chat Header with Actions -->
      <div class="chat-header-enhanced">
        <div class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700">
          <div class="flex items-center gap-3">
            <UIcon name="i-heroicons-chat-bubble-left-right" class="w-6 h-6 text-purple-500" />
            <div>
              <h1 class="text-xl font-bold text-gray-900 dark:text-white">
                {{ currentThreadTitle }}
              </h1>
              <p class="text-xs text-gray-600 dark:text-gray-400">
                {{ currentThreadInfo }}
              </p>
            </div>
          </div>

          <!-- Thread Actions -->
          <div class="flex items-center gap-2">
            <UButton
              v-if="threadsStore.currentThread"
              icon="i-heroicons-trash"
              variant="ghost"
              color="gray"
              size="sm"
              title="Clear messages"
              @click="showClearConfirm = true"
            />
            <UButton
              v-if="threadsStore.currentThread"
              icon="i-heroicons-share"
              variant="ghost"
              color="gray"
              size="sm"
              title="Share conversation"
              @click="handleShareCurrentThread"
            />
            <UButton
              v-if="threadsStore.currentThread"
              icon="i-heroicons-arrow-down-tray"
              variant="ghost"
              color="gray"
              size="sm"
              title="Export conversation"
              @click="handleExportCurrentThread"
            />
            <UButton
              icon="i-heroicons-plus"
              color="purple"
              size="sm"
              label="New"
              @click="handleNewThread"
            />
          </div>
        </div>
      </div>

      <!-- Chat Component -->
      <div class="flex-1 min-h-0">
        <GhostChatFullPage
          :key="threadsStore.activeThreadId"
          @message-sent="handleMessageSent"
        />
      </div>
    </div>

    <!-- Share Modal -->
    <ChatShareModal
      v-model="showShareModal"
      :thread-id="shareThreadId"
      @close="showShareModal = false"
      @unshared="handleThreadUnshared"
    />

    <!-- Export Modal -->
    <ChatExportModal
      v-model="showExportModal"
      :thread-id="exportThreadId"
      @close="showExportModal = false"
    />

    <!-- Clear Confirmation Modal -->
    <UModal v-model="showClearConfirm" :ui="{ width: 'max-w-md' }">
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-exclamation-triangle" class="w-5 h-5 text-yellow-500" />
            <h3 class="text-lg font-semibold">Clear conversation?</h3>
          </div>
        </template>

        <p class="text-gray-600 dark:text-gray-400">
          This will remove all messages from the current thread. The thread itself will remain in your history.
        </p>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" color="gray" @click="showClearConfirm = false">
              Cancel
            </UButton>
            <UButton color="red" @click="confirmClearThread">
              Clear Messages
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { useChatThreadsStore } from '~/stores/useChatThreadsStore'
import { useSiteConfigStore } from '~/stores/useSiteConfigStore'

// Stores
const siteConfigStore = useSiteConfigStore()
const threadsStore = useChatThreadsStore()
const toast = useToast()

// Check if Strands chat is enabled
const strandsEnabled = computed(() => siteConfigStore.isStrandsChatEnabled)

// Modal states
const showShareModal = ref(false)
const showExportModal = ref(false)
const showClearConfirm = ref(false)
const shareThreadId = ref<string | null>(null)
const exportThreadId = ref<string | null>(null)

// Current thread computed properties
const currentThreadTitle = computed(() => {
  return threadsStore.currentThread?.title || 'New Conversation'
})

const currentThreadInfo = computed(() => {
  if (!threadsStore.currentThread) {
    return 'Start a conversation with GHOST AI Assistant'
  }
  const count = threadsStore.currentThread.messageCount
  const date = new Date(threadsStore.currentThread.createdAt).toLocaleDateString()
  return `${count} message${count !== 1 ? 's' : ''} • Created ${date}`
})

// Initialize on mount
onMounted(async () => {
  await threadsStore.fetchThreads()

  // Load active thread if exists
  if (threadsStore.activeThreadId) {
    await threadsStore.loadThread(threadsStore.activeThreadId)
  }
})

// Handle thread selection
async function handleThreadSelected(threadId: string) {
  await threadsStore.loadThread(threadId)
}

// Handle new thread
async function handleNewThread() {
  const thread = await threadsStore.createThread()
  if (thread) {
    toast.add({
      title: 'New conversation started',
      color: 'green'
    })
  }
}

// Handle share thread (from sidebar)
function handleShareThread(threadId: string) {
  shareThreadId.value = threadId
  showShareModal.value = true
}

// Handle share current thread (from header)
function handleShareCurrentThread() {
  if (threadsStore.activeThreadId) {
    shareThreadId.value = threadsStore.activeThreadId
    showShareModal.value = true
  }
}

// Handle export thread (from sidebar)
function handleExportThread(threadId: string) {
  exportThreadId.value = threadId
  showExportModal.value = true
}

// Handle export current thread (from header)
function handleExportCurrentThread() {
  if (threadsStore.activeThreadId) {
    exportThreadId.value = threadsStore.activeThreadId
    showExportModal.value = true
  }
}

// Handle thread unshared
function handleThreadUnshared() {
  toast.add({
    title: 'Sharing removed',
    description: 'The share link has been disabled',
    color: 'green'
  })
}

// Handle clear thread
async function confirmClearThread() {
  if (!threadsStore.activeThreadId) return

  const success = await threadsStore.clearThread(threadsStore.activeThreadId)

  if (success) {
    toast.add({
      title: 'Conversation cleared',
      color: 'green'
    })
  } else {
    toast.add({
      title: 'Failed to clear conversation',
      color: 'red'
    })
  }

  showClearConfirm.value = false
}

// Handle message sent (save to thread)
async function handleMessageSent(message: any) {
  // This will be called when a message is sent from GhostChatFullPage
  // Messages should already be saved via the store
}

// Page metadata
definePageMeta({
  title: 'GHOST Chat',
  description: 'AI-powered assistant for AWS operations - ask questions about costs, configurations, security, and more'
})
</script>

<style scoped>
.disabled-notice {
  @apply flex items-center justify-center p-6;
}
</style>

