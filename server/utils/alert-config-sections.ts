/**
 * Validated updates for the GLOBAL budget-alert config sections edited on
 * the admin Alert Settings page.
 *
 * Each section route declares the fields it accepts and their types. Only
 * declared fields are written, so a request cannot store stray keys or a
 * string where the alert Lambda expects a number. Nested objects merge into
 * the stored object, so updating one threshold keeps the others.
 */

import { createError, readBody, type H3Event } from 'h3'
import { getConfigItem, updateConfigItem } from './budget-alert-config'
import { requireAdmin } from './user-roles'
import { logger } from './logger'

export type FieldRule =
  | { kind: 'boolean' }
  | { kind: 'number'; min?: number; max?: number; integer?: boolean; positive?: boolean }
  | { kind: 'string'; maxLength?: number; pattern?: RegExp }
  | { kind: 'email' }
  | { kind: 'emailList'; maxItems?: number }
  | { kind: 'numberList'; min?: number; maxItems?: number }
  | { kind: 'object'; fields: Record<string, FieldRule> }
  | { kind: 'map'; value: FieldRule; maxEntries?: number }
  | { kind: 'array'; item: FieldRule; maxItems?: number }

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function fail(message: string): never {
  throw createError({ statusCode: 400, message })
}

/** Validate one value against its rule and return the value to store. */
export function validateField(path: string, value: unknown, rule: FieldRule): unknown {
  switch (rule.kind) {
    case 'boolean':
      if (typeof value !== 'boolean') fail(`${path} must be true or false`)
      return value
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${path} must be a number`)
      if (rule.integer && !Number.isInteger(value)) fail(`${path} must be a whole number`)
      if (rule.positive && value <= 0) fail(`${path} must be greater than 0`)
      if (rule.min !== undefined && value < rule.min) fail(`${path} must be at least ${rule.min}`)
      if (rule.max !== undefined && value > rule.max) fail(`${path} must be at most ${rule.max}`)
      return value
    }
    case 'string':
      if (typeof value !== 'string') fail(`${path} must be text`)
      if (value.length > (rule.maxLength ?? 500)) fail(`${path} is too long`)
      if (rule.pattern && !rule.pattern.test(value)) fail(`${path} has an invalid format: ${value}`)
      return value
    case 'email':
      if (typeof value !== 'string' || !EMAIL_PATTERN.test(value)) fail(`Invalid email format for ${path}: ${String(value)}`)
      return value
    case 'emailList':
      if (!Array.isArray(value)) fail(`${path} must be a list of email addresses`)
      if (value.length > (rule.maxItems ?? 50)) fail(`${path} has too many entries`)
      for (const email of value) {
        if (typeof email !== 'string' || !EMAIL_PATTERN.test(email)) fail(`Invalid email format: ${String(email)}`)
      }
      return value
    case 'numberList':
      if (!Array.isArray(value)) fail(`${path} must be a list of numbers`)
      if (value.length > (rule.maxItems ?? 50)) fail(`${path} has too many entries`)
      return value.map((item, i) => validateField(`${path}[${i}]`, item, { kind: 'number', min: rule.min }))
    case 'object':
      if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${path} must be an object`)
      return pickFields(value as Record<string, unknown>, rule.fields, `${path}.`)
    case 'map': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${path} must be an object`)
      const entries = Object.entries(value as Record<string, unknown>)
      if (entries.length > (rule.maxEntries ?? 200)) fail(`${path} has too many entries`)
      return Object.fromEntries(entries.map(([key, item]) => [key, validateField(`"${key}"`, item, rule.value)]))
    }
    case 'array':
      if (!Array.isArray(value)) fail(`${path} must be a list`)
      if (value.length > (rule.maxItems ?? 50)) fail(`${path} has too many entries`)
      return value.map((item, i) => validateField(`${path}[${i}]`, item, rule.item))
  }
}

/** Validate the declared fields present in body; undeclared keys are dropped. */
export function pickFields(
  body: Record<string, unknown>,
  rules: Record<string, FieldRule>,
  prefix = ''
): Record<string, unknown> {
  const picked: Record<string, unknown> = {}
  for (const [field, rule] of Object.entries(rules)) {
    if (body[field] === undefined) continue
    picked[field] = validateField(`${prefix}${field}`, body[field], rule)
  }
  return picked
}

/** Merge validated fields into the stored section; nested objects and maps merge one level down. */
function mergeSection(
  existing: Record<string, any>,
  fields: Record<string, unknown>,
  rules: Record<string, FieldRule>
): Record<string, any> {
  const merged = { ...existing }
  for (const [field, value] of Object.entries(fields)) {
    const kind = rules[field]?.kind
    merged[field] = (kind === 'object' || kind === 'map') && existing[field] && typeof existing[field] === 'object'
      ? { ...existing[field], ...(value as object) }
      : value
  }
  return merged
}

export interface GlobalSectionUpdate {
  /** config_section key, e.g. "settings#main" */
  section: string
  section_type: string
  /** Shown in the success and failure messages */
  label: string
  rules: Record<string, FieldRule>
  /** Cross-field checks on the merged result; return an error message to reject */
  validate?: (merged: Record<string, any>) => string | undefined
}

/**
 * Handle a PUT for one GLOBAL config section: admin check, field
 * validation, merge with the stored item, cross-field validation, save.
 */
export async function updateGlobalConfigSection(event: H3Event, spec: GlobalSectionUpdate) {
  await requireAdmin(event)

  const body = await readBody(event)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    fail('Request body must be a JSON object')
  }

  const fields = pickFields(body, spec.rules)

  try {
    const existing = (await getConfigItem('GLOBAL', spec.section) as Record<string, any> | null) || {}
    const merged = mergeSection(existing, fields, spec.rules)

    const error = spec.validate?.(merged)
    if (error) fail(error)

    const updated = {
      ...merged,
      config_scope: 'GLOBAL',
      config_section: spec.section,
      section_type: spec.section_type
    }

    const user = event.context.auth?.user
    await updateConfigItem(updated as any, user?.email || user?.preferred_username || 'unknown')

    return {
      success: true,
      data: updated,
      message: `${spec.label} updated successfully`
    }
  } catch (error: any) {
    if (error?.statusCode === 400) throw error
    logger.error(`Error updating ${spec.label}:`, error)
    throw createError({
      statusCode: error?.statusCode || 500,
      message: error?.message || `Failed to update ${spec.label}`
    })
  }
}

// -----------------------------------------------------------------------------
// Alert levels (alerts#{LEVEL})
// -----------------------------------------------------------------------------

export const ALERT_LEVELS = ['INFO', 'WARNING', 'CRITICAL', 'ESCALATION'] as const

export const ALERT_LEVEL_RULES: Record<string, FieldRule> = {
  // Percent of budget; below 100 would alert before the budget is reached
  threshold: { kind: 'number', min: 100 },
  color: { kind: 'string', maxLength: 7, pattern: /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/ },
  min_dollars: { kind: 'number', min: 0 },
  max_per_month: { kind: 'number', integer: true, min: 1 },
  intervals: { kind: 'numberList', min: 0 }
}

/** The level name in upper case, or a 400 when it is not one of ALERT_LEVELS. */
export function parseAlertLevel(level: string | undefined): (typeof ALERT_LEVELS)[number] {
  const upper = (level || '').toUpperCase()
  if (!(ALERT_LEVELS as readonly string[]).includes(upper)) {
    fail(`Invalid alert level: ${level}. Must be one of: ${ALERT_LEVELS.join(', ')}`)
  }
  return upper as (typeof ALERT_LEVELS)[number]
}

/** Thresholds must rise with severity: INFO < WARNING < CRITICAL < ESCALATION. */
export function checkThresholdOrder(
  level: string,
  threshold: number,
  allLevels: Array<{ level: string; threshold: number }>
): void {
  const rank = (name: string) => (ALERT_LEVELS as readonly string[]).indexOf(name)
  for (const other of allLevels) {
    if (other.level === level) continue
    if (rank(level) < rank(other.level) && threshold >= other.threshold) {
      fail(`${level} threshold (${threshold}) must be less than ${other.level} threshold (${other.threshold})`)
    }
    if (rank(level) > rank(other.level) && threshold <= other.threshold) {
      fail(`${level} threshold (${threshold}) must be greater than ${other.level} threshold (${other.threshold})`)
    }
  }
}

export function auditUser(event: H3Event): string {
  const user = event.context.auth?.user
  return user?.email || user?.preferred_username || 'unknown'
}
