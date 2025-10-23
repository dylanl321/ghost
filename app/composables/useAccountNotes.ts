/**
 * Account Notes Composable
 * Manages admin notes for AWS accounts
 */

import type { AccountNote, CreateNoteRequest } from '#shared/types/account-notes'

export function useAccountNotes(accountId: string) {
  const notes = ref<AccountNote[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const toast = useToast()

  /**
   * Fetch notes for the account
   */
  async function fetchNotes() {
    loading.value = true
    error.value = null

    try {
      const response = await $fetch<{ data: AccountNote[] }>(
        `/api/accounts/${accountId}/notes`,
        {
          method: 'GET'
        }
      )

      notes.value = response.data || []
    } catch (err: any) {
      console.error('Failed to fetch account notes:', err)
      error.value = err.message || 'Failed to fetch notes'
      toast.add({
        title: 'Failed to load notes',
        description: error.value,
        icon: 'i-heroicons-exclamation-triangle',
        color: 'red',
        timeout: 3000
      })
    } finally {
      loading.value = false
    }
  }

  /**
   * Create a new note
   */
  async function createNote(request: Omit<CreateNoteRequest, 'accountId'>): Promise<boolean> {
    loading.value = true
    error.value = null

    try {
      const response = await $fetch<{ data: AccountNote }>(
        `/api/accounts/${accountId}/notes`,
        {
          method: 'POST',
          body: {
            ...request,
            accountId
          }
        }
      )

      if (response.data) {
        // Add to the beginning of the list
        notes.value.unshift(response.data)
        
        toast.add({
          title: 'Note created',
          description: 'Your note has been saved',
          icon: 'i-heroicons-check-circle',
          color: 'green',
          timeout: 3000
        })
        
        return true
      }
      
      return false
    } catch (err: any) {
      console.error('Failed to create note:', err)
      error.value = err.message || 'Failed to create note'
      toast.add({
        title: 'Failed to create note',
        description: error.value,
        icon: 'i-heroicons-exclamation-triangle',
        color: 'red',
        timeout: 3000
      })
      return false
    } finally {
      loading.value = false
    }
  }

  /**
   * Delete a note
   */
  async function deleteNote(noteId: string): Promise<boolean> {
    loading.value = true
    error.value = null

    try {
      await $fetch(`/api/accounts/${accountId}/notes/${noteId}`, {
        method: 'DELETE'
      })

      // Remove from list
      notes.value = notes.value.filter(note => note.noteId !== noteId)
      
      toast.add({
        title: 'Note deleted',
        description: 'The note has been removed',
        icon: 'i-heroicons-trash',
        color: 'gray',
        timeout: 2000
      })
      
      return true
    } catch (err: any) {
      console.error('Failed to delete note:', err)
      error.value = err.message || 'Failed to delete note'
      toast.add({
        title: 'Failed to delete note',
        description: error.value,
        icon: 'i-heroicons-exclamation-triangle',
        color: 'red',
        timeout: 3000
      })
      return false
    } finally {
      loading.value = false
    }
  }

  return {
    // State
    notes: readonly(notes),
    loading: readonly(loading),
    error: readonly(error),

    // Methods
    fetchNotes,
    createNote,
    deleteNote
  }
}

