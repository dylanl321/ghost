/**
 * Site Configuration Store
 *
 * Manages site-wide configuration and feature flags.
 * Loaded on app initialization, persisted in session storage.
 */

import { defineStore } from 'pinia';
import type { SiteConfig } from '~/shared/types/site-config';

const logger = createLogger('SiteConfigStore')

interface SiteConfigState {
  config: Partial<SiteConfig>;
  loaded: boolean;
  loading: boolean;
  error: string | null;
  lastFetch: number | null;
}

export const useSiteConfigStore = defineStore('siteConfig', {
  state: (): SiteConfigState => ({
    config: {},
    loaded: false,
    loading: false,
    error: null,
    lastFetch: null,
  }),

  getters: {
    /**
     * Check if a feature is enabled
     */
    isFeatureEnabled: (state) => (featurePath: string): boolean => {
      const keys = featurePath.split('.');
      let current: any = state.config;

      for (const key of keys) {
        if (current === undefined || current === null) return false;
        current = current[key];
      }

      return current === true;
    },

    /**
     * Get a configuration value by path
     */
    getConfigValue: (state) => <T = any>(path: string, defaultValue?: T): T | undefined => {
      const keys = path.split('.');
      let current: any = state.config;

      for (const key of keys) {
        if (current === undefined || current === null) return defaultValue;
        current = current[key];
      }

      return current !== undefined ? current : defaultValue;
    },

    /**
     * Feature flag shortcuts
     */
    isStrandsChatEnabled: (state): boolean => {
      return state.config.features?.strandsChat?.enabled ?? true;
    },

    isStrandsChatPopupEnabled: (state): boolean => {
      return state.config.features?.strandsChatPopup?.enabled ?? false;
    },

    isReportSchedulerEnabled: (state): boolean => {
      return state.config.features?.reportScheduler?.enabled ?? true;
    },

    isAdminNotificationsEnabled: (state): boolean => {
      return state.config.features?.adminNotifications?.enabled ?? true;
    },

    /**
     * Service configuration shortcuts
     */
    strandsServerUrl: (state): string => {
      return (
        state.config.services?.strands?.serverUrl ||
        'http://internal-lz-mcp-servers-dev-alb-1428009891.us-gov-west-1.elb.amazonaws.com:80'
      );
    },

    strandsTimeout: (state): number => {
      return state.config.services?.strands?.timeout ?? 300000;
    },

    strandsRetries: (state): number => {
      return state.config.services?.strands?.retries ?? 2;
    },

    strandsRetryDelay: (state): number => {
      return state.config.services?.strands?.retryDelay ?? 2000;
    },

    /**
     * UI configuration shortcuts
     */
    siteName: (state): string => {
      return state.config.ui?.siteName ?? 'GHOST Dashboard';
    },

    welcomeMessage: (state): string => {
      return state.config.ui?.welcomeMessage ?? 'Welcome to GHOST - Your centralized AWS account management dashboard';
    },

    showWelcomeCard: (state): boolean => {
      return state.config.ui?.showWelcomeCard ?? true;
    },

    popupMessage: (state) => {
      return state.config.ui?.popupMessage ?? null;
    },

    /**
     * Check if config is stale and needs refresh
     */
    isStale: (state): boolean => {
      if (!state.lastFetch) return true;
      const STALE_TIME = 10 * 60 * 1000; // 10 minutes
      return Date.now() - state.lastFetch > STALE_TIME;
    },
  },

  actions: {
    /**
     * Fetch site configuration from API
     */
    async fetchConfig(force = false): Promise<void> {
      // Skip if already loaded and not stale, unless forced
      if (!force && this.loaded && !this.isStale) {
        return;
      }

      // Skip if already loading
      if (this.loading) {
        return;
      }

      this.loading = true;
      this.error = null;

      try {
        const response = await $fetch('/api/site-config/all');

        if (response.success && response.config) {
          this.config = response.config as Partial<SiteConfig>;
          this.loaded = true;
          this.lastFetch = Date.now();
        } else {
          throw new Error('Failed to fetch site configuration');
        }
      } catch (error: any) {
        logger.error('Error fetching site config:', error);
        this.error = error.message || 'Failed to load configuration';

        // Set sensible defaults on error
        this.config = {
          features: {
            strandsChat: { enabled: true },
            strandsChatPopup: { enabled: false },
            reportScheduler: { enabled: true },
            adminNotifications: { enabled: true },
          },
          ui: {
            siteName: 'GHOST Dashboard',
            welcomeMessage: 'Welcome to GHOST - Your centralized AWS account management dashboard',
            showWelcomeCard: true,
          },
        };
        this.loaded = true;
      } finally {
        this.loading = false;
      }
    },

    /**
     * Refresh configuration (force fetch)
     */
    async refresh(): Promise<void> {
      await this.fetchConfig(true);
    },

    /**
     * Clear configuration and reset state
     */
    clear(): void {
      this.config = {};
      this.loaded = false;
      this.loading = false;
      this.error = null;
      this.lastFetch = null;
    },
  },

  // Persist in storage (survives page refresh, cleared on logout)
  persist: {
    key: 'ghost-site-config',
    storage: process.client ? sessionStorage : undefined,
  },
});
