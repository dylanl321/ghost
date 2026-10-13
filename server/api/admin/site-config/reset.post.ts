/**
 * POST /api/admin/site-config/reset
 *
 * Reset site configuration to default values (admin only).
 * Can reset a single key or all keys.
 */

import { defineEventHandler, readBody } from 'h3';
import { requireAdmin, getUserPermissions } from '../../../utils/user-roles';
import { resetSiteConfig, resetAllSiteConfig } from '../../../utils/site-config';
import { isOAuthAlertSettingKey, OAUTH_ALERT_SETTING_KEY_LIST } from '../../../mcp/oauth/admin/alert-settings';
import { OAUTH_CAPABILITIES } from '../../../../shared/types/oauth-administration';

interface ResetRequest {
  key?: string; // If provided, reset only this key. Otherwise reset all.
}

export default defineEventHandler(async (event) => {
  // Require admin access
  await requireAdmin(event);

  try {
    const body = await readBody<ResetRequest>(event);

    // Get username for audit trail from session
    const auth = event.context.auth;
    const user = auth?.user;
    const username = user?.email || user?.preferred_username || 'unknown';

    // Close the generic-route bypass: the OAuth operations capability gates any
    // reset of the `oauth.alerts.*` settings (Requirement 15.3). A single-key
    // reset of a protected key is rejected without the capability; a "reset all"
    // performed without the capability preserves the protected keys instead of
    // silently resetting them through this generic path.
    const hasOAuthOperations = (await getUserPermissions(event)).has(OAUTH_CAPABILITIES.OPERATIONS_MANAGE);

    if (body.key) {
      // Reset single key
      if (isOAuthAlertSettingKey(body.key) && !hasOAuthOperations) {
        throw createError({
          statusCode: 403,
          message: 'Resetting OAuth alert settings requires the OAuth operations capability. Use the OAuth administration alert settings API.',
        });
      }
      const reset = await resetSiteConfig(body.key, username);
      return {
        success: true,
        message: `Configuration ${body.key} reset to default`,
        config: reset,
      };
    } else {
      // Reset all keys. Without the OAuth operations capability, preserve the
      // capability-gated oauth.alerts.* keys so this path is not a bypass.
      await resetAllSiteConfig(username, hasOAuthOperations ? [] : OAUTH_ALERT_SETTING_KEY_LIST);
      return {
        success: true,
        message: 'All configuration reset to defaults',
      };
    }
  } catch (error: any) {
    logger.error('Error resetting site config:', error);

    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to reset site configuration',
    });
  }
});
