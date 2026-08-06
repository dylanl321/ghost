import type { H3Event } from 'h3'
import { createError } from 'h3'
import { getAllAccountMetadataFromDynamoDB } from './accounts-consolidated'
import { getAccountRecipients, updateConfigItem } from './budget-alert-config'
import { getUserEmail, isUserAdmin } from './user-roles'
import {
  accountMatchesId,
  addManualRecipient,
  canManageBudgetAlertRecipients,
  removeManualRecipient,
  type BudgetAlertRecipientAccount,
  type ManualBudgetAlertRecipientConfig
} from './manual-budget-alert-recipients'

export interface DefaultBudgetAlertRecipient {
  email: string
  role: string
  source: 'PEP'
  note: string
}

export interface DisplayManualBudgetAlertRecipient {
  email: string
  addedBy: string
  addedAt: string
  auditable: boolean
}

export interface BudgetAlertRecipientView {
  accountId: string
  canManage: boolean
  defaultRecipients: DefaultBudgetAlertRecipient[]
  manualRecipients: DisplayManualBudgetAlertRecipient[]
}

function roleEmail(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const normalized = value.trim().toLowerCase()
  return normalized.includes('@') ? normalized : `${normalized}@gd-ms.com`
}

function resolveCanonicalAccountId(account: BudgetAlertRecipientAccount, requestedAccountId: string): string {
  return account.awsStandardAccountID || account.primaryAccountID || account.accountId || requestedAccountId
}

function buildDefaultRecipients(account: BudgetAlertRecipientAccount): DefaultBudgetAlertRecipient[] {
  const candidates = [
    {
      value: account.primaryAccountAdminUsername,
      role: 'Primary account admin',
      note: 'Default recipient for applicable alerts'
    },
    {
      value: account.delegateAccountAdminUsername,
      role: 'Delegate account admin',
      note: 'Default recipient for applicable alerts'
    },
    {
      value: account.costManagerUsername,
      role: 'Cost manager',
      note: 'PEP role used by the budget-alert recipient rules'
    },
    {
      value: account.authorizingManagerUsername,
      role: 'Authorizing manager',
      note: 'Included in applicable monthly or role-based notifications'
    }
  ]

  const seen = new Set<string>()
  return candidates.flatMap(candidate => {
    const email = roleEmail(candidate.value)
    if (!email || seen.has(`${email}:${candidate.role}`)) return []
    seen.add(`${email}:${candidate.role}`)
    return [{ email, role: candidate.role, source: 'PEP' as const, note: candidate.note }]
  })
}

async function loadAccount(requestedAccountId: string): Promise<BudgetAlertRecipientAccount> {
  const accounts = await getAllAccountMetadataFromDynamoDB()
  const account = accounts.find(candidate => accountMatchesId(candidate, requestedAccountId))

  if (!account) {
    throw createError({ statusCode: 404, message: 'AWS account metadata was not found' })
  }

  return account
}

function buildManualRecipients(config: ManualBudgetAlertRecipientConfig | null): DisplayManualBudgetAlertRecipient[] {
  const audited = config?.manual_recipients || []
  const auditedEmails = new Set(audited.map(recipient => recipient.email.toLowerCase()))
  const legacy = (config?.cc || []).filter(email => !auditedEmails.has(email.toLowerCase()))

  return [
    ...audited.map(recipient => ({
      email: recipient.email,
      addedBy: recipient.added_by,
      addedAt: recipient.added_at,
      auditable: true
    })),
    ...legacy.map(email => ({
      email,
      addedBy: typeof config?.updated_by === 'string' ? config.updated_by : 'Existing configuration',
      addedAt: typeof config?.updated_at === 'string' ? config.updated_at : '',
      auditable: false
    }))
  ]
}

export async function getBudgetAlertRecipientView(
  event: H3Event,
  requestedAccountId: string
): Promise<BudgetAlertRecipientView> {
  const userEmail = getUserEmail(event)
  if (!userEmail) {
    throw createError({ statusCode: 401, message: 'User authentication is required' })
  }

  const account = await loadAccount(requestedAccountId)
  const accountId = resolveCanonicalAccountId(account, requestedAccountId)
  const [isGhostAdmin, config] = await Promise.all([
    isUserAdmin(event),
    getAccountRecipients(accountId) as Promise<ManualBudgetAlertRecipientConfig | null>
  ])

  return {
    accountId,
    canManage: canManageBudgetAlertRecipients(account, userEmail, isGhostAdmin),
    defaultRecipients: buildDefaultRecipients(account),
    manualRecipients: buildManualRecipients(config)
  }
}

export async function updateBudgetAlertRecipient(
  event: H3Event,
  requestedAccountId: string,
  action: 'add' | 'remove',
  email: string
): Promise<BudgetAlertRecipientView> {
  const userEmail = getUserEmail(event)
  if (!userEmail) {
    throw createError({ statusCode: 401, message: 'User authentication is required' })
  }

  const account = await loadAccount(requestedAccountId)
  const isGhostAdmin = await isUserAdmin(event)
  if (!canManageBudgetAlertRecipients(account, userEmail, isGhostAdmin)) {
    throw createError({
      statusCode: 403,
      message: 'Only GHOST admins, account admins, delegates, or cost managers can manage these recipients'
    })
  }

  const accountId = resolveCanonicalAccountId(account, requestedAccountId)
  const existing = await getAccountRecipients(accountId) as ManualBudgetAlertRecipientConfig | null

  let updated: ManualBudgetAlertRecipientConfig
  try {
    if (action === 'add') {
      updated = addManualRecipient(existing, email, userEmail, new Date().toISOString())
    } else {
      if (!existing) throw new Error('No manual recipients are configured for this account')
      updated = removeManualRecipient(existing, email)
    }
  } catch (error: any) {
    throw createError({ statusCode: 400, message: error.message })
  }

  updated.config_scope = accountId
  await updateConfigItem(updated as any, userEmail)

  return getBudgetAlertRecipientView(event, accountId)
}
