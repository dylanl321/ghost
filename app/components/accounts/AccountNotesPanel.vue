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

        <!-- Mentioned Users -->
        <div v-if="mentionedUsers.length > 0">
          <label class="block text-sm font-medium text-gray-300 mb-2">Mentioned Users</label>
          <div class="flex flex-wrap gap-2">
            <UBadge
              v-for="user in mentionedUsers"
              :key="user"
              color="blue"
              variant="soft"
              size="sm"
            >
              <template #default>
                <div class="flex items-center gap-1">
                  <UIcon name="i-heroicons-at-symbol" class="w-3 h-3" />
                  {{ user }}
                  <button @click="removeMention(user)" class="ml-1 hover:text-red-400">
                    <UIcon name="i-heroicons-x-mark" class="w-3 h-3" />
                  </button>
                </div>
              </template>
            </UBadge>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex justify-between items-center pt-2">
          <div class="flex gap-2">
            <UButton
              icon="i-heroicons-at-symbol"
              color="gray"
              variant="soft"
              size="sm"
              @click="showMentionDialog = true"
            >
              Mention User
            </UButton>
          </div>
          <div class="flex gap-2">
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
              <div class="flex items-center gap-2">
                <span class="font-medium text-white">{{ note.createdBy }}</span>
                <span class="text-xs text-gray-500">
                  {{ formatDate(note.createdAt) }}
                </span>
                <UBadge
                  v-if="note.updatedAt"
                  color="gray"
                  variant="subtle"
                  size="xs"
                  title="This note was edited"
                >
                  edited
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
          <div v-if="note.mentionedUsers && note.mentionedUsers.length > 0" class="flex items-center gap-2 text-xs text-gray-500">
            <UIcon name="i-heroicons-at-symbol" class="w-3 h-3" />
            <span>Mentioned: {{ note.mentionedUsers.join(', ') }}</span>
          </div>
        </div>
      </UCard>
    </div>

    <!-- Mention User Dialog -->
    <UModal v-model="showMentionDialog" title="Mention User">
      <div class="p-4 space-y-4">
        <p class="text-sm text-gray-400">Enter the email of the user you want to mention:</p>
        <UInput
          v-model="mentionEmail"
          type="email"
          placeholder="user@example.com"
          @keyup.enter="addMention"
        />
        <div class="flex justify-end gap-2">
          <UButton color="gray" variant="ghost" @click="showMentionDialog = false">
            Cancel
          </UButton>
          <UButton color="primary" @click="addMention">
            Add Mention
          </UButton>
        </div>
      </div>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useToast } from '#imports'
import { NOTE_TAG_OPTIONS } from '#shared/types/account-notes'

interface Props {
  accountId: string
}

const props = defineProps<Props>()

const toast = useToast()
const { user } = useOidcAuth()
const { notes, loading, fetchNotes, createNote, deleteNote } = useAccountNotes(props.accountId)

// Form state
const newNoteContent = ref('')
const selectedTags = ref<string[]>([])
const mentionedUsers = ref<string[]>([])
const saving = ref(false)
const deleting = ref<string | null>(null)
const showMentionDialog = ref(false)
const mentionEmail = ref('')

const availableTags = NOTE_TAG_OPTIONS

// Computed
const canSubmit = computed(() => {
  return newNoteContent.value.trim().length > 0 && !saving.value
})

const currentUserEmail = computed(() => {
  return user.value?.claims?.email as string || user.value?.email || ''
})

// Check if current user can delete a note (only creator can delete)
function canDeleteNote(note: any): boolean {
  return note.createdBy === currentUserEmail.value
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

function addMention() {
  const email = mentionEmail.value.trim()
  if (email && !mentionedUsers.value.includes(email)) {
    mentionedUsers.value.push(email)
    mentionEmail.value = ''
    showMentionDialog.value = false
  }
}

function removeMention(email: string) {
  const index = mentionedUsers.value.indexOf(email)
  if (index > -1) {
    mentionedUsers.value.splice(index, 1)
  }
}

function clearForm() {
  newNoteContent.value = ''
  selectedTags.value = []
  mentionedUsers.value = []
}

async function handleCreateNote() {
  if (!canSubmit.value) return

  saving.value = true

  try {
    const success = await createNote({
      content: newNoteContent.value.trim(),
      tags: selectedTags.value,
      mentionedUsers: mentionedUsers.value
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

function formatDate(dateString: string): string {
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

// Load notes on mount
onMounted(() => {
  fetchNotes()
})
</script>

