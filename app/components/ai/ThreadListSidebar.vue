<template>
  <div class="thread-list-sidebar flex flex-col h-full bg-white dark:bg-slate-800 border-r border-gray-200 dark:border-slate-700">
    <!-- Sidebar Header -->
    <div class="p-4 border-b border-gray-200 dark:border-slate-700">
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <UIcon name="i-heroicons-chat-bubble-left-right" class="w-5 h-5 text-purple-500" />
          Conversations
        </h2>
        <div class="flex items-center gap-2">
          <UButton
            v-if="!selectionMode"
            icon="i-heroicons-check-circle"
            variant="ghost"
            color="gray"
            size="sm"
            title="Select multiple"
            @click="enterSelectionMode"
          />
          <UButton
            v-if="!selectionMode"
            icon="i-heroicons-plus"
            color="purple"
            size="sm"
            label="New"
            @click="handleNewThread"
          />
        </div>
      </div>

      <!-- Selection Mode Actions -->
      <div v-if="selectionMode" class="mb-3 flex items-center justify-between gap-2 p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
        <span class="text-sm text-purple-900 dark:text-purple-100 font-medium">
          {{ selectedThreadIds.size }} selected
        </span>
        <div class="flex items-center gap-2">
          <UButton
            icon="i-heroicons-trash"
            color="red"
            size="xs"
            :disabled="selectedThreadIds.size === 0"
            @click="handleBulkDelete"
          >
            Delete
          </UButton>
          <UButton
            icon="i-heroicons-x-mark"
            variant="ghost"
            color="gray"
            size="xs"
            @click="exitSelectionMode"
          >
            Cancel
          </UButton>
        </div>
      </div>

      <!-- Search Bar -->
      <UInput
        v-model="searchQuery"
        placeholder="Search threads..."
        icon="i-heroicons-magnifying-glass"
        size="sm"
        @input="handleSearch"
      />

      <!-- Filter Buttons -->
      <div class="flex gap-2 mt-3">
        <UButton
          :variant="activeFilter === 'all' ? 'solid' : 'ghost'"
          :color="activeFilter === 'all' ? 'purple' : 'gray'"
          size="xs"
          @click="setFilter('all')"
        >
          All
        </UButton>
        <UButton
          :variant="activeFilter === 'pinned' ? 'solid' : 'ghost'"
          :color="activeFilter === 'pinned' ? 'purple' : 'gray'"
          size="xs"
          @click="setFilter('pinned')"
        >
          Pinned
        </UButton>
        <UButton
          :variant="activeFilter === 'archived' ? 'solid' : 'ghost'"
          :color="activeFilter === 'archived' ? 'purple' : 'gray'"
          size="xs"
          @click="setFilter('archived')"
        >
          Archived
        </UButton>
      </div>
    </div>

    <!-- Thread List -->
    <div class="flex-1 overflow-y-auto p-3 space-y-2">
      <!-- Loading State -->
      <div v-if="threadsStore.loading && threadsStore.threads.length === 0" class="flex items-center justify-center p-8">
        <div class="flex flex-col items-center gap-3">
          <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 text-purple-500 animate-spin" />
          <p class="text-sm text-gray-500 dark:text-gray-400">Loading threads...</p>
        </div>
      </div>

      <!-- Empty State -->
      <div v-else-if="filteredThreads.length === 0" class="flex items-center justify-center p-8">
        <div class="text-center">
          <UIcon name="i-heroicons-chat-bubble-left-right" class="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <h3 class="text-sm font-medium text-gray-900 dark:text-white mb-1">
            {{ emptyStateTitle }}
          </h3>
          <p class="text-xs text-gray-500 dark:text-gray-400">
            {{ emptyStateMessage }}
          </p>
        </div>
      </div>

      <!-- Pinned Threads Section -->
      <template v-else>
        <div v-if="pinnedThreads.length > 0 && activeFilter !== 'archived'" class="mb-4">
          <div class="flex items-center gap-2 px-2 py-1 mb-2">
            <UIcon name="i-heroicons-bookmark-solid" class="w-3 h-3 text-yellow-500" />
            <span class="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
              Pinned
            </span>
          </div>
          <div class="space-y-1">
            <ThreadListItem
              v-for="thread in pinnedThreads"
              :key="thread.threadId"
              :thread="thread"
              :active="thread.threadId === threadsStore.activeThreadId"
              :selection-mode="selectionMode"
              :selected="selectedThreadIds.has(thread.threadId)"
              @select="selectThread(thread.threadId)"
              @toggle-selection="toggleThreadSelection(thread.threadId)"
              @pin="handlePin(thread.threadId, false)"
              @unpin="handlePin(thread.threadId, false)"
              @archive="handleArchive(thread.threadId, true)"
              @unarchive="handleArchive(thread.threadId, false)"
              @share="handleShare(thread.threadId)"
              @export="handleExport(thread.threadId)"
              @delete="handleDelete(thread.threadId)"
              @rename="handleRename(thread.threadId)"
            />
          </div>
        </div>

        <!-- Regular Threads Section -->
        <div v-if="unpinnedThreads.length > 0 && activeFilter !== 'archived'">
          <div class="flex items-center gap-2 px-2 py-1 mb-2">
            <UIcon name="i-heroicons-clock" class="w-3 h-3 text-gray-500" />
            <span class="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
              Recent
            </span>
          </div>
          <div class="space-y-1">
            <ThreadListItem
              v-for="thread in unpinnedThreads"
              :key="thread.threadId"
              :thread="thread"
              :active="thread.threadId === threadsStore.activeThreadId"
              :selection-mode="selectionMode"
              :selected="selectedThreadIds.has(thread.threadId)"
              @select="selectThread(thread.threadId)"
              @toggle-selection="toggleThreadSelection(thread.threadId)"
              @pin="handlePin(thread.threadId, true)"
              @unpin="handlePin(thread.threadId, false)"
              @archive="handleArchive(thread.threadId, true)"
              @unarchive="handleArchive(thread.threadId, false)"
              @share="handleShare(thread.threadId)"
              @export="handleExport(thread.threadId)"
              @delete="handleDelete(thread.threadId)"
              @rename="handleRename(thread.threadId)"
            />
          </div>
        </div>

        <!-- Archived Threads Section -->
        <div v-if="archivedThreads.length > 0 && activeFilter === 'archived'">
          <div class="flex items-center gap-2 px-2 py-1 mb-2">
            <UIcon name="i-heroicons-archive-box" class="w-3 h-3 text-gray-500" />
            <span class="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
              Archived
            </span>
          </div>
          <div class="space-y-1">
            <ThreadListItem
              v-for="thread in archivedThreads"
              :key="thread.threadId"
              :thread="thread"
              :active="thread.threadId === threadsStore.activeThreadId"
              :selection-mode="selectionMode"
              :selected="selectedThreadIds.has(thread.threadId)"
              @select="selectThread(thread.threadId)"
              @toggle-selection="toggleThreadSelection(thread.threadId)"
              @pin="handlePin(thread.threadId, true)"
              @unpin="handlePin(thread.threadId, false)"
              @archive="handleArchive(thread.threadId, true)"
              @unarchive="handleArchive(thread.threadId, false)"
              @share="handleShare(thread.threadId)"
              @export="handleExport(thread.threadId)"
              @delete="handleDelete(thread.threadId)"
              @rename="handleRename(thread.threadId)"
            />
          </div>
        </div>
      </template>
    </div>

    <!-- Rename Modal -->
    <UModal v-model="showRenameModal" :ui="{ width: 'max-w-md' }">
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold">Rename Thread</h3>
        </template>

        <UInput
          v-model="renameTitle"
          placeholder="Enter new title..."
          size="lg"
          autofocus
          @keydown.enter="confirmRename"
        />

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" color="gray" @click="showRenameModal = false">
              Cancel
            </UButton>
            <UButton color="purple" @click="confirmRename" :disabled="!renameTitle.trim()">
              Rename
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Delete Confirmation Modal -->
    <UModal v-model="showDeleteConfirm" :ui="{ width: 'max-w-md' }">
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-exclamation-triangle" class="w-5 h-5 text-red-500" />
            <h3 class="text-lg font-semibold">Delete Thread?</h3>
          </div>
        </template>

        <p class="text-gray-600 dark:text-gray-400">
          This will permanently delete this conversation and all its messages. This action cannot be undone.
        </p>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" color="gray" @click="showDeleteConfirm = false">
              Cancel
            </UButton>
            <UButton color="red" @click="confirmDelete">
              Delete Permanently
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Bulk Delete Confirmation Modal -->
    <UModal v-model="showBulkDeleteConfirm" :ui="{ width: 'max-w-md' }">
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-exclamation-triangle" class="w-5 h-5 text-red-500" />
            <h3 class="text-lg font-semibold">Delete Multiple Threads?</h3>
          </div>
        </template>

        <p class="text-gray-600 dark:text-gray-400">
          This will permanently delete <strong>{{ selectedThreadIds.size }} thread{{ selectedThreadIds.size > 1 ? 's' : '' }}</strong> and all their messages. This action cannot be undone.
        </p>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" color="gray" @click="showBulkDeleteConfirm = false">
              Cancel
            </UButton>
            <UButton color="red" @click="confirmBulkDelete" :loading="bulkDeleteLoading">
              Delete {{ selectedThreadIds.size }} Thread{{ selectedThreadIds.size > 1 ? 's' : '' }}
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { useChatThreadsStore } from '~/stores/useChatThreadsStore'
import type { ChatThreadSummary } from '~/shared/types/chat-threads'

const emit = defineEmits<{
  'thread-selected': [threadId: string]
  'new-thread': []
  'share-thread': [threadId: string]
  'export-thread': [threadId: string]
}>()

const threadsStore = useChatThreadsStore()
const toast = useToast()

// Search and filter state
const searchQuery = ref('')
const activeFilter = ref<'all' | 'pinned' | 'archived'>('all')

// Modal state
const showRenameModal = ref(false)
const showDeleteConfirm = ref(false)
const showBulkDeleteConfirm = ref(false)
const activeThreadIdForAction = ref<string | null>(null)
const renameTitle = ref('')
const bulkDeleteLoading = ref(false)

// Selection mode state
const selectionMode = ref(false)
const selectedThreadIds = ref(new Set<string>())

// Computed thread lists
const pinnedThreads = computed(() => {
  let threads = threadsStore.pinnedThreads
  if (searchQuery.value) {
    threads = threads.filter(t =>
      t.title.toLowerCase().includes(searchQuery.value.toLowerCase())
    )
  }
  return threads
})

const unpinnedThreads = computed(() => {
  let threads = threadsStore.unpinnedThreads
  if (searchQuery.value) {
    threads = threads.filter(t =>
      t.title.toLowerCase().includes(searchQuery.value.toLowerCase())
    )
  }
  return threads
})

const archivedThreads = computed(() => {
  let threads = threadsStore.archivedThreads
  if (searchQuery.value) {
    threads = threads.filter(t =>
      t.title.toLowerCase().includes(searchQuery.value.toLowerCase())
    )
  }
  return threads
})

const filteredThreads = computed(() => {
  if (activeFilter.value === 'pinned') {
    return pinnedThreads.value
  } else if (activeFilter.value === 'archived') {
    return archivedThreads.value
  } else {
    return [...pinnedThreads.value, ...unpinnedThreads.value]
  }
})

// Empty state messages
const emptyStateTitle = computed(() => {
  if (searchQuery.value) return 'No threads found'
  if (activeFilter.value === 'pinned') return 'No pinned threads'
  if (activeFilter.value === 'archived') return 'No archived threads'
  return 'No conversations yet'
})

const emptyStateMessage = computed(() => {
  if (searchQuery.value) return 'Try a different search term'
  if (activeFilter.value === 'pinned') return 'Pin important threads for quick access'
  if (activeFilter.value === 'archived') return 'Archived threads will appear here'
  return 'Start a new conversation to get started'
})

// Initialize
onMounted(async () => {
  await threadsStore.fetchThreads()
})

// Handle search
function handleSearch() {
  // Search is reactive via computed properties
}

// Set filter
function setFilter(filter: 'all' | 'pinned' | 'archived') {
  activeFilter.value = filter
  if (filter === 'archived') {
    threadsStore.fetchThreads({ isArchived: true })
  } else {
    threadsStore.fetchThreads({ isArchived: false })
  }
}

// Select thread
function selectThread(threadId: string) {
  emit('thread-selected', threadId)
}

// Handle new thread
function handleNewThread() {
  emit('new-thread')
}

// Handle pin/unpin
async function handlePin(threadId: string, pin: boolean) {
  const success = await threadsStore.updateThread(threadId, { isPinned: pin })
  if (success) {
    toast.add({
      title: pin ? 'Thread pinned' : 'Thread unpinned',
      color: 'green'
    })
  } else {
    toast.add({
      title: 'Failed to update thread',
      color: 'red'
    })
  }
}

// Handle archive/unarchive
async function handleArchive(threadId: string, archive: boolean) {
  const success = await threadsStore.updateThread(threadId, { isArchived: archive })
  if (success) {
    toast.add({
      title: archive ? 'Thread archived' : 'Thread unarchived',
      color: 'green'
    })
    // Refresh list based on current filter
    if (activeFilter.value === 'archived') {
      await threadsStore.fetchThreads({ isArchived: true })
    } else {
      await threadsStore.fetchThreads({ isArchived: false })
    }
  } else {
    toast.add({
      title: 'Failed to update thread',
      color: 'red'
    })
  }
}

// Handle share
function handleShare(threadId: string) {
  emit('share-thread', threadId)
}

// Handle export
function handleExport(threadId: string) {
  emit('export-thread', threadId)
}

// Handle rename
function handleRename(threadId: string) {
  activeThreadIdForAction.value = threadId
  const thread = threadsStore.threads.find(t => t.threadId === threadId)
  renameTitle.value = thread?.title || ''
  showRenameModal.value = true
}

async function confirmRename() {
  if (!activeThreadIdForAction.value || !renameTitle.value.trim()) return

  const success = await threadsStore.updateThread(activeThreadIdForAction.value, {
    title: renameTitle.value.trim()
  })

  if (success) {
    toast.add({
      title: 'Thread renamed',
      color: 'green'
    })
  } else {
    toast.add({
      title: 'Failed to rename thread',
      color: 'red'
    })
  }

  showRenameModal.value = false
  activeThreadIdForAction.value = null
  renameTitle.value = ''
}

// Handle delete
function handleDelete(threadId: string) {
  activeThreadIdForAction.value = threadId
  showDeleteConfirm.value = true
}

async function confirmDelete() {
  if (!activeThreadIdForAction.value) return

  // Use deleteThreadAndCreateNew to ensure user always has an active thread
  const newThread = await threadsStore.deleteThreadAndCreateNew(activeThreadIdForAction.value)

  if (newThread) {
    toast.add({
      title: 'Thread deleted',
      description: 'New conversation started',
      color: 'green'
    })
  } else {
    toast.add({
      title: 'Failed to delete thread',
      color: 'red'
    })
  }

  showDeleteConfirm.value = false
  activeThreadIdForAction.value = null
}

// Selection mode functions
function enterSelectionMode() {
  selectionMode.value = true
  selectedThreadIds.value.clear()
}

function exitSelectionMode() {
  selectionMode.value = false
  selectedThreadIds.value.clear()
}

function toggleThreadSelection(threadId: string) {
  if (selectedThreadIds.value.has(threadId)) {
    selectedThreadIds.value.delete(threadId)
  } else {
    selectedThreadIds.value.add(threadId)
  }
  // Force reactivity update
  selectedThreadIds.value = new Set(selectedThreadIds.value)
}

// Handle bulk delete
function handleBulkDelete() {
  if (selectedThreadIds.value.size === 0) return
  showBulkDeleteConfirm.value = true
}

async function confirmBulkDelete() {
  if (selectedThreadIds.value.size === 0) return

  bulkDeleteLoading.value = true
  let successCount = 0
  let failCount = 0

  const threadsToDelete = Array.from(selectedThreadIds.value)

  // Delete threads one by one
  for (const threadId of threadsToDelete) {
    const success = await threadsStore.deleteThread(threadId)
    if (success) {
      successCount++
    } else {
      failCount++
    }
  }

  bulkDeleteLoading.value = false
  showBulkDeleteConfirm.value = false
  exitSelectionMode()

  // Show result toast
  if (failCount === 0) {
    toast.add({
      title: `Successfully deleted ${successCount} thread${successCount > 1 ? 's' : ''}`,
      color: 'green'
    })
  } else if (successCount === 0) {
    toast.add({
      title: `Failed to delete ${failCount} thread${failCount > 1 ? 's' : ''}`,
      color: 'red'
    })
  } else {
    toast.add({
      title: `Deleted ${successCount} thread${successCount > 1 ? 's' : ''}, ${failCount} failed`,
      color: 'yellow'
    })
  }
}
</script>

<style scoped>
.thread-list-sidebar {
  width: 320px;
  min-width: 320px;
  max-width: 320px;
}
</style>
