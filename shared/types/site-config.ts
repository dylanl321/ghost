/**
 * Site Configuration System
 *
 * Centralized feature flags and configuration management for GHOST.
 * Stored in DynamoDB, loaded on user login/session, accessible via Pinia store.
 */

/**
 * Configuration value types
 */
export type ConfigValueType = 'boolean' | 'string' | 'number' | 'object' | 'array';

export type ConfigTakesEffect =
  | 'immediate'
  | 'next_request'
  | 'next_refresh'
  | 'next_reload'
  | 'next_login'
  | 'not_wired';

/**
 * Configuration categories for organization in admin panel
 */
export type ConfigCategory = 'features' | 'services' | 'performance' | 'ui' | 'system';

/**
 * Base configuration item stored in DynamoDB
 */
export interface SiteConfigItem {
  /** Unique key in dot notation (e.g., 'features.reportScheduler.enabled') */
  key: string;

  /** Current value */
  value: any;

  /** Value type for validation */
  type: ConfigValueType;

  /** Configuration category */
  category: ConfigCategory;

  /** Human-readable label */
  label: string;

  /** Description of what this config controls */
  description: string;

  /** Default value (used for resets) */
  defaultValue: any;

  /** Whether this value is publicly accessible (vs admin-only) */
  isPublic: boolean;

  /** Whether this config can be edited via admin panel */
  isEditable: boolean;

  /** Validation rules (optional) */
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    allowedValues?: any[];
  };

  /** Metadata */
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
}

/**
 * Announcement displayed as a dismissible banner to all users
 */
export interface Announcement {
  id: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  active: boolean;
  createdAt: string;
  expiresAt?: string;
}

/**
 * Type-safe configuration structure
 */
export interface SiteConfig {
  mcp?: {
    audit?: {
      rawErrors?: {
        enabled?: boolean;
      };
    };
  };
  features?: {
    reportScheduler?: {
      enabled?: boolean;
    };
    adminNotifications?: {
      enabled?: boolean;
    };
  };
  performance?: {
    apiTimeout?: number;
    cacheTimeout?: number;
  };
  ui?: {
    siteName?: string;
    welcomeMessage?: string;
    showWelcomeCard?: boolean;
    popupMessage?: {
      enabled?: boolean;
      id?: string;
      title?: string;
      body?: string;
      severity?: 'info' | 'success' | 'warning';
      ctaLabel?: string;
      ctaLink?: string;
    };
  };
  announcements?: Announcement[];
}

/**
 * Default configuration values
 */
export const DEFAULT_SITE_CONFIG: SiteConfigItem[] = [
  {
    key: 'mcp.audit.rawErrors.enabled',
    value: true,
    type: 'boolean',
    category: 'system',
    label: 'MCP Raw Error Capture',
    description: 'Store full MCP tool failure context for 30 days in the encrypted raw-error audit table',
    defaultValue: true,
    isPublic: false,
    isEditable: true,
  },
  // Feature Flags

  {
    key: 'features.reportScheduler.enabled',
    value: true,
    type: 'boolean',
    category: 'features',
    label: 'Report Scheduler',
    description: 'Enable automated report scheduling and delivery',
    defaultValue: true,
    isPublic: false,
    isEditable: true,
  },
  {
    key: 'features.adminNotifications.enabled',
    value: true,
    type: 'boolean',
    category: 'features',
    label: 'Admin Notifications',
    description: 'Enable email notifications for admin events',
    defaultValue: true,
    isPublic: false,
    isEditable: true,
  },

  // User Notification System Configuration
  {
    key: 'notifications.enabled',
    value: true,
    type: 'boolean',
    category: 'features',
    label: 'User Notifications Enabled',
    description: 'Master switch for the in-app user notification system',
    defaultValue: true,
    isPublic: false,
    isEditable: true,
  },
  {
    key: 'notifications.digestEnabled',
    value: true,
    type: 'boolean',
    category: 'features',
    label: 'Email Digest Enabled',
    description: 'Send grouped email digests of notifications to users',
    defaultValue: true,
    isPublic: false,
    isEditable: true,
  },
  {
    key: 'notifications.defaultDigestFrequency',
    value: 'daily',
    type: 'string',
    category: 'features',
    label: 'Default Digest Frequency',
    description: 'Default email digest frequency for new users',
    defaultValue: 'daily',
    isPublic: false,
    isEditable: true,
    validation: {
      allowedValues: ['daily', 'weekly'],
    },
  },
  {
    key: 'notifications.defaultDigestHour',
    value: 8,
    type: 'number',
    category: 'features',
    label: 'Default Digest Hour',
    description: 'Default hour (0-23) for email digest delivery',
    defaultValue: 8,
    isPublic: false,
    isEditable: true,
    validation: {
      min: 0,
      max: 23,
    },
  },
  {
    key: 'notifications.dryRun.enabled',
    value: false,
    type: 'boolean',
    category: 'features',
    label: 'Notification Dry-Run Mode',
    description: 'Redirect all notifications to a single admin email instead of individual users',
    defaultValue: false,
    isPublic: false,
    isEditable: true,
  },
  {
    key: 'notifications.dryRun.redirectTo',
    value: '',
    type: 'string',
    category: 'features',
    label: 'Dry-Run Redirect Email',
    description: 'Email address to receive all notifications when dry-run mode is enabled',
    defaultValue: '',
    isPublic: false,
    isEditable: true,
  },


  // Performance Settings
  {
    key: 'performance.apiTimeout',
    value: 30000,
    type: 'number',
    category: 'performance',
    label: 'Default API Timeout (ms)',
    description: 'Default timeout for API requests',
    defaultValue: 30000,
    isPublic: false,
    isEditable: true,
    validation: {
      min: 5000,
      max: 120000,
    },
  },
  {
    key: 'performance.cacheTimeout',
    value: 600000,
    type: 'number',
    category: 'performance',
    label: 'Cache Timeout (ms)',
    description: 'Default cache timeout for config values (10 minutes)',
    defaultValue: 600000,
    isPublic: false,
    isEditable: true,
    validation: {
      min: 60000,
      max: 3600000,
    },
  },

  // UI Customization
  {
    key: 'ui.siteName',
    value: 'GHOST Dashboard',
    type: 'string',
    category: 'ui',
    label: 'Site Name',
    description: 'Application name displayed in navigation and page titles',
    defaultValue: 'GHOST Dashboard',
    isPublic: true,
    isEditable: true,
  },
  {
    key: 'ui.welcomeMessage',
    value: 'Welcome to GHOST - Your centralized AWS account management dashboard',
    type: 'string',
    category: 'ui',
    label: 'Welcome Message',
    description: 'Message displayed on the homepage',
    defaultValue: 'Welcome to GHOST - Your centralized AWS account management dashboard',
    isPublic: true,
    isEditable: true,
  },
  {
    key: 'ui.showWelcomeCard',
    value: true,
    type: 'boolean',
    category: 'ui',
    label: 'Show Welcome Card',
    description: 'Display the welcome card on the homepage for new users',
    defaultValue: true,
    isPublic: true,
    isEditable: true,
  },
  {
    key: 'ui.popupMessage.enabled',
    value: false,
    type: 'boolean',
    category: 'ui',
    label: 'Popup Message Enabled',
    description: 'Show a popup message to users on login. When disabled, falls back to version changelog.',
    defaultValue: false,
    isPublic: true,
    isEditable: true,
  },
  {
    key: 'ui.popupMessage.id',
    value: '',
    type: 'string',
    category: 'ui',
    label: 'Popup Message ID',
    description: 'Unique ID for the current popup. Change this to re-show to users who dismissed the previous one.',
    defaultValue: '',
    isPublic: true,
    isEditable: true,
  },
  {
    key: 'ui.popupMessage.title',
    value: '',
    type: 'string',
    category: 'ui',
    label: 'Popup Title',
    description: 'Title displayed at the top of the popup modal.',
    defaultValue: '',
    isPublic: true,
    isEditable: true,
  },
  {
    key: 'ui.popupMessage.body',
    value: '',
    type: 'string',
    category: 'ui',
    label: 'Popup Body',
    description: 'Main content of the popup. Supports basic markdown (bold, links, lists).',
    defaultValue: '',
    isPublic: true,
    isEditable: true,
  },
  {
    key: 'ui.popupMessage.severity',
    value: 'info',
    type: 'string',
    category: 'ui',
    label: 'Popup Severity',
    description: 'Visual style of the popup: info (blue), success (green), warning (yellow).',
    defaultValue: 'info',
    isPublic: true,
    isEditable: true,
    validation: {
      allowedValues: ['info', 'success', 'warning'],
    },
  },
  {
    key: 'ui.popupMessage.ctaLabel',
    value: '',
    type: 'string',
    category: 'ui',
    label: 'Popup CTA Button Label',
    description: 'Optional call-to-action button text. Leave empty for no CTA.',
    defaultValue: '',
    isPublic: true,
    isEditable: true,
  },
  {
    key: 'ui.popupMessage.ctaLink',
    value: '',
    type: 'string',
    category: 'ui',
    label: 'Popup CTA Button Link',
    description: 'URL the CTA button navigates to (internal path or external URL).',
    defaultValue: '',
    isPublic: true,
    isEditable: true,
  },
  {
    key: 'ui.dashboardLayout.default',
    value: null,
    type: 'object',
    category: 'ui',
    label: 'Default Dashboard Layout',
    description: 'Organization-wide default dashboard layout for new users. Admin-configured.',
    defaultValue: null,
    isPublic: true,
    isEditable: true,
  },
  {
    key: 'announcements.list',
    value: [],
    type: 'array',
    category: 'ui',
    label: 'Announcements',
    description: 'Active announcements displayed as banners to all users. Managed through /api/admin/announcements/update.',
    defaultValue: [],
    isPublic: true,
    isEditable: false,
  },

  // ---------------------------------------------------------------------------
  // OAuth Administration — evidence-based alert settings (oauth.alerts.*)
  //
  // Stored via existing site configuration (design "Diagnostics, maintenance,
  // and alerts"). These keys are OAuth-specific and every update/reset path is
  // gated by the `oauth.operations.manage` capability — including the generic
  // site-config admin route, which explicitly rejects `oauth.alerts.*` writes
  // unless that capability is held (see server/utils/site-config guard and the
  // dedicated /api/admin/oauth/alerts/settings routes). They are marked
  // `isEditable: false` so the generic admin panel does not offer a free-form
  // edit control that would bypass the capability + validation gate.
  //
  // Recipients NEVER carry a free-form address. `oauth.alerts.recipientsRef`
  // references an EXISTING approved organization notification destination; the
  // only supported reference is `admin-notifications` (the org-approved admin
  // notification set resolved from `email.admin.notificationEmails`). `none`
  // disables delivery. Delivery stays unavailable when no approved recipient
  // exists and never falls back to an arbitrary caller/developer address
  // (Requirement 15.4 / 18.6).
  // ---------------------------------------------------------------------------
  {
    key: 'oauth.alerts.enabled',
    value: false,
    type: 'boolean',
    category: 'system',
    label: 'OAuth Alerts Enabled',
    description: 'Master switch for evidence-based OAuth alert evaluation and delivery. Requires the OAuth operations capability to change.',
    defaultValue: false,
    isPublic: false,
    isEditable: false,
  },
  {
    key: 'oauth.alerts.thresholds',
    value: {
      registrationRejections: 5,
      tokenFailures: 5,
      refreshFailures: 5,
      consecutiveDiscoveryFailures: 2,
      consecutiveStorageFailures: 2,
      signingKeyDeadlineDays: 14,
      windowMinutes: 15,
      consecutiveGapMinutes: 5,
    },
    type: 'object',
    category: 'system',
    label: 'OAuth Alert Thresholds',
    description: 'Evidence thresholds for OAuth alerts: registration-rejection (>5 in 15m), token/refresh failure (>5 per stage in 15m), consecutive discovery/storage failures (2, five minutes apart), signing-key deadline (14 days). Requires the OAuth operations capability to change.',
    defaultValue: {
      registrationRejections: 5,
      tokenFailures: 5,
      refreshFailures: 5,
      consecutiveDiscoveryFailures: 2,
      consecutiveStorageFailures: 2,
      signingKeyDeadlineDays: 14,
      windowMinutes: 15,
      consecutiveGapMinutes: 5,
    },
    isPublic: false,
    isEditable: false,
  },
  {
    key: 'oauth.alerts.recipientsRef',
    value: 'admin-notifications',
    type: 'string',
    category: 'system',
    label: 'OAuth Alert Recipients Reference',
    description: 'Reference to an existing approved organization notification destination for OAuth alerts. Only "admin-notifications" (the approved admin notification set) or "none" (delivery disabled) are accepted. Free-form addresses are never accepted. Requires the OAuth operations capability to change.',
    defaultValue: 'admin-notifications',
    isPublic: false,
    isEditable: false,
    validation: {
      allowedValues: ['admin-notifications', 'none'],
    },
  },
];

/**
 * Helper type to extract config value by key path
 */
export type ConfigValue<K extends string> =
  K extends keyof SiteConfig ? SiteConfig[K] :
  K extends `${infer A}.${infer B}` ?
    A extends keyof SiteConfig ? ConfigValue<B> extends never ? never : ConfigValue<B> :
  never : never;

/**
 * Admin API response types
 */
export interface SiteConfigListResponse {
  configs: SiteConfigItem[];
  count: number;
}

export interface SiteConfigUpdateRequest {
  value: any;
  updatedBy?: string;
}

export interface SiteConfigUpdateResponse {
  success: boolean;
  config: SiteConfigItem;
}

/**
 * Change history entry for audit trail
 */
export interface SiteConfigHistoryEntry {
  /** Configuration key that was changed */
  key: string;

  /** Previous value before the change */
  oldValue: any;

  /** New value after the change */
  newValue: any;

  /** User who made the change */
  changedBy: string;

  /** When the change occurred */
  changedAt: string;

  /** Optional reason or note for the change */
  reason?: string;
}

/**
 * Change history API response
 */
export interface SiteConfigHistoryResponse {
  success: boolean;
  history: SiteConfigHistoryEntry[];
  count: number;
}

/** Retired persisted settings must not re-enable or expose the removed chatbot. */
export function isRetiredSiteConfigKey(key: string): boolean {
  return /^(features\.strandsChat(?:Popup)?|services\.strands)(?:\.|$)/.test(key)
}
