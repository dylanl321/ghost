/**
 * PUT /api/admin/site-config/:key
 *
 * Update a site configuration item (admin only).
 */

import { defineEventHandler, readBody, getRouterParam } from 'h3';
import { requireAdmin, getUserPermissions } from '../../../utils/user-roles';
import { updateSiteConfig, getSiteConfig, saveConfigHistory } from '../../../utils/site-config';
import { isOAuthAlertSettingKey } from '../../../mcp/oauth/admin/alert-settings';
import { OAUTH_CAPABILITIES } from '../../../../shared/types/oauth-administration';
import type { SiteConfigUpdateRequest, SiteConfigUpdateResponse } from '../../../../shared/types/site-config';

export default defineEventHandler(async (event) => {
  // Require admin access
  await requireAdmin(event);

  try {
    // Get the config key from URL params
    const key = getRouterParam(event, 'key');
    if (!key) {
      throw createError({
        statusCode: 400,
        message: 'Configuration key is required',
      });
    }

    // Decode the key (in case it has dots and is URL encoded)
    const decodedKey = decodeURIComponent(key);

    // Close the generic-route bypass: the OAuth-specific `oauth.alerts.*`
    // settings are gated on the OAuth operations capability (Requirement 15.3).
    // requireAdmin alone is NOT sufficient to change them here — an admin must
    // ALSO hold `oauth.operations.manage`, exactly as the dedicated
    // /api/admin/oauth/alerts/settings routes require. This prevents the generic
    // admin config route from being an unguarded path to OAuth alert settings.
    if (isOAuthAlertSettingKey(decodedKey)) {
      const permissions = await getUserPermissions(event);
      if (!permissions.has(OAUTH_CAPABILITIES.OPERATIONS_MANAGE)) {
        throw createError({
          statusCode: 403,
          message: 'Changing OAuth alert settings requires the OAuth operations capability. Use the OAuth administration alert settings API.',
        });
      }
    }

    // Parse request body
    const body = await readBody<SiteConfigUpdateRequest>(event);
    if (body.value === undefined) {
      throw createError({
        statusCode: 400,
        message: 'Value is required',
      });
    }

    // Get username for audit trail from session
    const auth = event.context.auth;
    const user = auth?.user;
    const username = user?.email || user?.preferred_username || 'unknown';

    // Get the old value before updating (for change history)
    const oldConfig = await getSiteConfig(decodedKey, false);
    const oldValue = oldConfig?.value;

    // Update the configuration
    const updated = await updateSiteConfig(
      decodedKey,
      body.value,
      username
    );

    // Save change history (non-blocking, errors won't affect the update)
    if (oldValue !== undefined) {
      saveConfigHistory(
        decodedKey,
        oldValue,
        body.value,
        username
      ).catch(err => logger.error('Failed to save config history:', err));
    }

    return {
      success: true,
      config: updated,
      message: `Configuration ${decodedKey} updated successfully`,
    } as SiteConfigUpdateResponse & { message: string };
  } catch (error: any) {
    logger.error('Error updating site config:', error);

    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to update site configuration',
    });
  }
});
