import assert from 'node:assert/strict'
import test from 'node:test'
import {
  aggregateVmaasProjections,
  allocateVmaasActuals,
  mergeVmaasInstanceActuals,
  reportingMonthRange,
  isVmaasOwned,
  normalizeVmaasOperatingSystem,
  scheduledHoursForMonth,
  VMAAS_ACCOUNT_ID,
  VMAAS_BILLING_ACCOUNT_ID,
  VMAAS_INSTANCE_ACTUAL_METRICS,
  type VmaasServerCost
} from '../../server/utils/vmaas-costs'
import { getEC2PricingCacheKey, getEC2PricingFilters } from '../../server/utils/aws-pricing'
import { validateCostQuery } from '../../server/utils/cost-domain'
import { isAllowedVmaasCostPath } from '../../server/middleware/entra-auth'

test('instance actual metrics include UnblendedCost so the authoritative query validates', () => {
  // Regression: loadInstanceActuals previously requested only NetUnblendedCost,
  // which queryCostDataset rejects with "UnblendedCost is required...".
  assert.ok(VMAAS_INSTANCE_ACTUAL_METRICS.includes('UnblendedCost'))
  assert.ok(VMAAS_INSTANCE_ACTUAL_METRICS.includes('NetUnblendedCost'))
  assert.doesNotThrow(() => validateCostQuery({
    startDate: '2026-01-01',
    endDate: '2026-02-01',
    granularity: 'MONTHLY',
    metrics: [...VMAAS_INSTANCE_ACTUAL_METRICS]
  }))
  assert.throws(() => validateCostQuery({
    startDate: '2026-01-01',
    endDate: '2026-02-01',
    granularity: 'MONTHLY',
    metrics: ['NetUnblendedCost']
  }), /UnblendedCost is required/)
})

test('VMaaS pricing keys and filters distinguish Linux, RHEL, and Windows', () => {
  const keys = ['linux', 'rhel', 'windows'].map(os => getEC2PricingCacheKey(
    'govcloud', 'us-gov-west-1', 'm6i.large', os as 'linux' | 'rhel' | 'windows'
  ))
  assert.equal(new Set(keys).size, 3)
  assert.deepEqual(
    getEC2PricingFilters('m6i.large', 'AWS GovCloud (US-West)', 'rhel').find(filter => filter.Field === 'preInstalledSw'),
    { Type: 'TERM_MATCH', Field: 'preInstalledSw', Value: 'RHEL' }
  )
  assert.equal(
    getEC2PricingFilters('m6i.large', 'AWS GovCloud (US-West)', 'windows').find(filter => filter.Field === 'operatingSystem')?.Value,
    'Windows'
  )
})

test('schedule runtime unions overlaps and includes overnight periods', () => {
  const result = scheduledHoursForMonth({
    name: 'overlap',
    timezone: 'UTC',
    periods: ['day', 'overlap', 'overnight']
  }, [
    { name: 'day', begintime: '09:00', endtime: '17:00', weekdays: 'mon-fri' },
    { name: 'overlap', begintime: '16:00', endtime: '18:00', weekdays: 'mon-fri' },
    { name: 'overnight', begintime: '22:00', endtime: '02:00', weekdays: 'fri' }
  ], new Date('2026-08-15T12:00:00Z'))

  // August 2026 has 21 weekdays and four Fridays: (21 * 9) + (4 * 4).
  assert.equal(result.available, true)
  assert.equal(result.hours, 205)
  assert.equal(result.alwaysOnHours, 744)
})

test('unsupported one-sided scheduler periods are unavailable instead of guessed', () => {
  const result = scheduledHoursForMonth({ name: 'no-start', timezone: 'America/New_York', periods: ['stop'] }, [
    { name: 'stop', endtime: '17:00', weekdays: 'mon-fri' }
  ], new Date('2026-08-15T12:00:00Z'))
  assert.equal(result.available, false)
  assert.equal(result.hours, null)
  assert.match(result.reason || '', /unsupported definition/)
})

test('fixed account ownership requires both VMaaS identity tags', () => {
  assert.equal(VMAAS_ACCOUNT_ID, '650505514334')
  assert.equal(VMAAS_BILLING_ACCOUNT_ID, '871049984747')
  assert.equal(isVmaasOwned({ GDLZ_DeployedBy: 'shared-vpc-tenant', team_id: 'alpha', tenant_id: 'alpha-web' }), true)
  assert.equal(isVmaasOwned({ GDLZ_DeployedBy: 'shared-vpc-tenant', team_id: 'alpha' }), false)
  assert.equal(isVmaasOwned({ GDLZ_DeployedBy: 'other', team_id: 'alpha', tenant_id: 'alpha-web' }), false)
})

test('dedicated VMaaS scope is restricted to the two read-only paths', () => {
  assert.equal(isAllowedVmaasCostPath('/api/integrations/vmaas/costs', 'GET'), true)
  assert.equal(isAllowedVmaasCostPath('/api/integrations/vmaas/instances/i-12345678/cost', 'GET'), true)
  assert.equal(isAllowedVmaasCostPath('/api/costs/summary', 'GET'), false)
  assert.equal(isAllowedVmaasCostPath('/api/integrations/vmaas/costs', 'POST'), false)
})

test('operating systems map to pricing families', () => {
  assert.deepEqual(normalizeVmaasOperatingSystem({ PlatformDetails: 'Linux/UNIX' }, { OS: 'linux' }), { key: 'linux', label: 'Linux' })
  assert.deepEqual(normalizeVmaasOperatingSystem({ PlatformDetails: 'Red Hat Enterprise Linux' }, {}), { key: 'rhel', label: 'RHEL' })
  assert.deepEqual(normalizeVmaasOperatingSystem({ PlatformDetails: 'Windows' }, {}), { key: 'windows', label: 'Windows' })
})

test('fleet projection aggregation preserves unavailable server count', () => {
  const base: VmaasServerCost = {
    instance_id: 'i-12345678', name: 'one', team_id: 'alpha', department: 'Engineering',
    operating_system: 'Linux', instance_type: 'm6i.large', region: 'us-gov-west-1', state: 'running', schedule: 'workweek',
    compute_hourly_usd: 1, storage_monthly_usd: 10, scheduled_hours: 100,
    scheduled_monthly_usd: 110, always_on_hours: 744, always_on_monthly_usd: 754,
    schedule_savings_usd: 644, scheduled_estimate_available: true,
    actual_month_usd: 40, in_fleet: true
  }
  const result = aggregateVmaasProjections([
    base,
    { ...base, instance_id: 'i-abcdef12', scheduled_monthly_usd: null, always_on_monthly_usd: 100, schedule_savings_usd: null, scheduled_estimate_available: false }
  ])
  assert.deepEqual(result, {
    scheduled_monthly_usd: 110,
    always_on_monthly_usd: 854,
    schedule_savings_usd: 644,
    actual_month_usd: 80,
    unavailable_server_count: 1
  })
})

test('reporting month uses MTD for the current month and full closed months otherwise', () => {
  const now = new Date('2026-08-15T12:00:00Z')
  assert.deepEqual(reportingMonthRange(undefined, now), { start: '2026-08-01', end: '2026-08-15', closed: false })
  assert.deepEqual(reportingMonthRange('2026-07', now), { start: '2026-07-01', end: '2026-08-01', closed: true })
})

test('instance actuals keep terminated servers that billed during the month', () => {
  const live: VmaasServerCost = {
    instance_id: 'i-12345678', name: 'live', team_id: 'alpha', department: 'Engineering',
    operating_system: 'Linux', instance_type: 'm6i.large', region: 'us-gov-west-1', state: 'running', schedule: 'workweek',
    compute_hourly_usd: 1, storage_monthly_usd: 10, scheduled_hours: 100,
    scheduled_monthly_usd: 110, always_on_hours: 744, always_on_monthly_usd: 754,
    schedule_savings_usd: 644, scheduled_estimate_available: true, actual_month_usd: 0, in_fleet: true
  }
  const merged = mergeVmaasInstanceActuals([live], [
    { instance_id: 'i-12345678', tenant_id: 'alpha-web', actual_month_usd: 22.5 },
    { instance_id: 'i-deadbeef12', tenant_id: 'beta-web', actual_month_usd: 18.25 }
  ])
  assert.equal(merged.find(server => server.instance_id === 'i-12345678')?.actual_month_usd, 22.5)
  const gone = merged.find(server => server.instance_id === 'i-deadbeef12')
  assert.equal(gone?.in_fleet, false)
  assert.equal(gone?.state, 'terminated')
  assert.equal(gone?.actual_month_usd, 18.25)
})

test('allocated actuals reconcile tenant usage and the GDMS IT residual', () => {
  const result = allocateVmaasActuals({
    billableTotal: 100,
    proformaTotal: 80,
    groups: [
      { tenant_id: 'alpha-app', cost_center: 'DE100', billable_direct_usd: 30 },
      { tenant_id: 'beta-app', cost_center: 'DE200', billable_direct_usd: 20 }
    ]
  })
  assert.deepEqual(result.rows.map(row => row.allocated_proforma_usd), [24, 16])
  assert.equal(result.allocatedDirect, 40)
  assert.equal(result.sharedResidual, 40)
  assert.equal(result.reconciled, true)
})

test('allocated actuals retain signed credits', () => {
  const result = allocateVmaasActuals({
    billableTotal: 100,
    proformaTotal: 90,
    groups: [
      { tenant_id: 'alpha-app', cost_center: 'DE100', billable_direct_usd: 50 },
      { tenant_id: 'alpha-credit', cost_center: 'DE100', billable_direct_usd: -10 }
    ]
  })
  assert.deepEqual(result.rows.map(row => row.allocated_proforma_usd), [45, -9])
  assert.equal(result.sharedResidual, 54)
})

test('allocated actuals fail closed without a usable denominator or tagged usage', () => {
  assert.throws(() => allocateVmaasActuals({ billableTotal: 0, proformaTotal: 10, groups: [] }), /positive/)
  assert.throws(() => allocateVmaasActuals({ billableTotal: 10, proformaTotal: 10, groups: [] }), /no tenant-tagged/)
})
