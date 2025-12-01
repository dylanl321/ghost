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

/**
 * Configuration categories for organization in admin panel
 */
export type ConfigCategory = 'features' | 'services' | 'performance' | 'ui' | 'system';

/**
 * Base configuration item stored in DynamoDB
 */
export interface SiteConfigItem {
  /** Unique key in dot notation (e.g., 'features.strandsChat.enabled') */
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
 * Type-safe configuration structure
 */
export interface SiteConfig {
  features: {
    strandsChat: {
      enabled: boolean;
    };
    strandsChatPopup: {
      enabled: boolean;
    };
    reportScheduler: {
      enabled: boolean;
    };
    adminNotifications: {
      enabled: boolean;
    };
  };
  services: {
    strands: {
      serverUrl: string;
      timeout: number;
      retries: number;
      retryDelay: number;
    };
  };
  performance: {
    apiTimeout: number;
    cacheTimeout: number;
  };
  ui: {
    siteName: string;
    welcomeMessage: string;
    showWelcomeCard: boolean;
  };
}

/**
 * Default configuration values
 */
export const DEFAULT_SITE_CONFIG: SiteConfigItem[] = [
  // Feature Flags
  {
    key: 'features.strandsChat.enabled',
    value: true,
    type: 'boolean',
    category: 'features',
    label: 'Strands Chat',
    description: 'Enable the AI-powered Strands chat interface for querying AWS account data',
    defaultValue: true,
    isPublic: true,
    isEditable: true,
  },
  {
    key: 'features.strandsChatPopup.enabled',
    value: false,
    type: 'boolean',
    category: 'features',
    label: 'Strands Chat Popup',
    description: 'Enable the floating Strands chat popup widget on all pages',
    defaultValue: false,
    isPublic: true,
    isEditable: true,
  },
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

  // Service Configuration
  {
    key: 'services.strands.serverUrl',
    value: process.env.STRANDS_SERVER_URL || 'http://internal-lz-mcp-servers-dev-alb-1428009891.us-gov-west-1.elb.amazonaws.com:80',
    type: 'string',
    category: 'services',
    label: 'Strands Server URL',
    description: 'ALB endpoint for the Strands ECS service',
    defaultValue: 'http://internal-lz-mcp-servers-dev-alb-1428009891.us-gov-west-1.elb.amazonaws.com:80',
    isPublic: false,
    isEditable: true,
    validation: {
      pattern: '^https?://.+',
    },
  },
  {
    key: 'services.strands.timeout',
    value: 300000,
    type: 'number',
    category: 'services',
    label: 'Strands Timeout (ms)',
    description: 'Request timeout for Strands API calls in milliseconds (5 minutes for MCP operations)',
    defaultValue: 300000,
    isPublic: false,
    isEditable: true,
    validation: {
      min: 10000,
      max: 600000,
    },
  },
  {
    key: 'services.strands.retries',
    value: 2,
    type: 'number',
    category: 'services',
    label: 'Strands Retry Count',
    description: 'Number of retry attempts for failed Strands requests',
    defaultValue: 2,
    isPublic: false,
    isEditable: true,
    validation: {
      min: 0,
      max: 5,
    },
  },
  {
    key: 'services.strands.retryDelay',
    value: 2000,
    type: 'number',
    category: 'services',
    label: 'Strands Retry Delay (ms)',
    description: 'Base delay between retry attempts (uses exponential backoff)',
    defaultValue: 2000,
    isPublic: false,
    isEditable: true,
    validation: {
      min: 500,
      max: 10000,
    },
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
