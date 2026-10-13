import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { getEC2PricingFilters } from '../aws-pricing'

const INSTANCE_TYPE = 't3.medium'
const REGION_NAME = 'AWS GovCloud (US-West)'

// Extract a single filter Value by Field name for concise assertions.
function fieldValue(filters: ReturnType<typeof getEC2PricingFilters>, field: string): string | undefined {
  return filters.find(f => f.Field === field)?.Value
}

test('linux maps to operatingSystem=Linux with preInstalledSw=NA', () => {
  const filters = getEC2PricingFilters(INSTANCE_TYPE, REGION_NAME, 'linux')
  assert.equal(fieldValue(filters, 'operatingSystem'), 'Linux')
  assert.equal(fieldValue(filters, 'preInstalledSw'), 'NA')
})

test('rhel maps to operatingSystem=RHEL with preInstalledSw=NA (regression guard)', () => {
  const filters = getEC2PricingFilters(INSTANCE_TYPE, REGION_NAME, 'rhel')
  assert.equal(fieldValue(filters, 'operatingSystem'), 'RHEL')
  assert.equal(fieldValue(filters, 'preInstalledSw'), 'NA')
  // The prior bug mapped RHEL to Linux + preInstalledSw=RHEL, which never matches
  // the AWS Price List and produced null VMaaS RHEL compute pricing.
  assert.notEqual(fieldValue(filters, 'operatingSystem'), 'Linux')
  assert.notEqual(fieldValue(filters, 'preInstalledSw'), 'RHEL')
})

test('windows maps to operatingSystem=Windows with preInstalledSw=NA', () => {
  const filters = getEC2PricingFilters(INSTANCE_TYPE, REGION_NAME, 'windows')
  assert.equal(fieldValue(filters, 'operatingSystem'), 'Windows')
  assert.equal(fieldValue(filters, 'preInstalledSw'), 'NA')
})

test('defaults to linux when no operating system is provided', () => {
  const filters = getEC2PricingFilters(INSTANCE_TYPE, REGION_NAME)
  assert.equal(fieldValue(filters, 'operatingSystem'), 'Linux')
  assert.equal(fieldValue(filters, 'preInstalledSw'), 'NA')
})

test('carries instanceType and location through unchanged for all OS values', () => {
  for (const os of ['linux', 'rhel', 'windows'] as const) {
    const filters = getEC2PricingFilters(INSTANCE_TYPE, REGION_NAME, os)
    assert.equal(fieldValue(filters, 'instanceType'), INSTANCE_TYPE)
    assert.equal(fieldValue(filters, 'location'), REGION_NAME)
    assert.equal(fieldValue(filters, 'tenancy'), 'Shared')
    assert.equal(fieldValue(filters, 'capacitystatus'), 'Used')
  }
})
