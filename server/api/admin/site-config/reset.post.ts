/**
 * POST /api/admin/site-config/reset
 *
 * Reset site configuration to default values (admin only).
 * Can reset a single key or all keys.
 */

import { defineEventHandler, readBody } from 'h3';
import { requireAdmin } from '~/server/utils/user-roles';
import { resetSiteConfig, resetAllSiteConfig } from '~/server/utils/site-config';

interface ResetRequest {
  key?: string; // If provided, reset only this key. Otherwise reset all.
}

export default defineEventHandler(async (event) => {
  // Require admin access
  const user = await requireAdmin(event);

  try {
    const body = await readBody<ResetRequest>(event);

    // Get username for audit trail
    const username = user.email || user.preferred_username || 'unknown';

    if (body.key) {
      // Reset single key
      const reset = await resetSiteConfig(body.key, username);
      return {
        success: true,
        message: `Configuration ${body.key} reset to default`,
        config: reset,
      };
    } else {
      // Reset all keys
      await resetAllSiteConfig(username);
      return {
        success: true,
        message: 'All configuration reset to defaults',
      };
    }
  } catch (error: any) {
    console.error('Error resetting site config:', error);

    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to reset site configuration',
    });
  }
});
