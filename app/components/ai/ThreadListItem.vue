<template>
  <div
    :class="[
      'thread-item group relative p-3 rounded-lg transition-all cursor-pointer',
      active
        ? 'bg-purple-100 dark:bg-purple-900/30 border-l-4 border-purple-600'
        : selected
        ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500'
        : 'bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 border-l-4 border-transparent'
    ]"
    @click="handleClick"
  >
    <div class="flex items-start justify-between gap-2">
      <!-- Selection Checkbox (visible in selection mode) -->
      <div v-if="selectionMode" class="flex-shrink-0 pt-1">
        <UCheckbox
          :model-value="selected"
          color="primary"
          @click.stop
          @update:model-value="$emit('toggle-selection')"
        />
      </div>
      <div class="flex-1 min-w-0">
        <!-- Title with Pin Icon and Loading Indicator -->
        <div class="flex items-center gap-2 mb-1">
          <UIcon
            v-if="thread.isPinned"
            name="i-heroicons-bookmark-solid"
            class="w-4 h-4 text-yellow-500 flex-shrink-0"
          />
          <h4
            :class="[
              'text-sm font-medium truncate',
              active ? 'text-purple-900 dark:text-purple-100' : 'text-gray-900 dark:text-white'
            ]"
          >
            {{ thread.title }}
          </h4>
          <!-- Active Query Indicator -->
          <UIcon
            v-if="hasActiveJob"
            name="i-heroicons-arrow-path"
            class="w-4 h-4 text-purple-500 animate-spin ml-auto flex-shrink-0"
            title="Query in progress"
          />
        </div>

        <!-- Last Message Preview -->
        <p
          v-if="thread.messageCount > 0"
          class="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mb-2"
        >
          {{ lastMessagePreview }}
        </p>

        <!-- Footer Info -->
        <div class="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
          <span class="flex items-center gap-1">
            <UIcon name="i-heroicons-chat-bubble-left" class="w-3 h-3" />
            {{ thread.messageCount }}
          </span>
          <span>{{ formatTimestamp(thread.lastMessageAt) }}</span>
          <UIcon
            v-if="thread.isShared"
            name="i-heroicons-share"
            class="w-3 h-3 text-blue-500"
            title="Shared"
          />
        </div>
      </div>

      <!-- Quick Actions (visible on hover, hidden in selection mode) -->
      <div v-if="!selectionMode" class="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <UDropdown
          :items="actionItems"
          :popper="{ placement: 'bottom-end' }"
          @click.stop
        >
          <UButton
            icon="i-heroicons-ellipsis-vertical"
            variant="ghost"
            color="gray"
            size="xs"
          />
        </UDropdown>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ChatThreadSummary } from '~/shared/types/chat-threads'
import { useBackgroundPolling } from '~/composables/useBackgroundPolling'

interface Props {
  thread: ChatThreadSummary
  active?: boolean
  selectionMode?: boolean
  selected?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  selectionMode: false,
  selected: false
})

const emit = defineEmits<{
  select: []
  'toggle-selection': []
  pin: []
  unpin: []
  archive: []
  unarchive: []
  share: []
  export: []
  delete: []
  rename: []
}>()

// Check if this thread has active background jobs
const backgroundPolling = useBackgroundPolling()
const hasActiveJob = computed(() => {
  return backgroundPolling.hasActiveJobsForThread(props.thread.threadId)
})

// Handle click behavior based on selection mode
function handleClick() {
  if (props.selectionMode) {
    emit('toggle-selection')
  } else {
    emit('select')
  }
}

// Compute last message preview
const lastMessagePreview = computed(() => {
  if (!props.thread.lastMessagePreview) return 'No messages yet'
  return props.thread.lastMessagePreview.substring(0, 100)
})

// Format relative timestamp
function formatTimestamp(timestamp: string) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 7) {
    return date.toLocaleDateString()
  }
  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (minutes > 0) return `${minutes}m ago`
  return 'Just now'
}

// Action menu items
const actionItems = computed(() => {
  const items = []

  // Pin/Unpin
  if (props.thread.isPinned) {
    items.push([{
      label: 'Unpin',
      icon: 'i-heroicons-bookmark',
      click: () => emit('unpin')
    }])
  } else {
    items.push([{
      label: 'Pin',
      icon: 'i-heroicons-bookmark-solid',
      click: () => emit('pin')
    }])
  }

  // Rename
  items.push([{
    label: 'Rename',
    icon: 'i-heroicons-pencil',
    click: () => emit('rename')
  }])

  // Share & Export
  items.push([
    {
      label: 'Share',
      icon: 'i-heroicons-share',
      click: () => emit('share')
    },
    {
      label: 'Export',
      icon: 'i-heroicons-arrow-down-tray',
      click: () => emit('export')
    }
  ])

  // Archive/Unarchive
  if (props.thread.isArchived) {
    items.push([{
      label: 'Unarchive',
      icon: 'i-heroicons-archive-box-arrow-down',
      click: () => emit('unarchive')
    }])
  } else {
    items.push([{
      label: 'Archive',
      icon: 'i-heroicons-archive-box',
      click: () => emit('archive')
    }])
  }

  // Delete
  items.push([{
    label: 'Delete',
    icon: 'i-heroicons-trash',
    click: () => emit('delete'),
    class: 'text-red-600 dark:text-red-400'
  }])

  return items
})
</script>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
