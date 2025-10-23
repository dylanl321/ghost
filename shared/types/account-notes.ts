/**
 * Account Notes Types
 * Types for admin notes and comments on AWS accounts
 */

export interface AccountNote {
  noteId: string // Unique identifier (UUID)
  accountId: string // AWS account ID
  createdBy: string // User email who created the note
  createdAt: string // ISO timestamp
  updatedAt?: string // ISO timestamp (for edits)
  content: string // Note content (supports markdown)
  mentionedUsers: string[] // Array of user emails mentioned in the note
  tags: string[] // Categories/tags (e.g., "support", "billing", "incident")
}

export interface CreateNoteRequest {
  accountId: string
  content: string
  mentionedUsers?: string[]
  tags?: string[]
}

export interface UpdateNoteRequest {
  content?: string
  mentionedUsers?: string[]
  tags?: string[]
}

export interface ListNotesQuery {
  accountId?: string
  createdBy?: string
  limit?: number
  sortOrder?: 'asc' | 'desc'
}

export interface NoteMention {
  noteId: string
  accountId: string
  accountName?: string
  mentionedBy: string
  createdAt: string
  content: string
  read: boolean
}

// Predefined tag options for categorization
export const NOTE_TAG_OPTIONS = [
  'support',
  'billing',
  'incident',
  'maintenance',
  'security',
  'compliance',
  'cost-optimization',
  'architecture',
  'deployment',
  'investigation',
  'follow-up',
  'resolved'
] as const

export type NoteTag = typeof NOTE_TAG_OPTIONS[number]


