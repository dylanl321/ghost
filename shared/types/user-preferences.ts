/**
 * User Preferences Types
 * Flexible preference storage for user settings
 */

/**
 * User preferences stored in DynamoDB
 */
export interface UserPreferences {
  userId: string // User email or ID
  timezone: string // IANA timezone (e.g., 'America/New_York')
  lastLoginAt?: string // ISO timestamp
  preferences?: Record<string, any> // Flexible storage for future preferences
  createdAt: string // ISO timestamp
  updatedAt: string // ISO timestamp
}

/**
 * Request to update user preferences (partial update)
 */
export interface UpdatePreferencesRequest {
  timezone?: string
  preferences?: Record<string, any>
}

/**
 * Common timezone option for UI
 */
export interface TimezoneOption {
  value: string // IANA timezone
  label: string // Display name
  offset: string // UTC offset (e.g., 'UTC-05:00')
}

/**
 * Common timezones for quick selection
 */
export const COMMON_TIMEZONES: TimezoneOption[] = [
  { value: 'America/New_York', label: 'Eastern Time', offset: 'UTC-05:00' },
  { value: 'America/Chicago', label: 'Central Time', offset: 'UTC-06:00' },
  { value: 'America/Denver', label: 'Mountain Time', offset: 'UTC-07:00' },
  { value: 'America/Los_Angeles', label: 'Pacific Time', offset: 'UTC-08:00' },
  { value: 'America/Anchorage', label: 'Alaska Time', offset: 'UTC-09:00' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time', offset: 'UTC-10:00' },
  { value: 'Europe/London', label: 'London', offset: 'UTC+00:00' },
  { value: 'Europe/Paris', label: 'Paris', offset: 'UTC+01:00' },
  { value: 'Asia/Tokyo', label: 'Tokyo', offset: 'UTC+09:00' },
  { value: 'Australia/Sydney', label: 'Sydney', offset: 'UTC+10:00' },
  { value: 'UTC', label: 'UTC', offset: 'UTC+00:00' }
]

/**
 * Get browser timezone
 */
export function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York'
  } catch {
    return 'America/New_York'
  }
}

/**
 * Format timezone display name
 */
export function formatTimezone(timezone: string): string {
  const option = COMMON_TIMEZONES.find(tz => tz.value === timezone)
  if (option) {
    return `${option.label} (${option.offset})`
  }
  return timezone
}
