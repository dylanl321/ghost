/**
 * Sync / verify the canonical Shared Investigations wire contract into Ghostv2.
 *
 * The canonical, versioned schema and fixtures live in the Registry repository
 * at `contracts/shared-investigations/`. Ghostv2 is a *validated counterpart*:
 * it must validate the SAME schema and the SAME fixtures rather than maintain a
 * divergent handwritten copy (see AGENTS.md and the contract README).
 *
 * Because Ghostv2 CI cannot assume the Registry checkout is a sibling directory,
 * this script vendors a read-only copy under
 * `tests/shared-investigations/contract/` and can also *verify* that the vendored
 * copy is byte-identical to the canonical source when that source is reachable.
 *
 * Usage:
 *   tsx tests/shared-investigations/sync-contract.ts          # copy canonical -> vendored
 *   tsx tests/shared-investigations/sync-contract.ts --check  # fail if they differ
 *
 * The canonical directory is resolved from, in order:
 *   1. $KIROCREW_CONTRACTS_DIR
 *   2. ../registry/contracts/shared-investigations relative to this repo root
 */
import { createHash } from 'node:crypto'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync
} from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
export const VENDORED_DIR = join(here, 'contract')
const repoRoot = resolve(here, '..', '..')

export function resolveCanonicalDir(): string | undefined {
  const fromEnv = process.env.KIROCREW_CONTRACTS_DIR
  if (fromEnv && existsSync(join(fromEnv, 'wire-contract.v1.schema.json'))) {
    return fromEnv
  }
  const sibling = resolve(
    repoRoot,
    '..',
    'registry',
    'contracts',
    'shared-investigations'
  )
  if (existsSync(join(sibling, 'wire-contract.v1.schema.json'))) {
    return sibling
  }
  return undefined
}

/** Files that make up the vendored contract (schema + fixtures + meta). */
function contractFiles(root: string): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        // validator.py and README are Registry-only; vendor schema + fixtures + meta.
        if (entry === '__pycache__') continue
        walk(full)
      } else if (
        full.endsWith('.json') &&
        !full.replace(/\\/g, '/').includes('/node_modules/')
      ) {
        out.push(relative(root, full).replace(/\\/g, '/'))
      }
    }
  }
  walk(root)
  return out.sort()
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function sync(canonical: string): void {
  rmSync(VENDORED_DIR, { recursive: true, force: true })
  mkdirSync(VENDORED_DIR, { recursive: true })
  for (const rel of contractFiles(canonical)) {
    const src = join(canonical, rel)
    const dst = join(VENDORED_DIR, rel)
    mkdirSync(dirname(dst), { recursive: true })
    cpSync(src, dst)
  }
  process.stdout.write(`synced ${contractFiles(canonical).length} contract file(s) into ${VENDORED_DIR}\n`)
}

function check(canonical: string): number {
  const canonicalFiles = contractFiles(canonical)
  const vendoredFiles = existsSync(VENDORED_DIR) ? contractFiles(VENDORED_DIR) : []
  let drift = 0
  const canonicalSet = new Set(canonicalFiles)
  const vendoredSet = new Set(vendoredFiles)
  for (const rel of canonicalFiles) {
    if (!vendoredSet.has(rel)) {
      process.stderr.write(`missing vendored file: ${rel}\n`)
      drift++
      continue
    }
    if (sha256(join(canonical, rel)) !== sha256(join(VENDORED_DIR, rel))) {
      process.stderr.write(`vendored copy differs from canonical: ${rel}\n`)
      drift++
    }
  }
  for (const rel of vendoredFiles) {
    if (!canonicalSet.has(rel)) {
      process.stderr.write(`vendored file has no canonical source: ${rel}\n`)
      drift++
    }
  }
  if (drift === 0) {
    process.stdout.write('vendored contract is byte-identical to the canonical source\n')
  }
  return drift
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const canonical = resolveCanonicalDir()
  if (!canonical) {
    process.stderr.write(
      'Canonical contract not found. Set KIROCREW_CONTRACTS_DIR or place the ' +
        'Registry checkout at ../registry.\n'
    )
    process.exit(2)
  }
  const mode = process.argv.includes('--check') ? 'check' : 'sync'
  if (mode === 'check') {
    process.exit(check(canonical) === 0 ? 0 : 1)
  } else {
    sync(canonical)
  }
}
