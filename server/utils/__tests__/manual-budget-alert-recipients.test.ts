import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import {
  addManualRecipient,
  canManageBudgetAlertRecipients,
  normalizeGdmsEmail,
  removeManualRecipient,
  type BudgetAlertRecipientAccount,
  type ManualBudgetAlertRecipientConfig
} from '../manual-budget-alert-recipients'

const account: BudgetAlertRecipientAccount = {
  awsStandardAccountID: '123456789012',
  awsGovCloudAccountID: '210987654321',
  primaryAccountID: '123456789012',
  primaryAccountAdminUsername: 'primary.admin',
  delegateAccountAdminUsername: 'delegate.admin@gd-ms.com',
  costManagerUsername: 'cost.manager'
}

test('normalizes GDMS usernames and email addresses', () => {
  assert.equal(normalizeGdmsEmail(' Jane.Doe '), 'jane.doe@gd-ms.com')
  assert.equal(normalizeGdmsEmail('Jane.Doe@GD-MS.COM'), 'jane.doe@gd-ms.com')
})

test('rejects external and malformed recipient addresses', () => {
  assert.throws(() => normalizeGdmsEmail('jane@example.com'), /@gd-ms\.com/)
  assert.throws(() => normalizeGdmsEmail('not an email'), /valid GDMS/)
})

test('allows GHOST admins and the account primary, delegate, and cost manager to manage recipients', () => {
  assert.equal(canManageBudgetAlertRecipients(account, 'anyone@gd-ms.com', true), true)
  assert.equal(canManageBudgetAlertRecipients(account, 'primary.admin@gd-ms.com', false), true)
  assert.equal(canManageBudgetAlertRecipients(account, 'delegate.admin@gd-ms.com', false), true)
  assert.equal(canManageBudgetAlertRecipients(account, 'cost.manager@gd-ms.com', false), true)
  assert.equal(canManageBudgetAlertRecipients(account, 'viewer@gd-ms.com', false), false)
})

test('adds an audited recipient as an additive CC without replacing existing config', () => {
  const existing: ManualBudgetAlertRecipientConfig = {
    config_scope: '123456789012',
    config_section: 'custom_recipients#main',
    section_type: 'custom_recipients',
    to: ['legacy.to@gd-ms.com'],
    cc: ['legacy.cc@gd-ms.com'],
    override: true,
    by_type: {
      MONTHLY: { cc: ['monthly.only@gd-ms.com'] },
      FORECAST: { INFO: { to: ['forecast.owner@gd-ms.com'] } }
    },
    manual_recipients: []
  }

  const updated = addManualRecipient(
    existing,
    'Jane.Doe',
    'admin.user@gd-ms.com',
    '2026-08-06T12:00:00.000Z'
  )

  assert.deepEqual(updated.to, ['legacy.to@gd-ms.com'])
  assert.deepEqual(updated.cc, ['legacy.cc@gd-ms.com', 'jane.doe@gd-ms.com'])
  assert.equal(updated.override, false)
  assert.deepEqual(updated.by_type, {
    MONTHLY: { cc: ['monthly.only@gd-ms.com', 'jane.doe@gd-ms.com'] },
    FORECAST: { INFO: { to: ['forecast.owner@gd-ms.com'], cc: ['jane.doe@gd-ms.com'] } }
  })
  assert.deepEqual(updated.manual_recipients, [{
    email: 'jane.doe@gd-ms.com',
    added_by: 'admin.user@gd-ms.com',
    added_at: '2026-08-06T12:00:00.000Z'
  }])
})

test('does not duplicate an existing manual recipient', () => {
  const existing: ManualBudgetAlertRecipientConfig = {
    config_scope: '123456789012',
    config_section: 'custom_recipients#main',
    section_type: 'custom_recipients',
    cc: ['jane.doe@gd-ms.com'],
    override: false,
    manual_recipients: [{
      email: 'jane.doe@gd-ms.com',
      added_by: 'first.admin@gd-ms.com',
      added_at: '2026-08-05T12:00:00.000Z'
    }]
  }

  assert.throws(
    () => addManualRecipient(existing, 'JANE.DOE', 'second.admin@gd-ms.com', '2026-08-06T12:00:00.000Z'),
    /already receives/
  )
})

test('removes only the selected manual recipient and preserves legacy recipients', () => {
  const existing: ManualBudgetAlertRecipientConfig = {
    config_scope: '123456789012',
    config_section: 'custom_recipients#main',
    section_type: 'custom_recipients',
    cc: ['legacy.cc@gd-ms.com', 'jane.doe@gd-ms.com', 'other.user@gd-ms.com'],
    override: false,
    manual_recipients: [
      { email: 'jane.doe@gd-ms.com', added_by: 'admin@gd-ms.com', added_at: '2026-08-05T12:00:00.000Z' },
      { email: 'other.user@gd-ms.com', added_by: 'admin@gd-ms.com', added_at: '2026-08-05T12:01:00.000Z' }
    ]
  }

  const updated = removeManualRecipient(existing, 'jane.doe@gd-ms.com')

  assert.deepEqual(updated.cc, ['legacy.cc@gd-ms.com', 'other.user@gd-ms.com'])
  assert.deepEqual(updated.manual_recipients, [
    { email: 'other.user@gd-ms.com', added_by: 'admin@gd-ms.com', added_at: '2026-08-05T12:01:00.000Z' }
  ])
})
