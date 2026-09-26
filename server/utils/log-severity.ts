/**
 * Pure severity-derivation helper for the production JSON log reporter.
 *
 * Kept dependency-free (no Consola import) so it can be unit-tested in
 * isolation. See logger.ts for how it is wired into the JSON reporter.
 */

// Minimal shape of the fields we read from a Consola LogObject.
export interface SeveritySource {
  type: string
  level: number
}

// Recognized Consola log types mapped to a CloudWatch severity string.
// Preferring the type preserves fatal-vs-error and warn intent, which the
// numeric level cannot express (Consola shares level 0 for fatal AND error,
// and uses level 1 for warn / level 2 for log).
const TYPE_SEVERITY: Record<string, string> = {
  fatal: 'fatal',
  error: 'error',
  warn: 'warn',
  info: 'info',
  success: 'info',
  log: 'info',
  debug: 'debug',
  trace: 'trace',
}

// Fallback mapping when the type is not a recognized severity. Level 0 is
// treated as 'error' (not 'fatal') because the two share level 0 and error is
// the safer, less alarming default when the type cannot distinguish them.
const NUMERIC_SEVERITY: Record<number, string> = {
  0: 'error',
  1: 'warn',
  2: 'info',
  3: 'info',
  4: 'debug',
  5: 'trace',
}

/**
 * Derive a CloudWatch severity string for a log entry.
 *
 * Prefers the Consola `type` (fatal/error/warn/debug/trace/…) when it is a
 * recognized severity, since the numeric `level` is lossy: Consola maps both
 * fatal and error to level 0, warn to 1, and log to 2. Falls back to the
 * numeric level otherwise, defaulting unknown values to 'info'.
 */
export function deriveSeverity(logObj: SeveritySource): string {
  const byType = TYPE_SEVERITY[logObj.type]
  if (byType) {
    return byType
  }
  return NUMERIC_SEVERITY[logObj.level] ?? 'info'
}
