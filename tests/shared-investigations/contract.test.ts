/**
 * Ghostv2 validated-counterpart test for the Shared Investigations collaboration
 * wire contract.
 *
 * The canonical, versioned schema and fixtures are owned by the Registry
 * repository at `contracts/shared-investigations/`. Ghostv2 does NOT maintain a
 * divergent handwritten copy: it vendors the canonical files (see
 * `sync-contract.ts`) and validates the SAME fixtures against the SAME schema
 * with ajv. When the canonical source is reachable, this suite also asserts the
 * vendored copy has not drifted from it.
 *
 * Feature: shared-investigations (task 1.1) - cross-repository wire contract.
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import { resolveCanonicalDir, VENDORED_DIR } from './sync-contract.ts'

const CONTRACT_DIR = VENDORED_DIR
const SCHEMA_PATH = join(CONTRACT_DIR, 'wire-contract.v1.schema.json')
const MANIFEST_PATH = join(CONTRACT_DIR, 'fixtures', 'manifest.json')

interface FixtureEntry {
  path: string
  model: string
  expect: 'valid' | 'rejected'
  note?: string
  reason?: string
}

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, 'utf-8'))
}

function buildAjv(): Ajv2020 {
  const ajv = new Ajv2020({
    strict: false,
    allErrors: true,
    allowUnionTypes: true
  })
  addFormats(ajv)
  const schema = readJson(SCHEMA_PATH)
  ajv.addSchema(schema, 'wire-contract')
  return ajv
}

/** Compile a validator for a single named model ($defs pointer). */
function validatorFor(ajv: Ajv2020, model: string) {
  const ref = model.replace('#/$defs/', 'wire-contract#/$defs/')
  const validate = ajv.getSchema(ref)
  assert.ok(validate, `could not resolve model ${model}`)
  return validate
}

test('the vendored contract exists and is the canonical schemaVersion 1', () => {
  assert.ok(existsSync(SCHEMA_PATH), 'vendored schema is missing; run sync-contract.ts')
  const schema = readJson(SCHEMA_PATH)
  assert.equal(schema.$defs.SchemaVersion.const, 1)
  const manifest = readJson(MANIFEST_PATH)
  assert.equal(manifest.schemaVersion, 1)
  assert.equal(manifest.schemaFile, 'wire-contract.v1.schema.json')
})

test('valid, boundary, and legacy fixtures validate against the canonical schema', () => {
  const ajv = buildAjv()
  const manifest = readJson(MANIFEST_PATH)
  for (const fixture of manifest.fixtures as FixtureEntry[]) {
    if (fixture.expect !== 'valid') continue
    const validate = validatorFor(ajv, fixture.model)
    const payload = readJson(join(CONTRACT_DIR, 'fixtures', fixture.path))
    const ok = validate(payload)
    assert.ok(
      ok,
      `${fixture.path} should validate but did not: ${JSON.stringify(validate.errors)}`
    )
  }
})

test('rejected fixtures are rejected by the canonical schema', () => {
  const ajv = buildAjv()
  const manifest = readJson(MANIFEST_PATH)
  for (const fixture of manifest.fixtures as FixtureEntry[]) {
    if (fixture.expect !== 'rejected') continue
    const validate = validatorFor(ajv, fixture.model)
    const payload = readJson(join(CONTRACT_DIR, 'fixtures', fixture.path))
    const ok = validate(payload)
    assert.equal(ok, false, `${fixture.path} should be rejected (${fixture.reason})`)
  }
})

test('all four fixture categories are present', () => {
  const manifest = readJson(MANIFEST_PATH)
  const categories = new Set(
    (manifest.fixtures as FixtureEntry[]).map((f) => f.path.split('/')[0])
  )
  assert.deepEqual([...categories].sort(), ['boundary', 'legacy', 'rejected', 'valid'])
})

test('pre-Investigation-ID creation recovery fixture recovers the original ack', () => {
  const ajv = buildAjv()
  const validate = validatorFor(ajv, '#/$defs/CreationOperationLookup')
  const recovery = readJson(
    join(CONTRACT_DIR, 'fixtures', 'legacy/creation-operation-lookup-pre-id-recovery.json')
  )
  assert.ok(validate(recovery), JSON.stringify(validate.errors))
  assert.equal(recovery.responseProjection.investigationId, recovery.investigationId)
})

test('interleaved check history fixture keeps both checkId pairs', () => {
  const ajv = buildAjv()
  const validate = validatorFor(ajv, '#/$defs/FeedPage')
  const page = readJson(
    join(CONTRACT_DIR, 'fixtures', 'boundary/feed-page-interleaved-checks.json')
  )
  assert.ok(validate(page), JSON.stringify(validate.errors))
  const byCheck = new Map<string, string[]>()
  for (const item of page.items) {
    const proj = item.safeProjection
    const list = byCheck.get(proj.checkId) ?? []
    list.push(proj.type)
    byCheck.set(proj.checkId, list)
  }
  assert.deepEqual(byCheck.get('chk-fake-A'), ['check-started', 'check-finished'])
  assert.deepEqual(byCheck.get('chk-fake-B'), ['check-started', 'check-finished'])
})

test('subject presence without an Investigation validates', () => {
  const ajv = buildAjv()
  const validate = validatorFor(ajv, '#/$defs/PresenceLease')
  const lease = readJson(
    join(CONTRACT_DIR, 'fixtures', 'legacy/presence-lease-subject-without-investigation.json')
  )
  assert.ok(validate(lease), JSON.stringify(validate.errors))
  assert.equal(lease.investigationId, undefined)
  assert.equal(lease.runId, undefined)
})

test('a status projection carrying a token field is rejected', () => {
  const ajv = buildAjv()
  const validate = validatorFor(ajv, '#/$defs/SafeCollaborationStatus')
  const payload = readJson(
    join(CONTRACT_DIR, 'fixtures', 'rejected/status-with-token-field.json')
  )
  assert.equal(validate(payload), false)
})

test('vendored contract has not drifted from the canonical Registry source', () => {
  const canonical = resolveCanonicalDir()
  if (!canonical) {
    // The Registry checkout is not reachable in this environment (e.g. isolated
    // CI). The vendored copy is still validated above; drift is enforced wherever
    // both repositories are present (local dev, combined CI).
    return
  }
  const canonicalSchema = readFileSync(join(canonical, 'wire-contract.v1.schema.json'))
  const vendoredSchema = readFileSync(SCHEMA_PATH)
  assert.ok(
    canonicalSchema.equals(vendoredSchema),
    'vendored schema differs from canonical; run: tsx tests/shared-investigations/sync-contract.ts'
  )
  const canonicalManifest = readFileSync(
    join(canonical, 'fixtures', 'manifest.json')
  )
  const vendoredManifest = readFileSync(MANIFEST_PATH)
  assert.ok(
    canonicalManifest.equals(vendoredManifest),
    'vendored fixture manifest differs from canonical; re-run sync-contract.ts'
  )
})
