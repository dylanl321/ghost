/**
 * AWS Identity Center session types
 */

export interface IDCUserSession {
  userId: string
  userName: string
  userPrincipalName?: string
  isActive: boolean
  accountId: string
  permissionSetName?: string
}
