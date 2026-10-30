/**
 * PUT /api/admin/site-config/:key
 *
 * Update a site configuration item (admin only).
 */

import { defineEventHandler, readBody, getRouterParam } from 'h3';
import { requireAdmin, getUserPermissions, getUserEmail } from '../../../utils/user-roles';
import { updateSiteConfigWithHistory, getSiteConfig } from '../../../utils/site-config';
import { isOAuthAlertSettingKey } from '../../../mcp/oauth/admin/alert-settings';
import { OAUTH_CAPABILITIES } from '../../../../shared/types/oauth-administration';
import type { SiteConfigUpdateRequest, SiteConfigUpdateResponse } from '../../../../shared/types/site-config';

export default defineEventHandler(async (event) => {
  // Require admin access
  await requireAdmin(event);

  try {
    // Get the config key from URL params
    const decodedKey = getRouterParam(event, 'key', { decode: true });
    if (!decodedKey) {
      throw createError({
        statusCode: 400,
        message: 'Configuration key is required',
      });
    }

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
    if (body?.value === undefined) {
      throw createError({
        statusCode: 400,
        message: 'Value is required',
      });
    }

    const existing = await getSiteConfig(decodedKey, false);
    if (!existing) {
      throw createError({ statusCode: 404, message: `Configuration key not found: ${decodedKey}` });
    }
    if (existing.isEditable === false) {
      throw createError({ statusCode: 403, message: `Configuration ${decodedKey} is not editable here` });
    }

    const updated = await updateSiteConfigWithHistory(decodedKey, body.value, getUserEmail(event) || 'unknown');

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
