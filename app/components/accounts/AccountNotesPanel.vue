<template>
  <div class="space-y-4">
    <!-- Create Note Card -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-pencil-square" class="text-blue-500 w-5 h-5" />
            <h4 class="font-semibold">Add Note</h4>
          </div>
        </div>
      </template>

      <div class="space-y-3">
        <!-- Note Content -->
        <UTextarea
          v-model="newNoteContent"
          placeholder="Add a note about this account... (supports @mentions)"
          :rows="4"
          :disabled="saving"
        />

        <!-- Tags Selection -->
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-2">Tags (optional)</label>
          <div class="flex flex-wrap gap-2">
            <UBadge
              v-for="tag in availableTags"
              :key="tag"
              :color="selectedTags.includes(tag) ? 'primary' : 'gray'"
              :variant="selectedTags.includes(tag) ? 'solid' : 'soft'"
              size="sm"
              class="cursor-pointer"
              @click="toggleTag(tag)"
            >
              {{ tag }}
            </UBadge>
          </div>
        </div>

        <!-- User Mentions Search -->
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-2">
            Mention Users (optional)
          </label>

          <!-- Search Input -->
          <div class="relative">
            <UInput
              v-model="userSearchQuery"
              placeholder="Search users by name or email to mention..."
              icon="i-heroicons-magnifying-glass"
              @input="onUserSearchInput"
              @focus="showUserDropdown = true"
            />

            <!-- Search Results Dropdown -->
            <div
              v-if="showUserDropdown && (userSearchResults.length > 0 || searchingUsers) && userSearchQuery.length >= 2"
              ref="userDropdownRef"
              class="absolute z-10 mt-1 w-full rounded-lg shadow-lg p-2 max-h-60 overflow-y-auto border border-gray-800 bg-[#0e1625]"
            >
              <!-- Loading -->
              <div v-if="searchingUsers" class="px-2 py-2 text-sm text-gray-400 flex items-center gap-2">
                <UIcon name="i-heroicons-arrow-path" class="animate-spin w-4 h-4" />
                Searching users...
              </div>

              <!-- Results -->
              <div
                v-for="result in userSearchResults"
                v-else
                :key="result.userPrincipalName"
                class="px-2 py-2 text-sm cursor-pointer rounded hover:bg-gray-800 transition"
                @click="selectUser(result)"
              >
                <div class="flex items-center gap-2">
                  <UIcon name="i-heroicons-user" class="w-4 h-4 text-blue-500" />
                  <div class="flex flex-col">
                    <span class="font-medium text-white">{{ result.displayName }}</span>
                    <span class="text-xs text-gray-500">{{ result.userPrincipalName }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Selected Users -->
          <div v-if="selectedUserMentions.length > 0" class="flex flex-wrap gap-2 mt-2">
            <UBadge
              v-for="user in selectedUserMentions"
              :key="user.userPrincipalName"
              color="blue"
              variant="soft"
              size="sm"
            >
              <div class="flex items-center gap-1">
                <UIcon name="i-heroicons-at-symbol" class="w-3 h-3" />
                {{ formatUserDisplayName(user.userPrincipalName) }}
                <button @click="removeSelectedUser(user)" class="ml-1 hover:text-red-400">
                  <UIcon name="i-heroicons-x-mark" class="w-3 h-3" />
                </button>
              </div>
            </UBadge>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex justify-end items-center pt-2 gap-2">
          <UButton
            color="gray"
            variant="ghost"
            size="sm"
            :disabled="saving"
            @click="clearForm"
          >
            Clear
          </UButton>
          <UButton
            color="primary"
            :loading="saving"
            :disabled="!canSubmit"
            @click="handleCreateNote"
          >
            Add Note
          </UButton>
        </div>
      </div>
    </UCard>

    <!-- Notes List -->
    <div v-if="loading && notes.length === 0" class="flex justify-center py-8">
      <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-gray-400" />
    </div>

    <div v-else-if="notes.length === 0" class="text-center py-12">
      <UIcon name="i-heroicons-document-text" class="w-12 h-12 text-gray-600 mx-auto mb-3" />
      <p class="text-gray-400">No notes yet</p>
      <p class="text-sm text-gray-500 mt-1">Be the first to add a note about this account</p>
    </div>

    <div v-else class="space-y-3">
      <UCard
        v-for="note in notes"
        :key="note.noteId"
        class="hover:bg-gray-800/50 transition-colors"
      >
        <div class="space-y-3">
          <!-- Note Header -->
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-medium text-white">{{ formatUserDisplayName(note.createdBy) }}</span>
                <UTooltip :text="formatFullDate(note.createdAt)">
                  <span class="text-xs text-gray-500 cursor-help">
                    {{ formatRelativeDate(note.createdAt) }}
                  </span>
                </UTooltip>
                <UTooltip v-if="note.updatedAt" :text="`Last edited: ${formatFullDate(note.updatedAt)}`">
                  <UBadge
                    color="gray"
                    variant="subtle"
                    size="xs"
                    class="cursor-help"
                  >
                    edited {{ formatRelativeDate(note.updatedAt) }}
                  </UBadge>
                </UTooltip>
                <UBadge
                  v-if="note.mentionedUsers && note.mentionedUsers.length > 0"
                  color="blue"
                  variant="subtle"
                  size="xs"
                >
                  <UIcon name="i-heroicons-at-symbol" class="w-3 h-3" />
                </UBadge>
              </div>
              <!-- Tags -->
              <div v-if="note.tags && note.tags.length > 0" class="flex flex-wrap gap-1 mt-1">
                <UBadge
                  v-for="tag in note.tags"
                  :key="tag"
                  color="purple"
                  variant="subtle"
                  size="xs"
                >
                  {{ tag }}
                </UBadge>
              </div>
            </div>
            <!-- Delete Button (only for note creator) -->
            <UButton
              v-if="canDeleteNote(note)"
              icon="i-heroicons-trash"
              color="red"
              variant="ghost"
              size="xs"
              :loading="deleting === note.noteId"
              @click="handleDeleteNote(note.noteId)"
            />
          </div>

          <!-- Note Content -->
          <div class="text-gray-300 whitespace-pre-wrap">{{ note.content }}</div>

          <!-- Mentioned Users -->
          <div v-if="note.mentionedUsers && note.mentionedUsers.length > 0" class="flex items-start gap-2 text-xs">
            <div class="flex items-center gap-1 text-gray-500">
              <UIcon name="i-heroicons-at-symbol" class="w-3 h-3" />
              <span>Mentioned:</span>
            </div>
            <div class="flex flex-wrap gap-1">
              <UBadge
                v-for="mentionedUser in note.mentionedUsers"
                :key="mentionedUser"
                color="blue"
                variant="soft"
                size="xs"
              >
                {{ formatUserDisplayName(mentionedUser) }}
              </UBadge>
            </div>
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useToast } from '#imports'
import { NOTE_TAG_OPTIONS } from '#shared/types/account-notes'
import { formatUsername } from '~/utils/userUtils'
import { onClickOutside } from '@vueuse/core'

const logger = createLogger('AccountNotesPanel')

interface Props {
  accountId: string
}

interface UserSearchResult {
  id: string
  displayName: string
  userPrincipalName: string
  mail?: string
  jobTitle?: string
  department?: string
}

const props = defineProps<Props>()

const toast = useToast()
const { user } = useOidcAuth()
const { searchUsers } = useGraphApi()
const { notes, loading, fetchNotes, createNote, deleteNote } = useAccountNotes(props.accountId)

// Form state
const newNoteContent = ref('')
const selectedTags = ref<string[]>([])
const selectedUserMentions = ref<UserSearchResult[]>([])
const saving = ref(false)
const deleting = ref<string | null>(null)

// User search state
const userSearchQuery = ref('')
const userSearchResults = ref<UserSearchResult[]>([])
const searchingUsers = ref(false)
const showUserDropdown = ref(false)
const userDropdownRef = ref(null)
let searchDebounceTimer: NodeJS.Timeout | null = null

const availableTags = NOTE_TAG_OPTIONS

// Computed
const canSubmit = computed(() => {
  return newNoteContent.value.trim().length > 0 && !saving.value
})

const currentUserEmail = computed(() => {
  return user.value?.claims?.email as string || ''
})

// Close dropdown when clicking outside
onClickOutside(userDropdownRef, () => {
  showUserDropdown.value = false
})

// Check if current user can delete a note (only creator can delete)
function canDeleteNote(note: any): boolean {
  return note.createdBy === currentUserEmail.value
}

// Format user display name from email (first.last@domain.com -> First Last)
function formatUserDisplayName(email: string): string {
  if (!email) return ''
  // Extract username part before @
  const username = email.includes('@') ? email.split('@')[0] : email
  return formatUsername(username || '')
}

// Format full date with time (e.g., "January 15, 2025 at 2:30 PM")
function formatFullDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
}

// Format relative date (e.g., "2h ago", "3d ago")
function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  })
}

// Methods
function toggleTag(tag: string) {
  const index = selectedTags.value.indexOf(tag)
  if (index > -1) {
    selectedTags.value.splice(index, 1)
  } else {
    selectedTags.value.push(tag)
  }
}

// Handle user search input event
function onUserSearchInput() {
  handleUserSearchAsync(userSearchQuery.value)
}

// Handle user search with debouncing (async)
function handleUserSearchAsync(query: string) {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer)
  }

  if (!query || query.trim().length < 2) {
    userSearchResults.value = []
    showUserDropdown.value = false
    return
  }

  searchDebounceTimer = setTimeout(async () => {
    searchingUsers.value = true
    showUserDropdown.value = true
    try {
      const accessToken = user.value?.accessToken || ''
      const results = await searchUsers(accessToken, query, 10)
      logger.info('User search results:', results) // Debug log
      userSearchResults.value = results as UserSearchResult[]
    } catch (error) {
      logger.error('Failed to search users:', error)
      userSearchResults.value = []
    } finally {
      searchingUsers.value = false
    }
  }, 300)
}

// Select a user from search results
function selectUser(user: UserSearchResult) {
  // Add to selected if not already there
  const alreadySelected = selectedUserMentions.value.find(
    u => u.userPrincipalName === user.userPrincipalName
  )

  if (!alreadySelected) {
    selectedUserMentions.value.push(user)
  }

  // Clear search
  userSearchQuery.value = ''
  userSearchResults.value = []
  showUserDropdown.value = false
}

// Remove a selected user
function removeSelectedUser(user: UserSearchResult) {
  selectedUserMentions.value = selectedUserMentions.value.filter(
    u => u.userPrincipalName !== user.userPrincipalName
  )
}

function clearForm() {
  newNoteContent.value = ''
  selectedTags.value = []
  selectedUserMentions.value = []
  userSearchQuery.value = ''
  userSearchResults.value = []
}

async function handleCreateNote() {
  if (!canSubmit.value) return

  saving.value = true

  try {
    // Extract user emails from selected user objects
    const mentionedUserEmails = selectedUserMentions.value.map(u => u.userPrincipalName)

    const success = await createNote({
      content: newNoteContent.value.trim(),
      tags: selectedTags.value,
      mentionedUsers: mentionedUserEmails
    })

    if (success) {
      clearForm()
    }
  } finally {
    saving.value = false
  }
}

async function handleDeleteNote(noteId: string) {
  if (!confirm('Are you sure you want to delete this note?')) {
    return
  }

  deleting.value = noteId

  try {
    await deleteNote(noteId)
  } finally {
    deleting.value = null
  }
}

// Load notes on mount
onMounted(() => {
  fetchNotes()
})
</script>


