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
      <!-- Chat Header with Thread Info and Actions -->
      <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <!-- Thread Info -->
        <div class="flex items-center gap-3 min-w-0">
          <UIcon name="i-heroicons-chat-bubble-left-right" class="w-6 h-6 text-purple-500 flex-shrink-0" />
          <div class="min-w-0 flex-1">
            <!-- Editable Title -->
            <div class="flex items-center gap-2 group min-w-0">
              <!-- Edit Mode: Input Field -->
              <input
                v-if="isEditingTitle"
                ref="titleInputRef"
                v-model="editingTitle"
                type="text"
                class="inline-title-input flex-1 min-w-0"
                @keydown.enter="saveTitle"
                @keydown.escape="cancelEdit"
                @blur="saveTitle"
              />

              <!-- View Mode: Title -->
              <h1
                v-else
                class="text-lg font-semibold text-gray-900 dark:text-white truncate cursor-text hover:text-purple-600 dark:hover:text-purple-400 transition-colors flex-1 min-w-0"
                @click="startEditingTitle"
              >
                {{ currentThreadTitle }}
              </h1>

              <!-- Edit Icon -->
              <button
                v-if="threadsStore.currentThread && !isEditingTitle"
                @click="startEditingTitle"
                class="flex items-center justify-center p-1 rounded text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all opacity-0 group-hover:opacity-100 flex-shrink-0"
                title="Rename thread"
              >
                <UIcon name="i-heroicons-pencil" class="w-4 h-4" />
              </button>

              <!-- Save/Cancel icons when editing -->
              <div v-if="isEditingTitle" class="flex items-center gap-1 flex-shrink-0">
                <button
                  @mousedown.prevent
                  @click="saveTitle"
                  class="flex items-center justify-center p-1 rounded text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20 transition-all"
                  title="Save (Enter)"
                >
                  <UIcon name="i-heroicons-check" class="w-4 h-4" />
                </button>
                <button
                  @mousedown.prevent
                  @click="cancelEdit"
                  class="flex items-center justify-center p-1 rounded text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                  title="Cancel (Esc)"
                >
                  <UIcon name="i-heroicons-x-mark" class="w-4 h-4" />
                </button>
              </div>
            </div>

            <div class="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
              <span>{{ currentThreadInfo }}</span>
              <span class="text-gray-400">•</span>
              <UBadge color="green" variant="subtle" size="xs">
                <div class="flex items-center gap-1">
                  <div class="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                  <span>Connected</span>
                </div>
              </UBadge>
            </div>
          </div>
        </div>

        <!-- Thread Actions -->
        <div class="flex items-center gap-1 flex-shrink-0">
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
            icon="i-heroicons-trash"
            variant="ghost"
            color="gray"
            size="sm"
            title="Clear messages"
            @click="showClearConfirm = true"
          />
        </div>
      </div>

      <!-- Chat Component -->
      <div class="flex-1 min-h-0">
        <ClientOnly>
          <GhostChatFullPage
            @message-sent="handleMessageSent"
          />
        </ClientOnly>
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
import { useChatUI } from '~/composables/useChatUI'

// Stores
const siteConfigStore = useSiteConfigStore()
const threadsStore = useChatThreadsStore()
const toast = useToast()

// Chat UI composable - used to properly handle thread creation with callback cleanup
const chatUI = useChatUI({ viewMode: 'fullpage' })

// Check if Strands chat is enabled
const strandsEnabled = computed(() => siteConfigStore.isStrandsChatEnabled)

// Modal states
const showShareModal = ref(false)
const showExportModal = ref(false)
const showClearConfirm = ref(false)
const shareThreadId = ref<string | null>(null)
const exportThreadId = ref<string | null>(null)

// Inline title editing state
const isEditingTitle = ref(false)
const editingTitle = ref('')
const titleInputRef = ref<HTMLInputElement | null>(null)

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
  // Note: If no active thread, one will be auto-created when the user sends their first message
})

// Handle thread selection - use chatUI to properly handle callback registration for active jobs
async function handleThreadSelected(threadId: string) {
  await chatUI.switchThread(threadId)
}

// Handle new thread - use chatUI to properly cleanup polling callbacks and reset UI state
async function handleNewThread() {
  await chatUI.createNewThread()
  toast.add({
    title: 'New conversation started',
    color: 'green'
  })
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
      color: 'red',
      timeout: 0
    })
  }

  showClearConfirm.value = false
}

// Handle message sent (save to thread)
async function handleMessageSent(message: any) {
  // This will be called when a message is sent from GhostChatFullPage
  // Messages should already be saved via the store
}

// Inline title editing functions
function startEditingTitle() {
  if (!threadsStore.currentThread) return

  editingTitle.value = threadsStore.currentThread.title
  isEditingTitle.value = true

  // Focus the input after it's rendered
  nextTick(() => {
    if (titleInputRef.value) {
      titleInputRef.value.focus()
      titleInputRef.value.select()
    }
  })
}

async function saveTitle() {
  if (!threadsStore.activeThreadId || !editingTitle.value.trim()) {
    cancelEdit()
    return
  }

  // Don't save if unchanged
  if (editingTitle.value.trim() === threadsStore.currentThread?.title) {
    isEditingTitle.value = false
    return
  }

  const success = await threadsStore.updateThread(threadsStore.activeThreadId, {
    title: editingTitle.value.trim()
  })

  if (success) {
    toast.add({
      title: 'Thread renamed',
      color: 'green',
      timeout: 2000
    })
  } else {
    toast.add({
      title: 'Failed to rename thread',
      color: 'red',
      timeout: 0
    })
  }

  isEditingTitle.value = false
}

function cancelEdit() {
  isEditingTitle.value = false
  editingTitle.value = ''
}

// Keyboard shortcuts
defineShortcuts({
  c: {
    handler: () => handleNewThread(),
    usingInput: false
  }
})

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

.inline-title-input {
  @apply text-lg font-semibold text-gray-900 dark:text-white bg-transparent border-none outline-none focus:outline-none px-0 py-0;
  @apply border-b-2 border-purple-500 dark:border-purple-400;
  min-width: 0;
}

.inline-title-input:focus {
  @apply ring-0;
}
</style>

