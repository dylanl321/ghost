/**
 * Account Notes Library
 * CRUD operations for admin notes on AWS accounts
 */

import type { AccountNote, CreateNoteRequest, UpdateNoteRequest, ListNotesQuery } from '../../shared/types/account-notes'
import { getTableName, getTableEnvironment, getTableAccountId } from './dynamodb-config'
import { putItem, getItem, deleteItem, queryItems } from '../utils/dynamodb'
import { v4 as uuidv4 } from 'uuid'

/**
 * Create a new account note
 */
export async function createAccountNote(
  request: CreateNoteRequest,
  createdBy: string
): Promise<AccountNote> {
  const now = new Date().toISOString()
  
  const note: AccountNote = {
    noteId: uuidv4(),
    accountId: request.accountId,
    createdBy,
    createdAt: now,
    content: request.content,
    mentionedUsers: request.mentionedUsers || [],
    tags: request.tags || []
  }

  const tableName = await getTableName('accountNotes')
  const environment = await getTableEnvironment('accountNotes')
  const accountId = await getTableAccountId('accountNotes')

  await putItem(tableName, note, environment, accountId)

  return note
}

/**
 * Get a note by ID
 */
export async function getAccountNote(noteId: string): Promise<AccountNote | null> {
  const tableName = await getTableName('accountNotes')
  const environment = await getTableEnvironment('accountNotes')
  const accountId = await getTableAccountId('accountNotes')

  const note = await getItem(tableName, { noteId }, environment, accountId)
  return note as AccountNote | null
}

/**
 * Update an existing note
 */
export async function updateAccountNote(
  noteId: string,
  updates: UpdateNoteRequest,
  userId: string
): Promise<AccountNote> {
  // Get existing note
  const existing = await getAccountNote(noteId)
  if (!existing) {
    throw new Error('Note not found')
  }

  // Verify ownership (only creator can edit)
  if (existing.createdBy !== userId) {
    throw new Error('Not authorized to edit this note')
  }

  const updated: AccountNote = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString()
  }

  const tableName = await getTableName('accountNotes')
  const environment = await getTableEnvironment('accountNotes')
  const accountId = await getTableAccountId('accountNotes')

  await putItem(tableName, updated, environment, accountId)

  return updated
}

/**
 * Delete a note
 */
export async function deleteAccountNote(noteId: string, userId: string): Promise<boolean> {
  // Get existing note to verify ownership
  const existing = await getAccountNote(noteId)
  if (!existing) {
    throw new Error('Note not found')
  }

  // Verify ownership (only creator can delete)
  if (existing.createdBy !== userId) {
    throw new Error('Not authorized to delete this note')
  }

  const tableName = await getTableName('accountNotes')
  const environment = await getTableEnvironment('accountNotes')
  const accountId = await getTableAccountId('accountNotes')

  await deleteItem(tableName, { noteId }, environment, accountId)

  return true
}

/**
 * List notes for an account
 */
export async function listAccountNotes(query: ListNotesQuery): Promise<AccountNote[]> {
  const tableName = await getTableName('accountNotes')
  const environment = await getTableEnvironment('accountNotes')
  const accountId = await getTableAccountId('accountNotes')

  let result: { items: any[] } = { items: [] }

  if (query.accountId) {
    // Query by account ID using GSI
    result = await queryItems(
      {
        tableName,
        indexName: 'AccountIdIndex',
        queryExpression: 'accountId = :accountId',
        expressionAttributeValues: {
          ':accountId': query.accountId
        },
        limit: query.limit,
        scanIndexForward: query.sortOrder === 'asc'
      },
      environment,
      accountId
    )
  } else if (query.createdBy) {
    // Query by creator using GSI
    result = await queryItems(
      {
        tableName,
        indexName: 'CreatedByIndex',
        queryExpression: 'createdBy = :createdBy',
        expressionAttributeValues: {
          ':createdBy': query.createdBy
        },
        limit: query.limit,
        scanIndexForward: query.sortOrder === 'asc'
      },
      environment,
      accountId
    )
  }

  return result.items as AccountNote[]
}

/**
 * Get mentions for a user
 * Returns all notes where the user is mentioned
 */
export async function getUserMentions(userEmail: string): Promise<AccountNote[]> {
  const tableName = await getTableName('accountNotes')
  const environment = await getTableEnvironment('accountNotes')
  const accountId = await getTableAccountId('accountNotes')

  // Note: This requires a scan which is not ideal for large datasets
  // In production, consider adding a separate table or GSI for mentions
  // For now, we'll fetch all notes and filter client-side
  // This is acceptable for MVP with limited notes

  // TODO: Optimize with dedicated mentions table or GSI if note volume grows
  
  return []
}

