/**
 * Structured-log field sanitization.
 *
 * Kept dependency-free (no h3/Nitro imports) so it can be unit tested in
 * isolation and reused by any code that writes untrusted values into a
 * single-line JSON log record.
 */

// Default cap for a single bounded field. Generous enough to keep an error
// message useful while preventing one field from bloating a log line.
const DEFAULT_MAX_LENGTH = 256

// Matches ASCII C0 controls (incl. newline, carriage return, tab), DEL, and the
// C1 control range. Built from an escaped string (rather than a regex literal)
// so no raw control bytes appear in this source file. Replacing these prevents
// forged newlines from injecting fake log entries.
// eslint-disable-next-line no-control-regex -- intentionally matching control chars to strip them
const CONTROL_CHARS = new RegExp('[\\u0000-\\u001F\\u007F-\\u009F]', 'g')

/**
 * Bound an untrusted value for safe inclusion in a structured log record.
 *
 * Returns `undefined` for anything that is not a string (so callers can omit
 * the field entirely), replaces control characters with a single space, trims
 * the result, and caps the length so a forged value cannot blow up the log
 * line. A trailing ellipsis marks truncation.
 */
export function boundedLogField(
  value: unknown,
  maxLength: number = DEFAULT_MAX_LENGTH,
): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const cleaned = value.replace(CONTROL_CHARS, ' ').trim()
  if (cleaned.length === 0) {
    return undefined
  }
  if (cleaned.length <= maxLength) {
    return cleaned
  }
  return cleaned.slice(0, maxLength - 1) + '…'
}
