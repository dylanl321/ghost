/**
 * Pure policy helpers for account-level manual budget-alert recipients.
 *
 * Manual recipients are stored as additive CC entries in the budget alert
 * system's existing custom_recipients#main record. Default PEP role routing
 * remains authoritative and is never replaced by this feature.
 */

export interface BudgetAlertRecipientAccount {
  awsStandardAccountID?: string
  awsGovCloudAccountID?: string
  primaryAccountID?: string
  accountId?: string
  primaryAccountAdminUsername?: string
  delegateAccountAdminUsername?: string
  costManagerUsername?: string
  authorizingManagerUsername?: string
  [key: string]: unknown
}

export interface ManualBudgetAlertRecipient {
  email: string
  added_by: string
  added_at: string
}

export interface ManualBudgetAlertRecipientConfig {
  config_scope: string
  config_section: 'custom_recipients#main'
  section_type: 'custom_recipients'
  to?: string[]
  cc?: string[]
  override?: boolean
  by_type?: Record<string, unknown>
  manual_recipients?: ManualBudgetAlertRecipient[]
  [key: string]: unknown
}

const GDMS_EMAIL_PATTERN = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@gd-ms\.com$/i

export function normalizeGdmsEmail(value: string): string {
  const trimmed = value.trim().toLowerCase()
  const email = trimmed.includes('@') ? trimmed : `${trimmed}@gd-ms.com`

  if (!GDMS_EMAIL_PATTERN.test(email)) {
    throw new Error('Enter a valid GDMS email address ending in @gd-ms.com')
  }

  return email
}

function usernamePart(value: string | undefined): string {
  if (!value) return ''
  return value.trim().toLowerCase().split('@')[0] || ''
}

export function accountMatchesId(account: BudgetAlertRecipientAccount, accountId: string): boolean {
  return [
    account.awsStandardAccountID,
    account.awsGovCloudAccountID,
    account.primaryAccountID,
    account.accountId
  ].some(candidate => candidate === accountId)
}

export function canManageBudgetAlertRecipients(
  account: BudgetAlertRecipientAccount,
  userEmail: string,
  isGhostAdmin: boolean
): boolean {
  if (isGhostAdmin) return true

  const currentUsername = usernamePart(userEmail)
  if (!currentUsername) return false

  return [
    account.primaryAccountAdminUsername,
    account.delegateAccountAdminUsername,
    account.costManagerUsername
  ].some(roleUsername => usernamePart(roleUsername) === currentUsername)
}

function uniqueEmails(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    const normalized = value.trim().toLowerCase()
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized)
      result.push(normalized)
    }
  }

  return result
}

function mapByTypeCc(value: unknown, email: string, remove = false): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value

  const source = value as Record<string, unknown>
  const hasNestedConfig = Object.values(source).some(child => child && typeof child === 'object' && !Array.isArray(child))
  const isRecipientLeaf = !hasNestedConfig
  const mapped: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(source)) {
    if (key === 'cc' && Array.isArray(child)) {
      const emails = child.filter(candidate => typeof candidate === 'string') as string[]
      mapped[key] = remove
        ? emails.filter(candidate => candidate.toLowerCase() !== email)
        : uniqueEmails([...emails, email])
    } else if (child && typeof child === 'object' && !Array.isArray(child)) {
      mapped[key] = mapByTypeCc(child, email, remove)
    } else {
      mapped[key] = child
    }
  }
  if (isRecipientLeaf && !('cc' in mapped) && !remove) mapped.cc = [email]
  return mapped
}

export function addManualRecipient(
  existing: ManualBudgetAlertRecipientConfig | null,
  emailInput: string,
  addedBy: string,
  addedAt: string
): ManualBudgetAlertRecipientConfig {
  const email = normalizeGdmsEmail(emailInput)
  const manualRecipients = existing?.manual_recipients || []

  if (manualRecipients.some(recipient => recipient.email.toLowerCase() === email)) {
    throw new Error(`${email} already receives manual budget alerts for this account`)
  }

  return {
    ...existing,
    config_scope: existing?.config_scope || '',
    config_section: 'custom_recipients#main',
    section_type: 'custom_recipients',
    cc: uniqueEmails([...(existing?.cc || []), email]),
    // Manual additions are always an overlay. Never suppress PEP/default roles.
    override: false,
    by_type: mapByTypeCc(existing?.by_type, email) as Record<string, unknown> | undefined,
    manual_recipients: [
      ...manualRecipients,
      { email, added_by: normalizeGdmsEmail(addedBy), added_at: addedAt }
    ]
  }
}

export function removeManualRecipient(
  existing: ManualBudgetAlertRecipientConfig,
  emailInput: string
): ManualBudgetAlertRecipientConfig {
  const email = normalizeGdmsEmail(emailInput)
  const manualRecipients = existing.manual_recipients || []

  if (!manualRecipients.some(recipient => recipient.email.toLowerCase() === email)) {
    throw new Error(`${email} is not a manually added recipient for this account`)
  }

  return {
    ...existing,
    cc: (existing.cc || []).filter(recipient => recipient.toLowerCase() !== email),
    override: false,
    by_type: mapByTypeCc(existing.by_type, email, true) as Record<string, unknown> | undefined,
    manual_recipients: manualRecipients.filter(recipient => recipient.email.toLowerCase() !== email)
  }
}
